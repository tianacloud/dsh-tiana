# Tiana for DSH

简体中文 | [English](README.en.md)

在 DeepSeek Harness（DSH）中浏览应用模板、开发本地项目，管理你的 Tiana 站点。

## 能做什么

- **发现模板**：搜索、预览应用模板，一键克隆为本地项目。
- **对话开发**：打开项目对话，用自然语言继续改造应用。
- **本地预览**：启动预览，修改后自动更新，随时停止。
- **管理站点与空间**：登录后查看站点、访问或管理应用，并切换 Tiana 空间。
- **自动准备工具**：安装并激活插件，即可使用 Tiana CLI 和官方 Skills。

## 安装

需要 Node.js 22.13+ 和 DSH 0.2.2-rc.1+。

在 DSH 插件管理器中安装 `@tianacloud/dsh-tiana`，或运行：

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

`web` 是 profile 示例，请按实际使用的名称替换。

## 开始使用

1. 在 DSH 侧栏打开 **Tiana**，浏览模板市场。
2. 选择模板并克隆到本地，打开预览或项目对话，开始定制。
3. 登录 Tiana 后，在 **我的站点** 查看应用、进入管理页面或切换空间。需要授权时会自动打开浏览器，等待期间也可以取消登录。

[Apache-2.0](LICENSE)
