# @tianacloud/dsh-tiana

简体中文 | [English](README.en.md)

DeepSeek Harness（DSH）的 Tiana 插件包。

## 功能概览

- **工具链自动引导**：首次激活时自动检测并安装/升级 `@tianacloud/cli`（最低要求 `1.0.17`），并通过官方 `@tianacloud/agent-skills` 将五个 Tiana Skill（`tiana`、`tiana-function`、`tiana-git`、`tiana-sqlite`、`tiana-web`）安装到 **DSH 专用目录** `$DSH_HOME/skills`，不会写入 `~/.agents/skills`。
- **模板市场**：无需登录即可按分类或关键词浏览公开 Tiana 网页应用模板、查看沙箱预览、复制提示词，或将模板源码克隆到 `~/TianaTemplates/<模板名>` 并自动创建 DSH 工作区与本地 SQLite mock 预览。
- **沙箱构建开关**：本地克隆与构建面板内置「沙箱构建」开关，默认在支持沙箱的主机上开启；若当前主机不支持沙箱，该开关将保持未开启且不可勾选。
- **站点与本地项目管理**：通过 Tiana CLI 浏览器授权登录，查看与管理个人站点（直接访问、跳转控制台管理、删除站点并保留关联 SQLite/Git 资源），以及查看并重启本地克隆项目的预览服务。

## 前置条件

- **Node.js**：`>=22.13.0`（本地模板预览依赖内置 `node:sqlite`）
- **DeepSeek Harness**：`>=0.2.2-rc.1`
- 首次引导及模板市场访问需要连通 npm registry 与 `https://console.tianacloud.com`（或 `TIANA_API_ORIGIN` 指定的地址）。

## 安装方式

### 通过 DSH 界面 / `plugin_manager`

直接安装 bundle 目标：

```text
@tianacloud/dsh-tiana
```

### 通过 DSH CLI

将 `<profile>` 替换为你的 profile 名称（例如 `web`）：

```sh
dsh plugin --profile <profile> add @tianacloud/dsh-tiana
```

安装并激活后，Host 插件会自动执行幂等 bootstrap，并将诊断状态写入 `$DSH_HOME/tiana-plugin/install-state.json`。如需手动排查或重试，可在插件包目录执行：

```sh
node scripts/bootstrap.mjs
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TIANA_API_ORIGIN` | `https://console.tianacloud.com` | 覆盖 Tiana API 与控制台地址；仅接受不含路径、凭据、查询参数和片段的 `http:`/`https:` origin。 |
| `DSH_HOME` | `~/.dsh` | DSH 主目录，用于存放 `$DSH_HOME/skills` 与 `$DSH_HOME/tiana-plugin`。 |
| `TIANA_LOCAL_BUILD_SANDBOX` | （未设置） | 设为 `off` 时，主机将禁用本地模板构建的 DSH 沙箱支持。 |

## 副作用与卸载说明

- 插件首次激活会在用户级环境全局安装 `tiana` CLI（优先使用用户可写的 `pnpm` 全局目录，回退到 `npm`），并将五个官方 Skill 安装至 `$DSH_HOME/skills`。
- 插件不会覆盖已存在的同名 Skill，也不会写入 `~/.agents/skills` 或项目级 `.dsh/skills`、`.agents/skills`。
- **卸载 `@tianacloud/dsh-tiana` 不会自动删除**已全局安装的 `tiana` CLI、`$DSH_HOME/skills`、`~/TianaTemplates/` 中的本地克隆项目，以及 `$DSH_HOME/tiana-plugin/` 下的状态与预览数据；DSH 目前没有插件卸载钩子，也没有卸载选项界面，如不再需要，请手动清理。

## 安全与隐私边界

- `/tiana/api/*` 路由位于 DSH Web Server 边界内；能访问该服务即视为可信，不做二次鉴权，仅校验同源，JSON 接口另需 `x-tiana-plugin: 1` 请求头。
- 浏览器端不接触 CLI 凭据或 refresh token；Host 仅在内存中读取 CLI access token 用于只读空间配额与站点图标代理。
- 公开模板预览使用 `sandbox="allow-scripts"` 的隔离 iframe。
- 本地模板预览运行在带 token/cookie 保护的独立端口上，使用本地 SQLite mock 数据，不连接云端数据库或运行后端函数。该端口监听回环地址，以及各网卡上的私有地址、CGNAT（如 Tailscale）和 IPv6 唯一本地地址，因此 DSH Web Server 能到达的地方也能打开预览；公网地址、链路本地地址和容器网桥（`docker0`、`br-*`、`veth*` 等）不会监听。
- 本地模板构建（`vite build` 或模板自带构建脚本）在开启「沙箱构建」时运行于 DSH 沙箱（`ctx.sandbox`）的 `workspace-write` 模式下：写入仅限模板目录、插件临时目录和预览产物目录。**沙箱不限制读取与网络访问**，恶意模板构建仍可能读取文件或外发数据；依赖安装（`npm ci --ignore-scripts`）不在沙箱内。若本机不支持沙箱或手动关闭「沙箱构建」开关，构建将无约束运行，界面会给出明确提示。请只克隆可信模板。

## 开源许可

Apache-2.0，详见 [LICENSE](LICENSE)。
