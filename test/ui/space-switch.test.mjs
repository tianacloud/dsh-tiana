import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
        const ctx = {effect: fn => fn(), get: () => undefined,
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
    else { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>DSH spaces candidate</title><style>
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
  page.setDefaultTimeout(8000);
  t.after(() => page.close());
  const calls = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/tiana/api/**', async route => {
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

const spaces = [
  {tenantId: 'ten-a', displayName: '个人空间', isDefault: true},
  {tenantId: 'ten-b', displayName: '协作空间'},
];
const siteData = id => ({ok:true, page:1,total:1,totalPages:1,items:[{id:`web-${id}`,name:`站点 ${id}`,enabled:true}]});
async function choose(page, name) {
  await page.getByRole('button', {name:'切换空间',exact:true}).click();
  await page.getByRole('option', {name}).click();
}
for (const count of [0,1,2]) {
  test(`space visibility uses ${count} memberships, never creation quota`, async t => {
    const {page} = await setup(t, async url => {
      if(url.pathname.endsWith('/spaces')) return {ok:true,items:spaces.slice(0,count),currentTenantId:'ten-a',canCreateSpace:count!==2};
    });
    const loaded = page.waitForResponse(r => r.url().endsWith('/tiana/api/spaces'));
    await page.goto(origin);
    await page.getByText('已连接 Tiana',{exact:true}).waitFor();
    await loaded;
    if(count===2) {
      await page.getByRole('button',{name:'切换空间',exact:true}).waitFor();
      assert.match(await page.locator('.tiana-space-trigger').innerText(),/个人空间/);
      await page.getByRole('button',{name:'切换空间',exact:true}).click();
      assert.equal(await page.getByRole('option').count(),2);
      await screenshot(page,'multi-space-menu');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('option').count(),0);
      await page.setViewportSize({width:480,height:900});
      assert.equal(await page.getByRole('button',{name:'切换空间',exact:true}).isVisible(),true);
      await page.getByRole('button',{name:'切换空间',exact:true}).click();
      const box = await page.locator('.tiana-space-menu').boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=480 && box.y>=0 && box.y+box.height<=900);
      await screenshot(page,'multi-space-narrow');
    } else {
      assert.equal(await page.locator('.tiana-space-row').count(),0);
      await screenshot(page,`spaces-${count}`);
    }
  });
}
test('switch refreshes sites, rejects late old-space response and preserves known failure', async t => {
  let current='ten-a', fail=false, releaseOld, blockOld=false;
  let siteReads=0;
  const {page,calls} = await setup(t, async (url,route) => {
    if(url.pathname.endsWith('/spaces')) return {ok:true,items:spaces,currentTenantId:current};
    if(url.pathname.endsWith('/sites')) {
      siteReads++;
      const captured=current;
      if(blockOld) {blockOld=false; await new Promise(r=>releaseOld=r);}
      return siteData(captured);
    }
    if(url.pathname.endsWith('/spaces/switch')) {
      if(fail) return {ok:false,tenantId:url.searchParams.get('id'),error:{code:'DENIED',message:'无法切换：成员资格已撤销'}};
      current=url.searchParams.get('id'); return {ok:true,tenantId:current,syncStatus:'pending'};
    }
  });
  await page.goto(`${origin}/?section=sites`);
  await page.getByText('站点 ten-a',{exact:true}).waitFor();
  await page.getByRole('button',{name:'切换空间',exact:true}).waitFor();
  blockOld=true;
  await page.getByRole('button',{name:'刷新站点',exact:true}).click();
  await choose(page,'协作空间');
  await page.getByRole('button',{name:'切换',exact:true}).click();
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/协作空间/);
  const oldResponse = page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/sites'));
  releaseOld();
  await oldResponse;
  assert.equal(await page.getByText('站点 ten-a',{exact:true}).count(),0);
  assert.ok(siteReads>=3);
  await screenshot(page,'switched');
  fail=true;
  await choose(page,'个人空间');
  await page.getByRole('button',{name:'切换',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'成员资格已撤销'}).waitFor();
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/协作空间/);
  await screenshot(page,'switch-failed');
  assert.equal(calls.filter(c=>c.includes('/spaces/switch')).length,2);
});
test('unknown switch shows sign-in without replaying', async t => {
  const {page,calls} = await setup(t, async url => {
    if(url.pathname.endsWith('/spaces')) return {ok:true,items:spaces,currentTenantId:'ten-a'};
    if(url.pathname.endsWith('/spaces/switch')) return {ok:false,requiresLogin:true,error:{code:'SPACE_OUTCOME_UNKNOWN',message:'切换结果未知，请重新登录'}};
  });
  await page.goto(origin);
  await choose(page,'协作空间');
  await page.getByRole('button',{name:'切换',exact:true}).click();
  await page.getByRole('button',{name:'登录 Tiana',exact:true}).waitFor();
  assert.equal(await page.locator('.tiana-space-row').count(),0);
  assert.equal(calls.filter(c=>c.includes('/spaces/switch')).length,1);
  await screenshot(page,'switch-unknown');
});
