# OpenChamber Fork — Ocelot

本文件记录此 fork 相对上游 `openchamber/openchamber` 的所有改动，供同步上游时参考。

## 品牌改名:OpenChamber → Ocelot (第一步:用户可见字符串)

将 fork 从 "OpenChamber" 重新品牌化为 "Ocelot"。第一步只改用户可见的字符串，内部标识符（npm scope、i18n key）暂缓。

### 已改

| 类别 | 改动 | 说明 |
|---|---|---|
| 环境变量 | `OPENCHAMBER_*` → `OCELOT_*` | `process.env.OCELOT_*`、`${OCELOT_*`、`$OCELOT_*`、裸标识符（对象键、帮助文本、shell 命令） |
| 配置路径 | `~/.config/openchamber` → `~/.config/ocelot` | airouter 配置、settings、sessions 等 |
| UI 品牌文本 | `OpenChamber` → `Ocelot` | 所有用户可见的 UI 字符串（标题、按钮、标签、placeholder） |
| 命令系统 | `'openchamber'` → `'ocelot'` | CommandAutocomplete 里的 source/id |
| 文件重命名 | `OpenChamberLogo.tsx` → `OcelotLogo.tsx` | UI 组件文件名 |
| 文件重命名 | `OpenChamberPage.tsx` → `OcelotPage.tsx` | 设置页组件 |
| 文件重命名 | `OpenChamberVisualSettings.tsx` → `OcelotVisualSettings.tsx` | 视觉设置组件 |
| Electron | `productName: "Ocelot"` | electron-builder 打包的应用名 |
| Docker | `OPENCHAMBER_UI_PASSWORD` → `OCELOT_UI_PASSWORD` | docker-compose.yml + docker-entrypoint.sh |

### 未改（暂缓，需三端同步或外部依赖）

| 项 | 原因 |
|---|---|
| `__OPENCHAMBER_*__` 桥接全局属性 | Electron `contextBridge.exposeInMainWorld` 暴露的 IPC 全局，需 main.mjs ↔ preload.mjs ↔ webview 三端同步 |
| `openchamber:*` IPC 通道名 | 同上，需三端同步 |
| `openchamber://` 深度链接协议 | 需改 Info.plist + main.mjs，且旧链接会失效 |
| `dev.openchamber.desktop` appId | Electron 应用唯一标识，改了无法升级旧版本 |
| `@openchamber-bot` GitHub App | 依赖 GitHub App 注册名，不能 sed |
| `openchamber.*` VS Code 命令前缀 | 用户不用 VS Code 扩展，跳过 |
| `OPENCHAMBER_SHARED_SETTINGS_PATH` 常量 | 局部常量名，非环境变量 |

## 品牌改名第二步:内部标识符

### 已改

| 类别 | 改动 | 说明 |
|---|---|---|
| npm scope | `@openchamber/*` → `@ocelot/*` | 5 个子包 name 字段 + 所有 workspace 依赖引用 + 所有源码 import + tsconfig paths |
| 根包名 | `openchamber-monorepo` → `ocelot-monorepo` | 根 package.json |
| i18n key | `settings.openchamber.*` → `settings.ocelot.*` | 13 个 i18n 消息文件 + 14 个引用源码 |

### 注意事项

- 上游同步时，`git merge upstream/main` 可能会重新引入 `OpenChamber` 字符串。合并后需重跑 sed 命令（见 git history）。
- `~/.config/openchamber/` 下的用户配置不会自动迁移到 `~/.config/ocelot/`，用户需手动迁移或接受重新配置。

### 遗留清理

第二步完成后，仍有部分 `@openchamber/` 引用残留在文档和 install 脚本中，随后统一清理：

