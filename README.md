# Tiana for DSH

简体中文 | [English](README.en.md)

把你在 DeepSeek Harness（DSH）里做好的网页应用发布到 TianaCloud，立刻获得一个可直接打开的公开网址；也可以从丰富的应用模板出发，通过对话改成自己的应用，再一键上线。

## 你可以用它做什么

### 让本地应用上线

已经做好的个人网站、小工具或全栈 Web 应用，都可以直接交给 DSH 部署到 TianaCloud。你只需描述需求、专注开发，云端托管交给 Tiana，无需自行购买和维护服务器。

无论是前端网页、数据库还是后端 API，都可以低成本部署到 TianaCloud。TianaCloud 提供 **100 个实例的永久免费额度**，可用于网页应用、后端服务、数据库等资源；存储、算力等用量额度可在控制台查看。

### 从模板开始，改成自己的应用

在插件中浏览和预览应用模板，挑一个喜欢的模板 **克隆到本地**，打开项目对话告诉 DSH 你想调整什么。开发过程中可以随时启动本地预览，满意后再发布到 TianaCloud。

发布后的应用统一在 **我的站点** 中访问和管理，也可以随时切换空间查看不同项目。

## 安装方式

前置要求：DSH `0.2.2-rc.1+`、Node.js `22.13+`。

以下三种方式任选其一即可：

### 方式一：通过插件市场安装（推荐）

先安装 [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 团队开发的插件市场 [DSH Market](https://github.com/dsh-market/dsh-market)（npm 包名 `dshmarket`）：

1. 在 DSH 菜单栏打开 **插件** → 点击右上角 **添加插件**，填入 `dshmarket` 完成安装（或运行 `dsh plugin --profile web add dshmarket`）。
2. 安装完成后进入插件市场，搜索 **Tiana**，点击安装即可。

### 方式二：通过 DSH 原生插件管理安装

无需命令行，直接在 DSH 界面中安装：

1. 在 DSH 菜单栏中选择 **插件**。
2. 点击右上角的 **添加插件**。
3. 在包名输入框中填入 `@tianacloud/dsh-tiana`（注意保留开头的 `@`），确认安装即可。

### 方式三：通过命令行安装

在终端运行：

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

如果你使用的是其他 DSH profile，请将命令中的 `web` 替换为对应的 profile 名称。

## 快速开始

1. 安装完成后，从 DSH 侧栏打开 **Tiana** 并登录账号。
2. **部署已有项目**：打开你的本地项目，在对话中直接告诉 DSH：

   > 帮我把这个网页应用部署到 TianaCloud，并给我访问网址。

3. **从模板新建项目**：在 Tiana 侧栏浏览模板并克隆到本地，通过对话定制修改、本地预览，满意后发布上线。

---

[官网](https://tianacloud.com) · [Apache-2.0](LICENSE)
