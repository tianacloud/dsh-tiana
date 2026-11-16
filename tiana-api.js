/**
 * Host-side Tiana account and catalog API for the panel.
 *
 * The browser never runs the Tiana CLI and never sees credentials. It calls
 * same-origin `/tiana/api/*` routes; account/site operations run the installed
 * `tiana` CLI, public marketplace reads fetch the anonymous MGR catalog, and
 * read-only Web APIs (space creation quota and app icons) use only the CLI
 * access token in Host memory. The refresh token is never used, returned or
 * persisted by this module.
 *
 * Reaching the DSH Web server is the trust boundary: a connection that can use
 * Harness is trusted to use these routes, so they ask for no second
 * authentication. They only reject cross-site browser requests with a
 * same-origin/custom-header check.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { probeSandboxSupport, runConfined } from './confined-run.js';
import { dshHome, runCommand, tianaCommand } from './install.js';
import { listenOnReservedAddresses } from './preview-bind.js';

const STATUS_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 30_000;
const LIST_TIMEOUT_MS = 60_000;
const MAX_JSON_CHARS = 4 * 1024 * 1024;
const DEFAULT_MARKETPLACE_ORIGIN = 'https://console.tianacloud.com';
/**
 * Resolve the Tiana management origin used for public marketplace reads.
 * `TIANA_API_ORIGIN` may override the default, but only with a complete
 * HTTP(S) origin; paths, credentials, queries and fragments are rejected.
 * @returns {string} normalized origin without a trailing slash.
 */
function marketplaceOrigin() {
  const configured = typeof process.env.TIANA_API_ORIGIN === 'string'
    ? process.env.TIANA_API_ORIGIN.trim()
    : '';
  if (configured === '') return DEFAULT_MARKETPLACE_ORIGIN;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('TIANA_API_ORIGIN must be a valid HTTP(S) origin.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('TIANA_API_ORIGIN must use http or https.');
  }
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('TIANA_API_ORIGIN must be an origin without path, credentials, query or fragment.');
  }
  return url.origin;
}

/**
 * Resolve the account credential file used by the Tiana CLI.
 * The plugin only reads the access token, never the refresh token, and never
 * returns it to the browser or writes it to disk.
 */
function cliCredentialPath() {
  const configured = typeof process.env.XDG_CONFIG_HOME === 'string'
    ? process.env.XDG_CONFIG_HOME.trim()
    : '';
  const root = configured !== '' ? configured : join(homedir(), '.config');
  return join(root, 'tiana', 'credentials.json');
}

async function cliAccessToken() {
  const path = cliCredentialPath();
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
  const origin = marketplaceOrigin();
  const credentials = parsed?.credentials;
  const entry = credentials?.[origin] ?? credentials?.[`${origin}/`];
  const token = entry?.access_token;
  if (typeof token !== 'string' || token.length === 0) return null;
  if (entry?.token_type !== undefined && entry.token_type !== 'Bearer') return null;
  const expiresAt = Date.parse(entry?.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) return null;
  return { accessToken: token, expiresAt };
}