| 文件 | 改动 |
|---|---|
| `scripts/install.sh` | `PACKAGE_NAME="@openchamber/web"` → `@ocelot/web` |
| `AGENTS.md` | Electron import 路径 `@openchamber/web/server` → `@ocelot/web/server` |
| `CONTRIBUTING.md` | `pack:web` 描述 `@openchamber/web` → `@ocelot/web` |
| `packages/web/README.md` | 标题 + install 命令 `@openchamber/web` → `@ocelot/web` |
| `packages/electron/README.md` | import 路径 + bundle-main 外部依赖 `@openchamber/web` → `@ocelot/web` |
| `packages/electron/node_modules/@openchamber/` | 删除 stale workspace 软链（`@ocelot/` 已存在） |
| `packages/vscode/node_modules/@openchamber/` | 删除 stale workspace 软链（`@ocelot/` 已存在） |

---

## 改动 1:TunneL 隧道管理增强

沿用上游，无 fork 专属改动。

## 改动 2:OpenCode CLI 启动参数透传

沿用上游，无 fork 专属改动。

## 改动 3:Desktop 桌面应用增强

沿用上游，无 fork 专属改动。

## 改动 4:AI Router (模型回退代理)

将 airouter（模型回退代理）作为进程内 Express 路由器集成到 web 服务器，让 Ocelot 具备多模型回退能力——主模型失败时自动切换到备用模型，提升复杂任务的完成率。

### 架构

```
用户请求
  ↓
Ocelot UI → OpenCode → provider.airouter → POST /api/airouter/v1/chat/completions
                                                      ↓
                                                 airouter 路由器
                                                      ↓
                                                 按 routes 配置顺序尝试
                                                      ↓
                                              provider A → 失败 → provider B → 失败 → ...
                                                      ↓
                                                 返回第一个成功响应
```

- **进程内挂载**:复用 web 服务器端口，不额外开进程
- **配置隔离**:airouter 自己的配置在 `~/.config/ocelot/airouter-config.json`（Ocelot 领地）
- **提供程序注入**:通过修改 `~/.config/opencode/config.json` 的 `provider.airouter` 块，让 OpenCode 把 airouter 当成一个 provider

### 文件清单

| 文件 | 作用 |
|---|---|
| `packages/web/server/lib/airouter/config.js` | 配置读写，路径 `~/.config/ocelot/airouter-config.json` |
| `packages/web/server/lib/airouter/routes.js` | 核心路由逻辑，按 routes 顺序尝试上游 provider |
| `packages/web/server/lib/airouter/provider-inject.js` | 向 `~/.config/opencode/config.json` 注入/移除 `provider.airouter` 块 |
| `packages/web/server/lib/airouter/index.js` | Express 路由器，端点 `GET/PUT /config`、`GET /health`、`POST /v1/chat/completions` |
| `packages/web/server/index.js` | 挂载路由器: `app.use('/api/airouter', createAirouterRouter({...}))` |

