import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openLocalSession } from '../../tiana-api.js';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

let browser, server, origin;
before(async () => {
  const bundle = await build({ bundle: true, write: false, format: 'iife', stdin: {
    resolveDir: resolve('.'), contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      window.__ModuleLoader__ = {load({factory}) {
        let main, dictionary;
        const t = key => dictionary.zh[key] ?? key;
        const ctx = {effect: fn => fn(), get: name => name === 'uiWorkspace' ? {openSession: id => {window.openedSession=id;}} : undefined,
          locale: {register: (ns,value) => {dictionary=value}, bind: () => t, getLocale: () => ({active:'zh'})},
          slots: {inject: (name,fn) => fn(), register: (spec, component) => {if(spec.name==='main') main=component;}}};
        factory(name => {if(name==='react') return React; throw new Error(name)}).apply(ctx);
        createRoot(document.getElementById('root')).render(React.createElement(main,{t,initialSection:new URL(location.href).searchParams.get('section') ?? 'templates'}));
      }};`,
  }});
  const client = await readFile(new URL('../../client.js', import.meta.url));
  server = createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(client); }
    else { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>DSH pagination candidate</title><style>
      :root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f5f6f7;--dsw-alias-border-l1:#e2e4e8;--dsw-alias-label-primary:#17202b;--dsw-alias-label-secondary:#596575;--dsw-alias-label-tertiary:#747e8c;--dsw-alias-brand-primary:#16775f}
      body{margin:0;font-family:Arial,sans-serif}#root{height:100vh}
      </style></head><body><div id="root"></div><script src="/bundle.js"></script><script src="/client.js"></script></body></html>`); }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.TIANA_TEST_CHROME });
});
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });

