/**
 * Run a command of an untrusted template (its build) under the DSH sandbox.
 *
 * DSH exposes `ctx.sandbox` (`@deepseek-ai/dsh-sandbox`): `confine(argv, policy)`
 * wraps an argv in bwrap/Landlock (Linux), Seatbelt (macOS) or the ACL runner
 * (Windows). `workspace-write` allows writes only under the template directory
 * plus the extra roots given here; everything else on the filesystem becomes
 * read-only. The sandbox does NOT restrict reads or the network, so it limits
 * what a hostile build script can modify, not what it can read or send.
 *
 * When no usable sandbox exists the command still runs, unconfined, and the
 * caller gets the reason so it can show a warning. Set
 * `TIANA_LOCAL_BUILD_SANDBOX=off` to skip confinement on purpose.
 */
import { mkdirSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { runCommand } from './install.js';

const DENIAL = /read-only file system|erofs|permission denied|operation not permitted|access is denied/i;

function runnerFailed(result, runner) {
  if (result.code === 0 || typeof result.stderr !== 'string') return false;
  return result.stderr.split(/\r?\n/).some((line) => line.startsWith(`${runner}: `));
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Probe whether DSH's sandbox service supports our `workspace-write` +
 * `additionalWritableRoots` build policy on this machine.
 * @param {object|undefined} sandbox - DSH `ctx.sandbox` service, if any.
 * @param {{probeRoot: string, env?: NodeJS.ProcessEnv}} options - probe directory and env.
 * @returns {Promise<{supported: boolean, enforcement: string|null, reason: string|null}>} capability.
 */
export async function probeSandboxSupport(sandbox, { probeRoot, env = process.env }) {
  if (env.TIANA_LOCAL_BUILD_SANDBOX === 'off') {
    return { supported: false, enforcement: null, reason: 'disabled by TIANA_LOCAL_BUILD_SANDBOX=off' };
  }
  if (sandbox === undefined || sandbox === null || typeof sandbox.confine !== 'function') {
    return { supported: false, enforcement: null, reason: 'the DSH sandbox service is not available' };
  }
  try {
    mkdirSync(probeRoot, { recursive: true });
    const root = realpathSync(probeRoot);
    const wrapped = await sandbox.confine([process.execPath, '--version'], {
      mode: 'workspace-write',
      workspaceRoot: root,
      additionalWritableRoots: [root],
    });
    const probe = await runCommand(wrapped.argv[0], wrapped.argv.slice(1), { cwd: root, env, timeoutMs: 5000 });
    if (probe.code !== 0) throw new Error('The sandbox runner cannot execute on this system.');
    return {
      supported: true,
      enforcement: wrapped.enforcement ?? null,
      reason: null,
    };
  } catch (error) {
    return {
      supported: false,
      enforcement: null,
      reason: message(error),
    };
  }
}

/**
 * @param {object|undefined} sandbox - DSH `ctx.sandbox` service, if any.
 * @param {{workspaceRoot: string, writableRoots?: string[], env?: NodeJS.ProcessEnv}} confinement - template dir and extra writable dirs.
 * @param {string} command - executable.
 * @param {string[]} args - argv without the executable.
 * @param {object} options - `runCommand` options.
 * @returns {Promise<{result: object, confined: boolean, enforcement?: string, denied: boolean, reason?: string}>} run outcome.
 */
export async function runConfined(sandbox, { workspaceRoot, writableRoots = [], env = process.env }, command, args, options = {}) {
  const unconfined = async (reason) => ({
    result: await runCommand(command, args, options),
    confined: false,
    denied: false,
    reason,
  });

  if (env.TIANA_LOCAL_BUILD_SANDBOX === 'off') return unconfined('disabled by TIANA_LOCAL_BUILD_SANDBOX=off');
  if (sandbox === undefined || sandbox === null || typeof sandbox.confine !== 'function') {
    return unconfined('the DSH sandbox service is not available');
  }

  let wrapped;
  try {
    const extra = writableRoots.map((root) => {
      mkdirSync(root, { recursive: true });
      return realpathSync(root);
    });
    wrapped = await sandbox.confine([command, ...args], {
      mode: 'workspace-write',
      workspaceRoot: realpathSync(workspaceRoot),
      additionalWritableRoots: extra,
    }, options.signal);
  } catch (error) {
    return unconfined(message(error));
  }

  const runner = basename(wrapped.argv[0]);
  let result;
  try {
    result = await runCommand(wrapped.argv[0], wrapped.argv.slice(1), options);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES') return unconfined(`sandbox runner ${runner} could not start`);
    throw error;
  }
  if (runnerFailed(result, runner)) return unconfined(`sandbox runner ${runner} failed: ${result.stderr.split(/\r?\n/).find((line) => line.startsWith(`${runner}: `))}`);

  return {
    result,
    confined: true,
    enforcement: wrapped.enforcement,
    denied: result.code !== 0 && DENIAL.test(`${result.stderr}`),
  };
}