### API 端点

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/airouter/config` | 返回当前 airouter 配置 |
| PUT | `/api/airouter/config` | 保存配置，根据 `enabled` 自动注入/移除 OpenCode provider |
| GET | `/api/airouter/health` | 健康检查，返回 `{ status: 'ok', enabled: <bool> }` |
| POST | `/api/airouter/v1/chat/completions` | 主代理端点，`enabled=false` 时返回 503 |

### 配置结构

```json
{
  "routes": {
    "default": ["provider-a", "provider-b"],
    "deepseek-v3": ["provider-x", "default"]
  },
  "dns": {
    "enabled": false,
    "servers": ["223.5.5.5"],
    "timeout": 3000
  },
  "enabled": false
}
```

- `routes`:key 是模型名（或 `default`），value 是 provider 优先级数组
- `dns`:可选的自定义 DNS 解析，解决某些 provider 域名污染问题
- `enabled`:总开关，false 时所有请求返回 503

### 提供程序注入

`PUT /api/airouter/config` 保存配置后:

- `enabled !== false` → 调用 `injectAirouterProvider()`，在 `~/.config/opencode/config.json` 的 `provider.airouter` 写入:
  ```json
  {
    "name": "AiRouter",
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://localhost:<port>/v1" },
    "models": { ... }
  }
  ```
- `enabled === false` → 调用 `removeAirouterProvider()`，删除 `provider.airouter` 块

注入后调用 `refreshFn`（即 `refreshOpenCodeAfterConfigChange`）让 OpenCode 热加载新配置。

### 设计决策

1. **配置位置**:airouter 自己的配置放 `~/.config/ocelot/`（Ocelot 领地），不污染 `~/.config/openchamber/`。用户返回原版 openchamber 时不会留下残留。
2. **提供程序注入位置**:放 `~/.config/opencode/config.json`（OpenCode 领地），因为这是 OpenCode 的地盘，airouter 只是把 Ocelot 的 provider 注册进去。
3. **进程内挂载**:不开独立进程，复用 web 服务器端口，简化部署和进程管理。
4. **错误处理**:遵循 AGENTS.md 的"区分 fetch 失败与空成功"原则——`loadConfig` 在 ENOENT 时返回默认配置，其他错误抛出明确异常。

---

## 改动 5:Magic Prompt 用户输入保留

修复斜杠命令吞掉用户输入的问题。之前 `/debug xxx`、`/plan-feature xxx` 等命令会把用户在命令后输入的文字丢弃，导致 AI 必然反问用户、浪费一轮对话。

### 修复的命令

| 命令 | 修复前 | 修复后 |
|---|---|---|
| `/debug [问题描述]` | 吞掉描述，发送 "I want to debug an issue." | 描述作为 visible prompt 附加上下文 + instructions 注入"Use this as the starting point" |
| `/plan-feature [描述]` | 吞掉描述，发送 "I want to start planning a feature." | 同上 |
| `/weigh [决策描述]` | 吞掉描述，发送 "Help me decide how to approach this." | 同上 |
| `/explore [区域]` | 吞掉区域，发送 "Give me a high-level tour of this codebase." | 区域作为 visible prompt "Focus on: xxx" + instructions 注入 |

### 未改的命令

| 命令 | 原因 |
|---|---|
| `/summary [topic]` | 已正确处理用户输入（通过 `topic_line`/`topic_block` 变量注入） |
| `/workspace-review` | 命令读 git diff 状态，用户无信息可补充 |
| `/catch-up` | 命令读 git 状态，用户无信息可补充 |
| `/handoff-review` | 走对话框流程 |

### 文件

| 文件 | 改动 |
|---|---|
| `packages/ui/src/lib/magicPrompts.ts` | 4 个 visible 模板加 `{{user_description_line}}` / `{{focus_area_line}}` 占位符 |
| `packages/ui/src/components/chat/ChatInput.tsx` | 4 个命令处理器提取用户输入、注入变量、追加 instructions 上下文 |

---

## 改动 6:首次启动源选择器 (First-Launch Source Chooser)

### 问题

Desktop 首次启动时，Ocelot 无法区分用户想用哪种 OpenCode 源:
- **本地安装**(用户自己装的 opencode CLI,在 PATH 里)
- **内置 CLI**(Electron 打包时附带的 opencode-cli)
- **远程服务器**(用户已有 OpenCode 实例,想连接过去)

之前的行为是直接启动一个 managed OpenCode 实例,用户没有选择权。如果用户已有远程服务器或想用内置 CLI,体验很差。

### 解决方案

引入"延迟启动"机制:Desktop 首次启动时**不自动启动 OpenCode**,而是显示一个选择器界面,让用户选好源之后再点 Start。

### 架构

```
Desktop 启动
  ↓
main.mjs 检查 initialHostChoiceCompleted
  ↓ false → 设置 OPENCHAMBER_AWAIT_USER_CHOICE=1
  ↓
web server lifecycle.js 看到 OPENCHAMBER_AWAIT_USER_CHOICE=1
  ↓ 跳过自动启动,只预解析 binary 路径(供 /health 报告)
  ↓ isOpenCodeReady = false
  ↓
UI 显示 ChooserScreen (三个 tab: 本地 / 内置 / 远程)
  ↓ 用户选源 + 点 Start
  ↓
POST /api/opencode/start → startManagedOpenCode()
  ↓ 启动 managed OpenCode 实例
  ↓
