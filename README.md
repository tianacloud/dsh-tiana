# Tiana for DSH

简体中文 | [English](README.en.md)

在 DeepSeek Harness（DSH）中，从 Tiana 应用模板开始，用对话修改应用，边开发边预览，并管理你的线上站点。

## 安装

需要 DSH 0.2.2-rc.1 或更新版本，以及 Node.js 22.13 或更新版本。

在 DSH 插件管理器中安装 `@tianacloud/dsh-tiana`，也可以在终端运行：

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

如果使用的 DSH profile 不是 `web`，请替换为对应名称。安装后，从 DSH 侧栏打开 **Tiana**。

## 使用

### 从模板开始

浏览、搜索和预览 Tiana 应用模板，找到合适的模板后点击 **克隆到本地**，即可获得一个可以继续开发的项目。

### 用对话修改，随时预览

在本地项目中打开对话，告诉 DSH 你想调整的页面或功能。启动本地预览后，可以一边修改一边查看效果。

### 管理线上站点

登录 Tiana，在 **我的站点** 中查看和访问已部署的应用，或进入站点管理页面。拥有多个空间时，可以切换空间查看对应的站点。

## 许可证

[Apache-2.0](LICENSE)
