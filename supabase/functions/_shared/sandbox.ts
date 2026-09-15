// supabase/functions/_shared/sandbox.ts
import { Sandbox } from 'https://esm.sh/@e2b/code-interpreter@1.0.4';

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  durationMs: number;
}

// Hobby Tier Limits Guard:
// - Max 20 concurrent sandboxes
// - Max 1h session length (we limit ephemeral runs to 90 seconds max to preserve concurrency & compute)
// - Max 10GB disk, 8 vCPU, 8GB RAM
const ACTIVE_SANDBOX_TIMEOUT_MS = 90_000; // 90s execution cap per turn

/**
 * Execute a shell command in an ephemeral E2B Linux sandbox.
 * Can optionally clone a GitHub repository first using a GitHub token.
 */
export async function runInSandbox(options: {
  command: string;
  repo?: string;
  branch?: string;
  gitToken?: string;
  files?: Array<{ path: string; content: string }>;
  timeoutMs?: number;
}): Promise<SandboxExecutionResult> {
  const apiKey = Deno.env.get('E2B_API_KEY');
  if (!apiKey) {
    throw new Error('E2B sandbox API key is not configured in server secrets.');
  }

  const startTime = Date.now();
  const timeoutMs = Math.min(options.timeoutMs || ACTIVE_SANDBOX_TIMEOUT_MS, ACTIVE_SANDBOX_TIMEOUT_MS);

  // Create isolated ephemeral sandbox with strict idle timeout to prevent leaking concurrent sandboxes
  const sandbox = await Sandbox.create({
    apiKey,
    timeoutMs: timeoutMs + 15_000, // Hard lifecycle kill
  });

  try {
    // 1. If repo provided, clone it into /home/user/repo (shallow clone to stay well within 10GB disk limit)
    let workdir = '/home/user';
    if (options.repo && options.gitToken) {
      workdir = '/home/user/repo';
      const branch = options.branch || 'main';
      const cloneCmd = `git clone --depth 1 --single-branch --branch ${branch} https://x-access-token:${options.gitToken}@github.com/${options.repo}.git /home/user/repo`;
      const cloneRes = await sandbox.commands.run(cloneCmd, { timeoutMs: 30_000 });
      if (cloneRes.exitCode !== 0) {
        return {
          stdout: cloneRes.stdout,
          stderr: `Failed to clone repository ${options.repo} (${branch}): ${cloneRes.stderr}`,
          exitCode: cloneRes.exitCode,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 2. Write any uncommitted / in-flight files into the sandbox
    if (options.files && options.files.length > 0) {
      for (const file of options.files) {
        const fullPath = file.path.startsWith('/') ? file.path : `${workdir}/${file.path}`;
        await sandbox.files.write(fullPath, file.content);
      }
    }

    // 3. Execute the requested command
    const res = await sandbox.commands.run(options.command, {
      cwd: workdir,
      timeoutMs,
    });

    // Sanitize any token leaks from output
    const sanitize = (text: string) => {
      if (!options.gitToken) return text;
      return text.replaceAll(options.gitToken, '***');
    };

    return {
      stdout: sanitize(res.stdout),
      stderr: sanitize(res.stderr),
      exitCode: res.exitCode,
      error: res.error ? String(res.error) : undefined,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Always immediately terminate sandbox to free up the 20 concurrent sandbox limit on Hobby tier
    try {
      await sandbox.kill();
    } catch {
      // Ignore shutdown cleanup errors
    }
  }
}
