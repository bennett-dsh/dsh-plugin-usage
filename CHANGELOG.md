# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-10-24

输入区成本 pill：把「今天花了多少」搬到 composer 旁边，并对齐 DSH 0.2.1 的 dock 契约。

### Added

- **输入区成本 pill**（`conversation.composer.dock`，id `usage-cost`，order 2）：显示今日
  参考成本，今日无调用时不占位；title 里带调用次数与 Token。宿主自己的 `usage` pill
  显示的是 token 数（读官方 `tokenUsage` 投影），两者互补。
  - 复用了设置页同一条 `usage/query` 通道，**按记录里的 provider/model 精确计价**，没有
    用官方投影算钱：投影只有会话内合计、不带模型归因，用它计价会把不同单价混成一个数
    （正是 v0.3 修掉的问题类）。
  - 口径是「今日」而不是「本会话」：宿主渲染这个 slot 时是
    `renderSlot("conversation.composer.dock", {})`，dock 条目拿不到会话标识。
  - 币种跟随设置页的 ¥/$ 选择（读宿主动态解析的 `currency.symbol`，不写死符号）；
    回填（backfill）进行中用 3s 快重试，完成后回到 30s 轮询；页面重新可见时立即刷新。

### Changed

- **`dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-conversation`**：dock slot 归该模块
  所有，静态 bundle 只有声明了才能在运行时拿到它。
- 兼容性：`engines.dsh` 仍是 `>=0.2.0-rc.2 <0.3.0`；0.2.0 没有这个 slot，注入失败只
  告警、不影响设置页（`try/catch` 包住）。

### Tests

- 83 → **87**。新增 `tests/client-dock.test.js`：dock 注册契约（slot 名 / id / order）、
  不再注册旧 `stats` 行 ID、`dsh.client.inject` 必须声明 slot 归属模块、pill 的币种符号
  必须来自宿主动态解析（防止 USD 视图印出 ¥）。

## [0.3.0] - 2026-10-19

设置页仪表盘的可用性与观感版本：修掉两处「看着正常其实不能用」的交互，补上
区间、币种与模型占比，并把控件对齐到 shell 的原生观感。

### Fixed

- **模型下拉勾选一个就塌缩（P1）**：宿主先按已选模型过滤、后登记候选，响应里的
  `models` 只剩已选中的那个。现在先登记候选再过滤；`models` 项直接带 `key`
  （`compositeModelKey` 的结果），客户端不再自己拼 `provider/model` —— 顺带修掉
  provider 为空时拼出 `/model`、选中后所有行都不匹配、整页归零的静默空结果。
- **模型/日期浮层被设置面板裁掉**：设置面板是 `overflow: hidden`，绝对定位的浮层
  右半边被切。改用 `useFixedPanel`：按锚点实测位置 `position: fixed`、视口夹取、
  下方空间不足时上翻。顺带补 `.tsd-model-popover` 缺失的 `box-sizing`。

### Added

- **「全部」区间**：`rangeFor('all')` 取 `[0, now)` 并关掉 `fill`，真实边界是宿主的
  `MAX_BUCKETS` 而不是天数；同时删掉「最长 30 天」这句假限制（date input 本来就没有
  min/max）。
- **模型占比卡**：KPI 网格第 6 格，按总 Token 显示前 4 个模型 + 「其它」，悬浮/聚焦
  切换说明行，明细走各段 `title`（与明细表同一口径，含未定价判定）。
- **参考成本币种切换**：¥ / $ 切换器在参考成本卡的值行最前，切换后重查；宿主
  `query` 收 `currency`、在输出边界按固定 7:1 折算并回传实际使用的 `{code, symbol}`；
  小于半分显示 `<0.01`。
- **插件图标**：`package.json#icon` + `icon.svg`（同时进 `files[]`），插件卡片与设置页
  导航行共用同一图形。

### Changed

- **价目表基准明确为美元**：内置默认价（0.27 / 1.10 / 0.07 USD 每百万 Token）此前
  直接配 `¥` 显示，比官方人民币价低约 7 倍；现在按 7:1 折算，显示数字随之变为官方
  人民币价位。价目表与「未定价」判定本身不变。
- **文案**：卡片与表头的「成本」改为「参考成本」（英文 `Est. cost`），它确实是按
  价目表估算、不是账单。
- **刷新按钮**：34px 描边方块改为 28px 透明图标按钮，图标换成 DSH 原生 16 网格
  stroke 1.5 的刷新字形；请求中 `disabled` + `aria-busy`。
