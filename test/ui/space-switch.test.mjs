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
      </style><script>
      window.__authPopups = [];
      window.open = (url, target, features) => {
        const record = {
          initialUrl: url,
          target,
          features,
          closed: false,
          location: { href: url },
          close() { this.closed = true; },
        };
        window.__authPopups.push(record);
        return record;
      };
      </script></head><body><div id="root"></div><script src="/bundle.js"></script><script src="/client.js"></script></body></html>`); }
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
      assert.equal(await page.locator('.tiana-space-confirm').count(),0);
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
test('selecting a space switches immediately without confirmation, refreshes sites and rejects late old-space response', async t => {
  let current='ten-a', fail=false, releaseOld, blockOld=false;
  let siteReads=0;
  const {page,calls} = await setup(t, async (url) => {
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
  assert.equal(await page.getByRole('button',{name:'切换',exact:true}).count(),0);
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/协作空间/);
  const oldResponse = page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/sites'));
  releaseOld();
  await oldResponse;
  assert.equal(await page.getByText('站点 ten-a',{exact:true}).count(),0);
  assert.ok(siteReads>=3);
  await screenshot(page,'switched-direct');
  fail=true;
  await choose(page,'个人空间');
  await page.getByRole('alert').filter({hasText:'成员资格已撤销'}).waitFor();
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/协作空间/);
  await screenshot(page,'switch-failed');
  assert.equal(calls.filter(c=>c.includes('/spaces/switch')).length,2);
});
test('switch requiring re-authentication opens authorization automatically, supports cancel, and switches after approval', async t => {
  let current='ten-a';
  let needAuth=true;
  let resumeApproved=false;
  let rotating=false;
  let readsDuringRotation=0;
  const {page,calls} = await setup(t, async url => {
    if(url.pathname.endsWith('/status')) return {loggedIn: true, error: null};
    if(url.pathname.endsWith('/spaces')) {
      if (rotating) readsDuringRotation++;
      return {ok:true,items:spaces,currentTenantId:current};
    }
    if(url.pathname.endsWith('/sites')) {
      if (rotating) readsDuringRotation++;
      return siteData(current);
    }
    if(url.pathname.endsWith('/spaces/switch')) {
      if(needAuth) return {ok:false,tenantId:url.searchParams.get('id'),requiresLogin:true,error:{code:'AUTH_REQUIRED',message:'需要重新授权'}};
      rotating=true;
      await new Promise(r => setTimeout(r, 500));
      current=url.searchParams.get('id');
      rotating=false;
      return {ok:true,tenantId:current,syncStatus:'synced'};
    }
    if(url.pathname.endsWith('/login/start')) {
      return {pending:true,verificationUri:'https://auth.example.test/reauth',retryAfter:1};
    }
    if(url.pathname.endsWith('/login/resume')) {
      if(resumeApproved) return {loggedIn:true};
      return {pending:true,retryAfter:1};
    }
  });
  await page.goto(`${origin}/?section=sites`);
  await page.getByText('站点 ten-a',{exact:true}).waitFor();
  await choose(page,'协作空间');
  await page.getByText('https://auth.example.test/reauth',{exact:true}).waitFor();
  const cancelButtons = page.getByRole('button',{name:'取消登录',exact:true});
  assert.ok(await cancelButtons.count() >= 1);
  const popupsAfterStart = await page.evaluate(() => window.__authPopups);
  assert.equal(popupsAfterStart.length, 1);
  assert.equal(popupsAfterStart[0].location.href, 'https://auth.example.test/reauth');
  await screenshot(page,'switch-reauth-pending');

  // Cancelling interrupts polling, closes popup, and restores the existing session via /status.
  await cancelButtons.first().click();
  await page.getByText('已连接 Tiana',{exact:true}).waitFor();
  await page.getByText('站点 ten-a',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/个人空间/);
  const popupClosedAfterCancel = await page.evaluate(() => window.__authPopups[0]?.closed);
  assert.equal(popupClosedAfterCancel, true);
  const resumeCountAfterCancel = calls.filter(c => c.includes('/login/resume')).length;
  await new Promise(r => setTimeout(r, 2300));
  assert.equal(calls.filter(c => c.includes('/login/resume')).length, resumeCountAfterCancel);
  await screenshot(page,'switch-reauth-cancelled');

  // Choosing the space again re-opens authorization; approving completes the switch to ten-b.
  await choose(page,'协作空间');
  await page.getByText('https://auth.example.test/reauth',{exact:true}).waitFor();
  needAuth=false;
  resumeApproved=true;
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(),/协作空间/);
  assert.equal(calls.filter(c=>c.includes('/spaces/switch')).length,3);
  assert.equal(readsDuringRotation,0);
  await screenshot(page,'switch-reauth-completed');
});

test('browser approval in the target space does not rotate credentials again', async t => {
  let current = 'ten-a';
  let approved = false;
  const { page, calls } = await setup(t, async url => {
    if (url.pathname.endsWith('/spaces')) return {ok:true,items:spaces,currentTenantId:current};
    if (url.pathname.endsWith('/sites')) return siteData(current);
    if (url.pathname.endsWith('/spaces/switch')) {
      return {ok:false,requiresLogin:true,error:{code:'AUTH_REQUIRED',message:'Switch would invalidate this session'}};
    }
    if (url.pathname.endsWith('/login/start')) return {pending:true,verificationUri:'https://auth.example.test/reauth',retryAfter:1};
    if (url.pathname.endsWith('/login/resume')) {
      if (!approved) return {pending:true,retryAfter:1};
      current = 'ten-b';
      return {loggedIn:true};
    }
  });
  await page.goto(`${origin}/?section=sites`);
  await page.getByText('站点 ten-a',{exact:true}).waitFor();
  await choose(page,'协作空间');
  await page.getByText('https://auth.example.test/reauth',{exact:true}).waitFor();
  approved = true;
  await page.getByText('站点 ten-b',{exact:true}).waitFor();
  assert.match(await page.locator('.tiana-space-trigger').innerText(), /协作空间/);
  assert.equal(calls.filter(c=>c.includes('/spaces/switch')).length,1);
  await screenshot(page,'approval-already-in-target');
});
