import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
  assert.ok(pkg.engines?.dsh);

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

test('tiana-api routes enforce DSH connection.requestRejection on every route and accept HTTPS Origin behind HTTP reverse proxy', async () => {
  const { registerTianaRoutes } = await import('../tiana-api.js');
  const routes = new Map();
  const webServer = {
    register(spec) {
      routes.set(`${spec.kind}:${spec.path}`, spec.handler);
      return () => routes.delete(`${spec.kind}:${spec.path}`);
    },
  };

  assert.throws(
    () => registerTianaRoutes(webServer, {}),
    /connection/i,
    'registerTianaRoutes must fail closed without a DSH connection service',
  );

  let rejectionStatus;
  const checkedPaths = [];
  const connection = {
    requestRejection(req) {
      checkedPaths.push(req.url);
      return rejectionStatus;
    },
  };
  const dispose = registerTianaRoutes(webServer, { connection });
  try {
    const call = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve) => {
      let status = 0;
      let body = '';
      const req = {
        method,
        url: path,
        headers,
        socket: { encrypted: false },
        on() {},
        off() {},
        resume() {},
      };
      const res = {
        on() {},
        off() {},
        writableEnded: false,
        writeHead(code) { status = code; },
        end(chunk = '') {
          this.writableEnded = true;
          body += chunk;
          resolve({ status, rawBody: body, body: body ? JSON.parse(body) : null });
        },
      };
      routes.get(`exact:${path.split('?')[0]}`)(req, res);
    });

    assert.ok(routes.size >= 21, `expected all Tiana HTTP routes to be registered, got ${routes.size}`);

    // Every registered route (JSON API + cover/preview/site-icon) must reject 401 and 403 first.
    for (const [key] of routes) {
      const path = key.replace(/^exact:/, '');
      for (const expectedStatus of [401, 403]) {
        rejectionStatus = expectedStatus;
        const refused = await call(path, {
          method: 'GET',
          headers: {
            'x-tiana-plugin': '1',
            host: '127.0.0.1:3080',
            origin: 'http://127.0.0.1:3080',
            'sec-fetch-site': 'same-origin',
          },
        });
        assert.equal(refused.status, expectedStatus, `${path} should return ${expectedStatus} when connection rejects`);
        assert.equal(refused.body?.ok, false);
        assert.equal(refused.body?.error?.code, expectedStatus === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
      }
    }

    // HEAD rejection must not emit a response body.
    rejectionStatus = 401;
    const refusedHead = await call('/tiana/api/template-preview?name=demo', {
      method: 'HEAD',
      headers: { host: '127.0.0.1:3080' },
    });
    assert.equal(refusedHead.status, 401);
    assert.equal(refusedHead.rawBody, '');

    // Admitted requests still enforce same-origin checks and work behind HTTPS reverse proxies.
    rejectionStatus = undefined;
    const okProxy = await call('/tiana/api/workspaces', {
      headers: {
        'x-tiana-plugin': '1',
        host: 'dsh.example.com',
        origin: 'https://dsh.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    assert.equal(okProxy.status, 200);
    assert.equal(okProxy.body.ok, true);

    const mismatch = await call('/tiana/api/workspaces', {
      headers: {
        'x-tiana-plugin': '1',
        host: 'dsh.example.com',
        origin: 'https://evil.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    assert.equal(mismatch.status, 403);
    assert.ok(checkedPaths.includes('/tiana/api/workspaces'));
    assert.ok(checkedPaths.includes('/tiana/api/template-cover'));
    assert.ok(checkedPaths.includes('/tiana/api/template-preview'));
    assert.ok(checkedPaths.includes('/tiana/api/site-icon'));
  } finally {
    dispose();
  }
});

test('host-main injects both webServer and connection before mounting routes', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const previousHome = process.env.DSH_HOME;
  const tempHome = await mkdtemp(join(tmpdir(), 'tiana-host-main-'));
  process.env.DSH_HOME = tempHome;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const { apply } = await import('../host-main.js');
  const injectedDeps = [];
  const registered = [];
  const effects = [];
  const webServer = {
    register(spec) {
      registered.push(spec.path);
      return () => {};
    },
  };
  const connection = {
    requestRejection() { return undefined; },
  };
  const ctx = {
    logger: { info() {}, error() {} },
    get(name) {
      if (name === 'webServer') return webServer;
      if (name === 'connection') return connection;
      return undefined;
    },
    effect(fn, label) {
      if (label === 'tiana:http-routes') {
        const dispose = fn();
        effects.push(dispose);
      }
    },
    inject(deps, cb) {
      injectedDeps.push(deps);
      cb({
        webServer,
        connection,
        get: (name) => ctx.get(name),
        effect: (fn, label) => ctx.effect(fn, label),
      });
    },
  };

  apply(ctx);
  try {
    assert.deepEqual(injectedDeps, [['webServer', 'connection']]);
    assert.ok(registered.includes('/tiana/api/workspaces'));
    assert.ok(registered.includes('/tiana/api/template-preview'));
  } finally {
    for (const dispose of effects) dispose?.();
  }

  // Without ctx.inject and without connection, routes must stay disabled.
  const fallbackRegistered = [];
  apply({
    logger: { info() {}, error() {} },
    get(name) {
      if (name === 'webServer') {
        return {
          register(spec) {
            fallbackRegistered.push(spec.path);
            return () => {};
          },
        };
      }
      return undefined;
    },
    effect() {},
  });
  assert.deepEqual(fallbackRegistered, []);
});
