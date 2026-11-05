# 验收记录

> 自动化门 + 两个原生契约门 + 发布前检查。每次发版把结果补进文末的验收表。

## 自动化门（四层）

`npm test` 先跑 `pretest`（`npm run build`），再执行
`node --test tests/*.test.js tests/*.test.cjs && node tools/check-docs.mjs`。四层分工：

| 层 | 覆盖什么 | 失败会长什么样 |
| --- | --- | --- |
| `tests/*.test.js` | 纯函数与宿主行为：fold / pricing / rpc / typert / scan / query / aggregate / fold-cache / lazy-backfill / native-hygiene；另有 `i18n.test.js`（8 本字典键集与占位符、`locale/*.json` meta）与 `client-settings-icon.test.js` | 断言 |
| `tests/dialog.test.cjs` | **构建产物**里的定价弹窗：真实 bundle + 假宿主，75 项 | `CHECK(S) FAILED` 并列出名字 |
| `tests/fold-parity.test.js` | 事件 fold 与官方 `tokenUsage` 投影的**对账** | 四个计数不相等 |
| `node tools/check-docs.mjs` | 公开文档的相对链接与锚点 | 列出失效链接 |

`tests/client-bundle-id.test.js` 用 `execFileSync(..., { stdio: 'pipe' })` 跑真实的
`scripts/build-client.js`；`tests/client-detail-section.test.js` 加载构建产物、直接渲染求星行，
钉住「subject 自过滤 / 单行无链接 / 不占用 `plugins.row.config`」。

## 两个原生契约门

| 命令 | 做什么 | 缺 asar 时 |
| --- | --- | --- |
| `npm run verify:typert` | 从本机 `resources/app.asar` 取出官方 `validateTypertManifest`，对贡献跑一遍（4 个端点） | 明确 `SKIPPED`（exit 0），不假装通过 |
| `npm run verify:remote` | 取出真实的 cordis + typert 注册表 + protocol + zod，在进程里跑本插件的注册路径，7 项检查 | 同上 |

`verify:remote` 不只验「能挂上」：它还**反向**验证「激活期一次性探测 `ctx.get('typert')`
必然失败」这个旧缺陷（cordis 的 `get` 只返回提供方 fiber 已激活的服务），以及接收方服务带
`typertRemote` 绑定。

## fold-parity fixture 的录制方式

对账用的 fixture 是**录**下来的，不是手写：

```sh
node scripts/fold-parity-fixture.mjs [path/to/app.asar]
```

脚本从本机分发物里取出官方 `@deepseek-ai/dsh-token-meter` 的
`lib/types/usage-projection.js`，只替换 import（zod 换成 no-op，两个 helper 从同一分发物
原样复制），**原样执行** `apply`，把结果写进 `tests/fixtures/token-usage-parity.json`。
`provenance` 里记录包版本与录制日期；DSH 升级后重跑它，别手改数字。

## 实测基线（2026-11-05）

| 项 | 结果 |
| --- | --- |
| 插件版本 | **0.6.0**（`CHANGELOG.md` 0.6.0；运行时行为与 0.5.1 相同） |
| 内核 | **0.2.2-rc.1**（`package.json` 的 `dsh.verifiedAgainst`） |
| 单测 | 沙箱内 `node --test --test-isolation=none ...`：**250 项 / 247 通过 / 3 失败**；可写环境（本机 full access 或 CI）`npm test`：**250/250 通过** |
| 3 项失败 | `tests/client-bundle-id.test.js` 的 `execFileSync(..., { stdio: 'pipe' })` 在 DSH 沙箱下返回 `spawn EPERM`；不是断言失败 |
| `verify:typert` | 4 端点 OK |
| `verify:remote` | 7/7 PASS |

**不要把这 3 项 EPERM 当成代码问题**：`npm test` 本身会为每个文件起 worker 进程，在 DSH 沙箱里同样会碰到 `EPERM`；沙箱内的正确读法是「247 通过 + 3 项因进程沙箱无法执行」。在可写环境（CI，或本机 full access）`npm test` 是 **250/250 全绿**（2026-11-05 本机实测，末尾还有 `check-docs: 27 个文档，链接与锚点全部有效`）。0.5.1 时的基线是 238 项（235 通过 + 同样 3 项 EPERM）。

## 发布前检查

1. `npm run build` —— 产物无内联 sourcemap（`DSH_USAGE_SOURCEMAP=1` 才另写外部 map）；
2. `npm test` —— 在 CI 或非沙箱环境跑；沙箱内按上面的读法记录；
3. `npm run verify:typert` + `npm run verify:remote` —— 两个原生契约门；
4. DSH 升级过就重跑 `scripts/fold-parity-fixture.mjs`，再跑 `tests/fold-parity.test.js`；
5. `node tools/check-docs.mjs`（已接进 `npm test`）—— 文档相对链接与锚点。

## 验收表

| 版本 | 内核 | 自动化 | 记录 |
| --- | --- | --- | --- |
| 0.6.0（2026-11-05 定版） | 0.2.2-rc.1 | 250 项（沙箱 247 + 3 项 EPERM；可写环境 `npm test` 250/250）；`verify:typert` 4 端点 OK；`verify:remote` 7/7 | `CHANGELOG.md` 0.6.0 |
| 0.5.1（2026-11-05） | 0.2.2-rc.1 | 238 项（沙箱 235 + 3 项 EPERM）；两个契约门通过 | `CHANGELOG.md` 0.5.1 |
| 0.5.0（2026-10-31） | 0.2.1-rc.4 | 224 项；两个契约门通过 | `CHANGELOG.md` 0.5.0 |
