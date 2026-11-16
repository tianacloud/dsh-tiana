# @tianacloud/dsh-tiana

[简体中文](README.md) | English

Tiana plugin bundle for DeepSeek Harness (DSH).

## Features

- **Automatic toolchain bootstrap**: On first activation, installs `@tianacloud/cli` (if missing or older than `1.0.17`) and installs the official Tiana agent skills (`tiana`, `tiana-function`, `tiana-git`, `tiana-sqlite`, `tiana-web`) via `@tianacloud/agent-skills` into `$DSH_HOME/skills` without writing to shared `~/.agents/skills`.
- **Template marketplace**: Browse public Tiana web app templates by category or search query without signing in, inspect live sandboxed previews, copy template prompts, or clone templates locally into `~/TianaTemplates/<name>` with an isolated local SQLite preview and a DSH workspace session.
- **Sandbox build toggle**: Includes a unified "Sandbox build" toggle switch for local template builds, enabled by default when supported by the host machine and disabled (unchecked) when the host does not support sandboxing.
- **Sites & local projects**: Sign in via Tiana CLI browser authorization, list and manage deployed Tiana web sites (open, manage in Tiana Console, or delete site while keeping associated SQLite/Git resources), and launch or reopen local template previews.

## Prerequisites

- **Node.js**: `>=22.13.0` (uses built-in `node:sqlite` for local template previews)
- **DeepSeek Harness**: `>=0.2.2-rc.1`
- Network access to npm registry and `https://console.tianacloud.com` (or `TIANA_API_ORIGIN`) for initial bootstrap and template marketplace browsing.

## Installation

### Via DeepSeek Harness UI / `plugin_manager`

Install bundle target:

```text
@tianacloud/dsh-tiana
```

### Via DSH CLI

Replace `<profile>` with your DSH profile name (for example `web`):

```sh
dsh plugin --profile <profile> add @tianacloud/dsh-tiana
```

After installation, the Host plugin runs an idempotent bootstrap and writes diagnostics to `$DSH_HOME/tiana-plugin/install-state.json`. You can also run the bootstrap manually from the installed package directory:

```sh
node scripts/bootstrap.mjs
```

## Configuration

| Environment Variable | Default | Description |
| --- | --- | --- |
| `TIANA_API_ORIGIN` | `https://console.tianacloud.com` | Overrides the Tiana API/console origin. Must be an `http:` or `https:` origin without path, credentials, query, or fragment. |
| `DSH_HOME` | `~/.dsh` | DSH home directory used for `$DSH_HOME/skills` and `$DSH_HOME/tiana-plugin`. |
| `TIANA_LOCAL_BUILD_SANDBOX` | _(unset)_ | Set to `off` to disable DSH sandbox support for local template builds on the host. |

## Side Effects & Uninstall

- Installing and activating this plugin installs `@tianacloud/cli` globally (preferring user-writable `pnpm` global bin, falling back to `npm`) and writes the five official Tiana skills into `$DSH_HOME/skills`.
- Existing skills in `$DSH_HOME/skills`, `~/.agents/skills`, or project-level `.dsh/skills` / `.agents/skills` are never overwritten or deleted by the plugin.
- **Uninstalling `@tianacloud/dsh-tiana` does NOT automatically remove** the globally installed `tiana` CLI, `$DSH_HOME/skills`, cloned directories under `~/TianaTemplates/`, or `$DSH_HOME/tiana-plugin/` state. DSH has no uninstall hook or options UI for plugins, so remove those manually if no longer needed.

## Security & Privacy Notes

- Panel routes under `/tiana/api/*` sit behind the DSH Web Server boundary. Being able to reach that server is the trust boundary: there is no second authentication, only a same-origin check plus the `x-tiana-plugin: 1` header on JSON endpoints.
- CLI credentials and refresh tokens are never sent to the browser. Host reads only the CLI access token in memory for read-only space quota and site icon endpoints.
- Public template previews are rendered in an isolated `sandbox="allow-scripts"` iframe.
- Local template previews run on an independent HTTP port with token/cookie protection and local SQLite mock data. The port listens on loopback plus the private, CGNAT (for example Tailscale) and unique-local IPv6 addresses of the machine's network interfaces, so it is reachable wherever the DSH Web Server is. Public addresses, link-local addresses and container bridges (`docker0`, `br-*`, `veth*`, ...) are skipped.
- Local template builds (`vite build` or the template build script) run under the DSH sandbox (`ctx.sandbox`) in `workspace-write` mode when the "Sandbox build" switch is enabled: writes are confined to the template directory, the plugin's temp directory and the preview output. **The sandbox does not restrict reads or network access**, so a hostile template build could still read files or send data out. Dependency installation (`npm ci --ignore-scripts`) is not sandboxed. If the host does not support sandboxing or the switch is turned off, the build runs unconfined and the UI displays a warning. Only clone templates you trust.

## License

Apache-2.0 — see [LICENSE](LICENSE).
