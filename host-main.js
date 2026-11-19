/**
 * Host half of the Tiana bundle.
 *
 * First activation bootstraps the Tiana toolchain:
 * - installs the `tiana` CLI to npm latest, including existing installations;
 * - installs the official Tiana skills into `$DSH_HOME/skills`, the DSH-only
 *   `user-dsh` skill root, not the shared `~/.agents/skills`.
 *
 * The bootstrap refreshes existing official skills and records its last result
 * in `$DSH_HOME/tiana-plugin/install-state.json` for diagnostics.
 *
 * Account/site API routes and the local template preview live in
 * `tiana-api.js`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrap, dshHome } from './install.js';
import { registerTianaRoutes } from './tiana-api.js';

const PACKAGE_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function writeHostDiagnostics(ctx, extra = {}) {
  try {
    const directory = join(dshHome(), 'tiana-plugin');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'host-loaded.json'),
      `${JSON.stringify({
        loadedAt: new Date().toISOString(),
        version: PACKAGE_VERSION,
        webServer: Boolean(ctx.get('webServer')),
        connection: Boolean(ctx.get('connection')),
        workspaceRegistry: Boolean(ctx.get('workspaceRegistry')),
        sessionController: Boolean(ctx.get('sessionController')),
        sandbox: Boolean(ctx.get('sandbox')),
        ...extra,
      }, null, 2)}\n`,
    );
  } catch {
    // Diagnostics only; a read-only home must not block the panel.
  }
}

/**
 * Install or update the Tiana toolchain to latest.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 */
export function apply(ctx) {
  const controller = new AbortController();

  writeHostDiagnostics(ctx);

  const mountRoutes = (connectionCtx, connection) => {
    if (typeof connection?.fetch?.register !== 'function') {
      ctx.logger.info('[tiana] DSH connection.fetch.register is unavailable; panel API routes stay disabled');
      return;
    }
    connectionCtx.effect(() => {
      const dispose = registerTianaRoutes(connection, {
        resolveWorkspaceRegistry: () => connectionCtx.get('workspaceRegistry') ?? ctx.get('workspaceRegistry'),
        resolveSessionController: () => connectionCtx.get('sessionController') ?? ctx.get('sessionController'),
        resolveSandbox: () => connectionCtx.get('sandbox') ?? ctx.get('sandbox'),
      });
      writeHostDiagnostics(connectionCtx, { routesMounted: true });
      return dispose;
    }, 'tiana:http-routes');
  };

  if (typeof ctx.inject === 'function') {
    ctx.inject(['connection'], (connectionCtx) => {
      mountRoutes(connectionCtx, connectionCtx.connection);
    });
  } else {
    mountRoutes(ctx, ctx.get('connection'));
  }

  ctx.effect(() => {
    const log = (message) => ctx.logger.info(`[tiana] ${message}`);
    void bootstrap({ signal: controller.signal, log })
      .then((state) => {
        if (state.status === 'ok') {
          ctx.logger.info(
            `[tiana] bootstrap ready: CLI ${state.cli.version}; skills ${state.skills.installed ? 'installed' : 'present'}`,
          );
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        ctx.logger.error(`[tiana] bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => controller.abort();
  }, 'tiana:bootstrap');
}
