import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { loginStart, loginResume, listSites } from '../tiana-api.js';

test('CLI children receive DSH attribution and authorization URLs stay unchanged', async (t) => {
  if (process.platform === 'win32') return t.skip('This executable fixture uses a POSIX shebang.');
  const root = await mkdtemp(join(tmpdir(), 'tiana-cli-source-'));
  const previous = { ...process.env };
  t.after(async () => {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(root, { recursive: true, force: true });
  });
  const log = join(root, 'calls.jsonl');
  const verificationUri = 'https://console.example.test/auth/cli?code=fixture%20code&return=%2Fwelcome#confirm';
  await writeFile(join(root, 'tiana'), `#!${process.execPath}
const {appendFileSync} = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, from: process.env.TIANA_FROM, origin: process.env.TIANA_API_ORIGIN}) + '\\n');
console.log(JSON.stringify({status: 'pending', data: {verification_uri: ${JSON.stringify(verificationUri)}, pending_auth: true}}));
`, { mode: 0o700 });
  process.env.PATH = `${root}${delimiter}${previous.PATH ?? ''}`;
  process.env.DSH_HOME = join(root, 'home');
  process.env.TIANA_API_ORIGIN = 'https://management.example.test';
  process.env.TIANA_FROM = 'other-host';

  assert.equal((await loginStart()).verificationUri, verificationUri);
  assert.equal((await loginResume()).verificationUri, verificationUri);
  await listSites();
  assert.equal(process.env.TIANA_FROM, 'other-host');

  delete process.env.TIANA_FROM;
  // Temporary-directory failure must still preserve the CLI source marker.
  process.env.DSH_HOME = join(root, 'not-a-directory');
  await writeFile(process.env.DSH_HOME, 'fixture');
  assert.equal((await loginStart()).verificationUri, verificationUri);
  assert.equal(process.env.TIANA_FROM, undefined);

  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.from, 'dsh');
    assert.equal(call.origin, 'https://management.example.test');
    assert.equal(call.args.includes('--from'), false);
  }
  assert.deepEqual(calls[0].args, ['login', '--start', '--no-open', '--json']);
  assert.deepEqual(calls[1].args, ['login', '--resume', '--json']);
  assert.equal(calls[2].args[0], 'web');
});
