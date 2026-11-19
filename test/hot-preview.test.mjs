import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {get} from 'node:http';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {registerTianaRoutes, stopLocalPreview, createLocalWorkspace} from '../tiana-api.js';

test('development preview serves Vite HMR and build-only live reload; stop closes resources', {skip: !process.env.TIANA_TEST_CHROME, timeout: 90000}, async t => {
  const root=await mkdtemp(join(tmpdir(),'tiana-hot-preview-'));
  const previous=process.env.DSH_HOME; process.env.DSH_HOME=root;
  t.after(async()=>{if(previous===undefined) delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;await rm(root,{recursive:true,force:true});});
  const viteDir=join(root,'vite-project'), buildDir=join(root,'build-project');
  await mkdir(join(viteDir,'src'),{recursive:true});await mkdir(buildDir);
  const require=createRequire(import.meta.url);
  const vitePackage=await realpath(dirname(require.resolve('vite/package.json')));
  await writeFile(join(viteDir,'package.json'),JSON.stringify({name:'vite-fixture',type:'module',dependencies:{vite:`file:${vitePackage}`}}));
  await writeFile(join(viteDir,'vite.config.js'),`export default {define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{lib:{entry:'src/main.js'}}};`);
  await writeFile(join(viteDir,'src','label.js'),`export const label='before edit';`);
  await writeFile(join(viteDir,'src','main.js'),`import {label} from './label.js'; document.querySelector('#app').textContent=label; window.mode=import.meta.env.MODE; if(import.meta.hot) import.meta.hot.accept('./label.js',mod=>document.querySelector('#app').textContent=mod.label);`);
  await writeFile(join(buildDir,'package.json'),JSON.stringify({name:'build-fixture',scripts:{build:'node build.cjs'}}));
  await writeFile(join(buildDir,'source.txt'),'before edit');
  await writeFile(join(buildDir,'build.cjs'),`const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','<html><body><h1>'+fs.readFileSync('source.txt','utf8')+'</h1></body></html>');`);
  await mkdir(join(root,'tiana-plugin'));
  await writeFile(join(root,'tiana-plugin','workspaces.json'),JSON.stringify({items:[{id:'vite',template:'tpl-fixture-vite',directory:viteDir},{id:'build',template:'stable-build',directory:buildDir}]}));
  const routes=new Map();
  let sandbox;
  if (process.env.TIANA_TEST_SANDBOX) {
    const modulePath=process.env.TIANA_TEST_SANDBOX;
    const requireSandbox=createRequire(modulePath);
    const {Context}=await import(pathToFileURL(requireSandbox.resolve('@deepseek-ai/cordis')).href);
    const {LocalSandboxProvider}=await import(pathToFileURL(modulePath).href);
    const ctx=new Context();
    const disposeSandbox=ctx.effect(()=>{
      sandbox=new LocalSandboxProvider(ctx,{runnerCommand:[],runnerFailureSignatures:[],probeTimeoutMs:5000});
      return ()=>{};
    });
    t.after(disposeSandbox);
  }
  const dispose=registerTianaRoutes({register(spec){routes.set(spec.path,spec.handler);return()=>{};}},{connection:{requestRejection:()=>undefined},resolveSandbox:()=>sandbox});
  t.after(dispose);
  const call=(path,method='GET')=>new Promise((resolve,reject)=>{
    const req={method,url:path,headers:{host:'preview.example.test','x-tiana-plugin':'1'},socket:{},on(){},off(){},resume(){}};
    const res={on(){},off(){},writableEnded:false,writeHead(){},end(data){this.writableEnded=true;resolve(JSON.parse(data));}};
    Promise.resolve(routes.get(path.split('?')[0])(req,res)).catch(reject);
  });
  const ready=async id=>{
    for(let i=0;i<400;i++) {
      const w=(await call(`/tiana/api/workspaces/status?id=${id}`)).workspace;
      if(w.status!=='preparing'){assert.equal(w.status,'ready',w.error);w.previewUrl=w.previewUrl.replace('preview.example.test','127.0.0.1');return w;}
      await delay(100);
    }
    assert.fail('preview readiness timeout');
  };
  const duplicate=await createLocalWorkspace('tpl-fixture-vite','');
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.existing[0].id,'vite');
  const browser=await chromium.launch({executablePath:process.env.TIANA_TEST_CHROME,headless:true});
  t.after(()=>browser.close());
  const evidence=process.env.TIANA_UI_EVIDENCE;
  if(evidence) await mkdir(evidence,{recursive:true});
  const results=[];
  for(const id of ['vite','build']) {
    await call(`/tiana/api/workspaces/prepare?id=${id}${sandbox?'':'&sandbox=off'}`,'POST');
    const w=await ready(id);
    assert.equal(w.warning,null);
    assert.equal(w.sandbox.confined,Boolean(sandbox));
    if(id==='vite') {
      const source=new URL('/src/main.js',w.previewUrl);source.search=new URL(w.previewUrl).search;
      const hostStatus=host=>new Promise((resolve,reject)=>{get(source,{headers:{host}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
      assert.equal(await hostStatus('preview.example.test'),200,'DSH hostname must be allowed');
      assert.equal(await hostStatus('untrusted.example.test'),403,'unrelated host must stay blocked');
    }
    const unauthorized=await fetch(new URL('/',w.previewUrl));assert.equal(unauthorized.status,403);
    const page=await browser.newPage();
    await page.goto(w.previewUrl);
    await page.getByText('before edit',{exact:true}).waitFor();
    await page.evaluate(()=>{window.persistAcrossHmr='kept';});
    const sql=await page.evaluate(async()=>{
      const response=await fetch('/v3/pipeline',{method:'POST',body:JSON.stringify({requests:[{type:'execute',stmt:{sql:'SELECT 1 AS value',args:[],named_args:[],want_rows:true}}]})});return response.json();
    });
    assert.equal(sql.results[0].type,'ok');
    if(id==='vite') assert.equal(await page.evaluate(()=>window.mode),'development');
    if(evidence) await page.screenshot({path:join(evidence,`${id}-before-edit.png`)});
    await writeFile(id==='vite'?join(viteDir,'src','label.js'):join(buildDir,'source.txt'),id==='vite'?`export const label='after edit';`:'after edit');
    await page.getByText('after edit',{exact:true}).waitFor({timeout:15000});
    if(id==='vite') assert.equal(await page.evaluate(()=>window.persistAcrossHmr),'kept','native HMR must not reload the document');
    if(evidence) await page.screenshot({path:join(evidence,`${id}-after-edit.png`)});
    results.push({id,confined:w.sandbox.confined,enforcement:w.sandbox.enforcement,updated:true,mode:id==='vite'?'development/HMR':'watch/reload',time:new Date().toISOString()});
    const stop=await stopLocalPreview(id);assert.equal(stop.ok,true);
    await assert.rejects(fetch(w.previewUrl));
    await page.close();
    // A second start must not inherit the stopped watcher's aborted signal.
    await call(`/tiana/api/workspaces/prepare?id=${id}${sandbox?'':'&sandbox=off'}`,'POST');
    await ready(id);await stopLocalPreview(id);
  }
  const mainPath=join(viteDir,'src','main.js');
  await writeFile(mainPath,'export const broken = ;');
  await call(`/tiana/api/workspaces/prepare?id=vite${sandbox?'':'&sandbox=off'}`,'POST');
  let failed;
  for(let i=0;i<150;i++) {
    failed=(await call('/tiana/api/workspaces/status?id=vite')).workspace;
    if(failed.status!=='preparing') break;
    await delay(100);
  }
  assert.equal(failed.status,'failed');
  assert.equal(failed.previewUrl,null);
  await writeFile(mainPath,`document.querySelector('#app').textContent='recovered';`);
  await call(`/tiana/api/workspaces/prepare?id=vite${sandbox?'':'&sandbox=off'}`,'POST');
  await ready('vite');await stopLocalPreview('vite');
  results.push({invalidSource:'failed without opening',fixedSource:'restart ready'});
  if(evidence) await writeFile(join(evidence,sandbox?'hot-preview-sandbox-results.json':'hot-preview-results.json'),JSON.stringify(results,null,2)+'\n');
});
