# 与原生 DSH 的距离：L2 补缺的取证与升级路径

对照 `xshared-lib` 经验库第〇条（原生优先：先取证原生，能引用不重写；补缺要有
「官方确实没有」的反证；原生结论要可核）。本文件把**仍然自研**的地方、以及**明知偏离原生、
但权衡后保留**的地方，连证据一起记下来 —— 省得下次重推一遍，也免得把"我觉得"当成反证。

取证对象：本机 `E:\FXS\APP\DSH NEXT\resources\app.asar`。引用的符号与行号都来自该分发物里的文件，不是转述。

| 项 | 值 |
|---|---|
| 首次取证 | `0.2.1-rc.3` |
| 当前基线 | `0.2.1-rc.4`（实例升级后按第〇条第 5 点重跑过两个契约门：`verify:typert` → 4 端点 OK；`verify:remote` → 7/7） |
| `engines.dsh` | `>=0.2.1-rc.3 <0.3.0` —— rc.3 也验证过，不因抬基线而缩小可安装范围 |

---

## 1. settings 导航图标：用 DOM 打标 + CSS mask（`src/client/index.js` 的 `installSettingsNavIcon`）

**为什么自研**：官方没有 icon 插口。

- 官方设置页把 `settings.section` 的条目投影成三个字段 —— `id` / `order` / `label`：
  `@deepseek-ai/dsh-client-ui-settings-general` 的 nav rows `getSnapshot` 里
  `ctx.slots.entries("settings.section").map((e) => ({ id: e.options.id ?? "", order:
  e.options.order ?? 0, label: resolveSlotLabel(e.options.label) ?? "" }))`。
- 图标由该包自己的 `navIcon(id)` 按 id 白名单决定，未列出的 id 回落到设置齿轮 ——
  同包 `function navIcon(id)`，注释原文 "unknown ids fall back to the settings gear"。

**所以**：第三方分区只能拿齿轮。当前实现给"自己那一行"加 `data-tsd-nav` 属性，再用
`::before` + mask 画字形：不改 DOM 结构、不碰 React 管的 `<svg>`（替换会让 React 卸载
时抛 `NotFoundError`）、认不出行就静默退化。

**升级路径**：官方一旦给 `settings.section` 的 options 加上 `icon` 字段，这个模块整体
删除（那时它是可引用的 L0，不该再留补缺）。

---

## 2. client → host：原生 typert Remote（已接）＋ `connection.fetch` 兜底

**现状**：`src/host/typert.js` 在宿主有 typert 注册表时，注册一份**原生贡献**并提供一个**接收方
服务**；`src/client/index.js` 的 `hostCall` **先**走 `remote['dsh-plugin-usage']`，失败再退回
`connection.fetch` 的 `/api/usage/*` 与 legacy `/usage` 通道。两条通道都常驻，不是二选一。

**原生要求逐条（都从分发物里取证，不是转述）**：

1. 贡献形状：`package` / `face: 'host'` / `schemas[]` / `model.{services,events,objects}` /
   `invocations[]`（`@deepseek-ai/dsh-typert-loader` `validateTypertManifest`）。
2. 每条 invocation 要 `id/service/namespace/method`；参数 `source` 只允许 `json`/`lookup`，
   **参数与结果都必须是 strict codec**：`mode === 'strict'` + 非空 `typeSymbol` + `create()`；
   结果还要给 `encode`（`requireStrictCodec`；没有 encode 时 gateway 会跳过自己的结果处理）。
3. `namespace` **必须是包名**：client 侧服务键 `remote.<namespace>`
   （`dsh-api-gateway` client 的 `remoteServiceKey`）。写成端点名会挂载成功但永远调不到。
4. **接收方服务**：gateway 按 `descriptor.service` 在接收方 ctx 上解析服务，并逐字段核对
   `typertRemote` 绑定（`service` = 实例本身 / `serviceKey` = 包名 / `namespace` = 包名）。
   所以 `registerTypert` 先 `ctx.reflect.provide('dsh-plugin-usage', receiver)`，再注册面；
   注册被拒时**把接收方服务撤回去**并留在 Fetch 通道上 —— 半个挂上的面比没有更糟。

**为什么不是构建期 `exports["./typert"]`**：那条路径要官方 loader 扫描到包，同时仍要接收方
服务；运行期 `ctx.typert.register()` 是官方公开入口（typert-registry README："any other owner
calls ctx.typert.register(contribution) directly"），不需要新增运行时依赖，且归属落在本插件
自己的 fiber 上（随卸载自动注销）。

**两条落地时的实测坑（别再踩）**：

1. 提供服务用 **`ctx.provide(name, value)`**（cordis `Context.provide`，"Register a service
   implementation owned by the current fiber… returns a disposer"）。`ctx.reflect` 是 `Service`
   构造器内部的门面，插件 ctx 上取不到 —— 用它会让整条路径静默失效。
2. 客户端取 Remote 用 **`ctx.get('remote.<包名>')`**（gateway 按 `remoteServiceKey(namespace)`
   建的服务键）；`ctx.remote[包名]` 是旧形状，且属性访问在严格代理上**会抛**，只能作为受
   保护的次选。