- **`SvgIcon`** 支持自带 `viewBox` / `strokeWidth` / 多段 `paths` 的图标定义，字符串
  写法仍是 24 网格 stroke 2 的简写。

## [0.2.2] - 2026-10-18

按 DSH 0.2.x 官方 API 审计后的正确性版本：修复「UI 正常但数据恒为空」的数据管道，
对齐官方 token 口径，价格表改走官方插件 Config。

### Fixed

- **数据管道在 0.2.x 上完全失效（P0）**：0.2.x 的 `Session` 没有 `.events`
  （应为 `session.snapshotEvents(fromSeq)`），`sessionPersistence.list()` 返回
  `{ header, revision, eventCount? }` 而非带顶层 `id` 的快照，且 `readFrom()` 不存在
  （应为 `open(id, 'read')` → `handle.read(offset)` → `close()`）。旧实现因此两条
  扫描路径都静默产出 0 条记录、backfill 仍报 `done`。现在改用上述官方访问器，
  并保留旧字段/`readFrom` 回退以兼容更早版本。
- **计费口径对齐官方 `tokenUsage` 投影**：`assistant/attempt`（重试/失败但仍计费的
  调用）按其 stream 内最后一个 `usage` chunk 计数；`llm/retry-started` 关闭
  `(turn, step)` 的替换槽，使重试后的调用**累加**而不是覆盖；无 `message.source`
  的结算按最近的 `request/context` / `request/header` 路由归因；`usage.totalTokens`
  有值时不再自行加总。
- **fork 会话重复计费**：按 `inheritedEventCount` 跳过父会话前缀。
- **日志截断/格式迁移后水位卡死**：用快照的 `eventCount` 检测日志缩短并复位水位与
  替换槽。
- **价格持久化死代码**：删除不存在的 `ctx.settings.register(...)` /
  `usage.prices` 命名空间路径；价格表改为导出的 schemastery `Config`（官方插件配置
  面，落 profile patch），`apply(ctx, config)` 读取并在默认价上合并用户价。
- **客户端定价通道**：`ctx.settingsScope` 在 0.2.x 不存在，改走官方
  `ctx.configForms.get('usage')`（`getSnapshot()/set()`），缺失时回退
  `usage/prices` RPC。

### Changed

- **持久化扫描跳过未变日志**：按 `revision` 变更令牌跳过，避免每 30s 重开全部会话。
- **包元数据**：新增 `engines.dsh = ">=0.2.0-rc.2 <0.3.0"`、`engines.node >= 22`、
  `dsh.manifestVersion`；`react` 移出 `peerDependencies`（官方由 shell module table
  提供，避免装第二份 React）；`@deepseek-ai/cordis` peer 收紧到 `~4.0.5`。
- **新增依赖** `@deepseek-ai/schemastery`（Config schema，官方同款）。
- 价格表补充 `deepseek-v4.1-flash` / `deepseek-v4.1-flash-1017` 默认价，并映射 DSH
  默认路由模型 `group/auto-deepseek-v4-1-flash`（否则原装环境所有会话显示「未定价」、成本为 0）。

### Added

- **CI**：`.github/workflows/ci.yml`（Node 22/24：install → build → test → bundle id
  契约 → tarball 内容检查）；发布工作流增加 tag/version 一致性、构建测试与打包校验。
- 新增 `tests/scan.test.js`（0.2.x 访问器、fork 前缀、revision 跳过、水位修复、
  旧 API 回退）、`tests/config.test.js`，并补齐 fold 的重试/attempt/归因用例
  （`npm test` 共 77 例）。

[0.2.2]: https://github.com/bennett-dsh/dsh-plugin-usage/compare/v0.2.1...v0.2.2

## [0.2.1] - 2026-10-18

