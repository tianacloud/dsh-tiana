# Tiana for DSH

[简体中文](README.md) | English

Browse app templates, develop local projects, and manage your Tiana sites in DeepSeek Harness (DSH).

## Features

- **Discover templates**: Search, preview, and clone apps into local projects.
- **Build through conversation**: Open a project conversation and describe the changes you want.
- **Preview locally**: Start a preview, see changes update automatically, and stop it whenever you like.
- **Manage sites and spaces**: Sign in to view, open, and manage your apps or switch Tiana spaces.
- **Ready-to-use tools**: Activating the plugin prepares the Tiana CLI and official Skills.

## Install

Requires Node.js 22.13+ and DSH 0.2.2-rc.1+.

Install `@tianacloud/dsh-tiana` through the DSH plugin manager, or run:

```sh
dsh plugin --profile web add @tianacloud/dsh-tiana@latest
```

Replace `web` with your actual profile name.

## Get started

1. Open **Tiana** in the DSH sidebar and browse the template marketplace.
2. Clone a template, then open its preview or project conversation to customize it.
3. Sign in and use **My Sites** to view apps, open their management pages, or switch spaces. Browser authorization opens automatically when needed, and pending sign-in can be cancelled.

[Apache-2.0](LICENSE)
