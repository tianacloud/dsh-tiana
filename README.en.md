# Tiana for DSH

[简体中文](README.md) | English

Publish the web apps you build in DeepSeek Harness (DSH) to TianaCloud and get a public URL you can open right away—or start from an app template, customize it through conversation, and publish when it is ready.

## What you can do

### Take your local app online

Ask DSH to deploy your personal website, tool, or full-stack web app to TianaCloud. You focus on describing requirements and building the app; Tiana handles cloud hosting without requiring you to buy or maintain a server.

Whether you are building a web page, a database, or a backend API, you can deploy it to TianaCloud at low cost. TianaCloud offers a **permanent free allowance of 100 instances**, shared across web apps, backend services, databases, and other resources. Check the console for storage, compute, and other usage allowances.

### Start from a template and make it yours

Browse and preview app templates in the plugin, clone one locally, and open a project conversation to tell DSH what you want to change. Preview your work locally as you iterate, then publish it to TianaCloud when it is ready.

Use **My Sites** to open and manage your published apps, or switch spaces to view other projects.

## Installation

Requires DSH `0.2.2-rc.1+` and Node.js `22.13+`.

Choose any of the three methods below:

### Option 1: Install via the plugin marketplace (Recommended)

Install [DSH Market](https://github.com/dsh-market/dsh-market) (npm package `dshmarket`), the visual plugin market built by the [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) team:

1. In DSH, open **Plugins** from the menu bar, click **Add Plugin** in the top-right corner, and enter `dshmarket` (or run `dsh plugin --profile web add dshmarket`).
2. Once the marketplace is installed, open it, search for **Tiana**, and click install.

### Option 2: Install via DSH's built-in plugin manager

No command line required:

1. Select **Plugins** from the DSH menu bar.
2. Click **Add Plugin** in the top-right corner.
3. Enter `@tianacloud/dsh-tiana` (be sure to include the leading `@`) and confirm to install.

### Option 3: Install via the command line

Run in your terminal:

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

If you use a different DSH profile, replace `web` with its name.

## Quick start

1. Once installed, open **Tiana** from the DSH sidebar and sign in.
2. **Deploy an existing project**: Open your project and ask DSH:

   > Deploy this web app to TianaCloud and give me its URL.

3. **Start from a template**: Browse templates from the Tiana sidebar, clone one locally, customize it in chat with local preview, and publish when ready.

---

[Website](https://tianacloud.com) · [Apache-2.0](LICENSE)
