import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {registerTianaRoutes, openLocalSession, stopLocalPreview, removeLocalWorkspace} from '../tiana-api.js';

test('local workspace recovers deleted sessions and stops a real built preview', async t => {
  const root=await mkdtemp(join(tmpdir(),'tiana-local-test-'));
  const oldHome=process.env.DSH_HOME; process.env.DSH_HOME=root;
  t.after(async()=>{if(oldHome===undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME=oldHome; await rm(root,{recursive:true,force:true});});
  const directory=join(root,'project'); await mkdir(directory);
  await writeFile(join(directory,'package.json'),JSON.stringify({name:'preview-fixture',version:'1.0.0',scripts:{build:'node build.cjs'}}));
  await writeFile(join(directory,'build.cjs'),"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.html','<html><body>preview fixture</body></html>');");
  await mkdir(join(root,'tiana-plugin'));
  await writeFile(join(root,'tiana-plugin','workspaces.json'),JSON.stringify({items:[{id:'project',directory,warning:'本次模板构建未启用 DSH 沙箱（disabled by TIANA_LOCAL_BUILD_SANDBOX=off）。',dshWorkspace:{ok:true,id:'workspace'},dshSession:{ok:true,ready:true,sessionId:'deleted'}}]}));
  const archived=['archived-most-recent'];
  let items=[{sessionId:'archived-most-recent',cwd:directory,blank:false},{sessionId:'other-project',cwd:'/other',blank:false},{sessionId:'latest',cwd:directory,blank:false},{sessionId:'older',cwd:directory,blank:false}];
  let created=0, failList=false;
  const events=[];
  const controller={
    list: async()=>{if(failList) throw new Error('list unavailable');return {items};},
    create: async({workspaceId})=>{assert.equal(workspaceId,'workspace');created++;return {sessionId:'replacement'};},
    rename:async()=>{},
    resolveAgent:async()=>({agent:{session:{append:async(...args)=>events.push(args)}}}),
  };
  const registry=()=>({archivedSessionIds:archived});
  const open=()=>openLocalSession('project',()=>controller,'zh',undefined,registry);
  assert.equal((await open()).session.sessionId,'latest');
  assert.equal(created,0);
  // Clearing a DSH workspace archives its conversations; global list rows remain.
  items=[{sessionId:'archived-most-recent',cwd:directory,blank:false}];
  const restored=await Promise.all([open(),open()]);
  assert.equal(created,1);
  assert.equal(restored[0].session.sessionId,'replacement');
  assert.equal(restored[1].session.ready,true);
  assert.equal(events.filter(e=>e[0]==='assistant/message').length,1);
  assert.match(events.find(e=>e[0]==='assistant/message')[1].message.content[0].text,/改造助手/);
  failList=true;
  assert.equal((await open()).ok,false);
  assert.equal(created,1,'a failed list must not create another session');
  const routes=new Map();
  const dispose=registerTianaRoutes({fetch:{register(spec){routes.set(spec.path,spec.fetch);return()=>{};}}},{resolveSessionController:()=>controller,resolveWorkspaceRegistry:registry});
  t.after(dispose);
  const call=async (path,method='GET')=>{
    const request = new Request(new URL(path, 'http://dsh.internal'), {
      method, headers: { 'accept-language': 'en' },
    });
    const response = await routes.get(new URL(request.url).pathname)(request);
    return response.json();
  };
  failList=false;
  items=[];
  const empty=await call('/api/tiana/workspaces/session?id=project&lang=zh','POST');
  assert.equal(empty.ok,true);
  assert.equal(empty.session.ready,true);
  assert.equal(created,2,'the HTTP route also creates in a completely empty workspace');
  assert.match(events.filter(e=>e[0]==='assistant/message').at(-1)[1].message.content[0].text,/改造助手/);
  assert.equal((await call('/api/tiana/workspaces/status?id=project')).workspace.warning,null);
  await call('/api/tiana/workspaces/prepare?id=project&sandbox=off','POST');
  assert.equal((await stopLocalPreview('project')).error.code,'WORKSPACE_BUSY');
  assert.equal((await removeLocalWorkspace('project')).error.code,'WORKSPACE_BUSY');
  let workspace;
  for(let i=0;i<100;i++) {
    workspace=(await call('/api/tiana/workspaces/status?id=project')).workspace;
    if(workspace.status!=='preparing') break;
    await delay(100);
  }
  assert.equal(workspace.status,'ready',workspace.error);
  const url=workspace.previewUrl;
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const forSession = await call('/api/tiana/workspaces/for-session?id=replacement');
  assert.equal(forSession.workspace.previewUrl, url);
  assert.match(await (await fetch(url)).text(),/preview fixture/);
  const stopped=await stopLocalPreview('project');
  assert.equal(stopped.workspace.status,'stopped');
  assert.equal(stopped.workspace.previewUrl,null);
  await assert.rejects(fetch(url));
  assert.equal((await stopLocalPreview('project')).ok,true);
  await call('/api/tiana/workspaces/prepare?id=project&sandbox=off','POST');
  for(let i=0;i<100;i++) {
    workspace=(await call('/api/tiana/workspaces/status?id=project')).workspace;
    if(workspace.status!=='preparing') break;
    await delay(100);
  }
  assert.equal(workspace.status,'ready',workspace.error);
  assert.equal((await removeLocalWorkspace('project')).ok,true);
  await assert.rejects(fetch(workspace.previewUrl));
  assert.equal((await call('/api/tiana/workspaces')).items.length,0);
});