onCliAvailable() → 进入主界面
```

### 文件清单

| 文件 | 作用 |
|---|---|
| `packages/electron/main.mjs` | L1260: 根据 `initialHostChoiceCompleted` 设置 `OPENCHAMBER_AWAIT_USER_CHOICE` |
| `packages/web/server/lib/opencode/lifecycle.js` | L822: `OPENCHAMBER_AWAIT_USER_CHOICE=1` 跳过分支,预解析 binary 但不启动 |
| `packages/web/server/lib/opencode/lifecycle.js` | L889: `startManagedOpenCode()` 函数,供用户选择后手动触发 |
| `packages/web/server/lib/opencode/openchamber-routes.js` | L292: `POST /api/opencode/start` 路由,调用 `startManagedOpenCode()` |
| `packages/ui/src/components/onboarding/ChooserScreen.tsx` | 选择器界面,三个 tab + Start 按钮 |
| `packages/ui/src/components/onboarding/RemoteConnectionForm.tsx` | 远程连接表单(远程 tab 内容) |
| `packages/ui/src/lib/desktopHosts.ts` | `initialHostChoiceCompleted` 持久化 |

### 关键设计决策

1. **环境变量而非配置文件**:用 `OPENCHAMBER_AWAIT_USER_CHOICE=1` 而不是 settings,因为这是启动时一次性的 gate,不需要持久化到用户配置。
2. **预解析但不启动**:skip 分支调用 `applyOpencodeBinaryFromSettings()` + `ensureOpencodeCliEnv()`,这样 `/health` 能报告 `opencodeBinarySource` 和 `bundledCliAvailable`,让选择器显示正确的可用性提示。
3. **幂等 start**:`startManagedOpenCode()` 检查是否已有实例运行,已运行则 no-op。
4. **persistFirstChoice**:用户选完源后,`desktopHostsSet({ initialHostChoiceCompleted: true })` 持久化,下次启动不再显示选择器。

### 上游冲突风险

- `lifecycle.js` 的 `bootstrapOpenCodeAtStartup` 函数是上游高频改动区域。合并时检查 `OPENCHAMBER_AWAIT_USER_CHOICE` 跳过分支是否存活。
- `env-runtime.js` 的 `resolveOpencodeCliPath` 优先级改动(上游 5edd7280)会影响 `opencodeBinarySource` 的值,但不影响我们的 `bundledCliAvailable` 字段(见改动 8)。

---

## 改动 7:TerminalView cd-to-config 快捷键

### 功能

在终端视图的底部 dock 加一个快捷按钮,点击后向终端发送 `cd ~/.config/opencode\r`,让用户快速跳转到 OpenCode 配置目录。

### 文件

| 文件 | 改动 |
|---|---|
| `packages/ui/src/components/views/TerminalView.tsx` | L760: `handleCdToConfigDir` 回调,调用 `terminal.sendInput(id, 'cd ~/.config/opencode\r')` |
| `packages/ui/src/components/views/TerminalView.tsx` | L1169: 底部 dock 按钮绑定 `onClick={handleCdToConfigDir}` |

### 上游冲突风险

低。TerminalView 的底部 dock 是 Ocelot 新增的 UI 区域,上游改动通常在终端渲染逻辑,不在 dock 布局。

---

## 改动 8:bundledCliAvailable 检测修复

### 问题

上游 5edd7280(v1.14.0) 改了 OpenCode binary 解析优先级:**内置 CLI 从第一优先级降到最后兜底**。这导致 `opencodeBinarySource` 反映的是"哪个源赢了解析",而不是"内置 CLI 是否存在"。

我们的 `ChooserScreen` 原来检查 `opencodeBinarySource === 'bundled'` 来判断内置 CLI 是否可用。上游改动后,如果用户本地装了 opencode,`opencodeBinarySource` 会是 `'path'` 而不是 `'bundled'`,导致内置 tab 错误地显示"不可用"并禁用按钮——即使内置 CLI 二进制确实存在。

### 解决方案

在 `/health` 响应中新增 `bundledCliAvailable: boolean` 字段,直接检查内置 CLI 二进制文件是否存在,与解析优先级无关。

### 文件清单

| 文件 | 改动 |
|---|---|
| `packages/web/server/lib/opencode/env-runtime.js` | 导出 `resolveBundledOpenCodeCliPath()`(已有内部函数,加到 return 对象) |
| `packages/web/server/index.js` | L663: 包装 `resolveBundledOpenCodeCliPath`; L1244: health snapshot 加 `bundledCliAvailable: Boolean(resolveBundledOpenCodeCliPath())` |
| `packages/ui/src/components/onboarding/ChooserScreen.tsx` | L155: 改用 `data.bundledCliAvailable === true` 代替 `opencodeBinarySource === 'bundled'` |

### 检测逻辑

`resolveBundledOpenCodeCliPath()` 检查:
1. `process.env.OCELOT_BUNDLED_OPENCODE_CLI_DIR` 环境变量指向的目录
2. `process.resourcesPath/opencode-cli/` (Electron 打包路径)

对每个候选路径调用 `isExecutable()`(statSync + accessSync X_OK)。只要有一个候选是可执行文件,就返回该路径;都不可执行则返回 `null`。

### 为什么不复用 opencodeBinarySource

`opencodeBinarySource` 的语义是"resolveOpencodeCliPath 最终选了哪个源",它的值取决于解析顺序:
- `'env'` — 环境变量显式指定
- `'path'` — PATH 里找到的
- `'fallback'` — 已知安装位置找到的
- `'shell'` — 登录 shell 里找到的
- `'bundled'` — 以上都找不到,用内置 CLI 兜底
- `'settings'` — 用户在 settings 里配了 opencodeBinary

上游 5edd7280 之后,只有"其他源都找不到"时才会是 `'bundled'`。所以 `opencodeBinarySource === 'bundled'` 不能用来判断"内置 CLI 是否存在",只能判断"是否最终用了内置 CLI"。

### 上游冲突风险

低。`resolveBundledOpenCodeCliPath` 是 `bundledOpenCodeCliFallback` 的子函数,上游不会单独改它的导出。但需检查上游是否改了 `bundledOpenCodeCliCandidates` 的候选路径列表(比如改了 `OCELOT_BUNDLED_OPENCODE_CLI_DIR` 环境变量名)。

---

## 上游合并检查清单

每次 `git merge upstream/main` 后,按此清单检查 fork 专属改动是否存活。

### 1. 品牌改名存活检查

```bash
# 用户可见字符串
grep -r 'OpenChamber' packages/ui/src/components/ packages/ui/src/lib/i18n/messages/en.ts --include='*.tsx' --include='*.ts' | grep -v 'node_modules' | grep -v '.test.'
# 应该只有 __OPENCHAMBER_*__ 桥接全局、openchamber:// 协议、dev.openchamber.desktop appId 等"暂缓"项

