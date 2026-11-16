/**
 * Latest-toolchain bootstrap for the Tiana plugin.
 *
 * Installing this bundle should leave the machine ready to use Tiana:
 * - the `tiana` CLI is installed or updated to npm latest;
 * - the official Tiana agent skills are installed into the DSH-owned skill root
 *   (`$DSH_HOME/skills`), never the shared `~/.agents/skills`.
 *
 * Existing CLI and official skills are refreshed as well. The bootstrap runs
 * from the Host plugin's `apply()` and can also be invoked manually through
 * `scripts/bootstrap.mjs`. State is written under `$DSH_HOME/tiana-plugin/`.
 */
import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { delimiter, dirname, join } from 'node:path';

const CLI_PACKAGE = '@tianacloud/cli@latest';
const SKILLS_PACKAGE = '@tianacloud/agent-skills@latest';
const CLI_REGISTRY = 'https://registry.npmjs.org/';
const MAX_OUTPUT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const CLI_CHECK_TIMEOUT_MS = 15 * 1000;

/** Tiana CLI versions below this floor are upgraded during bootstrap. */
export const MIN_CLI_VERSION = [1, 0, 30];

/** Skills supplied by the official Tiana agent-skills package. */
export const SKILL_NAMES = [
  'tiana',
  'tiana-function',
  'tiana-git',
  'tiana-sqlite',
  'tiana-web',
];

/**
 * Resolve the DSH home that owns the private skill root.
 * @param {NodeJS.ProcessEnv} env - environment to read.
 * @returns {string} absolute DSH home path.
 */
export function dshHome(env = process.env) {
  const configured = env.DSH_HOME?.trim();
  return configured && configured.length > 0 ? configured : join(homedir(), '.dsh');
}

/**
 * The DSH-only user skill root. This is `user-dsh` in `dsh-skill-filesystem`,
 * not the shared `~/.agents/skills` (`user-agents`).
 * @param {NodeJS.ProcessEnv} env - environment to read.
 * @returns {string} absolute skill directory.
 */
export function skillsDirectory(env = process.env) {
  return join(dshHome(env), 'skills');
}

/**
 * Diagnostic state file for the last bootstrap attempt.
 * @param {NodeJS.ProcessEnv} env - environment to read.
 * @returns {string} absolute state file path.
 */
export function statePath(env = process.env) {
  return join(dshHome(env), 'tiana-plugin', 'install-state.json');
}

/**
 * Run one command and collect a bounded output tail.
 * @param {string} command - executable name or absolute path.
 * @param {readonly string[]} args - argv without the executable.
 * @param {object} [options] - run options.
 * @param {string} [options.cwd] - working directory.
 * @param {NodeJS.ProcessEnv} [options.env] - child environment.
 * @param {number} [options.timeoutMs] - hard timeout.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @param {boolean} [options.killProcessGroup] - terminate build descendants together on POSIX.
 * @param {number} [options.stdoutLimit] - capture complete stdout up to this character limit, failing on overflow.
 * @returns {Promise<{code: number|null, signal: string|null, stdout: string, stderr: string, command: string, args: readonly string[]}>}
 */
export function runCommand(command, args, options = {}) {
  const {
    cwd = homedir(),
    env = process.env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    stdoutLimit,
    killProcessGroup = false,
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: killProcessGroup && process.platform !== 'win32',
        shell: process.platform === 'win32',
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    const stdoutDecoder = new StringDecoder('utf8');
    let stderr = '';
    let settled = false;
    let timeout;
    let killTimer;

    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const kill = signal => {
        try {
          if (killProcessGroup && process.platform !== 'win32') process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch { /* Process already exited. */ }
      };
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 5000);
    };
    const onAbort = () => {
      stop();
      finish(reject, abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      stop();
      finish(reject, Object.assign(new Error(`${command} timed out after ${timeoutMs}ms`), {
        code: 'ETIMEDOUT',
        command,
        args,
      }));
    }, timeoutMs);

    const collectStdout = (text) => {
      if (settled) return;
      stdout = stdoutLimit === undefined ? tail(stdout, text) : stdout + text;
      if (stdoutLimit !== undefined && stdout.length > stdoutLimit) {
        stop();
        finish(reject, Object.assign(new Error('Tiana CLI JSON output exceeded its size limit.'), { code: 'CLI_OUTPUT_TOO_LARGE' }));
      }
    };
    child.stdout?.on('data', (chunk) => collectStdout(stdoutDecoder.write(chunk)));
    child.stderr?.on('data', (chunk) => {
      stderr = tail(stderr, chunk);
    });
    child.on('error', (error) => {
      finish(reject, Object.assign(error, { command, args }));
    });
    child.on('close', (code, signalName) => {
      collectStdout(stdoutDecoder.end());
      finish(resolve, { code, signal: signalName, stdout, stderr, command, args });
    });
  });
}

/**
 * Install or refresh the CLI and DSH-only official skills to latest.
 * @param {object} [options] - bootstrap options.
 * @param {NodeJS.ProcessEnv} [options.env] - environment to read.
 * @param {(message: string) => void} [options.log] - progress sink.
 * @param {typeof runCommand} [options.run] - command runner, injectable for tests.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<object>} the final state record.
 */
export async function bootstrap(options = {}) {
  if (running !== undefined) return running;
  running = runBootstrap(options).finally(() => {
    running = undefined;
  });
  return running;
}

let running;

