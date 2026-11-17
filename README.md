# Tiana for DSH

简体中文 | [English](README.en.md)

把你在 DeepSeek Harness（DSH）里做好的网页应用，发布到 TianaCloud，获得一个可以直接打开的网址。也可以从丰富的应用模板开始，用对话改成自己的应用，再发布上线。

## 让本地应用上线

已经做好的个人网站、工具或 Web 应用，都可以交给 DSH 帮你部署到 TianaCloud。你负责描述需求、开发应用，Tiana 负责云端托管，不必自己购买和维护服务器。

无论是网页、数据库还是后端 API，都可以低成本部署到 TianaCloud。

TianaCloud 提供 **100 个实例的永久免费额度**，可用于网页应用、后端服务、数据库等资源。存储、算力等用量额度可在控制台查看。

## 从模板开始，改成自己的应用

在插件中浏览和预览应用模板，选择喜欢的模板 **克隆到本地**，打开项目对话，告诉 DSH 你想修改什么。开发时可以启动本地预览，满意后再发布到 TianaCloud。

发布后的应用可以在 **我的站点** 中访问和管理，也可以切换空间查看不同项目。

## 安装与使用

需要 DSH 0.2.2-rc.1+ 和 Node.js 22.13+。

在 DSH 插件管理器中安装 `@tianacloud/dsh-tiana`，或运行：

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

如果使用其他 DSH profile，请将 `web` 替换为对应名称。安装后，从侧栏打开 **Tiana** 并登录。

打开你的项目，在对话中告诉 DSH：

> 帮我把这个网页应用部署到 TianaCloud，并给我访问网址。

也可以从 Tiana 侧栏选择模板，开始一个新项目。

[官网](https://tianacloud.com) · [Apache-2.0](LICENSE)