export async function creationQuota() {
  const credential = await cliAccessToken();
  if (credential === null) {
    return {
      ok: false,
      canCreate: false,
      limit: null,
      used: null,
      remaining: null,
      error: { code: 'ACCESS_TOKEN_UNAVAILABLE', message: 'Tiana access token is unavailable or expired.' },
    };
  }
  try {
    const response = await fetch(`${marketplaceOrigin()}/api/v1/me/tenant-creation`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
      },
      signal: AbortSignal.timeout(WEB_ACCOUNT_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (!response.ok) {
      return {
        ok: false,
        canCreate: false,
        limit: null,
        used: null,
        remaining: null,
        error: { code: 'SPACE_QUOTA_UNAVAILABLE', message: `Tiana space creation quota returned HTTP ${response.status}.` },
      };
    }
    const value = await response.json();
    const limit = Number(value?.limit);
    const used = Number(value?.used);
    const remaining = Number(value?.remaining);
    if (![limit, used, remaining].every((item) => Number.isFinite(item) && item >= 0)) {
      return {
        ok: false,
        canCreate: false,
        limit: null,
        used: null,
        remaining: null,
        error: { code: 'SPACE_QUOTA_INVALID', message: 'Tiana space creation quota response was invalid.' },
      };
    }
    return {
      ok: true,
      canCreate: limit > 0,
      limit,
      used,
      remaining,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      canCreate: false,
      limit: null,
      used: null,
      remaining: null,
      error: {
        code: 'SPACE_QUOTA_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchSiteIcon(id) {
  const now = Date.now();
  const cached = SITE_ICONS.get(id);
  if (cached !== undefined && cached.expiresAt > now) return cached;
  if (cached !== undefined) SITE_ICONS.delete(id);
  const credential = await cliAccessToken();
  if (credential === null) return null;
  try {
    const response = await fetch(`${marketplaceOrigin()}/api/v1/web-apps/${encodeURIComponent(id)}/icon`, {
      headers: {
        accept: 'image/png,image/*',
        authorization: `Bearer ${credential.accessToken}`,
      },
      signal: AbortSignal.timeout(SITE_ICON_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_SITE_ICON_BYTES) return null;
    const result = {
      buffer,
      contentType,
      expiresAt: now + SITE_ICON_CACHE_TTL_MS,
    };
    if (SITE_ICONS.size >= SITE_ICON_CACHE_MAX) {
      const oldest = SITE_ICONS.keys().next().value;
      if (oldest !== undefined) SITE_ICONS.delete(oldest);
    }
    SITE_ICONS.set(id, result);
    return result;
  } catch {
    return null;
  }
}

function createSiteIconHandler() {
  return async (req, res) => {
    if (!allowSubresourceRequest(req, res, 'site icon')) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, {
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' },
      }, { allow: 'GET, HEAD' });
      return;
    }
    const parsed = new URL(req.url ?? '/', 'http://localhost');
    const id = parsed.searchParams.get('id') ?? '';
    if (!/^[a-z][a-z0-9]{5,31}$/.test(id)) {
      sendJson(res, 400, {
        ok: false,
        error: { code: 'INVALID_WEB_ID', message: 'Invalid Web application id.' },
      });
      return;
    }
    req.resume();
    try {
      const icon = await fetchSiteIcon(id);
      if (res.writableEnded) return;
      if (icon === null) {
        res.writeHead(404, {
          'cache-control': 'private, max-age=30',
          'x-content-type-options': 'nosniff',
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': icon.contentType,
        'content-length': String(icon.buffer.length),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
      });
      res.end(req.method === 'HEAD' ? undefined : icon.buffer);
    } catch {
      if (!res.writableEnded) {
        sendJson(res, 502, {
          ok: false,
          error: { code: 'SITE_ICON_UNAVAILABLE', message: 'Tiana site icon is unavailable.' },
        });
      }
    }
  };
}

const MARKETPLACE_TIMEOUT_MS = 20_000;
const TEMPLATE_CACHE_TTL_MS = 24 * 60 * 60_000;
const TEMPLATE_CACHE_MAX = 256;
const TEMPLATE_PAGE_CACHE = new Map();
const WEB_ACCOUNT_TIMEOUT_MS = 15_000;
const SITE_ICON_TIMEOUT_MS = 15_000;
const MAX_SITE_ICON_BYTES = 6 * 1024 * 1024;
const SITE_ICON_CACHE_TTL_MS = 5 * 60_000;
const SITE_ICON_CACHE_MAX = 200;
const SITE_ICONS = new Map();
const MARKETPLACE_MAX_BYTES = 4 * 1024 * 1024;
const COVER_TIMEOUT_MS = 15_000;
const MAX_COVER_BYTES = 3 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const CLONE_TIMEOUT_MS = 240_000;
const WORKSPACE_BUILD_TIMEOUT_MS = 300_000;
const ACQUISITION_SOURCE = 'dsh';
const GUIDED_SESSION_TEXT = {
  en: {
    title: 'Customize template: tell me what features, pages, styles, or data to change',
    welcome: 'Hi! I am the customization assistant for this locally cloned project.\n\nThe project is building locally. Tell me what you would like to change, for example:\n- Update the home page, layout, colors, or copy\n- Adjust sample data or interactions\n- Add new features\n\nI will not modify any files automatically—just describe your goal first. Once the build finishes, click "Preview" next to the conversation title to open the live local page.',
  },
  zh: {
    title: '改造模板：先告诉我想改哪些功能、页面、样式或数据',
    welcome: '你好，我是这个本地克隆项目的改造助手。\n\n项目已经在本地构建，你可以直接告诉我想改什么，例如：\n- 改首页、页面结构、配色或文案\n- 调整题库、数据或交互\n- 添加新功能\n\n我不会自动修改任何文件；先说说你的目标即可。构建完成后，对话标题旁的“预览”可以打开本地真实页面。',
  },
};

function guidedLocale(input) {
  return typeof input === 'string' && input.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function guidedSessionCopy(locale) {
  return GUIDED_SESSION_TEXT[guidedLocale(locale)];
}

function localizedSandboxWarning(reason, locale) {
  const detail = reason || 'unavailable';
  return guidedLocale(locale) === 'zh'
    ? `本次模板构建未启用 DSH 沙箱（${detail}）。`
    : `The template build ran without the DSH sandbox (${detail}).`;
}

function localizedFunctionsWarning(locale) {
  return guidedLocale(locale) === 'zh'
    ? '该模板包含后端函数；本地预览仅模拟 SQLite，不运行后端函数。'
    : 'This template declares backend functions; the local preview only mocks SQLite and does not run functions.';
}

function withAcquisitionSource(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('_from')) {
      url.searchParams.set('_from', ACQUISITION_SOURCE);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
const WORKSPACE_PREVIEW_BODY_BYTES = 1_000_000;
const WORKSPACES = new Map();
/** Resolves DSH's `sandbox` service; set while the routes are registered. */
let resolveSandbox = () => undefined;
let workspacesLoaded = false;
let workspacesLoadPromise = null;
let workspacePersistTail = Promise.resolve();
const PREVIEW_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";

/**
 * Fetch one public marketplace JSON document with the shared timeout and size
 * limits. Public catalog reads never use CLI credentials.
 * @param {string} url - absolute URL.
 * @param {object} [options] - execution options.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<object>} parsed JSON object.
 */
async function fetchPublicJson(url, { signal } = {}) {
  const timeout = AbortSignal.timeout(MARKETPLACE_TIMEOUT_MS);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`Tiana marketplace returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length === 0 || text.length > MAX_JSON_CHARS) {
    throw new Error('Tiana marketplace returned an unsupported JSON size.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Tiana marketplace returned invalid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tiana marketplace returned an invalid JSON object.');
  }
  return parsed;
}

/**
 * Fetch one public template cover with the shared image limits.
 * @param {string} name - published template name.
 * @param {string} version - optional cache-busting version.
 * @param {object} [options] - execution options.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<{buffer: Buffer, contentType: string}>} cover bytes.
 */
async function fetchTemplateCover(name, version, { signal } = {}) {
  const origin = marketplaceOrigin();
  const suffix = version === '' ? '' : `?v=${encodeURIComponent(version)}`;
  const url = `${origin}/api/v1/template-marketplace/${encodeURIComponent(name)}/cover${suffix}`;
  const timeout = AbortSignal.timeout(COVER_TIMEOUT_MS);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const response = await fetch(url, {
    headers: { accept: 'image/webp,image/*' },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`Tiana template cover returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Tiana template cover did not return an image.');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_COVER_BYTES) {
    throw new Error('Tiana template cover has an unsupported size.');
  }
  return { buffer, contentType };
}

/**
 * Run one Tiana CLI command and parse its JSON envelope.
 * @param {readonly string[]} args - command arguments after `tiana`.
 * @param {object} [options] - execution options.
 * @param {number} [options.timeoutMs] - hard timeout.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<object>} parsed envelope plus exit facts.
 */
async function runTiana(args, { timeoutMs = LIST_TIMEOUT_MS, signal } = {}) {
  try {
    const result = await runCommand(tianaCommand(), args, {
      env: commandEnvironment(),
      timeoutMs,
      signal,
    });
    const payload = parseJson(result.stdout) ?? parseJson(result.stderr);
    return {
      ...(payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        status: 'failed',
        exitCode: 127,
        error: {
          code: 'CLI_MISSING',
          message: 'Tiana CLI is not installed or not on PATH.',
          next_action: 'Re-enable the Tiana plugin to run its bootstrap, or run node scripts/bootstrap.mjs.',
        },
      };
    }
    if (error?.code === 'ABORTED') throw error;
    return {
      status: 'failed',
      exitCode: 1,
      error: {
        code: 'CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
        next_action: 'Check the Tiana CLI installation and retry.',
      },
    };
  }
}

/**
 * Read the local login state without refresh or quota requests.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} `{ loggedIn, error }`.
 */
export async function authStatus({ signal } = {}) {
  const result = await runTiana(['status', '--json'], {
    timeoutMs: STATUS_TIMEOUT_MS,
    signal,
  });
  const error = normalizeError(result.error);
  return {
    loggedIn: result.status === 'succeeded'
      && result.data?.logged_in === true
      && result.data?.space !== undefined,
    error: error ?? null,
  };
}

/**
 * Start a browser authorization transaction.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} normalized login result.
 */
export async function loginStart({ signal } = {}) {
  return normalizeLogin(
    await runTiana(['login', '--start', '--no-open', '--json'], {
      timeoutMs: AUTH_TIMEOUT_MS,
      signal,
    }),
  );
}

/**
 * Poll the pending browser authorization once.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} normalized login result.
 */
export async function loginResume({ signal } = {}) {
  return normalizeLogin(
    await runTiana(['login', '--resume', '--json'], {
      timeoutMs: AUTH_TIMEOUT_MS,
      signal,
    }),
  );
}

/**
 * List the spaces visible to the current Tiana login.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} spaces plus the current tenant id.
 */
export async function listSpaces({ signal } = {}) {
  const result = await runTiana(['space', 'list', '--json'], {
    timeoutMs: STATUS_TIMEOUT_MS,
    signal,
  });
  const error = normalizeError(result.error);
  if (result.exitCode !== 0 || result.status === 'failed' || result.data === undefined) {
    return { ok: false, currentTenantId: null, items: [], error: error ?? { code: 'SPACES_FAILED', message: 'Could not list Tiana spaces.' } };
  }
  const data = result.data;
  return {
    ok: true,
    currentTenantId: typeof data.current_tenant_id === 'string' ? data.current_tenant_id : null,
    items: Array.isArray(data.items)
      ? data.items
          .filter((item) => typeof item?.tenant_id === 'string')
          .map((item) => ({
            tenantId: item.tenant_id,
            displayName: typeof item.display_name === 'string' ? item.display_name : item.tenant_id,
            role: typeof item.role === 'string' ? item.role : '',
            isDefault: item.is_default === true,
          }))
      : [],
    error: error ?? null,
  };
}

/**
 * Switch the current Tiana login to a space.
 * @param {string} id - tenant id from listSpaces.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} switch result; auth failures are returned as data.
 */
export async function switchSpace(id, { signal } = {}) {
  if (typeof id !== 'string' || !/^ten-[a-z0-9]+$/i.test(id)) {
    return { ok: false, tenantId: null, error: { code: 'INVALID_SPACE_ID', message: 'Invalid Tiana space id.' } };
  }
  const result = await runTiana(['space', 'switch', id, '--json'], {
    timeoutMs: STATUS_TIMEOUT_MS,
    signal,
  });
  const error = normalizeError(result.error);
  const tenantId = typeof result.data?.tenant_id === 'string' ? result.data.tenant_id : id;
  if (result.exitCode !== 0 || result.status === 'failed' || result.status === 'unknown' || result.data?.tenant_id === undefined) {
    return {
      ok: false,
      tenantId,
      requiresLogin: result.status === 'unknown' || error?.code === 'AUTH_REQUIRED' || error?.code === 'SPACE_OUTCOME_UNKNOWN',
      error: error ?? { code: 'SPACE_SWITCH_FAILED', message: 'Tiana space switch did not succeed.' },
    };
  }
  return { ok: true, tenantId, requiresLogin: false, error: null };
}

/**
 * Clear the local account session.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} `{ ok, error }`.
 */
export async function logout({ signal } = {}) {
  const result = await runTiana(['logout', '--json'], {
    timeoutMs: AUTH_TIMEOUT_MS,
    signal,
  });
  return {
    ok: result.exitCode === 0 && result.status !== 'failed',
    error: normalizeError(result.error) ?? null,
  };
}

/**
 * List the current account's own Web applications.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} `{ items, error }`.
 */
export async function listSites({ signal } = {}) {
  const result = await runTiana(['web', 'list', '--json'], {
    timeoutMs: LIST_TIMEOUT_MS,
    signal,
  });
  const items = result.data?.items;
  if (Array.isArray(items)) {
    let consoleOrigin = null;
    try {
      consoleOrigin = marketplaceOrigin();
    } catch {
      // Sites remain usable even if a bad origin only affects console links.
    }
    return {
      items: items.map((item) => ({
        ...item,
        console_url: consoleOrigin !== null && typeof item.id === 'string'
          ? `${consoleOrigin}/console/web/${encodeURIComponent(item.id)}`
          : null,
      })),
      error: null,
    };
  }
  return {
    items: [],
    error: normalizeError(result.error) ?? {
      code: 'WEB_LIST_FAILED',
      message: 'Tiana web list did not return an item list.',
      nextAction: 'Check the Tiana account and retry.',
    },
  };
}

/**
 * Delete one Web application through the CLI. Associated SQLite/Git resources
 * are retained, matching the CLI's documented deletion semantics.
 * @param {string} id - Web id.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} `{ ok, data, error }`.
 */
export async function deleteSite(id, { signal } = {}) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    return {
      ok: false,
      data: null,
      error: { code: 'INVALID_WEB_ID', message: 'Invalid Web application id.' },
    };
  }
  const result = await runTiana(['web', 'delete', id, '--force', '--json'], {
    timeoutMs: LIST_TIMEOUT_MS,
    signal,
  });
  const ok = result.exitCode === 0 && result.status !== 'failed';
  return {
    ok,
    data: result.data ?? null,
    error: normalizeError(result.error) ?? (ok ? null : {
      code: 'WEB_DELETE_FAILED',
      message: 'Tiana web delete did not succeed.',
      nextAction: 'Refresh the site list and inspect the Web instance in Tiana Console.',
    }),
  };
}

/**
 * Read one page of the public Web template catalog. Marketplace reads are
 * anonymous; only template installation requires a Tiana account.
 *
 * The browser talks to this Host route, and the Host fetches the public MGR
 * catalog directly. No CLI credential or login state is involved.
 * @param {object} [options] - page and filter options.
 * @param {string} [options.after] - opaque catalog cursor.
 * @param {string} [options.category] - numeric category id.
 * @param {string} [options.q] - catalog search text.
 * @param {boolean} [options.includeCategories] - fetch category chips with this page.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @returns {Promise<object>} `{ items, categories, nextCursor, origin, error }`.
 */
export async function listPublicTemplates({
  after = '',
  category = '',
  q = '',
  includeCategories = true,
  signal,
} = {}) {
  let origin;
  try {
    origin = marketplaceOrigin();
  } catch (error) {
    return {
      items: [],
      categories: [],
      nextCursor: null,
      origin: null,
      error: {
        code: 'MARKETPLACE_ORIGIN_INVALID',
        message: error instanceof Error ? error.message : String(error),
        nextAction: 'Unset TIANA_API_ORIGIN or set it to a valid HTTP(S) origin.',
      },
    };
  }

  const cacheKey = `${origin}\u0000${includeCategories ? '1' : '0'}\u0000${after}\u0000${category}\u0000${q}`;
  const cached = TEMPLATE_PAGE_CACHE.get(cacheKey);
  if (cached !== undefined) {
    if (cached.expiresAt > Date.now()) return cached.value;
    TEMPLATE_PAGE_CACHE.delete(cacheKey);
  }

  const base = `${origin}/api/v1/template-marketplace`;
  const params = new URLSearchParams();
  if (after !== '') params.set('after', after);
  if (category !== '') params.set('category_id', category);
  if (q !== '') params.set('q', q);
  const pageUrl = params.size === 0 ? base : `${base}?${params.toString()}`;

  try {
    const [pageResult, categoriesResult] = await Promise.allSettled([
      fetchPublicJson(pageUrl, { signal }),
      includeCategories
        ? fetchPublicJson(`${base}/categories`, { signal })
        : Promise.resolve({ items: [] }),
    ]);
    if (pageResult.status !== 'fulfilled') throw pageResult.reason;

    const page = pageResult.value;
    if (!Array.isArray(page.items)) {
      throw new Error('Tiana marketplace did not return an item list.');
    }
    const categories = includeCategories
      && categoriesResult.status === 'fulfilled'
      && Array.isArray(categoriesResult.value.items)
      ? categoriesResult.value.items
      : [];
    const nextCursor = typeof page.next_cursor === 'string' && page.next_cursor.length > 0
      ? page.next_cursor
      : null;

    const value = {
      items: page.items,
      categories,
      nextCursor,
      origin,
      error: null,
    };
    if (TEMPLATE_PAGE_CACHE.size >= TEMPLATE_CACHE_MAX) {
      const oldest = TEMPLATE_PAGE_CACHE.keys().next().value;
      if (oldest !== undefined) TEMPLATE_PAGE_CACHE.delete(oldest);
    }
    TEMPLATE_PAGE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS,
      value,
    });
    return value;
  } catch (error) {
    return {
      items: [],
      categories: [],
      nextCursor: null,
      origin,
      error: {
        code: 'MARKETPLACE_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        nextAction: 'Check network access to the Tiana marketplace and retry.',
      },
    };
  }
}

/**
 * Read public template details, including the full description and prompt.
 * @param {string} name - published template name.
 * @param {object} [options] - execution options.
 * @returns {Promise<{item: object|null, error: object|null}>} detail result.
 */
export async function getPublicTemplateDetail(name, { signal } = {}) {
  try {
    const origin = marketplaceOrigin();
    const item = await fetchPublicJson(
      `${origin}/api/v1/template-marketplace/${encodeURIComponent(name)}`,
      { signal },
    );
    return { item, error: null };
  } catch (error) {
    return {
      item: null,
      error: {
        code: 'TEMPLATE_DETAIL_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        nextAction: 'Check network access to the Tiana marketplace and retry.',
      },
    };
  }
}

function commandEnvironment() {
  const temp = join(dshHome(), 'tiana-plugin', 'tmp');
  try {
    mkdirSync(temp, { recursive: true });
  } catch {
    return { ...process.env };
  }
  return { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp };
}

async function sandboxCapability() {
  const probeRoot = join(dshHome(), 'tiana-plugin', 'tmp');
  return probeSandboxSupport(resolveSandbox(), { probeRoot });
}

function addWarning(workspace, text) {
  workspace.warning = workspace.warning ? `${workspace.warning} ${text}` : text;
}

/**
 * Run a template build under DSH's sandbox when one is available: writes are
 * limited to the template directory, the plugin temp directory and the given
 * extra roots. Without a usable sandbox the build still runs and the preview
 * carries a warning saying so.
 */
async function runSandboxedBuild(workspace, command, args, env, extraRoots) {
  const temp = join(dshHome(), 'tiana-plugin', 'tmp');
  const buildEnv = workspace.sandboxOff === true
    ? { ...env, TIANA_LOCAL_BUILD_SANDBOX: 'off', npm_config_cache: join(temp, 'npm-cache') }
    : { ...env, npm_config_cache: join(temp, 'npm-cache') };
  const outcome = await runConfined(resolveSandbox(), {
    workspaceRoot: workspace.directory,
    writableRoots: [temp, ...extraRoots],
    env: buildEnv,
  }, command, args, {
    cwd: workspace.directory,
    env: buildEnv,
    timeoutMs: WORKSPACE_BUILD_TIMEOUT_MS,
  });
  workspace.sandbox = {
    confined: outcome.confined === true,
    enforcement: outcome.enforcement ?? null,
    reason: outcome.reason ?? null,
  };
  if (!outcome.confined) {
    addWarning(workspace, localizedSandboxWarning(outcome.reason, workspace.locale ?? workspace.dshSession?.locale));
  }
  return outcome;
}

function buildFailure(outcome) {
  const hint = outcome.denied
    ? ' The DSH sandbox only allows writes inside the project; set TIANA_LOCAL_BUILD_SANDBOX=off to build without it.'
    : '';
  return new Error(`Template build failed.${hint}\n${lastOutput(outcome.result)}`);
}

function resolveCloneDirectory(input, name) {
  const raw = typeof input === 'string' ? input.trim() : '';
  let target = raw;
  if (target === '') {
    target = join(homedir(), 'TianaTemplates', name);
    if (!existsSync(target)) return target;
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${target}-${index}`;
      if (!existsSync(candidate)) return candidate;
    }
    throw new Error('No free default directory was found for the cloned template.');
  }
  if (target === '~' || target.startsWith('~/')) {
    target = join(homedir(), target.slice(2));
  }
  return isAbsolute(target) ? target : resolve(process.cwd(), target);
}

/**
 * Clone one template source into a local directory. The caller builds it and
 * registers the resulting workspace; this function only downloads source.
 * @param {string} name - template name.
 * @param {string} directory - user-selected directory, or empty for the default.
 * @param {object} [options] - execution options.
 * @returns {Promise<object>} clone result.
 */
export async function cloneTemplate(name, directory, { signal } = {}) {
  if (!validTemplateName(name)) {
    return { ok: false, directory: null, error: { code: 'INVALID_TEMPLATE_NAME', message: 'Invalid template name.' } };
  }
  let target;
  try {
    target = resolveCloneDirectory(directory, name);
  } catch (error) {
    return {
      ok: false,
      directory: null,
      error: { code: 'INVALID_TARGET_DIRECTORY', message: error instanceof Error ? error.message : String(error) },
    };
  }
  try {
    mkdirSync(dirname(target), { recursive: true });
  } catch (error) {
    return {
      ok: false,
      directory: target,
      error: { code: 'TARGET_PARENT_UNAVAILABLE', message: error instanceof Error ? error.message : String(error) },
    };
  }

  const result = await runTiana(['web', 'init-template', name, '--dir', target, '--json'], {
    timeoutMs: CLONE_TIMEOUT_MS,
    signal,
  });
  if (result.exitCode !== 0 || result.status === 'failed') {
    return {
      ok: false,
      directory: target,
      metadataPath: null,
      error: normalizeError(result.error) ?? {
        code: 'TEMPLATE_CLONE_FAILED',
        message: 'Tiana template clone did not succeed.',
        nextAction: 'Check the directory, Tiana login and network, then retry.',
      },
    };
  }

  const actualDirectory = typeof result.data?.directory === 'string' && result.data.directory.length > 0
    ? result.data.directory
    : target;
  const metadataPath = typeof result.data?.metadata_path === 'string' ? result.data.metadata_path : null;

  return {
    ok: true,
    directory: actualDirectory,
    metadataPath,
    error: null,
  };
}

function workspaceStoreFile() {
  return join(dshHome(), 'tiana-plugin', 'workspaces.json');
}

function workspaceDataDirectory(id) {
  return join(dshHome(), 'tiana-plugin', 'workspaces', id);
}

async function loadWorkspaces() {
  if (workspacesLoaded) return;
  if (workspacesLoadPromise === null) {
    workspacesLoadPromise = (async () => {
      try {
        const parsed = JSON.parse(await readFile(workspaceStoreFile(), 'utf8'));
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        for (const item of items) {
          if (typeof item?.id !== 'string' || typeof item.directory !== 'string') continue;
          if (WORKSPACES.has(item.id)) continue;
          WORKSPACES.set(item.id, {
            id: item.id,
            title: typeof item.title === 'string' ? item.title : item.template ?? item.id,
            directory: item.directory,
            template: typeof item.template === 'string' ? item.template : '',
            appId: typeof item.appId === 'string' ? item.appId : `local-${item.id}`,
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            dshWorkspace: item.dshWorkspace ?? null,
            dshSession: item.dshSession ?? null,
            status: 'stopped',
            phase: 'stopped',
            error: null,
            warning: typeof item.warning === 'string' ? item.warning : null,
            sandbox: item.sandbox && typeof item.sandbox === 'object' ? item.sandbox : null,
            building: false,
            previewPort: null,
            previewToken: null,
            servers: [],
            db: null,
            outDir: null,
            indexHtml: null,
            readyAt: null,
          });
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          // A damaged registry must not prevent cloning a new workspace.
        }
      } finally {
        workspacesLoaded = true;
      }
    })();
  }
  await workspacesLoadPromise;
}

function persistWorkspaces() {
  const items = [...WORKSPACES.values()].map((workspace) => ({
    id: workspace.id,
    title: workspace.title,
    directory: workspace.directory,
    template: workspace.template,
    appId: workspace.appId,
    createdAt: workspace.createdAt,
    dshWorkspace: workspace.dshWorkspace,
    dshSession: workspace.dshSession,
    warning: workspace.warning ?? null,
    sandbox: workspace.sandbox ?? null,
  }));
  workspacePersistTail = workspacePersistTail.then(async () => {
    const file = workspaceStoreFile();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ version: 1, items }, null, 2)}\n`, { mode: 0o600 });
  }).catch(() => undefined);
  return workspacePersistTail;
}

