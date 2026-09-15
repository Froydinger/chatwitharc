// supabase/functions/_shared/browserTest.ts
//
// "Watch the bot work" browser automation. Playwright drives the app inside the
// SAME 20-minute E2B sandbox that already runs the dev server, and writes one
// JSON frame per step to the sandbox filesystem. browser-test-status reads those
// frames back out; nothing is stored in Postgres except a run -> sandbox mapping.
//
// Frames deliberately run at a low rate. Smooth cursor motion comes from the
// client interpolating between the action coordinates carried on each frame,
// not from a high frame rate.
import { Sandbox } from 'https://esm.sh/@e2b/code-interpreter@1.0.4';
import { runInSandbox } from './sandbox.ts';

export const BROWSER_TEST_ROOT = '/home/user/.arc-browser-test';
const PW_DIR = '/home/user/.arc-pw';
const PW_READY_MARKER = '/home/user/.arc-pw/.ready';
const PW_LOG = '/tmp/arc-pw-install.log';
const PW_VERSION = '1.49.1';

export type BrowserDevice = 'desktop' | 'mobile' | 'both';

export interface BrowserStep {
  action: 'goto' | 'click' | 'type' | 'scroll' | 'wait' | 'expect';
  url?: string;
  selector?: string;
  text?: string;
  dy?: number;
  ms?: number;
  state?: string;
  label?: string;
}

export interface BrowserFrame {
  i: number;
  device: 'desktop' | 'mobile';
  action: string;
  label: string;
  x: number | null;
  y: number | null;
  vw: number;
  vh: number;
  ok: boolean;
  error?: string;
  done?: boolean;
  screenshot?: string;
}

/**
 * Kicks the Playwright + Chromium install off in the background and returns at
 * once. Idempotent: the marker file makes repeat calls cheap, so this is safe to
 * fire whenever Git mode activates to buy a head start on the ~1-2 minute install.
 */
