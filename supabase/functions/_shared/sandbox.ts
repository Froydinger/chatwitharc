// supabase/functions/_shared/sandbox.ts
import { Sandbox } from 'https://esm.sh/@e2b/code-interpreter@1.0.4';

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  durationMs: number;
  previewUrl?: string;
  previewPort?: number;
  sandboxId?: string;
  expiresAt?: string;
  isReusedSession?: boolean;
}

export interface RunSandboxOptions {
  supabase?: any;
  userId?: string;
  command: string;
  repo?: string;
  branch?: string;
  gitToken?: string;
  files?: Array<{ path: string; content: string }>;
  port?: number;
  background?: boolean;
  killSandbox?: boolean;
  timeoutMs?: number;
  onProgress?: (message: string) => void;
}

// Hobby Tier Limits Guard:
// - Max 20 concurrent sandboxes
// - 20-minute session window per sandbox
// - Idle threshold: 3 minutes without commands qualifies as idle for eviction
// - Max 10GB disk, 8 vCPU, 8GB RAM
const SANDBOX_WINDOW_MS = 20 * 60 * 1000; // 20 minutes (1,200,000 ms)
const MAX_CONCURRENT_SANDBOXES = 20;
const IDLE_INACTIVITY_MS = 3 * 60 * 1000; // 3 minutes
const DEFAULT_COMMAND_TIMEOUT_MS = 90_000; // 90s per command

/**
 * Explicitly terminates active sandbox sessions for a user/repo to save compute hours.
 */
export async function closeSandboxSession(supabaseClient: any, userId: string, repo?: string) {
  const apiKey = Deno.env.get('E2B_API_KEY');
  if (!supabaseClient || !userId) return;
  try {
    let query = supabaseClient
      .from('git_sandboxes')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'idle']);
    if (repo) query = query.eq('repo', repo);
    const { data: existing } = await query;
    if (existing && existing.length > 0) {
      for (const row of existing) {
        if (apiKey) {
          try {
            const sbx = await Sandbox.connect(row.sandbox_id, { apiKey });
            await sbx.kill();
          } catch {
            // Already dead
          }
        }
        await supabaseClient.from('git_sandboxes').update({ status: 'closed' }).eq('id', row.id);
      }
    }
  } catch (err) {
    console.warn('Error closing sandbox session:', err);
  }
}

/**
 * Run a command inside a persistent 20-minute E2B Linux sandbox.
 * Reconnects to existing sandboxes for the user/repo if within the 20-minute window.
 * Enforces the 20-concurrent-sandbox Hobby limit by evicting idle sessions.
 */
