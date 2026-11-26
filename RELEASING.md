# 手动发布说明（Releasing）

`@tianacloud/dsh-tiana` 采用维护者个人 npm 账号**手动发布**（已停用 GitHub Actions OIDC 自动发布 workflow，CI 验证仍由 [`.github/workflows/ci.yml`](.github/workflows/ci.yml) 负责）。

## 前置条件

- Node.js `>=22.13.0`
- 已在本地使用具备 `@tianacloud/dsh-tiana` 发布权限的 npm 账号登录：
  ```sh
  npm login
  npm whoami
  ```
- 已配置 npm 2FA（手动发布时会提示输入 OTP 或完成 WebAuthn 验证）。
- 处于最新的 `main` 分支且工作区干净（`git status` 无未提交改动）。

## 发布步骤

### 1. 更新版本号

使用 `npm version` 更新 `package.json` 和 `package-lock.json`（先不自动打 tag）：

```sh
npm version patch --no-git-tag-version   # 或 minor / major / 指定版本号如 0.11.5
```

提交版本变更并通过 PR 合入 `main`（或在有权限时直接提交到 `main`）：

```sh
git add package.json package-lock.json
git commit -m "chore(release): bump version to $(node -p "require('./package.json').version")"
```

### 2. 运行测试与打包检查

```sh
npm ci
npm test
npm run pack:check
```

确认 `npm run pack:check`（`npm pack --dry-run`）输出的文件列表与 `package.json` 的 `files` 字段一致，无多余或缺失文件。

> 如需生成本地 `.tgz` 产物与 sha512 校验清单，可运行 `node scripts/pack-plugin.mjs dist/npm-release`。

### 3. 手动发布到 npm

```sh
npm publish --access public
```

- 按提示完成 2FA 验证（输入 OTP 或在浏览器确认）。
- 若发布预发布版本（如 `0.12.0-beta.1`），请附加 `--tag next`。

发布后验证：

```sh
npm view @tianacloud/dsh-tiana version dist-tags
```

### 4. 打 Git Tag 并推送

确认 npm 发布成功后，在对应发布提交上打 tag 并推送：

```sh
VERSION=$(node -p "require('./package.json').version")
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

> 推送 `v*` tag 仅用于记录版本点，不会触发自动发布。

### 5. 同步第三方插件市场（可选）

发布完成后，可触发 `dshpluginhub.ai` 同步新版本：

```sh
curl -X POST https://dshpluginhub.ai/api/v1/packages/submit \
  -H 'content-type: application/json' \
  -d '{"packageName":"@tianacloud/dsh-tiana"}'
```

或在 `dshpluginhub.ai` Dashboard 中点击 **Sync npm**。