function previewHostname(req) {
  const host = req?.headers?.host;
  if (typeof host !== 'string' || host.length === 0) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function previewUrlFor(req, workspace) {
  if (workspace?.previewPort === null || workspace?.previewPort === undefined) return null;
  const hostname = previewHostname(req);
  if (hostname === null || typeof workspace.previewToken !== 'string') return null;
  return `http://${hostname}:${workspace.previewPort}/?token=${encodeURIComponent(workspace.previewToken)}`;
}

function publicWorkspace(workspace, req) {
  return {
    id: workspace.id,
    title: workspace.title,
    directory: workspace.directory,
    template: workspace.template,
    status: workspace.status,
    phase: workspace.phase,
    error: workspace.error,
    warning: workspace.warning,
    sandbox: workspace.sandbox ?? null,
    dshWorkspace: workspace.dshWorkspace,
    dshSession: workspace.dshSession,
    previewUrl: workspace.status === 'ready' ? previewUrlFor(req, workspace) : null,
    createdAt: workspace.createdAt,
    readyAt: workspace.readyAt ?? null,
  };
}

async function readTemplateMetadata(directory) {
  try {
    const parsed = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function createDshWorkspace(resolveRegistry, directory, title) {
  try {
    const registry = typeof resolveRegistry === 'function' ? resolveRegistry() : undefined;
    if (registry === undefined || registry === null || typeof registry.create !== 'function') {
      return {
        ok: false,
        error: {
          code: 'DSH_WORKSPACE_UNAVAILABLE',
          message: 'The Harness workspace registry is unavailable; the source is cloned but no workspace was registered.',
        },
      };
    }
    const workspace = await registry.create(directory, title);
    return {
      ok: true,
      id: String(workspace.id),
      title: String(workspace.title ?? title),
      path: String(workspace.path ?? directory),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DSH_WORKSPACE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function createDshSession(resolveController, dshWorkspace, locale) {
  const lang = guidedLocale(locale);
  const { title } = guidedSessionCopy(lang);
  try {
    const controller = typeof resolveController === 'function' ? resolveController() : undefined;
    if (controller === undefined || controller === null || typeof controller.create !== 'function') {
      return {
        ok: false,
        locale: lang,
        error: {
          code: 'DSH_SESSION_UNAVAILABLE',
          message: 'The Harness session controller is unavailable; no guided session was created.',
        },
      };
    }
    const created = await controller.create({ workspaceId: dshWorkspace.id });
    const sessionId = String(created.sessionId);
    try {
      await controller.rename({ sessionId, title });
      return { ok: true, sessionId, title, locale: lang, renamed: true, error: null };
    } catch (error) {
      return {
        ok: true,
        sessionId,
        title,
        locale: lang,
        renamed: false,
        error: {
          code: 'DSH_SESSION_RENAME_FAILED',
          message: `Session "${sessionId}" was created but could not be renamed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      sessionId: null,
      title,
      locale: lang,
      error: {
        code: 'DSH_SESSION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function appendGuidedWelcome(session, turn, locale) {
  const { welcome: text } = guidedSessionCopy(locale);
  const now = Date.now();
  await session.append('turn/start', { turn });
  await session.append('step/start', { turn, step: 1 });
  await session.append(
    'assistant/message',
    {
      turn,
      step: 1,
      message: {
        id: `guided-welcome-${randomUUID()}`,
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'tiana-local', model: 'guided-welcome' },
      },
      stream: [{ type: 'text-chunks', time0: now, index: 0, dt: [0], texts: [text] }],
    },
    { surfaceOp: 'append' },
  );
  await session.append('step/end', { turn, step: 1 });
  await session.append('turn/end', { turn, reason: { kind: 'completed' } });
}

async function markGuidedSessionReady(resolveController, dshSession) {
  try {
    const controller = typeof resolveController === 'function' ? resolveController() : undefined;
    if (controller === undefined || controller === null || typeof controller.resolveAgent !== 'function') {
      return {
        ...dshSession,
        ready: false,
        readyError: {
          code: 'DSH_SESSION_RESOLVE_UNAVAILABLE',
          message: 'The Harness session resolver is unavailable; the titled session cannot be made visible.',
        },
      };
    }
    const resolved = await controller.resolveAgent(dshSession.sessionId);
    if (resolved === null || resolved === undefined || resolved.error) {
      throw new Error(resolved?.error?.message ?? 'The guided Session could not be resolved.');
    }
    const session = resolved.agent?.session;
    if (session === undefined || session === null || typeof session.append !== 'function') {
      throw new Error('The guided Session is not writable.');
    }
    // DSH hides blank Sessions from the workspace list and from the header.
    // Seed a closed turn with an assistant welcome: no prompt, no model request.
    await appendGuidedWelcome(session, 1, dshSession.locale);
    return {
      ...dshSession,
      ready: true,
      emptyTurn: false,
      seeded: true,
      readyError: null,
    };
  } catch (error) {
    return {
      ...dshSession,
      ready: false,
      readyError: {
        code: 'DSH_SESSION_READY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function lastOutput(result, limit = 2400) {
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim();
  return text.length > limit ? text.slice(-limit) : text;
}

async function installWorkspaceDependencies(workspace) {
  const directory = workspace.directory;
  if (!existsSync(join(directory, 'package.json'))) {
    throw new Error('The cloned template has no package.json; local build preview is unsupported.');
  }
  const hasLock = existsSync(join(directory, 'package-lock.json'))
    || existsSync(join(directory, 'npm-shrinkwrap.json'));
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = hasLock
    ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
    : ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
  const result = await runCommand(command, args, {
    cwd: directory,
    env: commandEnvironment(),
    timeoutMs: WORKSPACE_BUILD_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    throw new Error(`Dependency installation failed.\n${lastOutput(result)}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sdkShimSource() {
  return [
    'export function createTianaFetch() {',
    '  return (input, init) => fetch(input, init);',
    '}',
    '',
    'export function createTianaFiles() {',
    '  throw new Error("Files are not available in the local preview.");',
    '}',
    '',
    'export function createTianaSessionAuth() {',
    '  throw new Error("Session auth is not available in the local preview.");',
    '}',
    '',
    'export function diagnosisOf() {',
    '  return undefined;',
    '}',
    '',
    'export class TianaAuthError extends Error {}',
    'export class TianaFileError extends Error {}',
    '',
  ].join('\n');
}

async function writeVitePreviewConfig(workspace, previewRoot, outDir) {
  const directory = workspace.directory;
  const shimPath = join(previewRoot, 'serverless-shim.js');
  const configPath = join(previewRoot, 'vite.config.mjs');
  const viteConfigPath = ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs']
    .map((name) => join(directory, name))
    .find((candidate) => existsSync(candidate)) ?? null;
  await writeFile(shimPath, sdkShimSource());
  const baseImport = viteConfigPath === null
    ? 'let base = {};'
    : `const baseModule = await import(${JSON.stringify(pathToFileURL(viteConfigPath).href)});\nlet base = baseModule.default ?? {};\nif (typeof base === "function") base = await base({ command: "build", mode: "production" });\nbase = base ?? {};`;
  const configSource = `import { pathToFileURL } from "node:url";
${baseImport}
const shim = ${JSON.stringify(shimPath)};
const baseResolve = base.resolve ?? {};
const baseAlias = baseResolve.alias;
const alias = Array.isArray(baseAlias)
  ? [...baseAlias, { find: "@tianacloud/serverless", replacement: shim }]
  : { ...(baseAlias ?? {}), "@tianacloud/serverless": shim };
export default {
  ...base,
  resolve: { ...baseResolve, alias },
  build: { ...(base.build ?? {}), outDir: ${JSON.stringify(outDir)}, emptyOutDir: true, sourcemap: true },
};
`;
  await writeFile(configPath, configSource);
  return configPath;
}

async function buildWorkspaceWithVite(workspace, previewRoot) {
  const directory = workspace.directory;
  const outDir = join(workspaceDataDirectory(workspace.id), 'dist');
  await mkdir(outDir, { recursive: true });
  const configPath = await writeVitePreviewConfig(workspace, previewRoot, outDir);
  const outcome = await runSandboxedBuild(workspace, process.execPath, [
    join(directory, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--config',
    configPath,
    '--mode',
    'production',
  ], commandEnvironment(), [previewRoot, outDir]);
  if (outcome.result.code !== 0) throw buildFailure(outcome);
  workspace.outDir = outDir;
}

async function buildWorkspaceWithScript(workspace) {
  const directory = workspace.directory;
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch {
    throw new Error('The cloned template has no package.json; local build preview is unsupported.');
  }
  const buildScript = packageJson?.scripts?.build;
  if (typeof buildScript !== 'string' || buildScript.trim() === '') {
    throw new Error('No supported frontend build was found. The template has neither Vite nor a package.json build script.');
  }

  const sdkIndex = join(directory, 'node_modules', '@tianacloud', 'serverless', 'dist', 'index.js');
  let sdkBackup = null;
  if (existsSync(sdkIndex)) {
    sdkBackup = await readFile(sdkIndex, 'utf8');
    await writeFile(sdkIndex, sdkShimSource());
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let outcome;
  try {
    outcome = await runSandboxedBuild(
      workspace,
      command,
      ['run', 'build', '--', '0'.repeat(40)],
      { ...commandEnvironment(), TIANA_TEMPLATE_BUILD: '1' },
      [],
    );
  } finally {
    if (sdkBackup !== null) {
      await writeFile(sdkIndex, sdkBackup).catch(() => undefined);
    }
  }
  if (outcome.result.code !== 0) throw buildFailure(outcome);

  const candidates = ['dist', 'build', 'public'].map((name) => join(directory, name));
  const outDir = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (outDir === null) {
    throw new Error('The template build produced no dist/build directory for local preview.');
  }
  workspace.outDir = outDir;
}

async function ensurePreviewIndex(workspace) {
  if (workspace.outDir === null || workspace.outDir === undefined) {
    throw new Error('The template build output is missing.');
  }
  const indexPath = join(workspace.outDir, 'index.html');
  if (existsSync(indexPath)) return;
  let scriptUrl = null;
  let cssUrl = null;
  for (const [subdirectory, prefix] of [['assets', '/assets/'], ['', '/']]) {
    const directory = subdirectory === '' ? workspace.outDir : join(workspace.outDir, subdirectory);
    const names = await readdir(directory).catch(() => []);
    if (scriptUrl === null) {
      const script = names.find((name) => name === 'app.js')
        ?? names.find((name) => name.endsWith('.js'));
      if (script !== undefined) scriptUrl = `${prefix}${script}`;
    }
    if (cssUrl === null) {
      const css = names.find((name) => name === 'app.css')
        ?? names.find((name) => name.endsWith('.css'));
      if (css !== undefined) cssUrl = `${prefix}${css}`;
    }
  }
  if (scriptUrl === null) {
    throw new Error('The template build produced no browser entry. Local preview is unsupported.');
  }
  const cssLink = cssUrl === null ? '' : `<link rel="stylesheet" href="${escapeHtml(cssUrl)}">`;
  await writeFile(indexPath, `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(workspace.title)}</title>
${cssLink}
</head>
<body>
<div id="app"></div>
<script type="module" src="${escapeHtml(scriptUrl)}"></script>
</body>
</html>
`);
}

async function buildWorkspace(workspace) {
  const directory = workspace.directory;
  const viteBin = join(directory, 'node_modules', 'vite', 'bin', 'vite.js');
  const previewRoot = join(dshHome(), 'tiana-plugin', 'previews', workspace.id);
  await mkdir(previewRoot, { recursive: true });
  if (existsSync(viteBin)) {
    await buildWorkspaceWithVite(workspace, previewRoot);
  } else {
    await buildWorkspaceWithScript(workspace);
  }
  await ensurePreviewIndex(workspace);
}

async function initWorkspaceDatabase(workspace) {
  const directory = workspace.directory;
  const metadata = await readTemplateMetadata(directory);
  const dataDir = workspaceDataDirectory(workspace.id);
  await mkdir(dataDir, { recursive: true });
  workspace.db?.close();
  workspace.db = new DatabaseSync(join(dataDir, 'preview.sqlite'));
  const schemaName = typeof metadata.schema === 'string' && metadata.schema.length > 0
    ? metadata.schema
    : 'schema.sql';
  const seedName = typeof metadata.seeds === 'string' && metadata.seeds.length > 0
    ? metadata.seeds
    : 'seed.sql';
  for (const name of [schemaName, seedName]) {
    const file = join(directory, name);
    if (!existsSync(file)) continue;
    try {
      workspace.db.exec(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(`Local SQLite initialization failed for ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (metadata.functions !== undefined) {
    addWarning(workspace, localizedFunctionsWarning(workspace.locale ?? workspace.dshSession?.locale));
  }
}

function hranaArgument(value) {
  if (value === null || value === undefined) return null;
  switch (value.type) {
    case 'null': return null;
    case 'integer':
    case 'float': return Number(value.value);
    case 'blob': return Buffer.from(value.base64 ?? '', 'base64');
    default: return value.value ?? null;
  }
}

function hranaCell(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'bigint') return { type: 'integer', value: String(value) };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  return { type: 'text', value: String(value) };
}

function executeWorkspaceStatement(db, statement) {
  if (statement === null || typeof statement !== 'object' || typeof statement.sql !== 'string') {
    throw new Error('Invalid SQL statement.');
  }
  const prepared = db.prepare(statement.sql);
  const values = Array.isArray(statement.args) ? statement.args.map(hranaArgument) : [];
  const returnsRows = /^\s*(select|pragma|with|explain|values)/i.test(statement.sql)
    || /\breturning\b/i.test(statement.sql);
  if (returnsRows) {
    const rows = prepared.all(...values);
    let columns = [];
    try {
      columns = prepared.columns().map((column) => ({
        name: column.name,
        decltype: column.type ?? null,
      }));
    } catch {
      columns = [];
    }
    return {
      cols: columns,
      rows: rows.map((row) => columns.map((column) => hranaCell(row[column.name]))),
      affected_row_count: 0,
      last_insert_rowid: null,
    };
  }
  const result = prepared.run(...values);
  return {
    cols: [],
    rows: [],
    affected_row_count: Number(result.changes ?? 0),
    last_insert_rowid: String(result.lastInsertRowid ?? 0),
  };
}

async function executeWorkspacePipeline(db, body) {
  if (body === null || typeof body !== 'object' || !Array.isArray(body.requests)) {
    throw new Error('Invalid pipeline request.');
  }
  const results = [];
  for (const request of body.requests.slice(0, 20)) {
    if (request?.type === 'execute') {
      try {
        results.push({
          type: 'ok',
          response: { type: 'execute', result: executeWorkspaceStatement(db, request.stmt) },
        });
      } catch (error) {
        results.push({
          type: 'error',
          error: { message: error instanceof Error ? error.message : String(error), code: 'SQL_ERROR' },
        });
      }
    } else if (request?.type === 'close') {
      results.push({ type: 'ok', response: { type: 'close' } });
    } else {
      results.push({
        type: 'error',
        error: { message: 'Unsupported pipeline request.', code: 'UNSUPPORTED_REQUEST' },
      });
    }
  }
  return { baton: null, base_url: null, results };
}

function previewBootstrap(appId) {
  return `<script>window.tiana={appId:${JSON.stringify(appId)},auth:{getAccessToken:async()=>"local-preview"},connection:async()=>({origin:location.origin,sql_api:"hrana-v3"}),files:new Proxy({},{get:()=>async()=>{throw new Error("Files are not available in the local preview.")}}),functions:new Proxy({},{get:()=>async()=>{throw new Error("Functions are not available in the local preview.")}})};</script>`;
}

function injectPreviewBootstrap(html, appId) {
  if (html.includes('window.tiana')) return html;
  const tag = previewBootstrap(appId);
  const firstScript = html.search(/<script\b/i);
  const headEnd = html.search(/<\/head>/i);
  if (firstScript !== -1 && (headEnd === -1 || firstScript < headEnd)) {
    return `${html.slice(0, firstScript)}${tag}${html.slice(firstScript)}`;
  }
  if (headEnd !== -1) {
    return `${html.slice(0, headEnd)}${tag}${html.slice(headEnd)}`;
  }
  return `${tag}${html}`;
}

function workspaceContentType(file) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

async function readRequestBody(req, limit = WORKSPACE_PREVIEW_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function closeWorkspaceServer(workspace) {
  const servers = workspace.servers ?? [];
  workspace.servers = [];
  workspace.previewPort = null;
  workspace.previewToken = null;
  workspace.indexHtml = null;
  for (const server of servers) {
    try {
      server.close();
    } catch {
      // Already closed.
    }
  }
}

function closeWorkspaceDatabase(workspace) {
  try {
    workspace.db?.close();
  } catch {
    // Already closed.
  }
  workspace.db = null;
}

async function startWorkspacePreview(workspace) {
  closeWorkspaceServer(workspace);
  if (workspace.outDir === null || workspace.outDir === undefined) {
    throw new Error('The template build output is missing.');
  }
  const indexPath = join(workspace.outDir, 'index.html');
  const rawIndex = await readFile(indexPath, 'utf8');
  const html = injectPreviewBootstrap(rawIndex, workspace.appId);
  const token = randomBytes(18).toString('hex');
  const makeServer = () => createServer((req, res) => {
    void handleWorkspacePreviewRequest(req, res, {
      html,
      token,
      distDir: workspace.outDir,
      db: workspace.db,
      appId: workspace.appId,
    }).catch(() => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Local preview failed.');
      }
    });
  });
  const { servers, port } = await listenOnReservedAddresses(makeServer);
  workspace.servers = servers;
  workspace.previewPort = port;
  workspace.previewToken = token;
  workspace.indexHtml = html;
}

async function handleWorkspacePreviewRequest(req, res, context) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const cookie = req.headers.cookie ?? '';
  const supplied = url.searchParams.get('token');
  const authorized = supplied === context.token || cookie.split(';').some((part) => part.trim() === `tiana_preview=${context.token}`);
  if (!authorized) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (supplied === context.token) {
    res.setHeader('set-cookie', `tiana_preview=${context.token}; Path=/; HttpOnly; SameSite=Lax`);
  }
  const securityHeaders = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  };
  if (req.method === 'POST' && url.pathname === '/v3/pipeline') {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body);
      const payload = await executeWorkspacePipeline(context.db, parsed);
      res.writeHead(200, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    } catch (error) {
      res.writeHead(200, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        baton: null,
        base_url: null,
        results: [{
          type: 'error',
          error: { message: error instanceof Error ? error.message : String(error), code: 'PIPELINE_ERROR' },
        }],
      }));
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { ...securityHeaders, 'content-type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : context.html);
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  const root = resolve(context.distDir);
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { ...securityHeaders, 'content-type': workspaceContentType(file) });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function prepareWorkspace(workspace, locale, { sandboxOff = false } = {}) {
  if (typeof locale === 'string' && locale.length > 0) workspace.locale = guidedLocale(locale);
  if (workspace.building) return;
  workspace.sandboxOff = sandboxOff === true;
  workspace.building = true;
  workspace.status = 'preparing';
  workspace.phase = 'installing';
  workspace.error = null;
  workspace.warning = null;
  workspace.sandbox = null;
  workspace.readyAt = null;
  closeWorkspaceServer(workspace);
  closeWorkspaceDatabase(workspace);
  await persistWorkspaces();
  try {
    await installWorkspaceDependencies(workspace);
    workspace.phase = 'building';
    await persistWorkspaces();
    await buildWorkspace(workspace);
    workspace.phase = 'database';
    await persistWorkspaces();
    await initWorkspaceDatabase(workspace);
    workspace.phase = 'starting';
    await persistWorkspaces();
    await startWorkspacePreview(workspace);
    workspace.status = 'ready';
    workspace.phase = 'ready';
    workspace.readyAt = new Date().toISOString();
  } catch (error) {
    workspace.status = 'failed';
    workspace.phase = 'failed';
    workspace.error = error instanceof Error ? error.message : String(error);
    closeWorkspaceServer(workspace);
    closeWorkspaceDatabase(workspace);
  } finally {
    workspace.building = false;
    await persistWorkspaces();
  }
}

export async function createLocalWorkspace(name, directory, { signal, resolveWorkspaceRegistry, resolveSessionController, allowDuplicate = false, locale, sandboxOff = false } = {}) {
  await loadWorkspaces();
  if (allowDuplicate !== true) {
    const existing = [...WORKSPACES.values()]
      .filter((workspace) => workspace.template === name)
      .map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
        directory: workspace.directory,
        template: workspace.template,
        status: workspace.status,
        dshWorkspace: workspace.dshWorkspace,
        dshSession: workspace.dshSession,
      }));
    if (existing.length > 0) {
      return {
        ok: false,
        duplicate: true,
        existing,
        directory: null,
        workspace: null,
        dshWorkspace: null,
        dshSession: null,
        error: {
          code: 'LOCAL_ALREADY_INSTALLED',
          message: 'This template is already installed locally.',
        },
      };
    }
  }
  const cloned = await cloneTemplate(name, directory, { signal });
  if (!cloned.ok) {
    return { ...cloned, workspace: null, dshWorkspace: null };
  }
  const actualDirectory = cloned.directory;
  const metadata = await readTemplateMetadata(actualDirectory);
  const title = typeof metadata.display_name === 'string' && metadata.display_name.trim().length > 0
    ? metadata.display_name.trim()
    : name;
  const id = randomUUID();
  const dshWorkspace = await createDshWorkspace(resolveWorkspaceRegistry, actualDirectory, title);
  let dshSession = dshWorkspace.ok === true
    ? await createDshSession(resolveSessionController, dshWorkspace, locale)
    : {
        ok: false,
        sessionId: null,
        title: guidedSessionCopy(locale).title,
        locale: guidedLocale(locale),
        error: {
          code: 'DSH_SESSION_WORKSPACE_REQUIRED',
          message: 'A Harness workspace is required before a guided session can be created.',
        },
      };
  if (dshSession.ok === true) {
    dshSession = await markGuidedSessionReady(resolveSessionController, dshSession);
  }
  const workspace = {
    id,
    title,
    directory: actualDirectory,
    template: name,
    appId: `local-${id}`,
    createdAt: new Date().toISOString(),
    dshWorkspace,
    dshSession,
    status: 'preparing',
    phase: 'installing',
    error: null,
    warning: null,
    sandbox: null,
    building: false,
    previewPort: null,
    previewToken: null,
    servers: [],
    db: null,
    outDir: null,
    indexHtml: null,
    readyAt: null,
  };
  WORKSPACES.set(id, workspace);
  await persistWorkspaces();
  void prepareWorkspace(workspace, locale, { sandboxOff });
  return {
    ok: true,
    workspace: publicWorkspace(workspace),
    dshWorkspace,
    dshSession,
    directory: actualDirectory,
    error: null,
  };
}

async function workspaceStatus(id, req) {
  await loadWorkspaces();
  const workspace = WORKSPACES.get(id);
  if (workspace === undefined) {
    return {
      ok: false,
      workspace: null,
      error: { code: 'WORKSPACE_NOT_FOUND', message: 'Local workspace was not found.' },
    };
  }
  return { ok: true, workspace: publicWorkspace(workspace, req), error: null };
}

async function repairGuidedSessions(resolveSessionController) {
  await loadWorkspaces();
  const pending = [...WORKSPACES.values()].filter(
    (workspace) => workspace.dshSession?.ok === true
      && workspace.dshSession.ready !== true
      && workspace.dshSession.prompted !== true,
  );
  if (pending.length === 0) return;
  const controller = typeof resolveSessionController === 'function' ? resolveSessionController() : undefined;
  if (controller === undefined || controller === null || typeof controller.resolveAgent !== 'function') return;
  for (const workspace of pending) {
    const next = await markGuidedSessionReady(resolveSessionController, workspace.dshSession);
    workspace.dshSession = next;
    if (next.ready === true) await persistWorkspaces();
  }
}

async function seedExistingGuidedSessions(resolveSessionController) {
  await loadWorkspaces();
  const pending = [...WORKSPACES.values()].filter(
    (workspace) => workspace.dshSession?.ok === true
      && workspace.dshSession.ready === true
      && workspace.dshSession.emptyTurn === true
      && workspace.dshSession.seeded !== true,
  );
  if (pending.length === 0) return;
  const controller = typeof resolveSessionController === 'function' ? resolveSessionController() : undefined;
  if (controller === undefined || controller === null || typeof controller.resolveAgent !== 'function') return;
  for (const workspace of pending) {
    try {
      const resolved = await controller.resolveAgent(workspace.dshSession.sessionId);
      if (resolved === null || resolved === undefined || resolved.error) throw new Error(resolved?.error?.message ?? 'Session unavailable');
      const session = resolved.agent?.session;
      if (session === undefined || session === null || typeof session.append !== 'function') {
        throw new Error('Session is not writable.');
      }
      await appendGuidedWelcome(session, 2, workspace.dshSession.locale);
      workspace.dshSession = {
        ...workspace.dshSession,
        emptyTurn: false,
        seeded: true,
        readyError: null,
      };
      await persistWorkspaces();
    } catch (error) {
      try {
        await writeFile(
          join(dshHome(), 'tiana-plugin', 'seed-error.json'),
          `${JSON.stringify({
            at: new Date().toISOString(),
            workspace: workspace.title,
            sessionId: workspace.dshSession.sessionId,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }, null, 2)}\n`,
          { mode: 0o600 },
        );
      } catch {
        // Diagnostics must not prevent a later retry.
      }
    }
  }
}

async function workspaceForSession(sessionId, req, resolveSessionController, signal) {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 160) {
    return {
      ok: false,
      workspace: null,
      error: { code: 'INVALID_SESSION_ID', message: 'Invalid Session id.' },
    };
  }
  await loadWorkspaces();
  let workspace = [...WORKSPACES.values()].find(
    (candidate) => candidate.dshSession?.ok === true && candidate.dshSession.sessionId === sessionId,
  );
  if (workspace === undefined) {
    try {
      const controller = typeof resolveSessionController === 'function' ? resolveSessionController() : undefined;
      if (controller !== undefined && typeof controller.list === 'function') {
        const timeout = AbortSignal.timeout(10_000);
        const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
        const value = await controller.list({}, combined);
        const item = Array.isArray(value?.items)
          ? value.items.find((entry) => String(entry?.id) === sessionId)
          : undefined;
        if (typeof item?.cwd === 'string' && item.cwd.length > 0) {
          const target = resolve(item.cwd);
          workspace = [...WORKSPACES.values()].find(
            (candidate) => resolve(candidate.directory) === target,
          );
        }
      }
    } catch {
      // The guided-session lookup above is sufficient for the normal case.
    }
  }
  return {
    ok: true,
    workspace: workspace === undefined ? null : publicWorkspace(workspace, req),
    error: null,
  };
}

async function restartWorkspace(id, locale, { sandboxOff = false } = {}) {
  await loadWorkspaces();
  const workspace = WORKSPACES.get(id);
  if (workspace === undefined) {
    return {
      ok: false,
      workspace: null,
      error: { code: 'WORKSPACE_NOT_FOUND', message: 'Local workspace was not found.' },
    };
  }
  if (workspace.building) {
    return {
      ok: false,
      workspace: publicWorkspace(workspace),
      error: { code: 'WORKSPACE_BUSY', message: 'The local preview is already being prepared.' },
    };
  }
  void prepareWorkspace(workspace, locale, { sandboxOff });
  return { ok: true, workspace: publicWorkspace(workspace), error: null };
}

function closeAllWorkspacePreviews() {
  for (const workspace of WORKSPACES.values()) {
    closeWorkspaceServer(workspace);
    closeWorkspaceDatabase(workspace);
  }
}

function createCoverHandler() {
  return async (req, res) => {
    try {
      if (!allowSubresourceRequest(req, res, 'cover')) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, {
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' },
        }, { allow: 'GET, HEAD' });
        return;
      }

      const parsed = new URL(req.url ?? '/', 'http://localhost');
      const name = parsed.searchParams.get('name') ?? '';
      const version = parsed.searchParams.get('v') ?? '';
      if (!validTemplateName(name)) {
        sendJson(res, 400, {
          ok: false,
          error: { code: 'INVALID_TEMPLATE_NAME', message: 'Invalid template name.' },
        });
        return;
      }

      req.resume();
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClose);
      try {
        const cover = await fetchTemplateCover(
          name,
          /^\d{1,9}$/.test(version) ? version : '',
          { signal: controller.signal },
        );
        if (res.writableEnded) return;
        res.writeHead(200, {
          'content-type': cover.contentType,
          'content-length': String(cover.buffer.length),
          'cache-control': 'private, max-age=86400',
          'x-content-type-options': 'nosniff',
          'cross-origin-resource-policy': 'same-origin',
        });
        res.end(req.method === 'HEAD' ? undefined : cover.buffer);
      } finally {
        res.off('close', onClose);
      }
    } catch (error) {
      if (error?.name === 'AbortError' || res.writableEnded) return;
      sendJson(res, 502, {
        ok: false,
        error: {
          code: 'TEMPLATE_COVER_UNAVAILABLE',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}

function isSameAuthorityOrigin(origin, host) {
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false;
    const hostUrl = new URL(`${originUrl.protocol}//${host}`);
    return originUrl.host === hostUrl.host;
  } catch {
    return false;
  }
}

function allowSubresourceRequest(req, res, label) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    sendJson(res, 403, {
      ok: false,
      error: { code: 'FORBIDDEN', message: `Cross-site ${label} requests are not allowed.` },
    });
    return false;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0 && typeof req.headers.host === 'string') {
    if (!isSameAuthorityOrigin(origin, req.headers.host)) {
      sendJson(res, 403, {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Origin does not match the Harness page.' },
      });
      return false;
    }
  }

  return true;
}

/**
 * Fetch one public template preview. The upstream response is already a
 * sandboxed, self-contained HTML document; the Host re-serves it with a fixed
 * sandbox CSP so it cannot read DSH state even when opened top-level.
 * @param {string} name - published template name.
 * @param {string} version - optional cache-busting version.
 * @param {object} [options] - execution options.
 * @returns {Promise<{html: string, origin: string}>} preview HTML.
 */
async function fetchPublicTemplatePreview(name, version, { signal } = {}) {
  const origin = marketplaceOrigin();
  const suffix = version === '' ? '' : `?v=${encodeURIComponent(version)}`;
  const url = `${origin}/api/v1/template-marketplace/${encodeURIComponent(name)}/preview${suffix}`;
  const timeout = AbortSignal.timeout(COVER_TIMEOUT_MS);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const response = await fetch(url, {
    headers: { accept: 'text/html' },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`Tiana template preview returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    throw new Error('Tiana template preview did not return HTML.');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_PREVIEW_BYTES) {
    throw new Error('Tiana template preview has an unsupported size.');
  }
  return { html: buffer.toString('utf8'), origin };
}

function createPreviewHandler() {
  return async (req, res) => {
    try {
      if (!allowSubresourceRequest(req, res, 'preview')) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, {
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' },
        }, { allow: 'GET, HEAD' });
        return;
      }

      const parsed = new URL(req.url ?? '/', 'http://localhost');
      const name = parsed.searchParams.get('name') ?? '';
      const version = parsed.searchParams.get('v') ?? '';
      if (!validTemplateName(name)) {
        sendPreviewError(res, 400, 'Invalid template name.');
        return;
      }

      req.resume();
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClose);
      try {
        const preview = await fetchPublicTemplatePreview(
          name,
          /^\d{1,9}$/.test(version) ? version : '',
          { signal: controller.signal },
        );
        if (res.writableEnded) return;
        const bytes = Buffer.from(preview.html, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(bytes.length),
          'content-security-policy': PREVIEW_CSP,
          'cache-control': 'private, max-age=86400',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
          'cross-origin-resource-policy': 'same-origin',
        });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } finally {
        res.off('close', onClose);
      }
    } catch (error) {
      if (error?.name === 'AbortError' || res.writableEnded) return;
      sendPreviewError(res, 502, 'Template preview is unavailable.');
    }
  };
}

function sendPreviewError(res, status, message) {
  if (res.writableEnded) return;
  const safe = String(message)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const body = `<!doctype html><meta charset="utf-8"><title>Template preview</title><body style="margin:0;padding:24px;font:14px system-ui,sans-serif;color:#555">${safe}</body>`;
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': PREVIEW_CSP,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function validTemplateName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(name);
}

/**
 * Register the panel's same-origin JSON API routes.
 * @param {object} webServer - `ctx.webServer` service.
 * @returns {() => void} disposer removing every route.
 */
export function registerTianaRoutes(webServer, options = {}) {
  const disposers = [];
  resolveSandbox = typeof options.resolveSandbox === 'function' ? options.resolveSandbox : () => undefined;
  const add = (method, path, handler) => {
    disposers.push(webServer.register({
      kind: 'exact',
      path,
      handler: createHandler(method, handler),
    }));
  };

  add('GET', '/tiana/api/status', async ({ signal }) => {
    const status = await authStatus({ signal });
    return { ok: true, loggedIn: status.loggedIn, error: status.error };
  });

  add('POST', '/tiana/api/login/start', async ({ signal }) => {
    const result = await loginStart({ signal });
    return { ok: true, ...result };
  });

  add('POST', '/tiana/api/login/resume', async ({ signal }) => {
    const result = await loginResume({ signal });
    return { ok: true, ...result };
  });

  add('GET', '/tiana/api/spaces', async ({ signal }) => {
    const result = await listSpaces({ signal });
    const quota = await creationQuota();
    return {
      ok: result.ok,
      items: result.items,
      currentTenantId: result.currentTenantId,
      canCreateSpace: quota.ok === true && quota.canCreate === true,
      creation: quota.ok ? { limit: quota.limit, used: quota.used, remaining: quota.remaining } : null,
      error: result.error,
    };
  });

  add('POST', '/tiana/api/spaces/switch', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    return switchSpace(id, { signal });
  });

  add('POST', '/tiana/api/logout', async ({ signal }) => {
    const result = await logout({ signal });
    return { ok: result.ok, error: result.error };
  });

  add('GET', '/tiana/api/sites', async ({ signal }) => {
    const result = await listSites({ signal });
    return { ok: true, items: result.items, error: result.error };
  });

  add('GET', '/tiana/api/templates', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const after = url.searchParams.get('after') ?? '';
    const category = url.searchParams.get('category') ?? '';
    const q = (url.searchParams.get('q') ?? '').trim();
    if (after.length > 512) {
      return {
        ok: false,
        items: [],
        categories: [],
        nextCursor: null,
        error: { code: 'INVALID_CURSOR', message: 'Template cursor is too long.' },
      };
    }
    if (category !== '' && !/^\d{1,20}$/.test(category)) {
      return {
        ok: false,
        items: [],
        categories: [],
        nextCursor: null,
        error: { code: 'INVALID_CATEGORY', message: 'Template category is invalid.' },
      };
    }
    if (q.length > 200) {
      return {
        ok: false,
        items: [],
        categories: [],
        nextCursor: null,
        error: { code: 'INVALID_SEARCH', message: 'Template search is too long.' },
      };
    }
    const result = await listPublicTemplates({
      after,
      category,
      q,
      includeCategories: after === '',
      signal,
    });
    return {
      ok: true,
      items: result.items,
      categories: result.categories,
      nextCursor: result.nextCursor,
      origin: result.origin,
      error: result.error,
    };
  });

  add('POST', '/tiana/api/templates/clone', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = url.searchParams.get('name') ?? '';
    const directory = url.searchParams.get('dir') ?? '';
    const locale = url.searchParams.get('lang') ?? req.headers['x-tiana-locale'] ?? req.headers['accept-language'] ?? '';
    const sandboxOff = url.searchParams.get('sandbox') === 'off';
    const result = await createLocalWorkspace(name, directory, {
      signal,
      allowDuplicate: url.searchParams.get('allow') === '1',
      locale,
      sandboxOff,
      resolveWorkspaceRegistry: options.resolveWorkspaceRegistry,
      resolveSessionController: options.resolveSessionController,
    });
    return result;
  });

  add('GET', '/tiana/api/workspaces', async ({ req }) => {
    await loadWorkspaces();
    const sandbox = await sandboxCapability();
    const items = [...WORKSPACES.values()]
      .slice()
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .map((workspace) => publicWorkspace(workspace, req));
    return { ok: true, items, sandbox, error: null };
  });

  add('GET', '/tiana/api/workspaces/status', async ({ req }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    return workspaceStatus(id, req);
  });

  add('GET', '/tiana/api/workspaces/for-session', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    return workspaceForSession(id, req, options.resolveSessionController, signal);
  });
  add('POST', '/tiana/api/workspaces/prepare', async ({ req }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    const locale = url.searchParams.get('lang') ?? req.headers['x-tiana-locale'] ?? req.headers['accept-language'] ?? '';
    const sandboxOff = url.searchParams.get('sandbox') === 'off';
    return restartWorkspace(id, locale, { sandboxOff });
  });

  add('POST', '/tiana/api/sites/delete', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    const result = await deleteSite(id, { signal });
    return { ok: result.ok, data: result.data, error: result.error };
  });

  add('GET', '/tiana/api/template-detail', async ({ req, signal }) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = url.searchParams.get('name') ?? '';
    if (!validTemplateName(name)) {
      return {
        ok: false,
        item: null,
        error: { code: 'INVALID_TEMPLATE_NAME', message: 'Invalid template name.' },
      };
    }
    const result = await getPublicTemplateDetail(name, { signal });
    return { ok: true, item: result.item, error: result.error };
  });

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/tiana/api/template-cover',
    handler: createCoverHandler(),
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/tiana/api/template-preview',
    handler: createPreviewHandler(),
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/tiana/api/site-icon',
    handler: createSiteIconHandler(),
  }));

  void repairGuidedSessions(options.resolveSessionController).catch(() => undefined);
  void seedExistingGuidedSessions(options.resolveSessionController).catch(() => undefined);

  return () => {
    closeAllWorkspacePreviews();
    resolveSandbox = () => undefined;
    for (const dispose of disposers.reverse()) dispose();
  };
}

function createHandler(method, handler) {
  return async (req, res) => {
    try {
      if (!allowRequest(req, res)) return;
      if (req.method !== method) {
        sendJson(res, 405, {
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${method}.` },
        }, { allow: method });
        return;
      }

      req.resume();
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClose);

      try {
        const payload = await handler({ req, signal: controller.signal });
        if (!res.writableEnded) sendJson(res, 200, payload);
      } finally {
        res.off('close', onClose);
      }
    } catch (error) {
      if (error?.code === 'ABORTED' || res.writableEnded) return;
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'TIANA_PLUGIN_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}

function allowRequest(req, res) {
  if (req.headers['x-tiana-plugin'] !== '1') {
    sendJson(res, 403, {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Missing Tiana plugin request header.' },
    });
    return false;
  }

  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    sendJson(res, 403, {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Cross-site Tiana API requests are not allowed.' },
    });
    return false;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0 && typeof req.headers.host === 'string') {
    if (!isSameAuthorityOrigin(origin, req.headers.host)) {
      sendJson(res, 403, {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Origin does not match the Harness page.' },
      });
      return false;
    }
  }

  return true;
}

function sendJson(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(text);
}

function normalizeLogin(result) {
  const data = result.data ?? {};
  return {
    status: typeof result.status === 'string'
      ? result.status
      : result.exitCode === 0 ? 'succeeded' : 'failed',
    pending: data.pending_auth === true || result.status === 'pending',
    loggedIn: data.logged_in === true,
    verificationUri: typeof data.verification_uri === 'string' ? withAcquisitionSource(data.verification_uri) : null,
    expiresAt: data.expires_at ?? null,
    retryAfter: typeof data.retry_after === 'number' ? data.retry_after : 2,
    error: normalizeError(result.error) ?? null,
    exitCode: result.exitCode,
  };
}

function normalizeError(error) {
  if (error === null || error === undefined) return null;
  if (typeof error === 'string') {
    return { code: 'ERROR', message: error, nextAction: '' };
  }
  if (typeof error !== 'object') {
    return { code: 'ERROR', message: String(error), nextAction: '' };
  }
  return {
    code: typeof error.code === 'string' ? error.code : 'ERROR',
    message: typeof error.message === 'string' ? error.message : 'Unknown Tiana error.',
    nextAction: typeof error.next_action === 'string'
      ? error.next_action
      : typeof error.nextAction === 'string' ? error.nextAction : '',
  };
}

function parseJson(text) {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_JSON_CHARS) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to the single-object recovery below.
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
