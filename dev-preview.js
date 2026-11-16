/** Runs template Vite code in its own (optionally confined) process. */
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {listenOnReservedAddresses} from './preview-bind.js';
import {sdkShimSource, initWorkspaceDatabase, handleWorkspacePreviewRequest, injectPreviewBootstrap} from './tiana-api.js';

const workspace = JSON.parse(await readFile(process.argv[2], 'utf8'));
const root = workspace.directory;
const cookieName = `tiana_preview_${workspace.appId}`;
const {createServer: createVite, loadConfigFromFile, mergeConfig, transformWithEsbuild} = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
const loaded = await loadConfigFromFile({command: 'serve', mode: 'development'}, undefined, root);
const base = loaded?.config ?? {};
const shim = join(workspace.previewRoot, 'serverless-shim.js');
await writeFile(shim, sdkShimSource());
const indexPath = join(root, 'index.html');
const libEntry = base.build?.lib?.entry;
const entry = typeof libEntry === 'string' ? libEntry : Array.isArray(libEntry) ? libEntry[0] : libEntry && Object.values(libEntry)[0];
const entryUrl = entry ? '/' + relative(root, resolve(root, entry)).split('\\').join('/') : null;
if (!existsSync(indexPath) && !entryUrl) throw new Error('The Vite template has no index.html or library entry.');
const readIndex = () => existsSync(indexPath) ? readFile(indexPath, 'utf8') : Promise.resolve(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src=${JSON.stringify(entryUrl)}></script></body></html>`);
await initWorkspaceDatabase(workspace);
let vite;
const authorized = req => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('token') === workspace.previewToken || (req.headers.cookie ?? '').split(';').some(part => part.trim() === `${cookieName}=${workspace.previewToken}`);
};
const sockets = new Set();
const {servers, port} = await listenOnReservedAddresses(() => {
  const server = createServer((req, res) => {
    void (async () => {
      if (!authorized(req)) {res.writeHead(403); res.end('Forbidden'); return;}
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.searchParams.get('token') === workspace.previewToken) res.setHeader('set-cookie', `${cookieName}=${workspace.previewToken}; Path=/; HttpOnly; SameSite=Lax`);
      res.setHeader('cache-control', 'no-store');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('x-frame-options', 'DENY');
      const host = new URL(`http://${req.headers.host}`).host;
      res.setHeader('content-security-policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://${host} wss://${host}; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`);
      if (url.pathname === '/v3/pipeline') {
        await handleWorkspacePreviewRequest(req, res, {token: workspace.previewToken, db: workspace.db, appId: workspace.appId});
      } else if (!vite) {res.writeHead(503); res.end('Starting preview');}
      else if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await vite.transformIndexHtml('/', injectPreviewBootstrap(await readIndex(), workspace.appId));
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
      } else vite.middlewares(req, res, () => {res.writeHead(404);res.end('Not found');});
    })().catch(error => {if (!res.writableEnded) {res.writeHead(500);res.end(String(error.message));}});
  });
  server.on('connection', socket => {sockets.add(socket);socket.on('close', () => sockets.delete(socket));});
  return server;
});
vite = await createVite(mergeConfig(base, {
  configFile: false, root, mode: 'development', base: '/', appType: 'custom', clearScreen: false,
  define: {'process.env.NODE_ENV': JSON.stringify('development')},
  resolve: {alias: [{find: '@tianacloud/serverless', replacement: shim}]},
  server: {middlewareMode: true, hmr: {server: servers[0], clientPort: port}, fs: {strict: true, allow: [root, workspace.previewRoot]}},
}));
for (const server of servers) {
  // Register authorization before Vite's upgrade listener, including other bind addresses.
  server.prependListener('upgrade', (req, socket) => {if (!authorized(req)) socket.destroy();});
  if (server !== servers[0]) server.on('upgrade', (req, socket, head) => {if (!socket.destroyed) servers[0].emit('upgrade', req, socket, head);});
}
await vite.transformIndexHtml('/', injectPreviewBootstrap(await readIndex(), workspace.appId));
const prepareEntry = async url => {
  const transformed = await vite.transformRequest(url);
  if (transformed?.code) await transformWithEsbuild(transformed.code, url, {loader: 'js'});
};
if (entryUrl) await prepareEntry(entryUrl);
// Pre-transform HTML module entries so a compile failure is reported before ready.
const html = await readIndex();
for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  if (!/^(https?:)?\/\//.test(match[1])) await prepareEntry('/' + match[1].replace(/^\.?\//, ''));
}
process.stdout.write(`TIANA_DEV_READY ${JSON.stringify({port})}\n`);
let closing = false;
const close = async () => {
  if (closing) return; closing = true;
  await vite.close();
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
  workspace.db?.close();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