修复 DSH 0.2.x 静态安装下的两个静默失败（[#1](https://github.com/bennett-dsh/dsh-plugin-usage/issues/1)）：
查询全部 405、以及非 `dsh-plugin-usage` 包名下客户端 bundle 不注册。

### Fixed

- **`/usage/*` 通道在 0.2.x 上未挂载（查询一律 HTTP 405）**：`connection.rpc.handle`
  经 `owner.webServer.register` 挂载物理前缀路由，而 `owner` 是**读取服务的那条 fiber**
  ——本插件只 `inject: ['timer']`，该访问在 cordis 严格代理下抛
  `cannot get property "webServer" without inject`，`effect()` 再把同步异常重抛，
  通道因此静默消失。静态安装改为注册 Connection 共享 `/api` 通道的 exact Fetch 路由
  （`connection.fetch.register`，不触碰 `webServer`），浏览器侧先打
  `POST /api/usage/<endpoint>`，旧版宿主返回「路由缺失」时自动回退到 `/usage` 前缀通道。
- **客户端 bundle 硬编码 loader id**：宿主按最近的 `package.json` 解析包名并在该 key 下
  提供 factory，硬编码的 `dsh-plugin-usage` 会让 scoped 名 / npm alias / `file:` tarball
  安装永远等不到 factory，renderer 只报 `Renderer boot failed for 1 plugin(s)`。构建脚本
  改为从 `package.json#name` 派生 id。
- **npm 页面截图破图**：`package.json#files` 补上 README 引用的 `image.png` /
  `image-1.png`。

### Added

- **传输层回归测试**：`tests/rpc.test.js` 覆盖 Fetch 路由挂载、旧通道回退、异常隔离、
  harness / Typert 分支；`tests/build-client.test.js` 覆盖 id 派生（含 scoped 安装名）与
  构建产出，`npm test` 共 53 例。

[0.2.1]: https://github.com/bennett-dsh/dsh-plugin-usage/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-08-18

Token 用量统计插件的重要版本：内部架构重构（host 拆分为模块）+ 12 项功能/健壮性改进
+ 3 个真实运行环境修复。UI 保持兼容，数据口径更准确，价格表支持官方设置持久化。

### Added

- **价格表持久化（官方 settings 命名空间）**：host 注册 `usage.prices`，settings 服务可用时
  写入 `~/.dsh/settings.yaml` 并自动出现在官方「设置 → 插件」配置面；不可用时降级为进程内存。
- **增量聚合索引**：按日切片索引取代每次查询全量扫描，折叠时同步维护，支持
  `pruneBefore(size)` 内存控制。
- **backfill 并发与进度**：批量并发（8/批）+ 每会话失败指数退避 + `onProgress/onDone` 回调
  + 重叠 pass 防护；客户端在回填完成后自动刷新一次。
- **官方 Typert 网关接入路径**：`ctx.get('typertGateway')` 可用时注册 usage 通道，否则
  自动回退连接桥（零新增依赖，前向兼容）。
- **客户端 settingsScope 计价通道**：优先走官方 `ctx.settingsScope`，缺失时回退 usage/prices RPC。
- **单元测试**：node:test 37 例覆盖 time/settings/fold/aggregate/query/state，`npm test`。
- **构建产物 sourcemap**：客户端 bundle 内联 data-URI source map，缺失源文件时构建显式失败。

### Changed

- **host 模块化**：`src/host/index.js` 拆分为 settings/state/aggregate/fold/scan/query/
  rpc/client-source/time 十个职责模块（行为不变的重构）。
- **用量折叠按会话 (turn, step) 去重**：同一 (turn, step) 的后续 usage 样本替换先前样本，
  不再重复计数（更接近官方 token-meter 语义）。
- **模型聚合改按 `provider/model` 复合键**：多 provider 同名模型在明细表中分行展示。
- **未定价判定改用显式价格条目（`hasPrice`）**：显式配置为 0 价的模型不再误标「未定价」。
- **时间桶计算改为本地午夜序数**：跨时区/夏令时日历日与 step 网格一致。
- **客户端源码路径改为 `import.meta.url` 相对解析**：消除硬编码绝对路径。
- **客户端 RPC 优先走 `ctx.remote`**，缺失时回退 host/connection 桥。
- **客户端注入收敛**：`dsh.client.inject` 去掉未使用的 ui-sidebar，声明 locale/slots 服务。
- README 更新为新模块结构、去重口径、开发与测试说明。

### Fixed

- **host 启动崩溃**：`ctx.typertGateway` 直接属性访问在 cordis 严格代理下抛
  `cannot get property without inject`（改用 `ctx.get`）。
- **设置页入口不注册**：客户端 `ctx.slots ?? ...` 在严格代理下抛错导致
  `settings.section` 槽位注册被跳过（改为先 `ctx.get('slots')` + 声明注入，并使
  「用量统计」入口恢复正常）。
- 修复本机 Node 下 `node --test tests/` 目录参数不可用的问题（脚本改用 glob）。

### Security

- 无已知安全问题；价格等配置仅经本地 loopback RPC/官方 settings 传输。

[0.2.0]: https://github.com/bennett-dsh/dsh-plugin-usage/compare/v0.1.4...v0.2.0