export async function runInSandbox(options: RunSandboxOptions): Promise<SandboxExecutionResult> {
  const apiKey = Deno.env.get('E2B_API_KEY');
  if (!apiKey) {
    throw new Error('E2B sandbox API key is not configured in server secrets.');
  }

  const startTime = Date.now();
  const repo = options.repo || 'generic';
  const branch = options.branch || 'main';

  // 1. If explicit sandbox kill requested
  if (options.killSandbox) {
    options.onProgress?.('Terminating cloud sandbox session...');
    if (options.supabase && options.userId) {
      const { data: existing } = await options.supabase
        .from('git_sandboxes')
        .select('*')
        .eq('user_id', options.userId)
        .eq('repo', repo)
        .in('status', ['active', 'idle'])
        .gt('expires_at', new Date().toISOString());

      if (existing && existing.length > 0) {
        for (const row of existing) {
          try {
            const sbx = await Sandbox.connect(row.sandbox_id, { apiKey });
            await sbx.kill();
          } catch {
            // Already stopped
          }
          await options.supabase.from('git_sandboxes').update({ status: 'closed' }).eq('id', row.id);
        }
      }
    }
    return {
      stdout: 'Cloud sandbox terminated successfully.',
      stderr: '',
      exitCode: 0,
      durationMs: Date.now() - startTime,
    };
  }

  let sandbox: any = null;
  let sandboxDbId: string | null = null;
  let isReused = false;

  // 2. Check for an existing, active sandbox to reuse (20-minute window)
  if (options.supabase && options.userId && options.repo) {
    try {
      const { data: activeRows } = await options.supabase
        .from('git_sandboxes')
        .select('*')
        .eq('user_id', options.userId)
        .eq('repo', options.repo)
        .in('status', ['active', 'idle'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeRows && activeRows.length > 0) {
        const row = activeRows[0];
        options.onProgress?.('Reconnecting to existing 20-minute sandbox session...');
        try {
          sandbox = await Sandbox.connect(row.sandbox_id, { apiKey });
          // Extend the 20-minute timeout
          await sandbox.setTimeout(SANDBOX_WINDOW_MS);
          sandboxDbId = row.id;
          isReused = true;

          // Update active timestamp and renew 20-min expiration
          await options.supabase.from('git_sandboxes').update({
            status: 'active',
            last_active_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + SANDBOX_WINDOW_MS).toISOString(),
          }).eq('id', row.id);
        } catch (connErr) {
          console.warn('Existing sandbox no longer accessible, will provision fresh:', connErr);
          await options.supabase.from('git_sandboxes').update({ status: 'closed' }).eq('id', row.id);
          sandbox = null;
        }
      }
    } catch (err) {
      console.warn('Error checking existing sandbox in database:', err);
    }
  }

  // 3. If no active sandbox to reuse, manage capacity and provision a new one
  if (!sandbox) {
    if (options.supabase) {
      // Clean up expired sandboxes in DB
      await options.supabase
        .from('git_sandboxes')
        .update({ status: 'closed' })
        .lte('expires_at', new Date().toISOString())
        .in('status', ['active', 'idle']);

      // Count currently active/idle sandboxes across the entire platform
      const { count } = await options.supabase
        .from('git_sandboxes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'idle'])
        .gt('expires_at', new Date().toISOString());

      if ((count || 0) >= MAX_CONCURRENT_SANDBOXES) {
        options.onProgress?.('Sandbox capacity at 20/20. Looking for idle sessions...');
        // Find candidate idle sandbox (last active > 3 minutes ago)
        const idleCutoff = new Date(Date.now() - IDLE_INACTIVITY_MS).toISOString();
        const { data: idleRows } = await options.supabase
          .from('git_sandboxes')
          .select('*')
          .in('status', ['active', 'idle'])
          .lt('last_active_at', idleCutoff)
          .order('last_active_at', { ascending: true })
          .limit(1);

        if (idleRows && idleRows.length > 0) {
          const idle = idleRows[0];
          options.onProgress?.('Evicting idle sandbox session to free capacity...');
          try {
            const idleSbx = await Sandbox.connect(idle.sandbox_id, { apiKey });
            await idleSbx.kill();
          } catch {
            // Already dead
          }
          await options.supabase.from('git_sandboxes').update({ status: 'closed' }).eq('id', idle.id);
        } else {
          // No idle sessions available to evict
          throw new Error('All 20 cloud sandbox slots are currently in use with no idle sessions. The queue is full—please try again soon.');
        }
      }
    }

    options.onProgress?.('Provisioning isolated cloud Linux sandbox (20-minute window)...');
    sandbox = await Sandbox.create({
      apiKey,
      timeoutMs: SANDBOX_WINDOW_MS,
    });

    if (options.supabase && options.userId && options.repo) {
      const { data: inserted } = await options.supabase
        .from('git_sandboxes')
        .insert({
          user_id: options.userId,
          sandbox_id: sandbox.sandboxId,
          repo: options.repo,
          branch,
          status: 'active',
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + SANDBOX_WINDOW_MS).toISOString(),
        })
        .select('id')
        .single();

      if (inserted) {
        sandboxDbId = inserted.id;
      }
    }
  }

  try {
    let workdir = '/home/user';

    // 4. Git clone or sync if repo provided
    if (options.repo && options.gitToken) {
      workdir = '/home/user/repo';
      const checkRes = await sandbox.commands.run('[ -d /home/user/repo/.git ] && echo "exists" || echo "missing"');
      const isCloned = checkRes.stdout.includes('exists');

      if (!isCloned) {
        options.onProgress?.(`Cloning repository ${options.repo} (${branch})...`);
        const cloneCmd = `git clone --depth 1 --single-branch --branch ${branch} https://x-access-token:${options.gitToken}@github.com/${options.repo}.git /home/user/repo`;
        const cloneRes = await sandbox.commands.run(cloneCmd, { timeoutMs: 45_000 });
        if (cloneRes.exitCode !== 0) {
          return {
            stdout: cloneRes.stdout,
            stderr: `Failed to clone repository ${options.repo} (${branch}): ${cloneRes.stderr}`,
            exitCode: cloneRes.exitCode,
            durationMs: Date.now() - startTime,
            sandboxId: sandbox.sandboxId,
          };
        }
      }
    }

    // 5. Write any in-flight / modified files
    if (options.files && options.files.length > 0) {
      options.onProgress?.(`Writing ${options.files.length} test/source file(s)...`);
      for (const file of options.files) {
        const fullPath = file.path.startsWith('/') ? file.path : `${workdir}/${file.path}`;
        await sandbox.files.write(fullPath, file.content);
      }
    }

    // 6. Execute command
    let cmd = options.command.trim();
    let isServer = Boolean(options.background);
    if (!isServer) {
      const lower = cmd.toLowerCase();
      if (
        lower.includes('run dev') ||
        lower.includes('run preview') ||
        lower.includes('vite preview') ||
        lower.includes('vite dev') ||
        lower.includes('next dev') ||
        lower.includes('http.server') ||
        lower.includes('npm start') ||
        options.port
      ) {
        isServer = true;
      }
    }

    let preCommandOutput = '';
    let serverCmd = cmd;

    // Auto-install dependencies if node_modules is missing
    if (isServer || cmd.includes('npm ') || cmd.includes('vite')) {
      const checkDeps = await sandbox.commands.run('[ -f package.json ] && [ ! -d node_modules ] && echo "need_install" || echo "ok"', { cwd: workdir });
      if (checkDeps.stdout.includes('need_install')) {
        options.onProgress?.('Installing project dependencies (npm install)...');
        const installRes = await sandbox.commands.run('npm install --prefer-offline --no-audit --no-fund', {
          cwd: workdir,
          timeoutMs: 90_000,
        });
        preCommandOutput += `[npm install]\n${installRes.stdout}\n${installRes.stderr}\n\n`;
        if (installRes.exitCode !== 0) {
          return {
            stdout: preCommandOutput,
            stderr: `npm install failed with code ${installRes.exitCode}: ${installRes.stderr}`,
            exitCode: installRes.exitCode,
            durationMs: Date.now() - startTime,
            sandboxId: sandbox.sandboxId,
          };
        }
      }
    }

    // If running preview, ensure dist/ exists
    if (isServer && (serverCmd.includes('preview') || options.port === 4173)) {
      const checkDist = await sandbox.commands.run('[ -d dist ] && echo "has_dist" || echo "missing_dist"', { cwd: workdir });
      if (checkDist.stdout.includes('missing_dist')) {
        options.onProgress?.('Building project for preview (npm run build)...');
        const buildRes = await sandbox.commands.run('npm run build', {
          cwd: workdir,
          timeoutMs: 60_000,
        });
        preCommandOutput += `[npm run build]\n${buildRes.stdout}\n${buildRes.stderr}\n\n`;
        if (buildRes.exitCode !== 0) {
          return {
            stdout: preCommandOutput,
            stderr: `npm run build failed with code ${buildRes.exitCode}: ${buildRes.stderr}`,
            exitCode: buildRes.exitCode,
            durationMs: Date.now() - startTime,
            sandboxId: sandbox.sandboxId,
          };
        }
      }
    }

    // If chained with &&, run build/setup steps synchronously before launching server
    if (isServer && cmd.includes('&&')) {
      const parts = cmd.split(/\s*&&\s*/);
      const preParts = parts.slice(0, -1);
      serverCmd = parts[parts.length - 1];

      const preCmd = preParts.join(' && ');
      options.onProgress?.(`Running build/setup: ${preCmd}...`);
      const preRes = await sandbox.commands.run(preCmd, {
        cwd: workdir,
        timeoutMs: options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
      });

      preCommandOutput += `[Build / Setup Output]\n${preRes.stdout}\n${preRes.stderr}\n\n`;
      if (preRes.exitCode !== 0) {
        return {
          stdout: preCommandOutput,
          stderr: `Build step failed with exit code ${preRes.exitCode}: ${preRes.stderr}`,
          exitCode: preRes.exitCode,
          durationMs: Date.now() - startTime,
          sandboxId: sandbox.sandboxId,
        };
      }
    }

    // Auto-bind to 0.0.0.0 so E2B external proxy does not get connection refused
    if ((serverCmd.includes('vite') || serverCmd.includes('dev') || serverCmd.includes('preview')) && !serverCmd.includes('--host')) {
      if (serverCmd.includes('npm run ') || serverCmd.includes('npm start')) {
        serverCmd = `${serverCmd} -- --host 0.0.0.0`;
      } else {
        serverCmd = `${serverCmd} --host 0.0.0.0`;
      }
    }

    const targetPort = options.port || (serverCmd.includes('preview') ? 4173 : 5173);
    const fullServerCommand = isServer
      ? `nohup bash -c "export HOST=0.0.0.0 PORT=${targetPort}; ${serverCmd}" > /tmp/server.log 2>&1 &`
      : `export HOST=0.0.0.0 PORT=${targetPort}; ${serverCmd}`;

    options.onProgress?.(`Executing: ${serverCmd}...`);
    const cmdTimeout = options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS;
    let res: any;

    try {
      res = await sandbox.commands.run(fullServerCommand, {
        cwd: workdir,
        timeoutMs: cmdTimeout,
      });

      if (isServer) {
        // Wait briefly for server to initiate
        await new Promise((r) => setTimeout(r, 2500));
        const logRes = await sandbox.commands.run('cat /tmp/server.log 2>/dev/null || true', { timeoutMs: 3000 });
        const serverLog = logRes.stdout?.slice(0, 3000) || '';
        res = {
          stdout: `${preCommandOutput}Server running in background on port ${targetPort}:\n${serverLog}`.trim(),
          stderr: '',
          exitCode: 0,
        };
      }
    } catch (cmdErr: any) {
      if (cmdErr && (typeof cmdErr.exitCode === 'number' || cmdErr.stdout !== undefined || cmdErr.stderr !== undefined)) {
        res = {
          stdout: `${preCommandOutput}${cmdErr.stdout || ''}`,
          stderr: cmdErr.stderr || cmdErr.message || '',
          exitCode: typeof cmdErr.exitCode === 'number' ? cmdErr.exitCode : 1,
          error: cmdErr.message,
        };
      } else {
        throw cmdErr;
      }
    }

    // 7. Preview URL detection: always generate public E2B preview URL for servers
    let previewPort: number | undefined = options.port;
    let previewUrl: string | undefined;

    if (isServer || options.port) {
      previewPort = targetPort;
      const host = sandbox.getHost(previewPort);
      previewUrl = `https://${host}`;
      options.onProgress?.(`Live preview available at ${previewUrl}`);
    }

    // 8. Update DB with idle status and preview URL
    if (options.supabase && sandboxDbId) {
      await options.supabase.from('git_sandboxes').update({
        status: 'idle',
        last_active_at: new Date().toISOString(),
        preview_url: previewUrl || null,
        preview_port: previewPort || null,
      }).eq('id', sandboxDbId);
    }

    // Sanitize any GitHub token from output
    const sanitize = (text: string) => {
      if (!options.gitToken) return text;
      return text.replaceAll(options.gitToken, '***');
    };

    const expiresAt = new Date(Date.now() + SANDBOX_WINDOW_MS).toISOString();

    return {
      stdout: sanitize(res.stdout),
      stderr: sanitize(res.stderr),
      exitCode: res.exitCode,
      error: res.error ? String(res.error) : undefined,
      durationMs: Date.now() - startTime,
      previewUrl,
      previewPort,
      sandboxId: sandbox.sandboxId,
      expiresAt,
      isReusedSession: isReused,
    };
  } catch (err: any) {
    console.error('Error executing inside sandbox:', err);
    throw err;
  }
  // NOTE: Sandbox is intentionally NOT killed here!
  // It remains running for the 20-minute window to allow live previews and fast consecutive runs.
}