async function setup(t, handler) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  t.after(() => page.close());
  const calls = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/api/tiana/**', async route => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    let value = await handler(url, route);
    if (value === false) return;
    if (value === undefined) {
      if (url.pathname.endsWith('/status')) value = { loggedIn: true, error: null };
      else if (url.pathname.endsWith('/spaces')) value = { ok: true, items: [], currentTenantId: 'ten-test', canCreateSpace: false };
      else if (url.pathname.endsWith('/workspaces')) value = { ok: true, items: [] };
      else value = { ok: true, items: [], categories: [], nextCursor: null };
    }
    await route.fulfill({ json: value });
  });
  return { page, calls };
}
async function screenshot(page, name) {
  if (!process.env.TIANA_UI_EVIDENCE) return;
  await mkdir(process.env.TIANA_UI_EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(process.env.TIANA_UI_EVIDENCE, `${name}.png`), fullPage: true });
}
const sitePage = (page, search = '') => ({ ok: true, page, total: search ? 1 : 41, totalPages: search ? 1 : 3,
  items: Array.from({ length: search || page === 3 ? 1 : 20 }, (_, i) => ({ id: `web-${page}-${i}`, name: search || `站点 ${page}-${i}`, description: '', enabled: true })), error: null });
const templatePage = (page, query = '') => ({ ok: true, items: Array.from({ length: 18 }, (_, i) => ({ name: `tpl-${page}-${i}`, display_name: query || `模板 ${page}-${i}`, description: '模板分页验收', category_id: 1 })),
  categories: [{ id: 1, name: '工具' }], nextCursor: page === 1 ? 'cursor-2' : null, origin: 'https://console.example.test', error: null });

test('sites replace each page, search remotely, preserve errors and ignore late responses', async t => {
  let failSecond = false, releaseOld;
  const { page, calls } = await setup(t, async (url, route) => {
    if (!url.pathname.endsWith('/sites')) return;
    const p = Number(url.searchParams.get('page'));
    const q = url.searchParams.get('q') ?? '';
    if (q === 'old') { await new Promise(r => { releaseOld = r; }); }
    if (p === 2 && failSecond) return { ok: false, error: { code: 'TEST_ERROR', message: '分页读取失败' } };
    return sitePage(p, q);
  });
  await page.goto(`${origin}/?section=sites`);
  await page.getByText('站点 1-0', { exact: true }).waitFor();
  assert.equal(await page.locator('.tiana-site-row').count(), 20);
  assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button',{name:/从模板创建|从模板安装/}).count(),0);
  await screenshot(page, 'sites-first');
  const next = page.getByRole('button', { name: '下一页', exact: true });
  await next.focus();
  await next.press('Enter');
  await page.getByText('站点 2-0', { exact: true }).waitFor();
  assert.equal(await page.getByText('站点 1-0', { exact: true }).count(), 0);
  assert.equal(await page.locator('.tiana-site-row').count(), 20);
  await screenshot(page, 'sites-second');
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByText('站点 1-0', { exact: true }).waitFor();
  failSecond = true;
  await next.click();
  await page.getByRole('alert').filter({ hasText: '分页读取失败' }).waitFor();
  assert.equal(await page.getByText('站点 1-0', { exact: true }).count(), 1);
  failSecond = false;
  await next.click();
  await page.getByText('站点 2-0', { exact: true }).waitFor();
  await next.click();
  await page.getByText('站点 3-0', { exact: true }).waitFor();
  assert.equal(await next.isDisabled(), true);
  const search = page.getByPlaceholder('搜索名称或实例 ID');
  await search.fill('old');
  await page.waitForRequest(r => new URL(r.url()).searchParams.get('q') === 'old');
  await search.fill('new');
  await page.getByText('new', { exact: true }).waitFor();
  releaseOld();
  await page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'old');
  assert.equal(await page.getByText('old', { exact: true }).count(), 0);
  assert.equal(calls.some(c => c.includes('/sites?page=1&q=new')), true);
  assert.equal(calls.filter(c => c.startsWith('/api/tiana/templates')).length, 0);
  await screenshot(page, 'sites-search');
});

test('market scroll appends pages and retries failures without losing existing cards', async t => {
  let failSecond = true;
  const { page, calls } = await setup(t, async url => {
    if (!url.pathname.endsWith('/templates')) return;
    const p = url.searchParams.has('after') ? 2 : 1;
    if (p === 2 && failSecond) return { error: { message: '加载失败' } };
    return templatePage(p);
  });
  await page.goto(origin);
  await page.getByText('模板 1-0', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).count(), 0);
  await screenshot(page, 'templates-first');
  await page.locator('.tiana-template-sentinel').scrollIntoViewIfNeeded();
  await page.getByRole('button', {name: '重试', exact: true}).waitFor();
  assert.equal(await page.locator('.tiana-template-card').count(), 18);
  failSecond = false;
  await page.getByRole('button', {name: '重试', exact: true}).click();
  await page.getByText('模板 2-0', { exact: true }).waitFor();
  assert.equal(await page.locator('.tiana-template-card').count(), 36);
  assert.equal(await page.getByText('模板 1-0', {exact: true}).count(), 1);
  assert.equal(calls.filter(c => c.includes('after=cursor-2')).length, 2);
  await screenshot(page, 'templates-appended');
});

test('sites deduplicate clicks and discard pages from a previous space or logged-out account', async t => {
  let tenant = 'ten-a', releasePage;
  const { page, calls } = await setup(t, async url => {
    if (url.pathname.endsWith('/spaces')) return { ok: true, currentTenantId: tenant, canCreateSpace: true,
      items: ['a', 'b'].map(id => ({ tenantId: `ten-${id}`, displayName: `空间 ${id}`, role: 'admin' })) };
    if (url.pathname.endsWith('/spaces/switch')) { tenant = url.searchParams.get('id'); return { ok: true }; }
    if (url.pathname.endsWith('/logout')) return { ok: true };
    if (!url.pathname.endsWith('/sites')) return;
    const p = Number(url.searchParams.get('page'));
    const owner = tenant;
    if (p === 2) await new Promise(r => { releasePage = r; });
    const result = sitePage(p);
    result.items = result.items.map((item, i) => ({ ...item, name: `${owner} ${p}-${i}` }));
    return result;
  });
  await page.goto(`${origin}/?section=sites`);
  await page.getByText('ten-a 1-0', { exact: true }).waitFor();
  const next = page.getByRole('button', { name: '下一页', exact: true });
  const before = calls.filter(c => c === '/api/tiana/sites?page=2').length;
  const page2Request = page.waitForRequest(r => r.url().endsWith('/sites?page=2'));
  await next.evaluate(button => { button.click(); button.click(); });
  await page2Request;
  assert.equal(await next.isDisabled(), true);
  assert.equal(calls.filter(c => c === '/api/tiana/sites?page=2').length, before + 1);
  await page.getByRole('button', { name: '切换空间', exact: true }).click();
  await page.getByRole('option', { name: '空间 b', exact: true }).click();
  await page.getByText('ten-b 1-0', { exact: true }).waitFor();
  const oldResponse = page.waitForResponse(r => r.url().endsWith('/sites?page=2'));
  releasePage();
  await oldResponse;
  assert.equal(await page.getByText('ten-a 2-0', { exact: true }).count(), 0);
  const logoutRequest = page.waitForRequest(r => r.url().endsWith('/sites?page=2'));
  await next.click();
  await logoutRequest;
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  const loggedOutResponse = page.waitForResponse(r => r.url().endsWith('/sites?page=2'));
  releasePage();
  await loggedOutResponse;
  await page.getByRole('button', { name: '登录 Tiana', exact: true }).first().waitFor();
  assert.equal(await page.locator('.tiana-site-row').count(), 0);
  await screenshot(page, 'sites-logged-out');
});

test('template search discards delayed pages, refresh returns to page one and clicks do not prefetch', async t => {
  let releaseOld;
  const { page, calls } = await setup(t, async url => {
    if (!url.pathname.endsWith('/templates')) return;
    const query = url.searchParams.get('q') ?? '';
    if (query === 'old') await new Promise(r => { releaseOld = r; });
    return templatePage(url.searchParams.has('after') ? 2 : 1, query);
  });
  await page.goto(origin);
  await page.getByText('模板 1-0', { exact: true }).waitFor();
  await page.locator('.tiana-template-sentinel').scrollIntoViewIfNeeded();
  await page.getByText('模板 2-0', { exact: true }).waitFor();
  assert.equal(calls.filter(c => c.includes('after=cursor-2')).length, 1);
  await page.getByRole('button', { name: '刷新模板', exact: true }).click();
  await page.getByText('模板 1-0', { exact: true }).waitFor();
  await page.getByPlaceholder('搜索模板').fill('old');
  await page.waitForRequest(r => new URL(r.url()).searchParams.get('q') === 'old');
  await page.getByPlaceholder('搜索模板').fill('new');
  await page.getByText('new', { exact: true }).first().waitFor();
  const response = page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'old');
  releaseOld();
  await response;
  assert.equal(await page.getByText('old', { exact: true }).count(), 0);
  assert.equal(calls.filter(c => c.includes('q=new')).some(c => c.includes('after=')), false);
});


test('local preview defaults to sandbox, opens a tab after build, stops, and resolves sessions', async t => {
  let workspace = {id: 'local-test', title: '本地测试', directory: '/fixture/project', status: 'stopped', createdAt: '2026-11-16T09:00:00Z', dshWorkspace: {ok: true, id: 'ws', title: '本地测试'}, dshSession: {ok: true, ready: true, sessionId: 'deleted'}};
  let supported = true;
  let finishBuild;
  const {page, calls} = await setup(t, async url => {
    if (url.pathname.endsWith('/workspaces')) return {items: [workspace], sandbox: {supported}};
    if (url.pathname.endsWith('/workspaces/prepare')) {
      workspace = {...workspace, status: 'preparing', readyAt: null};
      finishBuild = () => {workspace = {...workspace, status: 'ready', readyAt: String(Date.now()), previewUrl: origin + '/preview-fixture'};};
      return {workspace};
    }
    if (url.pathname.endsWith('/workspaces/stop')) {workspace = {...workspace, status: 'stopped', previewUrl: null}; return {ok: true};}
    if (url.pathname.endsWith('/workspaces/session')) return {session: {ready: true, sessionId: 'latest-surviving'}};
  });
  await page.goto(`${origin}/?section=local`);
  const toggle=page.getByRole('switch', {name: '沙箱构建'});
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), true);
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'启动预览',exact:true}).click();
  await page.getByRole('button',{name:'预览构建中…',exact:true}).waitFor();
  assert.equal(page.context().pages().length,1,'no blank tab during build');
  await screenshot(page,'local-building-no-blank-tab');
  finishBuild();
  const popup=await popupPromise; t.after(()=>popup.close());
  await popup.waitForURL(origin + '/preview-fixture');
  assert.ok(calls.includes('/api/tiana/workspaces/prepare?id=local-test&lang=zh'));
  assert.equal(calls.some(c=>c.includes('/prepare?') && c.includes('sandbox=off')),false);
  await page.getByRole('button',{name:'停止预览',exact:true}).waitFor();
  const actionBoxes=await page.locator('.tiana-local-actions button,.tiana-local-actions a').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height}}));
  assert.equal(actionBoxes.length,4);
  assert.equal(await page.getByRole('button',{name:'移除项目',exact:true}).count(),0);
  assert.ok(actionBoxes.every(box=>box.y===actionBoxes[0].y));
  await screenshot(page,'local-ready');
  await page.setViewportSize({width:375,height:812});
  const mobileBoxes=await page.locator('.tiana-local-actions button,.tiana-local-actions a').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,x:r.x,right:r.right}}));
  assert.ok(mobileBoxes.every(box=>box.y===mobileBoxes[0].y));
  assert.ok(mobileBoxes.every(box=>box.x>=0 && box.right<=375));
  await screenshot(page,'local-ready-narrow');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'停止预览',exact:true}).click();
  await page.getByRole('button',{name:'启动预览',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'停止预览',exact:true}).count(),0);
  await page.getByRole('button',{name:'打开会话',exact:true}).click();
  await page.waitForFunction(()=>window.openedSession === 'latest-surviving');
  supported=false;
  await page.reload();
  await page.getByRole('button',{name:'启动预览',exact:true}).waitFor();
  assert.equal(await toggle.isChecked(),false);
  assert.equal(await toggle.isDisabled(),true);
  await screenshot(page,'local-stopped-unsupported');
});


test('preview blocker leaves a ready link and never creates a waiting tab', async t => {
  let workspace={id:'blocked',title:'预览拦截测试',directory:'/fixture/blocked',status:'stopped'};
  const {page}=await setup(t,async url=>{
    if(url.pathname.endsWith('/workspaces')) return {items:[workspace],sandbox:{supported:true}};
    if(url.pathname.endsWith('/workspaces/prepare')) {
      workspace={...workspace,status:'ready',readyAt:'ready',previewUrl:origin+'/preview-fixture'};
      return {workspace};
    }
  });
  await page.addInitScript(()=>{window.previewOpenCalls=[];window.open=url=>{window.previewOpenCalls.push(url);return null;};});
  await page.goto(`${origin}/?section=local`);
  await page.getByRole('button',{name:'启动预览',exact:true}).click();
  await page.getByText('请允许弹出标签页，或点击打开预览。',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.previewOpenCalls),[origin+'/preview-fixture']);
  assert.equal(await page.getByRole('link',{name:'打开预览',exact:true}).getAttribute('href'),origin+'/preview-fixture');
  await screenshot(page,'local-popup-blocked');
});


test('opening a workspace with only archived conversations creates in that workspace', async t => {
  const root=await mkdtemp(join(tmpdir(),'dsh-empty-session-ui-'));
  const oldHome=process.env.DSH_HOME;process.env.DSH_HOME=root;
  t.after(async()=>{if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;await rm(root,{recursive:true,force:true});});
  const directory=join(root,'project');await mkdir(directory);await mkdir(join(root,'tiana-plugin'));
  const workspace={id:'empty-project',title:'空工作区项目',directory,status:'stopped',dshWorkspace:{ok:true,id:'project-workspace'}};
  await writeFile(join(root,'tiana-plugin','workspaces.json'),JSON.stringify({items:[workspace]}));
  let created=0;
  const events=[];
  const registry={archivedSessionIds:['archived-session']};
  const controller={
    list:async()=>({items:[{sessionId:'archived-session',cwd:directory,blank:false}]}),
    create:async(request)=>{assert.equal(request.workspaceId,'project-workspace');created++;return {sessionId:'new-project-session'};},
    rename:async()=>{},
    resolveAgent:async()=>({agent:{session:{append:async(...args)=>events.push(args)}}}),
  };
  const {page,calls}=await setup(t,async url=>{
    if(url.pathname.endsWith('/workspaces'))return {items:[workspace],sandbox:{supported:true}};
    if(url.pathname.endsWith('/workspaces/session'))return openLocalSession('empty-project',()=>controller,'zh',undefined,()=>registry);
  });
  await page.goto(`${origin}/?section=local`);
  await page.getByText('空工作区项目',{exact:true}).waitFor();
  await screenshot(page,'empty-workspace-before-open');
  await page.getByRole('button',{name:'打开会话',exact:true}).click();
  await page.waitForFunction(()=>window.openedSession==='new-project-session');
  assert.equal(created,1);
  assert.ok(events.some(e=>e[0]==='assistant/message'));
  assert.deepEqual(registry.archivedSessionIds,['archived-session']);
  assert.equal(calls.filter(c=>c.includes('/workspaces/session')).length,1);
  await screenshot(page,'empty-workspace-session-created');
});
