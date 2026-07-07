# 更新检测机制文档

本 fork 中有**两套独立的更新检测**，记录如下以便后续仓库改名后统一修改。

## 1. OpenChamber 应用自身更新

### 触发时机

应用启动 3 秒后首次检查，之后按服务端返回的 `nextSuggestedCheckInSec` 递归调度（默认 1 小时，最小 5 分钟，最大 24 小时）。

### 链路

```
useUpdatePolling (启动 3s 后触发)
  └─ useUpdateStore.checkForUpdates()
       ├─ desktop → checkForDesktopUpdates() (Electron autoUpdater)
       └─ web/vscode → checkForWebUpdates()
            └─ GET /api/openchamber/update-check
                 └─ package-manager.js checkForUpdates()
                      ├─ checkForUpdatesFromApi() → POST https://api.openchamber.dev/v1/update/check
                      └─ getLatestVersion() → GET https://registry.npmjs.org/@ocelot/web (fallback)
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `packages/ui/src/hooks/useUpdatePolling.ts` | 轮询调度，启动 3s 后首次检查 |
| `packages/ui/src/stores/useUpdateStore.ts` | 状态管理 + 分发到 desktop/web/vscode 检测路径 |
| `packages/ui/src/components/ui/UpdateDialog.tsx` | 更新对话框 UI（changelog、下载、重启） |
| `packages/web/server/lib/opencode/openchamber-routes.js` L17-53 | `GET /api/openchamber/update-check` 路由 |
| `packages/web/server/lib/package-manager.js` L87-136 | `checkForUpdatesFromApi()` — 向 `api.openchamber.dev` 发 POST |
| `packages/web/server/lib/package-manager.js` L720-764 | `checkForUpdates()` — 总入口，API 失败则 fallback 到 npm registry |
| `packages/web/server/lib/package-manager.js` L13 | `NPM_REGISTRY_URL = https://registry.npmjs.org/@ocelot/web` |
| `packages/web/server/lib/package-manager.js` L20 | `UPDATE_CHECK_URL = https://api.openchamber.dev/v1/update/check` |
| `packages/web/server/lib/package-manager.js` L14 | `CHANGELOG_URL = https://raw.githubusercontent.com/btriapitsyn/openchamber/main/CHANGELOG.md` |

### 数据源

1. **主**：`POST https://api.openchamber.dev/v1/update/check`
   - Payload: `{ appType, deviceClass, platform, arch, channel, currentVersion, installId, instanceMode, reportUsage }`
2. **Fallback**：`GET https://registry.npmjs.org/@ocelot/web`
3. **Changelog**：`GET https://raw.githubusercontent.com/btriapitsyn/openchamber/main/CHANGELOG.md`

### 仓库改名后需修改的 URL

- `packages/web/server/lib/package-manager.js` L20: `UPDATE_CHECK_URL`（指向 `api.openchamber.dev`）
- `packages/web/server/lib/package-manager.js` L14: `CHANGELOG_URL`（指向 `github.com/btriapitsyn/openchamber`）
- `packages/web/server/lib/package-manager.js` L13: `NPM_REGISTRY_URL`（如果 npm 包名也改）
- `packages/ui/src/components/ui/UpdateDialog.tsx` L33: `GITHUB_RELEASES_URL = https://github.com/btriapitsyn/openchamber/releases`

## 2. OpenCode CLI 更新

### 触发时机

应用启动 5 秒后首次检查，失败则 10 秒、60 秒后重试（共 3 次）。

### 链路

```
OpenCodeUpdateToast (启动 5s 后触发)
  └─ GET /api/opencode/upgrade-status
       ├─ isBundledOpenCodeBinaryActive() == true → 直接返回 available: false（不提示）
       └─ 本地安装的 OpenCode → 对比版本
            ├─ GET {opencodeServer}/global/health (获取当前版本)
            └─ fetchLatestOpenCodeVersion()
                 ├─ GET https://registry.npmjs.org/opencode-ai/latest
                 └─ GET https://api.github.com/repos/anomalyco/opencode/releases/latest
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `packages/ui/src/components/update/OpenCodeUpdateToast.tsx` | Toast UI + 启动 5s 后检查逻辑 |
| `packages/ui/src/components/update/openCodeUpdateDedup.ts` | 版本去重逻辑（避免重复提示同一版本） |
| `packages/web/server/lib/opencode/routes.js` L207-249 | `GET /api/opencode/upgrade-status` 路由 |
| `packages/web/server/lib/opencode/routes.js` L86-97 | `fetchLatestOpenCodeVersionFromGithub()` — 查 GitHub Releases |
| `packages/web/server/lib/opencode/routes.js` L99-109 | `fetchLatestOpenCodeVersionFromNpm()` — 查 npm registry |
| `packages/web/server/lib/opencode/routes.js` L111-124 | `fetchLatestOpenCodeVersion()` — 同时查两个源取较高版本 |

### 数据源

1. **GitHub**：`GET https://api.github.com/repos/anomalyco/opencode/releases/latest`
2. **npm**：`GET https://registry.npmjs.org/opencode-ai/latest`
3. **当前版本**：`GET {opencodeServer}/global/health` → `health.version`

### Bundled CLI 特殊处理

当 `isBundledOpenCodeBinaryActive()` 返回 true 时，`/api/opencode/upgrade-status` 直接返回 `{ available: false, source: 'bundled' }`，不查询外部源。这是正确的——bundled CLI 版本由 Electron 包更新决定，不需要单独升级。

## 3. 用户可控开关

### OpenCode 更新通知

- Settings → `showOpenCodeUpdateNotifications`
- 存储：`useUIStore`
- 关闭后 `OpenCodeUpdateToast` 不会检查也不会弹 toast

### OpenChamber 自身更新

- 无独立开关，始终轮询
- `useUpdateStore.dismiss()` 仅临时关闭对话框，下一轮轮询会再次检测

## 4. 待办（仓库改名后）

1. 修改 `package-manager.js` 中的 `UPDATE_CHECK_URL`、`CHANGELOG_URL`、`NPM_REGISTRY_URL`
2. 修改 `UpdateDialog.tsx` 中的 `GITHUB_RELEASES_URL`
3. 决定是否保留 `api.openchamber.dev` 更新检查（fork 版本可能不需要）
4. 如果不需要 OpenChamber 自身更新检查，可以考虑直接禁用 `useUpdatePolling` 或让 `checkForUpdates` 提前返回
