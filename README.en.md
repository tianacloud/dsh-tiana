# Tiana for DSH

[简体中文](README.md) | English

Publish the web apps you build in DeepSeek Harness (DSH) to Tiana Cloud and get a URL you can open in a browser. Or start from an app template, customize it through conversation, and publish it when it is ready.

## Take your local app online

Ask DSH to deploy your personal website, tool, or web app to Tiana Cloud. You build the app; Tiana hosts it, without requiring you to buy and maintain a server.

Need a backend? Deploy **serverless APIs** for data processing and business logic, so you can run both your frontend and backend at low cost.

Tiana Cloud offers a **permanent free allowance of 100 instances**, shared across web apps, backend services, databases, and other resources. Check the console for storage, compute, and other usage allowances.

## Start from a template and make it yours

Browse and preview app templates in the plugin, clone one locally, and open a project conversation to tell DSH what you want to change. Preview your work locally, then publish it to Tiana Cloud when it is ready.

Use **My Sites** to open and manage your published apps, or switch spaces to view other projects.

## Install and get started

Requires DSH 0.2.2-rc.1+ and Node.js 22.13+.

Install `@tianacloud/dsh-tiana` in the DSH plugin manager, or run:

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

If you use a different DSH profile, replace `web` with its name. Once installed, open **Tiana** from the sidebar and sign in.

Open your project and ask DSH:

> Deploy this web app to Tiana Cloud and give me its URL.

You can also choose a template from the Tiana sidebar to start a new project.

[Website](https://tianacloud.com) · [Apache-2.0](LICENSE)