# npm scope
grep -r '@openchamber/' packages/*/package.json packages/*/src packages/*/server --include='*.json' --include='*.ts' --include='*.js' --include='*.tsx' --include='*.mjs' | grep -v 'node_modules'
# 应该为空(全部已改为 @ocelot/)

# i18n key 命名空间
grep -r 'settings\.openchamber\.' packages/ui/src --include='*.ts' --include='*.tsx' | grep -v 'node_modules'
# 应该为空(全部已改为 settings.ocelot.)
```

如果上游重新引入了 `OpenChamber` 字符串或 `@openchamber/` scope 或 `settings.openchamber.*` i18n key,需重跑 rebrand sed 命令(见 git history 的 rebrand commits)。

### 2. i18n 死键清理

合并后,`en.settings.ts`(类型源)可能同时有 `settings.openchamber.*` 和 `settings.ocelot.*` 键。其他 locale 文件也会有双份。

```bash
# 检查是否有死键(es/pt-BR/uk 用双引号,其他用单引号,需 quote-agnostic 正则)
grep -rn "settings\.openchamber\." packages/ui/src/lib/i18n/messages/*.settings.ts | grep -v node_modules
# 应该为空
```

如果有残留,用 quote-agnostic 正则清理:
```python
import re, glob
for f in glob.glob('packages/ui/src/lib/i18n/messages/*.settings.ts'):
    with open(f) as fh: lines = fh.readlines()
    out = [l for l in lines if not re.match(r"^\s*['\"]settings\.openchamber\.", l)]
    with open(f, 'w') as fh: fh.writelines(out)
```

### 3. 首次启动选择器存活检查

```bash
# lifecycle.js 跳过分支
grep -n 'OPENCHAMBER_AWAIT_USER_CHOICE' packages/web/server/lib/opencode/lifecycle.js
# 应该有 L822 的 if 分支

# POST /api/opencode/start 路由
grep -n '/api/opencode/start' packages/web/server/lib/opencode/openchamber-routes.js
# 应该有 L292 的 route

# main.mjs 环境变量设置
grep -n 'OPENCHAMBER_AWAIT_USER_CHOICE' packages/electron/main.mjs
# 应该有 L1260 的设置

# ChooserScreen 存活
ls packages/ui/src/components/onboarding/ChooserScreen.tsx
# 应该存在
```

### 4. bundledCliAvailable 检测存活检查

```bash
# env-runtime.js 导出
grep -n 'resolveBundledOpenCodeCliPath' packages/web/server/lib/opencode/env-runtime.js | tail -5
# return 对象里应该有 resolveBundledOpenCodeCliPath

# index.js 包装 + health snapshot
grep -n 'resolveBundledOpenCodeCliPath\|bundledCliAvailable' packages/web/server/index.js
# 应该有 L663 包装 + L1244 snapshot 字段

# ChooserScreen 使用新字段
grep -n 'bundledCliAvailable' packages/ui/src/components/onboarding/ChooserScreen.tsx
# 应该有 L155 的检测逻辑
```

如果上游改了 `bundledOpenCodeCliCandidates` 的候选路径或 `OCELOT_BUNDLED_OPENCODE_CLI_DIR` 环境变量名,需同步更新。

### 5. AI Router 存活检查

```bash
# 路由挂载
grep -n 'createAirouterRouter\|/api/airouter' packages/web/server/index.js
# 应该有 app.use('/api/airouter', ...) 挂载

# 目录存在
ls packages/web/server/lib/airouter/
# 应该有 config.js routes.js provider-inject.js index.js
```

### 6. Magic Prompt 存活检查

```bash
# 占位符存在
grep -n 'user_description_line\|focus_area_line' packages/ui/src/lib/magicPrompts.ts
# 应该有 4 处占位符

# ChatInput 处理器
grep -n 'user_description\|focus_area' packages/ui/src/components/chat/ChatInput.tsx
# 应该有 4 个命令的输入提取逻辑
```

### 7. TerminalView cd-to-config 存活检查

```bash
grep -n 'handleCdToConfigDir\|cd ~/.config/opencode' packages/ui/src/components/views/TerminalView.tsx
# 应该有 L760 回调 + L764 sendInput
```

### 8. bootstrap-runtime 依赖注入完整性检查

合并后,如果上游在 `bootstrap-runtime.js` 的 `registerOpenChamberRoutes` 调用里新增了参数,但 `options` 解构遗漏,会导致 `ReferenceError: xxx is not defined` 闪退。

```bash
# 检查 index.js 是否传了 startManagedOpenCode
grep -n 'startManagedOpenCode' packages/web/server/index.js | head -5
# 应该有: 定义 + 传给 setupBaseRoutes

# 检查 bootstrap-runtime.js 是否解构了
grep -n 'startManagedOpenCode' packages/web/server/lib/opencode/bootstrap-runtime.js
# 应该有: 解构 + 传给 registerOpenChamberRoutes

# 更通用的检查:对比两个文件中 registerOpenChamberRoutes 的参数列表
grep -A 20 'registerOpenChamberRoutes' packages/web/server/lib/opencode/bootstrap-runtime.js | grep -v '//'
# 确保每个传参都在 options 解构里有对应项
```

### 9. 类型检查 + Lint

```bash
bun run type-check
bun run lint
```

如果 type-check 报 locale 缺键,通常是合并后 `en.settings.ts` 有新键但其他 locale 没同步。用 `bun run lint` 定位,然后手动补齐缺失的 `settings.ocelot.*` 键。
