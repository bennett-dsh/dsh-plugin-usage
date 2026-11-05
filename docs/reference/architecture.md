# 装配契约

> 本插件贴着 DSH 内部契约实现，没有稳定的第三方 API。**DSH 升级后先跑
> `npm run verify:typert` 与 `npm run verify:remote`，再按本页的槽位/服务清单复核。**

## 1. 装配

| 层 | 文件 | 作用 |
| --- | --- | --- |
| bundle | `cordis.patch.yml` | `insert` 一行 `id: usage` / `name: dsh-plugin-usage`；包在 `package.json` 里声明 `dsh.bundle.patch` |
| host | `lib/host/index.js`（源码 `src/host/`） | 扫描、折叠、聚合、计价、两条 RPC 通道；导出 `name` / `inject` / `Config` / `apply` |
| client | `lib/client/index.js`（源码 `src/client/index.js`） | 设置页仪表盘、输入区 pill、详情页求星行；构建产物是 `window.__ModuleLoader__.load({ id, factory })`，`id` 从 `package.json#name` 派生 |
| locale | `locale/*.json`（8 份） | 包标题/描述/详情文档（宿主启动时读取）；界面字典走 `ctx.locale.register` |

`dsh.client.inject` 是启动期模块依赖声明（本插件保留既有 5 项）。槽位注册通过
`ctx.slots.inject` 等待槽位被声明，**不要求**把槽位 owner 写进 `inject` ——
`plugins.detail.section` 就没有新增声明也能注册（0.2.2-rc.1 实测）。

## 2. 槽位

| 槽位 | 注册 | 说明 |
| --- | --- | --- |
| `settings.section` | `id: token-stats`, `order: 20` | 设置页「用量统计」页面 |
| `settings.section.icon` | `id: token-stats`, `order: 0` | 导航行图标；**id 必须等于 section id**，否则永不渲染且不报错（0.2.2-rc.1+） |
| `conversation.composer.dock` | `id: usage-cost`, `order: 2` | 输入区「今日 ¥x.xx」pill；宿主自己占 0/1（0.2.1+） |
| `plugins.detail.section` | `id: usage-star`, `order: 80` | 详情页求星行；list slot，每个详情页都会派发，条目必须按 `subject.pkg.name` 自过滤（0.2.2-rc.1+）。order 必须小于市场来源行 `dsh-market-source`(90)，否则会被排到「查看仓库↗」页脚之后 |

旧内核没有的槽位，`slots.inject` 不触发，对应入口静默消失，其余功能不变。

## 3. 服务依赖

| 端 | 类型 | 服务 | 缺席时 |
| --- | --- | --- | --- |
| host | 硬依赖（`inject`） | `timer` | 不会 apply |
| host | 可选（`ctx.inject` 子级） | `typert` | 落回 Fetch 通道 |
| host | 可选（`ctx.inject` 子级） | `connection` | 不挂 Fetch/legacy 路由 |
| host | 运行时探测（`ctx.get`） | `settings` / `sessionPersistence` / `logger` | 配置只在内存生效 / 不扫持久化会话 / 退回 console |
| client | 硬依赖（`inject`） | `locale` / `slots` | 不会 apply |
| client | 运行时探测（`ctx.get`） | `configForms` / `remote` / `connection` | 回退 RPC / 回退 Fetch |

**不要**把可选服务写进硬 `inject`：第三方发行版没装该服务时，整个插件都不会 apply。

## 4. 两条通道

浏览器半 → 宿主半有两条常驻通道，不是二选一：

1. **原生 typert Remote**（优先）：`src/host/typert.js` 注册一份贡献并提供同名接收方服务，
   `namespace` 必须是包名；客户端 `remote.$mount` 后经 `ctx.get('remote.dsh-plugin-usage')` 调用。
   贡献形状、strict codec、`typertRemote` 绑定逐条取自分发物，由 `npm run verify:typert`
   用官方 `validateTypertManifest` 校验。
2. **Fetch 兜底**：`connection.fetch.register` 在共享 `/api` 通道上挂
   `POST /api/usage/<endpoint>`，请求体是参数的 JSON，响应是
   `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`；更早的宿主保留
   `/usage` 前缀通道。

端点共 4 个：`query` / `prices` / `pricing` / `contract`。`contract` 只报端点名，供浏览器半
在 `$mount` 时与宿主清单对齐。实际走了哪条、为什么，随每次 dashboard 响应以 `channel`
字段下发（`{ ok, transport, reason }`）——插件 logger 不一定进宿主日志，所以不靠猜。

**注册被拒时把接收方服务撤回去**，只留 Fetch：半个挂上的面比没有更糟。

## 5. 缓存与诊断文件

| 路径 | 内容 | 说明 |
| --- | --- | --- |
| `<DSH_HOME>/cache/dsh-plugin-usage/fold/<sessionId>.json` | 一个会话折叠后的记录 + `revision` + `watermark` + 签名 | 临时文件 + rename 原子写；异步、8 个一批 |
| `<DSH_HOME>/cache/dsh-plugin-usage/last-pass.json` | 一轮扫描的耗时摘要 | 纯诊断面；删掉不影响统计，`response.scan` 里有同一份 |

`DSH_HOME` 可改根目录（默认 `~/.dsh`）。缓存签名 = `FOLD_CACHE_VERSION` + 节假表
`capturedAt`；缓存坏了/读不了当未命中，退回全量扫，**不 prune**。

## 6. 文件布局

```
src/host/     宿主：scan / fold / fold-cache / query / state / aggregate / prices / pricing /
              peak / holidays / settings / rpc / typert / time
src/client/   设置页仪表盘 + pill + 求星行（纯 JS，样式内联在 index.js）
scripts/      构建入口、价目与节假表生成、fold 对账录制、两个原生契约校验
tests/        单测（宿主行为 + 构建产物 UI/详情页门 + i18n + fold 对账）
tools/        check-docs.mjs（公开文档的相对链接与锚点门）
docs/         公开文档库（导航 / 设计 / 参考 / 指南 / 经验 / 验收）
docs-private/ 私有文档库（仅入口 README 入库）
locale/       包标题/描述/详情文档 + 界面字典（zh / en / ja / de / es / fr / pt / ru）
```
