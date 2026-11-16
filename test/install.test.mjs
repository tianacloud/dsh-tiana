import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

import { bootstrap, SKILL_NAMES } from '../install.js';

async function makeHome() {
  const dir = await mkdtemp(join(tmpdir(), 'tiana-bootstrap-test-'));
  return { dir, env: { DSH_HOME: dir, PATH: process.env.PATH ?? '' } };
}

async function createSkills(root) {
  for (const name of SKILL_NAMES) {
    const directory = join(root, 'skills', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'SKILL.md'), `# ${name}\n`, 'utf8');
  }
}

function makeRunner(options = {}) {
  const {
    cliInitially = true,
    installCli = true,
    installSkills = true,
    initialVersion = '1.0.30',
    installedVersion = '1.0.30',
  } = options;
  const calls = [];
  let cliPresent = cliInitially;
  let cliVersion = initialVersion;

  const run = async (command, args, runOptions) => {
    calls.push({ command, args, env: runOptions.env });
    if (command.endsWith('tiana') && args[0] === 'version') {
      if (!cliPresent) {
        throw Object.assign(new Error('spawn tiana ENOENT'), { code: 'ENOENT' });
      }
      return { code: 0, stdout: `tiana ${cliVersion} (helper-contract 3)\n`, stderr: '' };
    }
    if (command.endsWith('pnpm') && args[0] === 'add') {
      if (!installCli) return { code: 1, stdout: '', stderr: 'pnpm install failed' };
      cliPresent = true;
      cliVersion = installedVersion;
      return { code: 0, stdout: '', stderr: '' };
    }
    if (command.endsWith('npm') && args[0] === 'install') {
      if (!installCli) return { code: 1, stdout: '', stderr: 'npm install failed' };
      cliPresent = true;
      cliVersion = installedVersion;
      return { code: 0, stdout: '', stderr: '' };
    }
    if (
      (command.endsWith('npx') && args.includes('install')) ||
      (command.endsWith('pnpm') && args[0] === 'dlx')
    ) {
      if (!installSkills) return { code: 1, stdout: '', stderr: 'skills install failed' };
      await createSkills(runOptions.env.DSH_HOME);
      return { code: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };

  return { run, calls };
}

test('fresh home installs the CLI and DSH-only skills', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { run, calls } = makeRunner({ cliInitially: false });

  const state = await bootstrap({ env, run, log: () => {} });

  assert.equal(state.status, 'ok');
  assert.equal(state.cli.installed, true);
  assert.equal(state.cli.version, '1.0.30');
  assert.equal(state.skills.installed, true);
  assert.equal(state.skillsDir, join(dir, 'skills'));
  assert.ok(calls.some((call) => (call.command.endsWith('pnpm') && call.args[0] === 'add') || (call.command.endsWith('npm') && call.args[0] === 'install')));
  assert.ok(calls.some((call) => call.command.endsWith('npx') && call.args.includes('install')));
  for (const name of SKILL_NAMES) {
    assert.ok(existsSync(join(dir, 'skills', name, 'SKILL.md')), `${name} installed`);
  }

  const persisted = JSON.parse(await readFile(join(dir, 'tiana-plugin', 'install-state.json'), 'utf8'));
  assert.equal(persisted.status, 'ok');
  assert.equal(persisted.cli.version, '1.0.30');
});

test('an already-ready home still updates CLI and skills to latest', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await createSkills(dir);
  const { run, calls } = makeRunner();

  const state = await bootstrap({ env, run, log: () => {} });

  assert.equal(state.status, 'ok');
  assert.equal(state.cli.upgraded, true);
  assert.equal(state.skills.installed, true);
  assert.ok(calls.some((call) => call.args.includes('@tianacloud/cli@latest')));
  assert.ok(calls.some((call) => call.args.includes('@tianacloud/agent-skills@latest')));
});

test('missing skills are installed and an existing CLI is refreshed', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { run, calls } = makeRunner();

  const state = await bootstrap({ env, run, log: () => {} });

  assert.equal(state.status, 'ok');
  assert.equal(state.cli.upgraded, true);
  assert.equal(state.skills.installed, true);
  assert.ok(calls.some((call) => call.command.endsWith('npx')));
});

test('an old CLI is upgraded before skills are installed', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { run } = makeRunner({ initialVersion: '1.0.29', installedVersion: '1.0.30' });

  const state = await bootstrap({ env, run, log: () => {} });

  assert.equal(state.status, 'ok');
  assert.equal(state.cli.upgraded, true);
  assert.equal(state.cli.version, '1.0.30');
  assert.equal(state.skills.installed, true);
});

test('pnpm install is given a usable PNPM_HOME', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const testEnv = { ...env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  const { run, calls } = makeRunner({ cliInitially: false });

  const state = await bootstrap({ env: testEnv, run, log: () => {} });

  assert.equal(state.status, 'ok');
  const pnpmCall = calls.find((call) => call.command.endsWith('pnpm') && call.args[0] === 'add');
  assert.ok(pnpmCall);
  assert.equal(pnpmCall.env.PNPM_HOME, bin);
});

test('a failed CLI install is persisted and does not claim success', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { run } = makeRunner({ cliInitially: false, installCli: false });

  await assert.rejects(
    () => bootstrap({ env, run, log: () => {} }),
    /exited with 1|No package manager/,
  );

  const persisted = JSON.parse(await readFile(join(dir, 'tiana-plugin', 'install-state.json'), 'utf8'));
  assert.equal(persisted.status, 'error');
  assert.match(persisted.error, /exited with 1|No package manager/);
  assert.equal(existsSync(join(dir, 'skills', 'tiana', 'SKILL.md')), false);
});


test('bootstrap does not accept latest if it still lacks site pagination', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { run } = makeRunner({ initialVersion: '1.0.25', installedVersion: '1.0.29' });
  await assert.rejects(bootstrap({ env, run }), /below the required 1.0.30/);
  const state = JSON.parse(await readFile(join(dir, 'tiana-plugin', 'install-state.json'), 'utf8'));
  assert.equal(state.status, 'error');
});


test('existing skills are refreshed and a newer latest CLI is selected above the minimum', async (t) => {
  const { dir, env } = await makeHome();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await createSkills(dir);
  await writeFile(join(dir, 'skills', 'tiana', 'SKILL.md'), '# old version');
  const { run } = makeRunner({ initialVersion: '1.0.30', installedVersion: '1.0.31' });
  const state = await bootstrap({ env, run });
  assert.equal(state.cli.version, '1.0.31');
  assert.equal(state.skills.installed, true);
  assert.notEqual(await readFile(join(dir, 'skills', 'tiana', 'SKILL.md'), 'utf8'), '# old version');
});