function installCommand(): string {
  const inner = [
    'set -e',
    'mkdir -p ' + PW_DIR,
    'cd ' + PW_DIR,
    '[ -f package.json ] || npm init -y',
    'npm i playwright@' + PW_VERSION + ' --no-audit --no-fund',
    // --with-deps needs root and is not always available; the plain install is
    // enough on the E2B base image, so never let the deps step fail the install.
    '(npx playwright install --with-deps chromium || npx playwright install chromium)',
    'touch ' + PW_READY_MARKER,
  ].join(' && ');

  // Already ready, or an install is already in flight -> do nothing.
  return [
    'if [ -f ' + PW_READY_MARKER +' ]; then echo "ready"; ',
    'elif pgrep -f "arc-pw-install" > /dev/null 2>&1; then echo "installing"; ',
    'else nohup bash -c \'exec -a arc-pw-install bash -c "' + inner.replace(/"/g, '\\"') + '"\' > ' + PW_LOG + ' 2>&1 & echo "started"; fi',
  ].join('');
}

/**
 * Warms Chromium inside the sandbox for this repo. Reuses the existing sandbox
 * when there is one; otherwise runInSandbox provisions it (and clones + npm
 * installs the repo on the way, which is a head start of its own).
 *
 * Note this does claim one of the 20 concurrent sandbox slots and starts the
 * 20-minute window, so only call it on a real intent signal such as Git mode
 * activating with a repo selected.
 */
export async function prewarmBrowser(options: {
  supabase: any;
  userId: string;
  repo: string;
  branch?: string;
  gitToken?: string;
}): Promise<{ status: string }> {
  try {
    await runInSandbox({
      supabase: options.supabase,
      userId: options.userId,
      repo: options.repo,
      branch: options.branch,
      gitToken: options.gitToken,
      command: installCommand(),
      timeoutMs: 45_000,
    });
    return { status: 'prewarming' };
  } catch (err) {
    console.warn('Browser prewarm failed (non-fatal):', err);
    return { status: 'unavailable' };
  }
}

/** Connects to the live sandbox for this user+repo without creating one. */
async function connectExistingSandbox(supabase: any, userId: string, repo: string) {
  const apiKey = Deno.env.get('E2B_API_KEY');
  if (!apiKey) throw new Error('E2B sandbox API key is not configured in server secrets.');

  const { data: rows } = await supabase
    .from('git_sandboxes')
    .select('*')
    .eq('user_id', userId)
    .eq('repo', repo)
    .in('status', ['active', 'idle'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (!rows || rows.length === 0) return null;
  try {
    return await Sandbox.connect(rows[0].sandbox_id, { apiKey });
  } catch {
    await supabase.from('git_sandboxes').update({ status: 'closed' }).eq('id', rows[0].id);
    return null;
  }
}

// The runner is static: the run id, output dir and config all arrive as argv, so
// nothing is interpolated into it. Written with string concatenation (no
// backticks) to keep it readable inside this template literal.
const RUNNER_SOURCE = `
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const outDir = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(path.join(outDir, 'config.json'), 'utf8'));

let frameIndex = 0;
function writeFrame(obj) {
  const name = String(frameIndex).padStart(4, '0') + '.json';
  const full = path.join(outDir, name);
  // Write-then-rename so a concurrent reader never sees a partial frame.
  fs.writeFileSync(full + '.tmp', JSON.stringify(obj));
  fs.renameSync(full + '.tmp', full);
  frameIndex += 1;
}

function resolve(page, step) {
  if (step.selector) return page.locator(step.selector).first();
  if (step.text) return page.getByText(step.text, { exact: false }).first();
  return null;
}

function describe(step) {
  if (step.label) return step.label;
  if (step.action === 'goto') return 'Opening ' + (step.url || 'page');
  if (step.action === 'click') return 'Clicking ' + (step.text || step.selector || 'element');
  if (step.action === 'type') return 'Typing into ' + (step.selector || 'field');
  if (step.action === 'scroll') return 'Scrolling';
  if (step.action === 'wait') return 'Waiting';
  if (step.action === 'expect') return 'Checking ' + (step.selector || 'element');
  return step.action;
}

async function runDevice(deviceName) {
  const isMobile = deviceName === 'mobile';
  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 720 };
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext(
    isMobile
      ? { viewport: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
          userAgent: devices['iPhone 13'].userAgent }
      : { viewport: viewport, deviceScaleFactor: 1 }
  );
  const page = await context.newPage();
  let failed = false;

  for (const step of cfg.steps) {
    let x = null, y = null, ok = true, error;
    try {
      if (step.action === 'goto') {
        await page.goto(step.url || cfg.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(400);
      } else if (step.action === 'wait') {
        await page.waitForTimeout(Math.min(step.ms || 500, 5000));
      } else if (step.action === 'scroll') {
        await page.mouse.wheel(0, step.dy || 400);
        await page.waitForTimeout(250);
      } else {
        const loc = resolve(page, step);
        if (!loc) throw new Error('Step needs a selector or text');
        await loc.waitFor({ state: 'visible', timeout: 10000 });
        const box = await loc.boundingBox();
        if (box) { x = Math.round(box.x + box.width / 2); y = Math.round(box.y + box.height / 2); }
        if (step.action === 'click') {
          await loc.click({ timeout: 10000 });
          await page.waitForTimeout(400);
        } else if (step.action === 'type') {
          await loc.fill(step.text || '', { timeout: 10000 });
          await page.waitForTimeout(200);
        } else if (step.action === 'expect') {
          const visible = await loc.isVisible();
          const want = step.state !== 'hidden';
          if (visible !== want) throw new Error('Expected element to be ' + (want ? 'visible' : 'hidden'));
        }
      }
    } catch (err) {
      ok = false;
      failed = true;
      error = String((err && err.message) || err).slice(0, 400);
    }

    let shot = '';
    try {
      shot = (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64');
    } catch (_) { /* a closed page still yields a usable frame record */ }

    writeFrame({
      i: frameIndex, device: deviceName, action: step.action, label: describe(step),
      x: x, y: y, vw: viewport.width, vh: viewport.height,
      ok: ok, error: error, screenshot: shot,
    });

    if (!ok && cfg.stopOnFailure) break;
  }

  await browser.close();
  return failed;
}

(async () => {
  let anyFailed = false;
  try {
    for (const d of cfg.devices) {
      const failed = await runDevice(d);
      anyFailed = anyFailed || failed;
    }
  } catch (err) {
    anyFailed = true;
    writeFrame({
      i: frameIndex, device: 'desktop', action: 'error', label: 'Run failed',
      x: null, y: null, vw: 1280, vh: 720, ok: false,
      error: String((err && err.message) || err).slice(0, 400), screenshot: '',
    });
  }
  writeFrame({
    i: frameIndex, device: 'desktop', action: 'done',
    label: anyFailed ? 'Finished with problems' : 'Finished',
    x: null, y: null, vw: 1280, vh: 720, ok: !anyFailed, done: true, screenshot: '',
  });
  fs.writeFileSync(path.join(outDir, 'status'), anyFailed ? 'failed' : 'passed');
})();
`;

export interface StartBrowserTestResult {
  runId: string;
  status: 'running' | 'preparing';
  deviceList: Array<'desktop' | 'mobile'>;
  sandboxId: string;
}

/**
 * Writes the runner + config into the sandbox and launches it in the background,
 * so the edge function returns immediately instead of blocking for the length of
 * the run. Frames are polled separately through browser-test-status.
 */
export async function startBrowserTest(options: {
  supabase: any;
  userId: string;
  repo: string;
  branch?: string;
  gitToken?: string;
  url: string;
  device: BrowserDevice;
  steps: BrowserStep[];
  goal?: string;
  onProgress?: (msg: string) => void;
}): Promise<StartBrowserTestResult> {
  const deviceList: Array<'desktop' | 'mobile'> =
    options.device === 'both' ? ['desktop', 'mobile'] : [options.device];

  let sandbox = await connectExistingSandbox(options.supabase, options.userId, options.repo);
  if (!sandbox) {
    // No live sandbox: provision one (and start the browser install) then attach.
    options.onProgress?.('Starting cloud sandbox for the browser test...');
    await prewarmBrowser({
      supabase: options.supabase,
      userId: options.userId,
      repo: options.repo,
      branch: options.branch,
      gitToken: options.gitToken,
    });
    sandbox = await connectExistingSandbox(options.supabase, options.userId, options.repo);
    if (!sandbox) throw new Error('Could not attach a cloud sandbox for the browser test.');
  }

  // Idempotent: returns instantly when Chromium is already warm.
  options.onProgress?.('Preparing browser...');
  await sandbox.commands.run(installCommand(), { timeoutMs: 45_000 }).catch(() => undefined);

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outDir = `${BROWSER_TEST_ROOT}/${runId}`;

  await sandbox.commands.run(`mkdir -p ${outDir}`, { timeoutMs: 10_000 });
  await sandbox.files.write(`${PW_DIR}/runner.mjs`, RUNNER_SOURCE);
  await sandbox.files.write(`${outDir}/config.json`, JSON.stringify({
    url: options.url,
    devices: deviceList,
    steps: options.steps,
    stopOnFailure: false,
  }));

  // Wait for the install marker (up to ~3 min) inside the background process, so
  // a cold sandbox still works; a warm one falls straight through.
  const launch = [
    'nohup bash -c "',
    'for i in $(seq 1 180); do [ -f ' + PW_READY_MARKER + ' ] && break; sleep 1; done; ',
    'cd ' + PW_DIR + ' && node runner.mjs ' + outDir,
    '" > ' + outDir + '/runner.log 2>&1 &',
  ].join('');
  await sandbox.commands.run(launch, { timeoutMs: 15_000 });

  await options.supabase.from('browser_test_runs').insert({
    run_id: runId,
    user_id: options.userId,
    sandbox_id: sandbox.sandboxId,
    repo: options.repo,
    target_url: options.url,
    device: options.device,
    goal: options.goal || null,
    step_count: options.steps.length * deviceList.length,
    status: 'running',
  });

  return { runId, status: 'running', deviceList, sandboxId: sandbox.sandboxId };
}

/** Reads frames written after `sinceIndex` straight out of the sandbox. */
export async function readBrowserTestFrames(
  supabase: any,
  userId: string,
  runId: string,
  sinceIndex: number,
): Promise<{ frames: BrowserFrame[]; done: boolean; status: string }> {
  const apiKey = Deno.env.get('E2B_API_KEY');
  if (!apiKey) throw new Error('E2B sandbox API key is not configured in server secrets.');

  const { data: run } = await supabase
    .from('browser_test_runs')
    .select('*')
    .eq('run_id', runId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!run) return { frames: [], done: true, status: 'closed' };

  let sandbox: any;
  try {
    sandbox = await Sandbox.connect(run.sandbox_id, { apiKey });
  } catch {
    // Sandbox expired mid-run: end the run rather than polling forever.
    await supabase.from('browser_test_runs').update({ status: 'closed' }).eq('run_id', runId);
    return { frames: [], done: true, status: 'closed' };
  }

  const outDir = `${BROWSER_TEST_ROOT}/${runId}`;
  const listing = await sandbox.commands
    .run(`ls -1 ${outDir}/*.json 2>/dev/null | grep -v config.json || true`, { timeoutMs: 10_000 })
    .catch(() => ({ stdout: '' }));

  const names: string[] = String(listing.stdout || '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean)
    .sort();

  const frames: BrowserFrame[] = [];
  for (const file of names) {
    const base = file.split('/').pop() || '';
    const index = parseInt(base.replace('.json', ''), 10);
    if (Number.isNaN(index) || index < sinceIndex) continue;
    // Cap per poll so one response never grows unbounded.
    if (frames.length >= 6) break;
    try {
      const raw = await sandbox.files.read(file);
      frames.push(JSON.parse(String(raw)));
    } catch {
      // Frame still being written; it will arrive on the next poll.
    }
  }

  const done = frames.some((f) => f.done) || run.status === 'passed' || run.status === 'failed';
  let status = run.status;
  if (frames.some((f) => f.done)) {
    status = frames.some((f) => f.ok === false && f.action !== 'done') ? 'failed' : 'passed';
    await supabase.from('browser_test_runs').update({ status }).eq('run_id', runId);
  }

  return { frames, done, status };
}
