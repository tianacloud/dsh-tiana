import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'));
}

test('package.json is configured for public npm and DSH bundle distribution', async () => {
  const pkg = await readJson('package.json');

  assert.equal(pkg.name, '@tianacloud/dsh-tiana');
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, './host-main.js');
  assert.equal(pkg.icon, './icon.svg');
  assert.ok(pkg.engines?.node);
  assert.equal(pkg.engines?.dsh, '>=0.2.2-rc.1');

  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh?.client?.platform, 'web');
  assert.ok(Array.isArray(pkg.dsh?.client?.inject));

  for (const key of ['.', './client', './cordis.patch.yml', './package.json', './locale/*.json', './icon', './icon.svg']) {
    assert.ok(Object.hasOwn(pkg.exports ?? {}, key), `exports should include ${key}`);
  }

  for (const requiredFile of [
    'host-main.js',
    'install.js',
    'tiana-api.js',
    'preview-bind.js',
    'dev-preview.js',
    'confined-run.js',
    'client.js',
    'cordis.patch.yml',
    'locale/*.json',
    'icon.svg',
    'scripts/bootstrap.mjs',
    'README.md',
    'README.en.md',
    'LICENSE',
  ]) {
    assert.ok(pkg.files?.includes(requiredFile), `files should include ${requiredFile}`);
  }

  for (const path of ['host-main.js', 'install.js', 'tiana-api.js', 'preview-bind.js', 'dev-preview.js', 'confined-run.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'scripts/bootstrap.mjs', 'README.md', 'README.en.md', 'LICENSE']) {
    assert.ok(existsSync(join(ROOT, path)), `${path} should exist`);
  }
});

