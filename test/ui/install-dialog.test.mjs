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
    else { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>DSH install dialog candidate</title><style>
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

test('install choices stay hidden until login succeeds in the open dialog', async t => {
  let loginResult = {error: {code: 'LOGIN_START_FAILED', message: '测试登录失败'}};
  let resumeResult = {pending: true, retryAfter: 1};
  const {page, calls} = await setup(t, async url => {
    if (url.pathname.endsWith('/login/start')) return loginResult;
    if (url.pathname.endsWith('/login/resume')) return resumeResult;
    if (url.pathname.endsWith('/status')) return {loggedIn: false, error: {code: 'AUTH_REQUIRED', message: 'Login required'}};
    if (url.pathname.endsWith('/templates')) return {items: [{name: 'sample', display_name: '示例模板', description: '安装方式测试'}], categories: [], nextCursor: null, origin: 'https://console.example.test'};
  });
  await page.goto(origin);
  await page.getByRole('button', {name: '安装', exact: true}).click();
  const dialog = page.getByRole('dialog');
  const hidden = async () => {
    assert.equal(await dialog.getByRole('button', {name: '克隆到本地', exact: true}).count(), 0);
    assert.equal(await dialog.getByRole('link', {name: '打开网页版安装'}).count(), 0);
    assert.equal(await dialog.getByRole('button', {name: '打开网页版安装'}).count(), 0);
  };
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).waitFor();
  await hidden();
  const cards = dialog.locator('.tiana-install-option');
  assert.equal(await cards.count(), 0);
  assert.equal(await dialog.getByText('Login required', {exact: true}).count(), 0);
  await screenshot(page,'anonymous');
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).click();
  await dialog.getByText('测试登录失败', {exact: true}).waitFor();
  await hidden();
  await screenshot(page,'login-failed');
  loginResult = {pending: true, verificationUri: 'https://auth.example.test', retryAfter: 1};
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).click();
  await dialog.getByText('https://auth.example.test', {exact: true}).waitFor();
  await dialog.getByRole('button', {name: '取消登录', exact: true}).waitFor();
  await hidden();
  await screenshot(page,'login-pending');
  await dialog.getByRole('button', {name: '取消登录', exact: true}).click();
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).waitFor();
  await hidden();
  await screenshot(page,'login-cancelled');
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).click();
  await dialog.getByText('https://auth.example.test', {exact: true}).waitFor();
  resumeResult = {loggedIn: true};
  await dialog.getByRole('button', {name: '克隆到本地', exact: true}).waitFor();
  assert.equal(await dialog.getByRole('link', {name: '打开网页版安装'}).count(), 1);
  assert.equal(calls.some(c => c.includes('/templates/clone')), false);
  await dialog.getByPlaceholder('~/TianaTemplates/示例模板', {exact:true}).waitFor();
  const a = await cards.nth(0).boundingBox(), b = await cards.nth(1).boundingBox();
  assert.equal(a.y,b.y); assert.ok(a.x+a.width <= b.x);
  const localButton=await dialog.getByRole('button',{name:'克隆到本地',exact:true}).boundingBox();
  const cloudButton=await dialog.getByRole('link',{name:'打开网页版安装'}).boundingBox();
  assert.equal(localButton.y,cloudButton.y);
  assert.equal(localButton.height,cloudButton.height);
  await screenshot(page,'authenticated');
  await page.setViewportSize({width: 480, height: 900});
  const c = await cards.nth(0).boundingBox(), d = await cards.nth(1).boundingBox();
  assert.equal(c.y,d.y); assert.ok(c.x+c.width <= d.x);
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  const narrowLocal=await dialog.getByRole('button',{name:'克隆到本地',exact:true}).boundingBox();
  const narrowCloud=await dialog.getByRole('link',{name:'打开网页版安装'}).boundingBox();
  assert.equal(narrowLocal.y,narrowCloud.y);
  assert.equal(narrowLocal.height,narrowCloud.height);
  await screenshot(page,'authenticated-narrow');
  await page.setViewportSize({width: 1440, height: 1000});
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  await page.getByRole('button', {name: '退出登录', exact: true}).click();
  await page.getByRole('button', {name: '安装', exact: true}).click();
  await dialog.getByRole('button', {name: '登录 Tiana', exact: true}).waitFor();
  await hidden();
  await screenshot(page,'signed-out');

});