3. **不要在激活期一次性探测 `ctx.get('typert')`**：cordis 的 `get` 只返回
   **提供方 fiber 已激活**的服务（`Context.get` → `_getImpl` 里 `if (strict && impl.fiber.state
   !== 2) return`），而同一组合里的兄弟 bundle 可能比我们晚激活。实机后果是：宿主编排里
   明明有 typert 注册表，插件却报 "no typert registry in this composition" 并落到 Fetch。
   正确写法是**声明依赖**，在依赖就绪时再注册：
   ```js
   ctx.inject(['typert'], (typertCtx) => { Object.assign(channel, registerTypert(typertCtx, handlers, log)) })
   ```
   与 `connection` 的写法一致（`registerRPC` 里两处并列），缺这个服务时回调不触发、Fetch 照样工作。

**通道决策可查**：`registerTypert` 返回 `{ ok, transport, reason }`，随每次 dashboard 响应
以 `channel` 字段下发（插件 logger 不一定进宿主日志）。所以"走了哪条、为什么"不需要猜。

**真机实测（2026-10-29，work-exp，DSH NEXT 0.2.1-rc.3）**：dashboard 打开后网络里出现
`POST /api/dsh-plugin-usage/query` → **200**，响应 `channel` 为
`{"ok":true,"transport":"remote","reason":"registered 4 endpoints"}`；页面数据完整渲染
（991.43M token / 2,562 次调用）。`/api/usage/*` 只在自举窗口（`$mount` 尚未落地的头一两个
请求）出现，之后自动走 Remote —— 这就是"两条通道都常驻"的设计意图，不是残留。

**门**：
- `npm run verify:typert` 直接从本机 asar 取出官方 `validateTypertManifest` 跑一遍
  （缺 asar 时明确 SKIPPED，不假装通过）；
- `npm run verify:remote` 更狠一步：把**真实的 cordis + 真实的 typert 注册表**从 asar 里取出来，
  在进程里跑一遍本插件的注册路径，并**反向**验证"激活期一次性探测 `ctx.get('typert')` 必然失败"。
  这一条不需要重启真机就能证明通道成立（2026-10-29 实测：面落在 `dsh-plugin-usage/query`，
  namespace/method 正确，接收方服务带 `typertRemote` 绑定）；
- `tests/typert.test.js` 覆盖 loader 不查但 gateway 要的规则：namespace = 包名、接收方绑定、
  wire 名合法性、id 唯一性、以及"注册被拒要把接收方撤回去"；
- `tests/rpc.test.js` 断言两条通道都挂上，客户端侧 `tests/dialog.test.cjs` 断言优先 Remote、
  失败回落 Fetch。


---

## 3. 折叠缓存与诊断文件：一处**已知的**自建旁路，以及它为什么还留着

**现状**：`src/host/fold-cache.js` 把每个会话折叠后的记录写到
`<DSH_HOME>/cache/dsh-plugin-usage/fold/<sessionId>.json`（临时文件 + rename 原子写），
`src/host/scan.js` 在同一目录写一份 `last-pass.json`（一轮扫描的耗时摘要，纯诊断）。

**官方确实有对应通道**（这条要写清楚，否则"留着"就成了"我觉得"）：

- `@deepseek-ai/dsh-storage` —— 服务键 `storage`，`var Storage = class extends Service { constructor(ctx) { super(ctx, "storage") } }`，
  后端注册在 `backend`，数据面挂在 `forms`，`get domain()` 取 domain 形态；
- `@deepseek-ai/dsh-storage-json` —— `config: { root: !!js dshHomePath('storages') }`；
- `@deepseek-ai/dsh-storage-domain` —— `async open(spec)`（`lib/index.js`），返回带表/键/校验的 domain，并 `provide("storageDomain", facility)`；
- **官方自己就是这么存同类东西的**：`@deepseek-ai/dsh-session-projection-cache` 的注释原文
  "per-record layout — one version-stamped checkpoint document per session"，数据落在 `session_projcache` domain 上。
  也就是说"按会话存一份带版本号的检查点"这件事，官方已经有先例，而且走的是 storageDomain。

**所以按第〇条第 3 点，这是一处自建旁路。保留它的理由（三条，都不是"更好用"）：**

1. **这份数据是派生物，必须能整目录删掉重算**。`FOLD_CACHE_VERSION` 变化、节假日表更新、会话日志回滚，
   都是"作废重算"；而 storageDomain 把数据当 **durable**：`open(spec)` 会 `await unit.loadAll()` 后
   **逐条**过 `valueSchema.parse`，不合法要 `invalidRecords: 'backup-and-skip'` 搬走并记日志。
   给一份按设计就该丢弃的缓存背上迁移语义，是把成本放到错的一侧。
2. **`open()` 是急加载的，而缓存只该懒读**。本机实测（2026-10-30）：258 个会话、合计 **12 MB**、
   最大单条 1.6 MB、中位数 7 KB。今天 12 MB 还能接受，但这是**随历史线性增长**的派生物 ——
   把它变成"每次激活先把全部记录 parse 一遍"，等于把刚修掉的启动开销换个位置搬回来
   （对照：404 MB 日志的读取+解压是 12.5 s，热启动靠懒读压到 0.08 s）。
