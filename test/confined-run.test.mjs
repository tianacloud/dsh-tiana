import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runConfined } from '../confined-run.js';

const NODE = process.execPath;

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tiana-confined-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const passthrough = (calls = []) => ({
  confine: async (argv, policy) => {
    calls.push({ argv, policy });
    return { argv, enforcement: 'fake' };
  },
});

test('runs through the sandbox wrapper with workspace-write policy', () => withDir(async (dir) => {
  const calls = [];
  const out = await runConfined(passthrough(calls), { workspaceRoot: dir, writableRoots: [join(dir, 'dist')], env: {} }, NODE, ['-e', 'process.stdout.write("ok")'], { cwd: dir });
  assert.equal(out.confined, true);
  assert.equal(out.enforcement, 'fake');
  assert.equal(out.result.stdout, 'ok');
  assert.equal(calls[0].policy.mode, 'workspace-write');
  assert.equal(calls[0].policy.additionalWritableRoots.length, 1);
}));

test('falls back unconfined when the sandbox is missing, disabled or throws', () => withDir(async (dir) => {
  const run = (sandbox, env = {}) => runConfined(sandbox, { workspaceRoot: dir, env }, NODE, ['-e', ''], { cwd: dir });
  const missing = await run(undefined);
  assert.equal(missing.confined, false);
  assert.match(missing.reason, /not available/);
  const off = await run(passthrough(), { TIANA_LOCAL_BUILD_SANDBOX: 'off' });
  assert.equal(off.confined, false);
  assert.match(off.reason, /TIANA_LOCAL_BUILD_SANDBOX/);
  const broken = await run({ confine: async () => { throw new Error('no bwrap'); } });
  assert.equal(broken.confined, false);
  assert.equal(broken.reason, 'no bwrap');
}));

test('falls back when the runner itself fails or cannot start', () => withDir(async (dir) => {
  const failing = { confine: async () => ({ argv: [NODE, '-e', 'console.error("node: setup failed"); process.exit(1)'], enforcement: 'fake' }) };
  const a = await runConfined(failing, { workspaceRoot: dir, env: {} }, NODE, ['-e', ''], { cwd: dir });
  assert.equal(a.confined, false);
  assert.match(a.reason, /failed/);
  const missing = { confine: async () => ({ argv: ['/nonexistent/runner', 'x'], enforcement: 'fake' }) };
  const b = await runConfined(missing, { workspaceRoot: dir, env: {} }, NODE, ['-e', ''], { cwd: dir });
  assert.equal(b.confined, false);
  assert.match(b.reason, /could not start/);
}));

test('flags filesystem denials from a confined command', () => withDir(async (dir) => {
  const denying = { confine: async () => ({ argv: [NODE, '-e', 'console.error("EROFS: read-only file system"); process.exit(1)'], enforcement: 'fake' }) };
  const out = await runConfined(denying, { workspaceRoot: dir, env: {} }, NODE, ['-e', ''], { cwd: dir });
  assert.equal(out.confined, true);
  assert.equal(out.denied, true);
}));

test('probeSandboxSupport detects whether the host sandbox supports workspace-write with extra roots', () => withDir(async (dir) => {
  const { probeSandboxSupport } = await import('../confined-run.js');
  const ok = await probeSandboxSupport(passthrough(), { probeRoot: dir, env: {} });
  assert.deepEqual(ok, { supported: true, enforcement: 'fake', reason: null });

  const off = await probeSandboxSupport(passthrough(), { probeRoot: dir, env: { TIANA_LOCAL_BUILD_SANDBOX: 'off' } });
  assert.equal(off.supported, false);
  assert.match(off.reason, /TIANA_LOCAL_BUILD_SANDBOX/);

  const missing = await probeSandboxSupport(undefined, { probeRoot: dir, env: {} });
  assert.equal(missing.supported, false);

  const unsupported = await probeSandboxSupport({ confine: async () => { throw new Error('additionalWritableRoots not supported'); } }, { probeRoot: dir, env: {} });
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.reason, /additionalWritableRoots/);
}));


test('sandbox probe rejects wrappers that exist but cannot run on the system', () => withDir(async dir => {
  const {probeSandboxSupport}=await import('../confined-run.js');
  const sandbox={confine:async()=>({argv:[NODE,'-e','process.exit(1)'],enforcement:'unusable'})};
  assert.equal((await probeSandboxSupport(sandbox,{probeRoot:dir,env:{}})).supported,false);
}));