async function runBootstrap({ env = process.env, log = () => {}, run = runCommand, signal } = {}) {
  const home = dshHome(env);
  const skillsDir = skillsDirectory(env);
  const state = {
    status: 'running',
    startedAt: new Date().toISOString(),
    dshHome: home,
    skillsDir,
    cli: {},
    skills: { names: SKILL_NAMES },
  };
  await writeState(env, state);

  try {
    throwIfAborted(signal);

    const before = await readCliVersion(env, run, signal);
    log('Installing or updating the Tiana CLI to npm latest');
    await installCli(env, run, log, signal);
    state.cli.installed = before === undefined;
    state.cli.upgraded = before !== undefined;
    const after = await readCliVersion(env, run, signal);

    if (after === undefined) {
      throw new Error('Tiana CLI is still unavailable after installation');
    }
    if (!versionAtLeast(after, MIN_CLI_VERSION)) {
      throw new Error(`Tiana CLI ${after.join('.')} is below the required ${MIN_CLI_VERSION.join('.')}`);
    }
    state.cli.version = after.join('.');

    throwIfAborted(signal);
    log(`Installing or updating Tiana skills to npm latest in ${skillsDir}`);
    await installSkills(env, skillsDir, run, log, signal);
    if (!(await skillsPresent(skillsDir))) {
      throw new Error(`Tiana skills are incomplete under ${skillsDir}`);
    }
    state.skills.installed = true;

    state.status = 'ok';
    state.finishedAt = new Date().toISOString();
    await writeState(env, state);
    log(`Tiana is ready: CLI ${state.cli.version}; skills in ${skillsDir}`);
    return state;
  } catch (error) {
    state.status = 'error';
    state.finishedAt = new Date().toISOString();
    state.error = error instanceof Error ? error.message : String(error);
    await writeState(env, state).catch(() => {});
    throw error;
  }
}

async function readCliVersion(env, run, signal) {
  try {
    const result = await run(commandName('tiana'), ['version'], {
      env: { ...env, TIANA_FROM: 'dsh' },
      timeoutMs: CLI_CHECK_TIMEOUT_MS,
      signal,
    });
    if (result.code !== 0) return undefined;
    return parseVersion(`${result.stdout}\n${result.stderr}`);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ETIMEDOUT') return undefined;
    throw error;
  }
}

async function installCli(env, run, log, signal) {
  const attempts = [];
  const pnpmHome = findPnpmHome(env);
  if (pnpmHome !== undefined) {
    attempts.push({
      command: commandName('pnpm'),
      args: ['add', '-g', CLI_PACKAGE],
      env: { ...env, PNPM_HOME: pnpmHome },
    });
  }
  attempts.push({
    command: commandName('npm'),
    args: ['install', '-g', CLI_PACKAGE, `--registry=${CLI_REGISTRY}`],
    env,
  });

  let lastError;
  for (const attempt of attempts) {
    throwIfAborted(signal);
    try {
      log(`Running ${attempt.command} ${attempt.args.join(' ')}`);
      const result = await run(attempt.command, attempt.args, {
        env: attempt.env,
        signal,
      });
      if (result.code === 0) return;
      lastError = new Error(`${attempt.command} exited with ${result.code}: ${lastOutput(result)}`);
      log(lastError.message);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
        lastError = error;
        continue;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error('No package manager was available to install the Tiana CLI');
}

async function installSkills(env, skillsDir, run, log, signal) {
  const attempts = [
    [commandName('npx'), ['--yes', SKILLS_PACKAGE, 'install', '--dir', skillsDir]],
    [commandName('pnpm'), ['dlx', SKILLS_PACKAGE, 'install', '--dir', skillsDir]],
  ];
  let lastError;

  for (const [command, args] of attempts) {
    throwIfAborted(signal);
    try {
      log(`Running ${command} ${args.join(' ')}`);
      const result = await run(command, args, { env, signal });
      if (result.code === 0) return;
      lastError = new Error(`${command} exited with ${result.code}: ${lastOutput(result)}`);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        lastError = error;
        continue;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error('No installer was available to install the Tiana skills');
}

async function skillsPresent(skillsDir) {
  try {
    await Promise.all(
      SKILL_NAMES.map((name) => access(join(skillsDir, name, 'SKILL.md'), fsConstants.R_OK)),
    );
    return true;
  } catch {
    return false;
  }
}

async function writeState(env, state) {
  const file = statePath(env);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

function parseVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(current, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

/** The `tiana` CLI executable name for this platform. */
export function tianaCommand() {
  return commandName('tiana');
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

/**
 * Locate a user-owned pnpm home so a global install needs no root permissions.
 * `pnpm add -g` refuses to run without a known global bin directory unless
 * `PNPM_HOME` is set; the directory containing the `pnpm` executable is that
 * same bin directory and is already on PATH.
 * @param {NodeJS.ProcessEnv} env - environment to read.
 * @returns {string | undefined} absolute pnpm home.
 */
function findPnpmHome(env) {
  const configured = env.PNPM_HOME?.trim();
  if (configured !== undefined && configured.length > 0) return configured;
  const executable = findOnPath(env.PATH ?? '', process.platform === 'win32'
    ? ['pnpm.cmd', 'pnpm.exe', 'pnpm']
    : ['pnpm']);
  if (executable === undefined) return undefined;
  const candidate = dirname(executable);
  try {
    accessSync(candidate, fsConstants.W_OK);
    return candidate;
  } catch {
    return undefined;
  }
}

function findOnPath(pathValue, names) {
  for (const directory of pathValue.split(delimiter)) {
    if (directory === '') continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return undefined;
}

function tail(existing, chunk) {
  return (existing + chunk.toString()).slice(-MAX_OUTPUT);
}

function lastOutput(result) {
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim();
  return output.length > 0 ? output : '(no output)';
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  return Object.assign(new Error('Tiana bootstrap was cancelled'), { code: 'ABORTED' });
}