3. **插件零运行时依赖**（只有 schemastery）。domain 的 `valueSchema` 需要一个校验器；为缓存引入 zod
   或自写一套 schema，只为校验我们自己写出去、自己也认得出的 JSON，不划算。
   另外缓存按后端 `revision` 整条覆盖、不需要变更事件 —— 而那正是 storageDomain 相对自由命名空间多出来的部分。

这三条都是**可复核的事实**（服务实现、实测字节数、依赖清单），不是"我觉得它不好用"。一旦第 2 条的前提变了
（缓存不再随历史增长，或官方给 domain 加了懒加载/只读视图），这处旁路就应当按下面的路径迁走。

**升级路径**（一旦出现"跨实例共享/可见性/诊断要统一"的需求，按这个走，不要再加第三个目录）：

```js
const domain = await ctx.storageDomain.open(defineDomain({
  name: 'dsh_usage_fold',
  tables: { sessions: { valueSchema } },
}))
ctx.effect(() => () => domain.close(), 'usage: fold domain')
```

`readEntry/writeEntry` 换成 domain 的读/写，`FOLD_CACHE_VERSION` 变成 `version` 字段（domain 自己会校验）。

**可核**：`tests/fold-cache.test.js`（原子写 / 签名 / 不做 prune）把行为钉住；
`last-pass.json` 是**诊断面**不是数据面 —— 删掉它不影响任何统计，`response.scan` 里也有同一份摘要。

**为什么一次查询会启动一轮全量扫描（读请求带写副作用）**

第〇条第 3 点讲"不自建旁路"，但这里还有一条更微妙的：**查询不该有副作用**。我们明知故犯，
因为不这么做，加载态根本不可能被看见：

- 全量统计（含缓存水合）暖缓存 **0.78 s**、冷缓存 **~12 s**（实测，见上）；
- 面板是**按需挂载**的：用户点开 设置 → 用量统计 时，进程启动早就过去了。

所以若在 `apply` 里开扫，那 0.78 s 永远发生在用户打开面板之前 —— 代码里有加载态、屏幕上一帧都没有
（这条我们踩过：连着重启十几次都"没有加载动画"）。现在改成 `handlers.set('query')` 里调
`startBackfillOnDemand`：**面板打开的那一刻就是统计开始的那一刻**，骨架屏与
`正在统计 n/N 个会话…` 的可见时长等于工作本身的时长。

代价与边界，写在这里免得上游 review 当成性能回退：

1. 查询是**幂等**的：`state.backfill.started` 闩住，只有第一次查询真正启动；
2. 写入的只是**派生物缓存**（`cache/dsh-plugin-usage/fold`，可整目录删除），不碰用户数据、不写设置；
3. 后台任务**不可能弄死宿主**：`void runBackfill(...).catch(...)` 兜底，日志经 `safeLog()`
   —— 这两条是实际事故的产物（`logSink(...).warn is not a function` 直接把 dsh 打挂过）；
4. 门：`tests/lazy-backfill.test.js`（首次启动 / 幂等 / 无持久化立即 done / 接线门 / 坏 logger /
   `ctx.get` 抛异常），其中接线门断言 `apply` 里不得再出现 `runBackfill`，防止有人"顺手"改回启动时预热。

---

## 4. 已经和原生对齐的部分（同样取证过，别再改回去）

| 项 | 位置 | 官方对照 |
|---|---|---|
| 词典注册/绑定 | `ctx.effect(() => ctx.locale.register(NS, {zh, en}))` + `ctx.locale.bind(NS)` | 官方 `dsh-client-ui-settings-plugin-inventory` 的 `apply`（同形） |
| 设置分区注册 | `ctx.slots.inject('settings.section', () => ctx.slots.register({name, id, order, label, locale}, C))` | 同上（官方也不把 `slots.inject` 包进 `ctx.effect`） |
| 客户端 bundle 契约 | 构建产物 `window.__ModuleLoader__.load({id, factory})` | 任一官方 `*.client.js` |
| 日志 | `ctx.logger`（`ctx.get('logger')` → `ctx.logger` → `console` 兜底） | 官方插件用 `ctx.logger.*` |
| 会话用量 fold | 自己折叠事件（官方 `tokenUsage` 只有会话级总量，没有分模型/分时刻） | 由 `tests/fold-parity.test.js` 拿官方 fold 的录制结果对账 |
| client→host | 原生 typert Remote（贡献 + 接收方服务），Fetch 作兜底 | 见上面 §2，`npm run verify:typert` 用官方校验器验 |
| 错误上页面 | 宿主只发稳定码 `internal`，界面按码出话，堆栈进日志 | 库经验⑪ |
| 配置 | schemastery `Config` + `ctx.settings.update('usage', patch)` | 原生配置路径 |
| patch 行 | `cordis.patch.yml` 里 `id: usage` | 库经验⑧ |