test('stable template IDs detect existing installs and reuse the newest session', async t=>{
  const {page,calls}=await setup(t,async url=>{
    if(url.pathname.endsWith('/templates')) return {items:[{name:'tpl-stable-123',display_name:'已安装模板'}],categories:[],nextCursor:null,origin:'https://console.example.test'};
    if(url.pathname.endsWith('/workspaces')) return {items:[{id:'local-existing',template:'tpl-stable-123',title:'已有项目',directory:'/fixture/existing',dshSession:{ok:true,ready:true,sessionId:'deleted-session'}}],sandbox:{supported:true}};
    if(url.pathname.endsWith('/workspaces/session')) return {session:{ready:true,sessionId:'current-session'}};
  });
  await page.goto(origin);
  await page.getByRole('button',{name:'安装',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByText('已有项目',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'克隆到本地',exact:true}).count(),0);
  const cloneAnother=dialog.getByRole('button',{name:'再克隆一份',exact:true});
  const cloud=dialog.getByRole('link',{name:'打开网页版安装',exact:true});
  const checkSize=async()=>{
    const a=await cloneAnother.boundingBox(),b=await cloud.boundingBox();
    assert.ok(Math.abs(a.width-b.width)<1, `width ${a.width} vs ${b.width}`);
    assert.equal(a.height,b.height);
    assert.equal(a.y,b.y);
  };
  await checkSize();
  await screenshot(page,'duplicate-existing');
  await page.setViewportSize({width:480,height:900});
  await checkSize();
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await screenshot(page,'duplicate-existing-narrow');
  await page.setViewportSize({width:1440,height:1000});
  await dialog.getByRole('button',{name:'打开已有项目',exact:true}).click();
  await page.waitForFunction(()=>window.openedSession === 'current-session');
  assert.ok(calls.some(c=>c==='/api/tiana/workspaces/session?id=local-existing&lang=zh'));
  assert.equal(calls.some(c=>c.includes('/templates/clone')),false);
});

test('local projects expose no deletion or removal controls', async t => {
  const {page,calls}=await setup(t,async url=>{
    if(url.pathname.endsWith('/workspaces')) return {ok:true,items:[{id:'local-keep',template:'',title:'保留项目',directory:'/fixture/project',status:'stopped'}],sandbox:{supported:true}};
  });
  await page.goto(origin+'?section=local');
  await page.getByText('保留项目',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/移除项目|删除项目/}).count(),0);
  assert.equal(calls.some(c=>c.includes('/workspaces/remove')),false);
  await screenshot(page,'local-no-delete');
});

test('local projects refresh automatically when missing directories hide and return', async t=>{
  let visible=true,reads=0;
  const {page}=await setup(t,async url=>{
    if(url.pathname.endsWith('/workspaces')){reads++;return {ok:true,items:visible?[{id:'recovered',template:'',title:'改名后恢复',directory:'/fixture/恢复项目',status:'stopped'}]:[],sandbox:{supported:true}};}
  });
  await page.goto(origin+'?section=local');
  const title=page.getByText('改名后恢复',{exact:true});await title.waitFor();
  visible=false;await title.waitFor({state:'detached'});
  await screenshot(page,'local-directory-hidden');
  visible=true;await title.waitFor();
  assert.ok(reads>=3);
  await screenshot(page,'local-directory-restored');
});

test('template preview dialog fetches HTML from same origin and renders inside sandboxed srcDoc iframe', async t => {
  let previewRequest;
  const { page } = await setup(t, async (url, route) => {
    if (url.pathname.endsWith('/templates')) {
      return {
        items: [{
          name: 'tpl-preview-demo',
          display_name: '预览示例',
          description: '沙箱预览测试',
          current_version: { version: '3', installable: true, has_source: true },
        }],
        categories: [],
        nextCursor: null,
        origin: 'https://console.example.test',
      };
    }
    if (url.pathname.endsWith('/template-detail')) {
      return {
        ok: true,
        item: {
          name: 'tpl-preview-demo',
          display_name: '预览示例',
          description: '沙箱预览测试',
          current_version: { version: '3', installable: true, has_source: true },
          prompt: 'Customize this template.',
        },
        error: null,
      };
    }
    if (url.pathname.endsWith('/template-preview')) {
      previewRequest = route.request();
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><head><title>Preview</title></head><body><div id="preview-ok">sandbox preview ok</div><script>document.getElementById("preview-ok").dataset.ran="yes";</script></body></html>',
      });
      return false;
    }
  });
  await page.goto(origin);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const iframe = dialog.locator('iframe.tiana-preview-frame');
  await iframe.waitFor();
  assert.equal(previewRequest.resourceType(), 'fetch');
  assert.equal(Object.keys(previewRequest.headers()).some(name => name.startsWith('x-tiana-')), false);
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await iframe.getAttribute('src'), null);
  const srcdoc = await iframe.getAttribute('srcdoc');
  assert.match(srcdoc ?? '', /http-equiv="Content-Security-Policy"/i);
  const frameEl = dialog.frameLocator('iframe.tiana-preview-frame').locator('#preview-ok');
  await frameEl.waitFor();
  assert.equal(await frameEl.textContent(), 'sandbox preview ok');
  assert.equal(await frameEl.getAttribute('data-ran'), 'yes');
  await screenshot(page, 'template-preview-fetch');
});

