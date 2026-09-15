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
    options.onProgress?.(`Executing: ${options.command}...`);
    const cmdTimeout = options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS;
    const res = await sandbox.commands.run(options.command, {
      cwd: workdir,
      timeoutMs: cmdTimeout,
      background: !!options.background,
    });

    // 7. Preview URL detection: specified port or listening dev server ports
    let previewPort: number | undefined = options.port;
    let previewUrl: string | undefined;

    try {
      // Check for listening ports (e.g. 3000, 5173, 8080, 8000)
      const portCheck = await sandbox.commands.run('ss -tulpn 2>/dev/null || netstat -tuln 2>/dev/null', { timeoutMs: 5000 });
      const portMatches = [...portCheck.stdout.matchAll(/:(\d{3,5})\b/g)].map(m => parseInt(m[1], 10));
      const commonPorts = [5173, 3000, 8080, 8000, 4173, 5000, 8081, 4000];

      if (!previewPort) {
        for (const p of commonPorts) {
          if (portMatches.includes(p)) {
            previewPort = p;
            break;
          }
        }
      }

      if (previewPort) {
        const host = sandbox.getHost(previewPort);
        previewUrl = `https://${host}`;
        options.onProgress?.(`Live preview available at ${previewUrl}`);
      }
    } catch {
      // Port inspection is non-fatal
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

