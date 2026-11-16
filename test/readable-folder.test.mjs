import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join, delimiter} from 'node:path';
import {templateFolderName, resolveCloneDirectory, cloneTemplate} from '../tiana-api.js';

test('default clone uses catalog display name, keeps template ID and avoids existing directories', async t => {
  const temp=mkdtempSync(join(tmpdir(),'dsh-readable-'));
  const title=`中文测试-${process.pid}`;
  const target=join(homedir(),'TianaTemplates',title);
  const previous={path:process.env.PATH,home:process.env.DSH_HOME,fetch:globalThis.fetch};
  process.env.PATH=temp+delimiter+previous.path;
  process.env.DSH_HOME=join(temp,'dsh');
  t.after(()=>{process.env.PATH=previous.path;if(previous.home===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous.home;globalThis.fetch=previous.fetch;rmSync(temp,{recursive:true,force:true});rmSync(target,{recursive:true,force:true});});
  writeFileSync(join(temp,'tiana'),`#!${process.execPath}\nconst a=process.argv.slice(2);console.log(JSON.stringify({status:'succeeded',data:{directory:a[a.indexOf('--dir')+1],template:a[2]}}));`,{mode:0o755});
  globalThis.fetch=async()=>Response.json({template_id:'tpl-test',display_name:title});
  mkdirSync(target,{recursive:true});
  const cloned=await cloneTemplate('tpl-test','');
  assert.equal(cloned.ok,true);
  assert.equal(cloned.directory,target+'-2');
  globalThis.fetch=async()=>{throw new Error('catalog unavailable');};
  assert.equal((await cloneTemplate('tpl-test','')).ok,false);
  const explicit=await cloneTemplate('tpl-test',join(temp,'custom'));
  assert.equal(explicit.ok,true);
  assert.equal(explicit.directory,join(temp,'custom'));
  assert.equal(resolveCloneDirectory(join(temp,'chosen'),'unused'),join(temp,'chosen'));
  for(const [input,expected] of [['霓虹海岸 · 城市驾驶游戏','霓虹海岸 · 城市驾驶游戏'],['a/b:c?','a-b-c-'],['..','tpl-test'],['','tpl-test'],['CON','_CON'],['云端. ','云端']]) assert.equal(templateFolderName(input,'tpl-test'),expected);
});