test('site icons and template and workspace covers render via Fetch-only transport', async t => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYfcAAAAASUVORK5CYII=',
    'base64',
  );
  let workspaceTemplate = 'local-cover-v1';
  const requests = [];
  const { page } = await setup(t, async (url, route) => {
    if (url.pathname.endsWith('/templates')) {
      return {
        items: [
          { name: 'release-cover', display_name: '模板封面', version: 7, cover_url: '/fixture' },
          { name: 'pending-cover', display_name: '等待封面', cover_url: '/fixture' },
        ],
        categories: [], origin: 'https://console.example.test',
      };
    }
    if (url.pathname.endsWith('/sites')) {
      return { ok: true, page: 1, items: [
        { id: 'web-raster', name: '图标站点' }, { id: 'web-svg', name: '矢量站点' },
      ] };
    }
    if (url.pathname.endsWith('/workspaces')) {
      return { ok: true, items: [{
        id: 'project', template: workspaceTemplate, title: '本地封面', directory: '/fixture/project', status: 'stopped',
      }] };
    }
    if (url.pathname.endsWith('/template-cover') || url.pathname.endsWith('/site-icon')) {
      requests.push(route.request());
      if (route.request().resourceType() !== 'fetch') {
        await route.abort();
      } else if (url.searchParams.get('id') === 'web-svg') {
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
      } else {
        await route.fulfill({ contentType: 'image/png', body: png });
      }
      return false;
    }
  });
  await page.addInitScript(() => {
    window.imageUrls = { created: [], revoked: [], pending: false, aborted: false };
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.imageUrls.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.imageUrls.revoked.push(url);
      revoke(url);
    };
    const fetch = window.fetch;
    window.fetch = (url, options) => {
      if (String(url).includes('/template-cover?name=pending-cover')) {
        window.imageUrls.pending = true;
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => {
            window.imageUrls.aborted = true;
            reject(options.signal.reason);
          }, { once: true });
        });
      }
      return fetch(url, options);
    };
  });
  const loadedImage = async (selector) => {
    await page.waitForFunction((css) => {
      const image = document.querySelector(css);
      return image?.src.startsWith('blob:') && image.naturalWidth > 0;
    }, selector);
    return page.locator(selector).getAttribute('src');
  };
  const revoked = (url) => page.waitForFunction((src) => window.imageUrls.revoked.includes(src), url);
  await page.goto(origin);
  const templateUrl = await loadedImage('.tiana-template-cover-img');
  await page.waitForFunction(() => window.imageUrls.pending);
  assert.ok(requests.some(request => request.url().endsWith('/template-cover?name=release-cover&v=7')));
  await screenshot(page, 'template-cover-blob');

  await page.getByRole('button', { name: '我的站点', exact: true }).click();
  await page.waitForFunction(() => window.imageUrls.aborted);
  await revoked(templateUrl);
  const siteUrl = await loadedImage('.tiana-site-image');
  assert.equal(await page.locator('.tiana-site-initial').textContent(), '矢');
  await screenshot(page, 'site-icon-blob-and-fallback');

  await page.getByRole('button', { name: '本地项目', exact: true }).click();
  await revoked(siteUrl);
  const firstLocalUrl = await loadedImage('.tiana-local-thumb img');
  workspaceTemplate = 'local-cover-v2';
  await page.getByRole('button', { name: '刷新本地项目' }).click();
  await revoked(firstLocalUrl);
  const secondLocalUrl = await loadedImage('.tiana-local-thumb img');
  assert.notEqual(firstLocalUrl, secondLocalUrl);
  assert.deepEqual(await page.evaluate(() => window.imageUrls.created), [
    templateUrl, siteUrl, firstLocalUrl, secondLocalUrl,
  ]);
  await screenshot(page, 'local-cover-blob');
  assert.ok(requests.some(request => request.url().endsWith('/template-cover?name=local-cover-v2')));
  assert.ok(requests.every(request => request.resourceType() === 'fetch'));
  assert.ok(requests.every(request => Object.keys(request.headers()).every(name => !name.startsWith('x-tiana-'))));
});