test('cordis.patch.yml, client.js, and host-main.js match package identity and have no dev markers', async () => {
  const pkg = await readJson('package.json');
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8');
  const client = await readFile(join(ROOT, 'client.js'), 'utf8');
  const hostMain = await readFile(join(ROOT, 'host-main.js'), 'utf8');

  assert.match(patch, new RegExp(`name:\\s*['"]${pkg.name.replace('/', '\\/')}['"]`));
  assert.match(client, new RegExp(`id:\\s*['"]${pkg.name.replace('/', '\\/')}['"]`));
  assert.doesNotMatch(hostMain, /\?local-workspace=/);
  assert.doesNotMatch(hostMain, /@local\//);
  assert.doesNotMatch(client, /@local\//);
  assert.doesNotMatch(patch, /@local\//);
});

test('locale metadata files are valid and reference existing detail documents', async () => {
  const pkg = await readJson('package.json');
  for (const file of ['locale/en.json', 'locale/zh.json']) {
    const data = await readJson(file);
    assert.equal(typeof data.meta?.title, 'string');
    assert.ok(data.meta.title.trim().length > 0);
    assert.equal(typeof data.meta?.description, 'string');
    assert.ok(data.meta.description.trim().length > 0);
    if (data.meta?.detail !== undefined) {
      assert.ok(existsSync(join(ROOT, data.meta.detail)), `${file} meta.detail (${data.meta.detail}) should exist`);
      assert.ok(pkg.files.includes(data.meta.detail), `${file} meta.detail (${data.meta.detail}) should be included in pkg.files`);
    }
  }
});

test('shipped documentation and source files contain no hardcoded local developer paths', async () => {
  for (const file of ['README.md', 'README.en.md', 'host-main.js', 'install.js', 'tiana-api.js', 'preview-bind.js', 'dev-preview.js', 'confined-run.js', 'client.js', 'scripts/bootstrap.mjs']) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.doesNotMatch(content, /\/home\/liam\b/, `${file} must not contain local home path`);
    assert.doesNotMatch(content, /@local\/dsh-tiana/, `${file} must not contain @local/dsh-tiana`);
  }
});

function captureFetchRoutes() {
  const routes = new Map();
  const connection = {
    fetch: {
      register(route) {
        assert.ok(!routes.has(route.path), route.path);
        routes.set(route.path, route);
        return async () => { routes.delete(route.path); };
      },
    },
  };
  const call = (path, options) => {
    const url = new URL(path, 'http://dsh.internal');
    return routes.get(url.pathname).fetch(new Request(url, options));
  };
  return { connection, routes, call };
}

test('Tiana registers exactly its 21 routes as buffered Fetch handlers on the DSH API channel', async () => {
  const { registerTianaRoutes } = await import('../tiana-api.js');
  assert.throws(() => registerTianaRoutes({ requestRejection() {} }), /connection\.fetch\.register/);

  const { connection, routes, call } = captureFetchRoutes();
  const dispose = registerTianaRoutes(connection);
  const paths = {
    GET: [
      'status', 'spaces', 'sites', 'templates', 'workspaces', 'workspaces/status',
      'workspaces/for-session', 'template-detail', 'template-cover', 'template-preview', 'site-icon',
    ],
    POST: [
      'login/start', 'login/resume', 'spaces/switch', 'logout', 'templates/clone',
      'workspaces/prepare', 'workspaces/remove', 'workspaces/stop', 'workspaces/session', 'sites/delete',
    ],
  };
  assert.equal(routes.size, 21);
  for (const [method, names] of Object.entries(paths)) {
    for (const name of names) {
      const route = routes.get(`/api/tiana/${name}`);
      assert.deepEqual(route.methods, method === 'GET' ? ['GET', 'HEAD'] : ['POST'], name);
      assert.equal(route.requestBody, 'buffered', name);
      assert.equal(typeof route.fetch, 'function', name);
    }
  }

  const response = await call('/api/tiana/templates?category=invalid', {
    headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com', 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await response.json()).error.code, 'INVALID_CATEGORY');

  const head = await call('/api/tiana/templates?category=invalid', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.deepEqual([...head.headers], [...response.headers]);
  assert.equal(head.body, null);
  await dispose();
  assert.equal(routes.size, 0);
});

test('media Fetch routes preserve bytes and security headers and omit all HEAD bodies', async (t) => {
  const { registerTianaRoutes } = await import('../tiana-api.js');
  const root = await mkdtemp(join(tmpdir(), 'tiana-fetch-media-'));
  const marketplace = 'https://market.example.test';
  const configHome = process.env.XDG_CONFIG_HOME;
  const apiOrigin = process.env.TIANA_API_ORIGIN;
  process.env.XDG_CONFIG_HOME = root;
  process.env.TIANA_API_ORIGIN = marketplace;
  t.after(async () => {
    if (configHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = configHome;
    if (apiOrigin === undefined) delete process.env.TIANA_API_ORIGIN;
    else process.env.TIANA_API_ORIGIN = apiOrigin;
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'tiana'));
  await writeFile(join(root, 'tiana', 'credentials.json'), JSON.stringify({
    credentials: { [marketplace]: { access_token: 'fixture-token', expires_at: '2099-01-01T00:00:00Z' } },
  }), { mode: 0o600 });

  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const html = Buffer.from('<h1>预览</h1>');
  const upstream = t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/preview')) return new Response(html, { headers: { 'content-type': 'text/html' } });
    return new Response(image, { headers: { 'content-type': 'image/png' } });
  });
  const { connection, call } = captureFetchRoutes();
  t.after(registerTianaRoutes(connection));
  const resources = [
    { path: 'site-icon?id=web123', upstreamPath: '/api/v1/web-apps/web123/icon', contentType: 'image/png', bytes: image, maxAge: 300 },
    { path: 'template-cover?name=demo&v=7', upstreamPath: '/api/v1/template-catalog/demo/cover?channel=market&version=7', contentType: 'image/png', bytes: image, maxAge: 86400 },
    { path: 'template-preview?name=demo&v=7', upstreamPath: '/api/v1/template-catalog/demo/preview?channel=market&version=7', contentType: 'text/html; charset=utf-8', bytes: html, maxAge: 86400 },
  ];
  for (const { path, upstreamPath, contentType, bytes, maxAge } of resources) {
    const response = await call(`/api/tiana/${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal(response.headers.get('content-type'), contentType);
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('cache-control'), `private, max-age=${maxAge}`);
    assert.match(response.headers.get('content-security-policy'), /^sandbox\b/);
    assert.equal(upstream.mock.calls.at(-1).arguments[0], marketplace + upstreamPath);

    const head = await call(`/api/tiana/${path}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.deepEqual([...head.headers], [...response.headers]);
  }
  for (const path of ['site-icon', 'template-cover', 'template-preview']) {
    const invalid = await call(`/api/tiana/${path}`, { method: 'HEAD' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body, null);
  }
});

test('media upstream fetches abort when their DSH request is cancelled', async (t) => {
  const { registerTianaRoutes } = await import('../tiana-api.js');
  const { connection, call } = captureFetchRoutes();
  t.after(registerTianaRoutes(connection));
  const upstreamStarted = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    upstreamStarted.resolve(signal);
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });

  const controller = new AbortController();
  const pending = call('/api/tiana/template-cover?name=demo', { signal: controller.signal });
  const upstreamSignal = await upstreamStarted.promise;
  controller.abort();
  assert.equal(upstreamSignal.aborted, true);
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal(response.body, null);
});

test('host-main mounts and disposes routes with only the connection service', async (t) => {
  const previousHome = process.env.DSH_HOME;
  const tempHome = await mkdtemp(join(tmpdir(), 'tiana-host-main-'));
  process.env.DSH_HOME = tempHome;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const { apply } = await import('../host-main.js');
  const { connection, routes } = captureFetchRoutes();
  const injectedDeps = [];
  const effects = [];
  const messages = [];
  const ctx = {
    logger: { info(message) { messages.push(message); }, error() {} },
    get: name => name === 'connection' ? connection : undefined,
    effect(fn, label) {
      if (label === 'tiana:http-routes') effects.push(fn());
    },
    inject(deps, cb) {
      injectedDeps.push(deps);
      cb({ ...ctx, connection });
    },
  };

  apply(ctx);
  assert.deepEqual(injectedDeps, [['connection']]);
  assert.equal(routes.size, 21);
  const diagnostics = JSON.parse(await readFile(join(tempHome, 'tiana-plugin/host-loaded.json'), 'utf8'));
  assert.equal(diagnostics.webServer, false);
  assert.equal(diagnostics.routesMounted, true);
  for (const dispose of effects) await dispose();
  assert.equal(routes.size, 0);

  apply({ ...ctx, inject: undefined, get: () => ({ requestRejection() {} }) });
  assert.equal(routes.size, 0);
  assert.ok(messages.some(message => message.includes('connection.fetch.register is unavailable')));
});
