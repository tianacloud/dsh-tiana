import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import test from 'node:test';
import { runCommand } from '../install.js';
import { listSites } from '../tiana-api.js';

test('JSON capture preserves large UTF-8 output and rejects overflow; diagnostic tails remain bounded', async () => {
  const script = "const b=Buffer.from('中文🌱'.repeat(20000)); for(let i=0;i<b.length;i+=7) process.stdout.write(b.subarray(i,i+7));";
  const result = await runCommand(process.execPath, ['-e', script], { stdoutLimit: 200000 });
  assert.equal(result.stdout, '中文🌱'.repeat(20000));
  const tail = await runCommand(process.execPath, ['-e', "process.stdout.write('x'.repeat(70000))"]);
  assert.equal(tail.stdout.length, 65536);
  await assert.rejects(runCommand(process.execPath, ['-e', "process.stdout.write('x'.repeat(100001))"], { stdoutLimit: 100000 }), { code: 'CLI_OUTPUT_TOO_LARGE' });
});

test('sites query requests exactly one CLI page, handles long items and keeps errors distinct', async (t) => {
  if (process.platform === 'win32') return t.skip('The fake executable uses a POSIX shebang; run this integration fixture on Linux/macOS.');
  const dir = await mkdtemp(join(tmpdir(), 'tiana-site-page-'));
  const oldPath = process.env.PATH;
  const oldHome = process.env.DSH_HOME;
  const log = join(dir, 'calls.jsonl');
  const cli = join(dir, process.platform === 'win32' ? 'tiana.cmd' : 'tiana');
  const installStub = async (body) => writeFile(cli, `#!${process.execPath}\n${body}`, { mode: 0o755 });
  process.env.PATH = `${dir}${delimiter}${oldPath}`;
  process.env.DSH_HOME = join(dir, 'dsh');
  t.after(async () => {
    process.env.PATH = oldPath;
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
    await rm(dir, { recursive: true, force: true });
  });
  const prefix = `import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');\n`;
  // A single response larger than the old 64 Ki-character limit.
  await installStub(prefix + `const args=process.argv.slice(2); const page=Number(args[args.indexOf('--page')+1]); console.log(JSON.stringify({status:'succeeded',data:{page,page_size:20,total:40,total_pages:2,items:Array.from({length:20},(_,i)=>({id:'web-'+i,name:'Site',description:'中文🌱'.repeat(1500)}))},error:null}));`);
  const result = await listSites({ page: 2, q: '中文 & notes' });
  assert.equal(result.error, null);
  assert.equal(result.items.length, 20);
  assert.equal(result.items[0].description, '中文🌱'.repeat(1500));
  assert.equal(result.page, 2);
  assert.equal(result.total, 40);
  assert.deepEqual(JSON.parse((await readFile(log, 'utf8')).trim()), ['web', 'list', '--page', '2', '--search', '中文 & notes', '--json']);
  for (const page of [0, -1, 10001, NaN, 1.5]) assert.equal((await listSites({ page })).error.code, 'INVALID_SITE_QUERY');
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);

  await installStub(`console.log(JSON.stringify({status:'failed',data:{items:[]},error:{code:'AUTH_REQUIRED',message:'Sign in'}}));process.exitCode=1;`);
  assert.equal((await listSites()).error.code, 'AUTH_REQUIRED');
  await installStub(`console.log(JSON.stringify({status:'succeeded',data:{page:1,items:[]},error:null}));`);
  const empty = await listSites();
  assert.equal(empty.error, null);
  assert.equal(empty.totalPages, 0);
  await installStub(prefix + `process.stderr.write('flag provided but not defined: -page');process.exitCode=2;`);
  assert.equal((await listSites()).error.code, 'CLI_UPGRADE_REQUIRED');
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2, 'old CLI must not trigger a full-list fallback');
  await installStub(`console.log(JSON.stringify({status:'failed',data:null,error:{code:'INVALID_INPUT',message:'invalid options or option value'}}));process.exitCode=2;`);
  assert.equal((await listSites()).error.code, 'CLI_UPGRADE_REQUIRED', 'published CLI 1.0.25 rejects unknown flags as structured INVALID_INPUT');
  await installStub(`process.stdout.write('x'.repeat(4*1024*1024+1));`);
  assert.equal((await listSites()).error.code, 'CLI_OUTPUT_TOO_LARGE');
});
