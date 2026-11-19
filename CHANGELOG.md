# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.7.0] - 2026-11-19

**价目表不再只能等发版：任何用户都能在界面里一键把最新的价目与节假日历拉下来。** 这一次同时是两条管线的重构 —— 页面解析变成一条共享链路，峰谷分桶从折叠缓存里拿掉，于是「换历」从「全量重扫 441 个会话」变成「重建索引 12 ms」。没有新增按钮，没有定时任务，激活时不联网。

### Added

- **运行时拉取最新价目与节假日历**（`usage/refresh` 端点 + 定价弹窗底部「拉取最新定价」）。宿主并行抓 opencode Zen 目录页、DeepSeek 官方定价页与 `holiday-cn` 年历，解析 → 各自过校验 → 换表 + 换历 → **一次原子写**落到 `<DSH_HOME>/cache/dsh-plugin-usage/reference/table.json`，下次启动自动沿用。
  - 年份范围按手上的用量记录算并向后再顺延一年（与生成器同一条规则），所以历史会话那一年不会被漏掉。
  - 价目与日历**同一份落盘记录**，不会出现「价是新的、历是旧的」这种看着新鲜实则算错的状态。
  - `{ reset: true }` 一键回退到随包发布的那张表与那份历（`referenceOrigin` / `holidayOrigin` 供界面标记「内置 / 已更新」）。
  - 实机（实例 30221）：**677 ms**、92 个模型 + 90 个节假日日期、`saved=true`；重建索引后总调用数只按真实新增增长（9105 → 9108），没有丢也没有重复计费。
- **失败按原因分家**：`network` / `timeout` / `http` / `too-large` →「连不上价目来源」；`parse` →「页面结构变了」；`table-invalid` →「拉到的价目表没通过校验」；`unsupported` →「环境无 fetch」。**日历拉不到不算整体失败**：价目照常生效，只多一句「节假日历没拉到，峰谷判定仍按内置历」。
- **新测试文件** `tests/reference-refresh.test.js`（13 项），fixture 是 **2026-11-19 的真实页面响应**（`tests/fixtures/pricing/`）：页面改版会在测试里红，而不是在用户的账单上红。

### Changed

- **解析、合并、校验收成一份**：`src/host/reference-parse.js`，生成器与运行时都 import 它。`scripts/gen-prices.mjs` 从 480 行降到 260 行，`--offline` 重生成与旧产物逐字段一致。两份 parser 是「CI 绿、用户拉到旧读法」的标准成因。
- **换表与换历各只留一个插槽**：`pricing.js` 的 `active`（`setReferenceTable` / `referenceOrigin`）与 `peak.js` 的 `active`（`setHolidayCalendar` / `holidayOrigin`）。阶梯的每一级、账单与价格显示都通过它们读，不会出现一半新一半旧。
- **折叠记录不再存峰谷分桶**（`fold.js`）。分桶是 `record.time` + 日历的纯函数，存下来有两个代价：缓存签名被迫绑定日历（换一次历全量重扫，本机 441 会话），以及记录可能保留一个已被新日历否定的档位。改为建索引时现算，`aggregate.rebuildIndex` 就是换历后的那一步。
- **`foldSignature()` 只留版本号**（`FOLD_CACHE_VERSION = 2`）；v1 条目仍可读（`legacyFoldSignature` 命中后 `stripDerived` 丢掉分桶），**升级不重扫**。
- **`holiday-years.js` 从 `scripts/lib/` 移进 `src/host/`**：运行时也要用 `holidaySpan` 决定拉哪几年。
- `logSink` 增加 `info` 档（宿主 logger 有 `info` 就走它，没有退回 `warn`）。

### Fixed

- **`prices.yml` 连挂三周**（11-02 / 11-09 / 11-16）：`writeFileSync` 往干净 checkout 里不存在的 `.cache/` 写快照 → `ENOENT`，生成器 0.2 s 内死掉，内置价目表因此停更 19 天。改为先 `mkdirSync(recursive)`，且**写快照失败只 warn**：缓存是优化，不该决定运行成败。
- **价目刷新后有条用例必红**：「字面行优先于推断」的夹具钉了 `glm-5.3-flash-free`，上游把它删了 → `how` 从 `normalized` 掉到 `variant`。夹具改为**从表里推导**（找一条带变体后缀、基座另有一行且价格不同的已发布行），上游再删模型也不会误红。
- **加载中点「确定」会静默关窗**：此时 `draft` 为空，`submit()` 直接 `onClose()`，用户以为保存成功。按钮 `disabled` 与 `submit()` 开头各加一道守卫。
- **成功日志记成 `warn`**：`logSink` 只有 error / warn 两条路，「拉取成功」和「写盘失败」在日志里长得一样。现在成功走 `info`。
- **停更 19 天的错账**：`gemini-3.6/3.7/3.8-flash`、`claude-sonnet-5-5`、`gpt-6.1-sol` 的缓存读价**腰斩**（如 0.15 → 0.075、0.2 → 0.1）此前没进来，按两倍在算。

### Data

- 内置价目表：89 → **92** 行（Zen 88 → 91），新增 14 / 删除 11 / 改价 6，长上下文加价档 15 → 18，下线公告 18 → 25，促销 2 → 6。
- 内置节假日历：61 → **90** 天（2027 年安排已公布，覆盖 2025–2027）。

### Tests

- **254 → 269**。新增 `tests/reference-refresh.test.js`（真实页面解析、校验拒绝四种坏表、五个失败 code、store 往返、v1 兼容、换历重建索引、8 语言键齐）；`tests/query.test.js` 新增「同一批记录在重建前仍是旧价、重建后换价」；`tests/fold-cache.test.js` 把「签名含日历」改成「签名只有版本 + v1 可读且丢分桶」；`tests/tier-billing.test.js` 里 6 项从「分桶字段」改写为「按 `record.time` 计价 + 换历即换价」；`tests/i18n.test.js` 钉值 134 → **146**。

### Verified

- `npm test` → **269/269 通过**；`check-docs` → **28 篇**文档链接与锚点全部有效。
- `npm run verify:typert` → **5 端点** OK（官方 `validateTypertManifest`）；`npm run verify:remote` → **7/7 PASS**（含一个 async handler）。
- 本机实例（内核 `0.2.2-rc.5`）：`usage/refresh` 677 ms 返回 92 模型 + 90 日期；落盘文件 16 KB，`version 2`，同时含 `table(92)` 与 `calendar(90)`；`{reset:true}` 两样一起回内置并删除落盘文件。
- 度量（本机 441 个会话缓存 / 5.4 MB / 13,826 条记录）：整套缓存 JSON 解析 131 ms、按 `time` 重新分类 16.7 ms、重建聚合索引 **11.7 ms** —— 对照全量重扫会话日志 12.5 s+。

### Notes

- 内核基线抬到 **`0.2.2-rc.5`**（`verifiedAgainst`）；`engines.dsh` 仍为 `>=0.2.1-rc.3 <0.3.0`，`@deepseek-ai/cordis` 仍为 `~4.1.0`。
- 落盘的 v1 payload（0.6.x 时代拉取过的表）会因 schema 版本不匹配被当作「没有」，回落到内置表 —— 缓存，无损失。
- 有意不做：卡片按钮直接联网（仍是开弹窗，避免误触即请求、且卡片上没有位置放进度与错误）、打开弹窗自动拉取（价目按周变，每次开弹窗都联网既慢又会在没有用户意图时弹横幅）。

## [0.6.2] - 2026-11-15

**两处小改动：未定价提示变成入口，客户端 bundle 加了一道构建期契约门。** 没有新增界面，没有新增 i18n 键，内核基线不变。

### Fixed

- **成本卡的「N 次调用未定价」现在点得动**。它原本是死文本 —— 读得到、点不动，用户只能回头找卡片右上角那颗小图标才会到定价弹窗。现在它本身就是一个按钮，调的是同一个 `onOpenPricing`。
  - 不需要预选参数：弹窗的待选表本来就把 `state === 'none'` 的行排在第一张表（`pendingRows` 在前、`matchedRows` 在后），点进去就已经在正确的位置。
  - 复用 `pricingOpen` 作为 title / aria-label —— 那颗图标按钮用的也是这个键，两处入口因此指向同一件事。**8 本字典零改动。**
  - 配套 `.tsd-card-note-action` 抹掉 UA 按钮的边框、底色与居中；警告色与 11px 字号保持不变。

### Changed

- **`scripts/build-client.js` 增加 bundle 契约门**。`src/client/index.js` 是动态插件沙箱的 apply 函数体，会被整段拼进 loader factory，所以里面出现顶层 `import` / `export` 就是运行期语法错误 —— 而此前没有任何环节拦得住它：`tsc` 跑的是 `allowJs` + `checkJs:false`，构建脚本又是盲拼。失败的形态最糟：构建成功、页面白屏，渲染器只报 `Renderer boot failed for 1 plugin(s)`，不指认原因。
  - 新增 `hasModuleStatement()`，锚定行首，所以注释、字符串、CSS 模板字面量里的同名词不算语句；`renderClientEntry()` 发现即抛错，并说明「这是沙箱 body，必须 import-free」。
  - 这道门只在贡献者与 CI 生效：`scripts/` 不在 `package.json#files` 白名单里，不会进任何人装到的包，因此不值得为它单独发版。

### Tests

- **250 → 254**：`tests/build-client.test.js` 新增 3 项（判定函数本身、带 `import` 的 body 被拒、本仓库真实 body 仍 import-free 且仍返回 `{ inject, apply }` 描述符）；`tests/client-slots.test.js` 新增 1 项（提示必须是接 `onOpenPricing` 的按钮，且 action 类保留 `border: 0` / `background: none`）。

### Verified

- `npm test` → **254/254 通过**；`node tools/check-docs.mjs` → 27 篇文档的链接与锚点全部有效。
- `npm run verify:typert` → 4 端点 OK；`npm run verify:remote` → 7/7 PASS。
- 发布包与本机树对账（以 0.6.1 的 npm tarball 为基准）：33 个文件中唯一不同的是 `lib/client/index.js` —— 正是本次重建推进的那个，其余逐字节一致；`0 missing`。
- 内核基线不变：`0.2.2-rc.3`；`engines.dsh` 不变（`>=0.2.1-rc.3 <0.3.0`）。

### Notes

- 版本口径落进 [MAINTAINING.md](MAINTAINING.md) 发版步骤第 2 条：**只有重大功能更新或重构才抬次版本号（`0.x` 的 `x`），其余一律只抬补丁号（`z`）**；纯文档、纯基线改动同样走补丁版。版本号绑的是发布，不是提交。

## [0.6.1] - 2026-11-14

**跟随本地 DSH NEXT 实例升级到 Harness `0.2.2-rc.3` 的对账版本**。代码零改动；只抬 `verifiedAgainst`、更新文档基线与重录 fold-parity fixture。

### Changed

- `dsh.verifiedAgainst`：`0.2.2-rc.1` → **`0.2.2-rc.3`**；`engines.dsh` 不变（`>=0.2.1-rc.3 <0.3.0`，不因抬基线缩小可安装范围）。
- README 中英与 `docs/reference/{compatibility,native-alignment}.md`、`docs/testing.md` 的验证基线同步到 `0.2.2-rc.3`（2026-11-14）。
- `tests/fixtures/token-usage-parity.json` 按文档重录：官方折叠在 rc.3 上给出**完全相同**的四个计数（1860 / 340 / 5910 / 100），只有 `provenance.version` / `recordedAt` 变化；未手改任何数字。

### Verified

- 官方升级指南：`v0.2.2-rc.1` 的 19 条逐条核对，**无一涉及**本插件使用的表面（Client 槽位、typert、`sessionPersistence`、`session/event`、locale、settings）；`v0.2.2-rc.2` / `v0.2.2-rc.3` 没有升级指南条目。
  - `plugin-update-method` 只影响消费 `BundleInfo` 的代码；`session-append-overloads` 只影响替换 `Session.append` 的代码；`window-drag-regions` 只影响自建浮层——三者本插件都不涉及。
- `npm test` → **250/250 通过**；`check-docs` → 27 个文档链接与锚点全部有效。
- `npm run verify:typert` → 4 端点 OK；`npm run verify:remote` → 7/7 PASS。
- 实机：`plugins.detail.section` 的 `usage-star`（order 80）、`settings.section.icon` 的 `token-stats`、`conversation.composer.dock` 的 `usage-cost` 均 active；宿主日志显示 `native typert Remote (4 endpoints)` 与扫描 pass 正常。

## [0.6.0] - 2026-11-05

**规范化版本**：公开/私有文档库、插件详情页求星行、8 语言全量适配。运行时行为与 0.5.1 相同，只新增一个详情页 section 与六本语言字典。

### Added

- **插件详情页底部的求星行**：注册官方 `plugins.detail.section`（id `usage-star`，order 80），在插件管理器详情页（组合包页 / 行页 / 官方插件页）底部追加一行「⭐ 用着顺手？给个 Star 支持一下」。要点：
  - 该槽在**每个**详情页都派发 `{ subject }`，条目按 `subject.pkg.name === 'dsh-plugin-usage'` 自过滤，其他插件页面返回 `null`；
  - 不注册 `plugins.row.config` —— 那个 keyed 槽会占用该行的配置页（本插件没有自建配置页，官方也不会为它自动生成页面）；`Config` 仍作为 durable 配置面，由仪表盘与 profile patch 写入；
  - 星形是 Unicode 字符，不自绘图标；**不新增链接**（仓库入口由宿主页脚提供）；颜色只用主题 token；
  - order 取 **80**，必须小于市场插件来源行的 90：那一行是页脚的「查看仓库↗」，求星提示要留在插件内容区、位于它上方。
  - 0.2.1 及更早没有这个槽，`inject` 不触发，页面只是少一行。
- **8 种官方语言全量适配**（zh / en / ja / de / es / fr / pt / ru）：客户端字典从 2 本扩到 8 本，每本 **134 键**、键集与占位符完全一致；`locale/*.json` 补齐 8 份 `meta.title` / `meta.description` / `meta.detail`（zh → `README.md`，其余 → `README.en.md`）。ja / de / es / fr / pt / ru 为**机器翻译（人工粗校）**，README 已披露并欢迎纠正。
- **README 中英双语**：新增 [README.en.md](README.en.md)，两版顶部互相切换；README 重排为「功能 / 安装 / 配置 / 数据来源 / 兼容性 / 文档 / 开发 / 安装硬规矩」。
- **公开文档库 `docs/`**：导航、设计、参考（装配/兼容/原生对齐）、指南（配置/排查）、经验（症状→根因→证据）、验收；`docs/native-transport.md` 迁入 `docs/reference/native-alignment.md`，基线更新为 `0.2.2-rc.1`。
- **私有文档库 `docs-private/`**：只有入口 README 入库；路线图、待办、决策记录、调研、本机环境、发版清单留在本机（`.gitignore` 排除）。
- **仓库规范文件**：`CONTRIBUTING.md`、`SECURITY.md`、`MAINTAINING.md`、`.editorconfig`、Issue/PR 模板。
- **文档链接门** `tools/check-docs.mjs`：校验公开文档的相对链接与锚点，接入 `npm test` 与 `npm run check:docs`。

### Changed

- `package.json`：版本 0.6.0；描述改为中英双语；补 `homepage` / `bugs` / `dsh-plugin` 关键词；`files` 增加 `README.en.md`（`meta.detail` 在安装包里必须能找到它）。
- `locale/zh.json` / `locale/en.json` 补 `meta.detail`；新增 ja / de / es / fr / pt / ru 六份 meta。
- 客户端 `ctx.locale.register` 注册 8 本字典；`apply` 末尾新增 `plugins.detail.section` 注册（失败只告警，不影响设置页与 pill）。
- README 的安装段改为「npm 优先、GitHub / 本地等价」，并保留 pnpm 同版本重装与运行中覆盖文件的硬规矩。

### Tests

- **238 → 250**：新增 `tests/i18n.test.js`（8 本字典键集 / 占位符 / 非中文无 CJK / 字面 key 全覆盖 / 8 份 meta 与 `meta.detail` / README 双语互链）与 `tests/client-detail-section.test.js`（构建产物注册、subject 自过滤、单行无链接、不占用 `plugins.row.config`、主题 token）。
- 实测：`node --test --test-isolation=none` → **250 项，247 通过**；3 项失败与 0.5.1 相同，均为 `tests/client-bundle-id.test.js` 的 `execFileSync(..., { stdio: 'pipe' })` 在 DSH 沙箱下返回 `spawn EPERM`（环境限制，非代码缺陷；CI 正常）。
- `npm run verify:typert` → 4 端点 OK；`npm run verify:remote` → 7/7 PASS。
- 本机（可写环境，2026-11-05）完整 `npm test` → **250/250 通过**，外加 `check-docs: 27 个文档，链接与锚点全部有效`。
- **测试卫生修复**：`tests/scan.test.js` 的两个 watermark / shrink 用例改传 `cache:false`。此前它们把虚构会话 `s1` 写进**真实** fold 缓存，导致同一台机器第二次跑测试时 `readEntry` 命中旧条目、跳过读取而失败（第一次全绿正是第二次红的成因）。见 `docs/experience/09-测试污染真实缓存.md`。

### Notes

- 改 `locale/*.json` 的插件标题/描述 → **重启应用**；改客户端字典 → 刷新页面即可。
- 0.6.0 同时是**版本号跳板**：pnpm 对同版本 `file:` 重装没有可靠路径，安装/升级必须先升版本（见 [MAINTAINING.md](MAINTAINING.md#安装与升级的硬规矩)）。

## [0.5.1] - 2026-11-05

### Changed

- **`usage/query` 每个模型只解析一次价格**：五级阶梯只是 `(provider, model)` 加价目表的纯函数，
  一次查询里不会变，原来却按记录逐条走，而且每条要走两遍（`lookup()` 一次，存储层 `costOf()`
  内部又 `lookup()` 一次），热力图对同一批记录再走第三遍。现在按 `provider/model` 记忆化一次，
  `costOf` 直接拿已解析的价目行计费；`ratesOf()` 按价格行对象缓存峰/谷两档的展开结果
  （价格变更时存储层是**替换**行对象而不是改字段，所以对象身份就是版本，缓存不会读到旧价）。
  - 实测（本机，按真实 fold 形状造的记录）：30k 条「今日 + 热力图」49 → 30 ms、「全部 + 热力图」
    132 → 62 ms；100k 条 171 → 100 ms、460 → 214 ms。
  - 语义不变：同一输入仍给出同样的 `daily` / `byModel` / `total` / `unpricedCalls`，`tests/query.test.js`
    的既有断言全绿；这次只是不再重复做同一件事。
  - 下一步（单独 PR）：把 day×model 聚合放到 fold 时增量维护，查询降到 O(天×模型)。

- **查询不再逐条记录聚合**：day 粒度改读 fold 时增量维护的「天 × 模型」汇总单元格，
  一次查询的代价从 O(记录数) 降到 O(天 × 模型)。成本不在单元格里存：价目表和用户确认的
  匹配随时可变，单元格只记 token，查询时按**当时**的费率计费。范围两端被切开的那些天
  仍回到记录扫描，所以「从 05:00 起」这类不按天对齐的区间依然精确。
  - 实测（本机，30k / 100k 条记录）：今日 + 热力图 30 → 2.5 ms / 100 → 7.0 ms；
    全部 + 热力图 62 → 3.5 ms / 214 → 2.8 ms；全部（不带热力图）41 → 1.0 ms。
  - 数值等价：除 `cost` 的末位（≤ 3.2e-16 相对误差 —— 单元格先加 token 再计价，浮点加法
    不满足结合律）以外，`daily` / `byModel` / `total` / `unmatched` / `models` / `heatmap`
    与逐条路径逐字段一致；`¥` 视图本来就按 1e-6 取整，显示值不变。
  - 完整性守卫：只有 `index.size() === state.records.length` 时才读汇总单元格；绕过 `add()`
    直接塞进 `state.records` 的记录会让查询退回记录扫描（那条路径本来就有防御性补扫），
    宁可慢也不给出半份汇总。
  - 内存代价：每 (天 × 模型) 一个 13 个数字的单元格。本机 75 个会话、9,358 条记录量级下
    可忽略；单元格随 `pruneBefore()` 一起被裁掉。

- **客户端 bundle 不再内联 base64 sourcemap**：`scripts/build-client.js` 原来把整份源码塞进
  `//# sourceMappingURL=data:...`，产物因此是源码的两倍多。0.5.0 的 `lib/client/index.js`
  是 415.8 KB（gzip 130.2 KB），其中 240 KB（gzip 77 KB）是这份调试附件 —— 每个 web 客户端
  启动都要下载它。现在默认不产出 map，同一个源码的产物是 175.9 KB（gzip 53.2 KB）。
  - 需要调试时 `DSH_USAGE_SOURCEMAP=1 npm run build` 会另写 `lib/client/index.js.map`，
    bundle 里只留一行外部引用（与官方 bundle 的 `//# sourceMappingURL=client.js.map` 一致）。
  - `package.json#files` 增加 `!lib/client/*.map`：即使本地带 map 构建，map 也不会进 tarball。

- **折叠缓存的读写改成异步，且只写真的变了的会话**：`readEntry` / `writeEntry` 原来用
  `readFileSync` / `writeFileSync`，冷启动一轮 258 个会话的写盘要 137 ms，这 137 ms 里宿主
  线程完全被占住（agent loop 一起停）。现在走 `fs/promises`，按 8 个一批并发。
  - 实测（本机，258 会话 × 117 条记录）：同步一轮 137 ms、最长事件循环停顿 **137 ms**；
    异步一轮 84 ms、最长停顿 **6 ms**。
  - 增量：一轮扫描只为**折叠记录真的变了**的会话写盘（`state.epochs` 在每次插入或原地替换时
    自增）。只追加工具调用、文本这类不产生用量的事件时文件保持原样 —— 那本来是最常见的写盘来源。
  - 原生卫生门随之收紧：`src/host` 里不再有任何同步写调用，`tests/native-hygiene.test.js`
    的 fold-cache/scan 豁免已删除。

- **删掉分叉的 `src/client/styles.js`**：它没有任何引用（真正生效的是 `src/client/index.js`
  里的内联 `const CSS`），内容还停在旧版本 —— 少了 104 个现存选择器、还留着 9 个已删的，
  改它不会改变屏幕上的任何东西。沙箱 body 没有 import，样式必须随 body 走，所以内联串是
  唯一可行的形态，重复的那份删掉。
  - 顺带：`npm run build` 现在先清 `lib/`，删掉的源文件不会以旧构建产物的形式继续被打包。

- **活跃会话改成 `session/event` 推送**：原来每 2 s 调一次 `scanLive`，读侧是
  `session.snapshotEvents()` —— 0.2.1-rc.4 已标 deprecated（"new calls are prohibited"），
  而且每次都把同一段日志重走一遍才发现没有新东西。现在每个事件提交即折叠一次
  （`ctx.on('session/event')`，监听器随 fiber 卸载），2 s 轮询删除；30 s 的持久化扫描保留，
  既按 `revision` 跳过未变日志，也兼作补漏（激活前就在跑的会话、或扫描途中提交的事件）。
  - 连带修掉一处会重复计费的隐患：`watermark` 领先于持久化事件数时，原来会被当成「日志变短」
    而把整段日志从头重折 —— 重试过的 attempt 会因此被重复计费。现在用「本进程见过的最大
    持久化事件数」（`state.persistedCounts`）判断是否真的变短，落后的日志只从水位继续读。
- **设置页导航图标改用官方 `settings.section.icon`**（0.2.2-rc.1 新增：list / inline / root，
  由 `@deepseek-ai/dsh-client-ui-settings-general` 的 nav rows 以 `{size, active}` +
  `only: row.id` 渲染）：注册 id 必须等于 section id（`token-stats`），对不上的 id
  **永不渲染、也不报错**。删掉 0.2.1 时代的 DOM 补缺（属性标记 + CSS mask + MutationObserver）——
  那正是它自己注释里约定「官方补上就整体删除」的 L2，现在不再碰 React 管理的节点。
  **旧内核没有这个槽时 inject 不触发，行内图标退化成官方齿轮，其余一切不变。**
- `@deepseek-ai/cordis`（peer + dev）`~4.0.5` → `~4.1.0`；`@deepseek-ai/schemastery`
  `~3.18.5` → `~3.19.0`，与 0.2.2-rc.1 宿主自带的版本一致。
- `dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-settings-general`：图标槽归该模块所有，
  静态 bundle 只有声明了才能在运行时拿到它。
- `dsh.verifiedAgainst`：`0.2.1-rc.4` → `0.2.2-rc.1`。`engines.dsh` 不变 ——
  0.2.2-rc.1 仍落在 `>=0.2.1-rc.3 <0.3.0` 内（DSH 用 `includePrerelease: true` 判定）。

### Tests

- 224 → **226**：`tests/query.test.js` 新增两条 —— 一条数 `lookup()` 的调用次数（两个模型、
  三条记录、带热力图，必须恰好两次解析），一条钉住「价格行被替换后按新价计费」，
  防止按模型记忆化把旧价缓存下来。
- 226 → **229**：`tests/query.test.js` 再增三条 —— 汇总单元格按每条记录自己的峰/谷档计价、
  不按天对齐的区间只算区间内的记录、以及「汇总路径 vs 逐条路径」逐字段对账
  （cost 允许 ≤ 1e-12 相对误差）。
- 229 → **230**：`tests/build-client.test.js` 把「bundle 不带任何 sourcemap」和「`sourcemap: true`
  时写外部 map 并引用它」钉住，另加一条产物体积门（bundle 不得超过源码 + 2 KB，
  防止有人把源码再抄一遍回去）。
- 230 → **231**：`tests/fold-cache.test.js` 新增「只追加了不产生用量的事件时，缓存文件不被重写」
  （用一个只有没被重写才能活下来的标记来断言）；`writeEntry` 的异步契约也钉住（返回 Promise）。
- 231 → **232**：`tests/native-hygiene.test.js` 钉住「样式只有一份，就在客户端 body 里」——
  `src/client/styles.js` 必须不存在、`src/client/` 下只有 `index.js`。
- 232 → **234**：`tests/scan.test.js` 换成推送路径的门（事件折叠、fork 前缀不重复计费、
  重复投递不重复计费、坏事件不抛、落后的持久化日志只从水位续读、真变短的日志才从头重折）；
  `tests/native-hygiene.test.js` 钉住 `apply` 必须订阅 `session/event` 且不得再出现 `scanLive`。
- 234 → **238**。新增 `tests/client-settings-icon.test.js`：图标注册 id 必须等于 section id、
  旧 DOM 补缺必须删净（留一条就是同一行画两个字形）、图标按 `size` 渲染且只用 `currentColor`、
  `dsh.client.inject` 必须声明槽位归属模块。

### Verified

- 0.2.2-rc.1 上 `npm test` 全绿（238）、`verify:typert`（4 端点）与 `verify:remote`（7/7）通过。
- 与 0.2.1-rc.4 逐文件比对：会话持久化 `list()` / `read(offset, length, options)` 签名未变，
  `tokenUsage` 投影字段未变（只有 `contextPressure` 多了 `summary: false`），
  `settings.section` / `conversation.composer.dock` 槽位契约未变。

## [0.5.0] - 2026-10-31

基于 0.4.0（输入区成本 pill）发布；`0.4.1`–`0.4.8` 以及本地标注为 `0.4.0` 的定价改造都是
开发迭代（未单独发布），逐条明细在文末保留。

### Added

- **参考价目表与逐级匹配**：内置 opencode Zen + DeepSeek 价目（`src/host/prices.js`，由
  `scripts/gen-prices.mjs` 生成），查询走 `resolvePrice` 的唯一阶梯：用户自定义价 → 用户确认的匹配 →
  按名称精确 → 变体（`-free` / `-fast` / `-1017`）→ 模糊；四态由宿主给出，客户端不再二次解释。
- **峰谷计价**：北京时间 `09:00–12:00`、`14:00–18:00` 为峰时，排除中国大陆法定节假日，
  节假表随用量数据年份顺延；未公布年份显式标注而不是静默丢表。
- **折叠结果落盘缓存**（`src/host/fold-cache.js`）：热启动 **0.08 s**（此前每次重启都要重读
  404 MB / 1.35 GB 解压，仅解压就 12.5 s）。签名 = 折叠规则版本 + 节假表版本，缓存损坏一律降级全量扫。
- **图表悬浮卡也显示参考成本**：每日/每小时趋势图（柱状与折线）与年度热力图的提示卡，现在
  在输入/输出/合计之外给出该时段的参考成本（取自宿主桶里的 `cost`，已按展示币种换算）；
  三处卡片抽成同一个 `TipRows`，避免"给一处加字段、另几处漏"。读屏走同一份信息：
  `barAria` / `hmTitle` 一并带上 `{cost}`。
- **悬浮卡里只有「有图例的那几行」带色块**：色块的语义是「这一行对应图例里的哪个颜色」，
  所以 `输入` / `输出` / `总 Token` 有，而 `参考成本` / `调用次数` 没有——它们各留一个
  10px 无底色的占位（`.tsd-tooltip-dot` 本身不设背景），文字仍与上方对齐。
- **原生 typert Remote 通道**（`src/host/typert.js`）：注册一份原生贡献并提供接收方服务，
  `connection.fetch` 的 `/api/usage/*` 常驻兜底；实际通道随每次响应返回（`channel`）。
- **仪表盘**：按模型明细（可排序）、定价匹配弹窗（四态可改可撤）、年度热力图、币种切换、
  每日/每小时趋势、未定价调用计数。
- `prices.yml` 定时重生成价目，`release.yml` 校验版本并创建 Release。
- README 演示图更新为 0.5.0 仪表盘截图；新增 `screenshots.json`，插件市场按仓库里的声明取图。

### Changed

- **与上游 0.4.0 合并**：输入区成本 pill（`conversation.composer.dock`，id `usage-cost`）原样保留，
  与重写后的 `apply` / 主题变量共存；`tests/client-dock.test.js` 继续守它的注册契约。
- **全量统计改为第一次查询才启动**（`startBackfillOnDemand`）：此前在激活时开扫，缓存加载
  （暖 0.78 s / 冷 ~12 s）总在用户打开面板之前完成，加载态永远看不见。代价是"读请求触发写"，
  权衡与边界写在 `docs/native-transport.md` §3。
- **加载态如实反映进度**：统计未完成期间整段骨架屏 + 确定进度条（宽度 = `done/total`）+
  `正在统计 n/N 个会话…`，不再先给半份会往上爬的数字；尊重 `prefers-reduced-motion`。
- 设置写入全部走 `.volatile()` 字段，重启后自定义价与已确认匹配不再丢失。

### Fixed

- 参考成本为 0 的模型被显示成「未定价」（表格曾自行重算宿主已给出的判定）。
- 加载骨架比真实卡片少一格（写死 5 格，实际 6 张）。
- 统计未完成时落到「暂无数据」。
- **`logSink(...).warn is not a function` 导致进入用量统计即崩溃**（`logSink` 返回的是函数）。
- `backfill` 计数出现 `{status: done, total: 258, done: 0}`（"扫完了"其实读作"一条没扫"）。
- 部分会话列表触发的 `prune()` 误删 257/258 条缓存，导致每次启动重折全量。
- 法定节假日被按峰时计价、`-free` 行被按付费孪生计价、变体名被判「未匹配」。
- 节假日历生成物把维护者本机路径写进了 `coverage.basis`（随包发布、且每周 CI 重生成会来回翻转）：
  现在只保留 `session store` / `calendar default` 两个与环境无关的值，并加门。

### Tests

`npm test` 224 项（宿主行为 + 客户端槽位/加载态/定价接线门）；`tests/dialog.test.cjs` 75 项（构建产物）；
`tests/client-dock.test.js`（0.4.0 输入区 pill）与 `tests/holiday-years.test.js` 的生成物路径门一并保留；
`npm run verify:typert`（官方 loader 校验 4 个端点）与 `npm run verify:remote`（7 项）为原生契约门。


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

---

## 附录：0.5.0 之前的本地迭代（未单独发布）

这一节是开发过程记录，不属于任何一次发布说明。

##### 迭代明细（本地 0.4.x 迭代，均未单独发布）


#### 0.4.8 · 2026-10-31

##### Fixed
- **按需启动的全量扫描补上 rejection 兜底**（`startBackfillOnDemand`）：`void runBackfill(...)`
  此前没有 `.catch`，而 `runBackfill` 自己的 `try` 要在 `ctx.get('sessionPersistence')` 之后才开始 ——
  上下文探测一旦抛错，就变成未处理的 rejection，被宿主判为致命（与 0.4.7 修的 `logSink` 崩溃同一类，
  且同样由"打开用量统计"这一读请求触发）。现在 `.catch` 里落 `status='done'` 并记一行日志。
  门：`tests/lazy-backfill.test.js` 新增「`ctx.get` 抛错也不能让读请求弄死进程」（变异验证：
  去掉 `.catch` 立即变红）。

##### Docs
- `docs/native-transport.md`：新增「为什么一次查询会启动一轮全量扫描（读请求带写副作用）」——
  把这条**明知偏离原生**的权衡连代价与边界写清楚（幂等 / 只写派生物缓存 / 后台不可能弄死宿主 /
  接线门防回退），免得上游 review 当成性能回退；开头改为基线小表（rc.3 → rc.4）。
- `README.md`：新增「装进本机 profile 时的一条硬规矩」——用官方插件管理器、同版本 `file:` 依赖
  会被 pnpm 判为已满足（`ambiguous-install`），日常替换请 `pnpm install --force`，**版本号只在
  值得发版时动**；装完必须核对产物而不是只看 `applied`。
- 三个接线门文件补了抬头声明：它们是**源码级接线门**（守"两处是否仍指向同一源头"），
  与行为门分工不同。

#### 0.4.7 · 2026-10-31

##### Fixed
- **进入「用量统计」直接崩溃（`fatal load failure: TypeError: logSink(...).warn is not a function`）**。
  `logSink(ctx)` 返回的是**函数** `(message, level?)`，而两处把它当 logger 对象用了：
  `persist()` 里的 `const logger = logSink(ctx)` + `logger.warn(...)`，以及按需启动回填时传的
  `log: (m) => logSink(ctx).warn(m)`。后者在 0.4.6 把回填搬到查询路径后立刻暴露：扫描收尾写日志
  →抛错→ 进入 `catch` 又用同一个坏 sink 写日志 → 异常逃出 `runBackfill` → 宿主把未处理的 rejection
  当致命错误，进程退出。
  现在两处都按函数契约调用；并且 `scan.js` 的所有日志经过 `safeLog()`，**日志坏了最多丢一行，
  绝不会再弄死宿主**。
- 门（`tests/lazy-backfill.test.js` 新增 2 条）：日志 sink 抛异常时扫描仍落到 `done`；
  `logSink` 只能以函数形式调用（禁止 `.warn/.error`、禁止别名成 `logger` 对象）。
  变异验证：把 `.warn` 写法加回去立即变红。

#### 0.4.6 · 2026-10-31

##### Changed
- **全量统计改为按需启动：第一次查询才开扫**（`startBackfillOnDemand`，`src/host/scan.js`；
  接线在 `handlers.set('query')`）。此前在 `apply` 里就开扫，暖缓存 0.78 s（冷缓存 ~12 s）的
  "缓存加载"窗口发生在用户打开面板之前 —— 代码里的加载态永远看不见，重启多少次都一样。
  现在面板打开的那一刻就是统计开始的那一刻：骨架 + `正在统计 n/N 个会话…` + 确定进度条，
  暖冷缓存都可见。`state.backfill` 增加 `started` 闩（`status` 会被调用方先置 running，
  不能拿它当"只跑一次"的守卫）。
- 客户端轮询节奏改为**先快后慢** 600 ms → 1.5 s → 3 s：固定 3 s 会让 0.8 s 就结束的暖缓存
  窗口"躺 3 秒再跳一格"，比没有进度更糟。

##### Tests
- 新增 `tests/lazy-backfill.test.js`（4 条）：首次调用置 running 且幂等；无持久化时立即 done
  （面板不会永远转）；空库跑完落到 done 且 `done === total`；**接线门**——`query` 处理器必须调用
  `startBackfillOnDemand`，且 `apply` 不得再直接 `runBackfill`（变异验证：删掉调用点即变红）。

#### 0.4.5 · 2026-10-31

##### Changed
- **从 DSH 启动到统计算完，整段都是加载态**（`src/client/index.js` 的仪表盘渲染）：
  此前只在"数据为空"时给骨架，半份结果会先显示出来再一格一格往上爬 —— 既像"你只有这么多
  用量"，也正是「数字一点点往上爬」那类抱怨的来源。现在只要 `backfill.status === 'running'`
  就渲染骨架屏，数据区（`!computing`）与空态（`!computing`）都等算完才出现。
  统计期间仍保留：顶部确定进度条（宽度 = done/total）、头部「正在统计 n/N 个会话…」、
  旋转的刷新图标；屏幕阅读器只播报头部这一处（骨架屏的 live 区域在统计期间置 `aria-live="off"`，
  避免重复朗读）。
  门：`tests/client-slots.test.js` 第 2 条同步加强（断言骨架覆盖整段 computing、数据区必须带
  `!computing`；变异验证：把条件退回只覆盖 `!ready` 立即变红）。

#### 0.4.4 · 2026-10-31

##### Added
- **「统计没算完」本身就是一个加载态**。此前只有"请求在飞"（busy）才有反馈，
  而全量统计（258 个会话）远比一次请求长：冷启动那几秒页面看起来是静止的，
  数据为空时还会显示「暂无数据」—— 把"还在算"说成了"没有用量"。
  现在 `backfill.status === 'running'` 即 `computing`：
  - 顶部进度条改**确定进度**，宽度 = 宿主返回的 `done/total`（知道分母就不装忙）；
  - 头部副标题换成 `正在统计 {done}/{total} 个会话…`（同位置同行高，算完不跳版）；
  - 刷新图标在统计期间也保持旋转；
  - `computing && isEmpty` 时显示骨架屏，**不再**落到「暂无数据」；
  - `role="status"` 让屏幕阅读器也能读到进度。
  门：`tests/client-slots.test.js` 第 2 条（变异验证：去掉 `computing && isEmpty` 即变红）。

#### 0.4.3 · 2026-10-31

##### Fixed
- **骨架屏比真实卡片少一格**（`LoadingState`）：占位块写死 `[0,1,2,3,4]` 五张，而「模型占比」
  让统计卡变成 **6 张** —— 加载态少一格，数据到达时整行重排。
  现在张数从 `SUMMARY_CARD_SLOTS` 派生，`SummaryCards` 与骨架屏共用同一份 key 顺序；
  新增门 `tests/client-slots.test.js` 逐字比对两边的 key 列表，并禁止骨架再出现写死的索引区间
  （变异验证：把骨架改回 `[0..4]` 该门立即变红）。

#### 0.4.2 · 2026-10-30

##### Changed (基线抬到 rc.4，无行为变化)
- 桌面版实例当日升到 **0.2.1-rc.4**，按「原生会动：先对账再抬基线」复核两个契约门：
  `verify:typert` 报 `OK: the official loader accepts the contribution (4 endpoints, namespace dsh-plugin-usage)`，
  `verify:remote` 7/7 全绿 → `dsh.verifiedAgainst` 由 `0.2.1-rc.3` 抬到 `0.2.1-rc.4`；
  `engines.dsh` 保持 `>=0.2.1-rc.3 <0.3.0`（rc.3 也验证过，不缩小可安装范围）。
- 卫生门里「基线必须出现在下限字符串里」这条过窄判据改成**区间判定**（基线必须落在 `engines.dsh`
  区间内，允许比下限新）—— 否则"验证了更新的构建"这个正确动作会被自己的门判红。
- 为什么要有 0.4.2：0.4.1 在 22:06 已装进桌面版，之后又改了 manifest 基线；同版本号 + 同 `file:` 路径时
  pnpm 判定"无需新增"（返回 `ambiguous-install`），只有换版本号才能让内容真正替换。

#### 0.4.1 · 2026-10-30

##### Changed (基线抬到 rc.4)
- 桌面版实例当日升到 **0.2.1-rc.4**，按「原生会动：先对账再抬基线」复核两个契约门：
  `verify:typert` 报 `OK: the official loader accepts the contribution (4 endpoints, namespace dsh-plugin-usage)`，
  `verify:remote` 7/7 全绿 → `dsh.verifiedAgainst` 由 `0.2.1-rc.3` 抬到 `0.2.1-rc.4`；
  `engines.dsh` 保持 `>=0.2.1-rc.3 <0.3.0`（rc.3 也验证过，不缩小可安装范围）。
  同时把卫生门里「基线必须出现在下限字符串里」这条过窄判据改成**区间判定**（基线必须在
  `engines.dsh` 区间内，允许比下限新），否则"验证了更新的构建"这个正确动作会被自己的门判红。

##### Fixed
- **参考成本为 0 的模型被显示成「未定价」**（`src/client/index.js` 的 `ModelTable`）：表格在 `useMemo`
  里自己重算了一次 `unpriced: (tokens > 0) && !(cost > 0)`，把「用户明确把单价填成 0」也判成未定价 ——
  历史记录里因此永远看不到 ¥0.00。现在判定只取宿主结论（`unpriced: r.unpriced === true`），
  `¥0.00` 与「未定价」的区别回到唯一来源：查得到价 vs 查不到价。门：`tests/native-hygiene.test.js`。

##### Changed
- **加载态做诚实**（`src/client/index.js`）：
  - 补 `@media (prefers-reduced-motion: reduce)`：关掉骨架屏呼吸、刷新按钮旋转与入场淡入
    （官方客户端同样写法：`plugin-manager.client.js` / `settings-general.client.js`）；
  - 删掉刷新时整块内容 `opacity: .55` —— 每次轮询闪一下，且暗示"数字在重算"；改为顶部 **2px 细进度条**
    （绝对定位、不推版面、`aria-hidden`），只在「已有数据、正在刷新」时出现；
  - 骨架屏补 `role="status"` + `aria-live="polite"` 与可读文案（`loading` 双语 key），
    屏幕阅读器不再只知道 `aria-busy`。
- **原生对齐收口**（对照共享库经验第〇条 `exp-native-first`）：
  - `package.json` 声明 `dsh.verifiedAgainst: "0.2.1-rc.3"`，并把 `engines.dsh` 收紧到
    `>=0.2.1-rc.3 <0.3.0` —— 之前写的是 `>=0.2.0-rc.2`，那是一个**从未验证过**的下限。
  - `docs/native-transport.md` 新增 §3：折叠缓存这处**已知自建旁路**的取证（官方 `dsh-storage` /
    `dsh-storage-json` / `dsh-storage-domain`，以及官方 `dsh-session-projection-cache` 的同类先例）、
    三条可复核的保留理由（派生物需可整目录删；`open()` 急加载而缓存 258 条已 12 MB 且随历史线性增长；
    零运行时依赖）、以及迁移路径。同时删掉该文件 §4 表格里重复的一行。
  - `runBackfill` 的兜底 `catch` 不再静默：失败原因经 `log` 落到宿主日志。
- **新增原生卫生门 `tests/native-hygiene.test.js`（4 条）**：`verifiedAgainst` 必须存在且与 `engines.dsh`
  下限一致；按模型明细的 `unpriced` 只能取宿主结论（禁止客户端重新派生 `!(cost > 0)`）；`src/host/**` 的
  磁盘写只允许出现在 `fold-cache.js` 与 `scan.js` 的 `last-pass.json`（新写盘必须先写进 §3 的反证）；
  `settings.update` 的命名空间必须等于 `cordis.patch.yml` 里的行 id。

##### Added
- **折叠结果落盘缓存，重启不再全量重扫**（`src/host/fold-cache.js`）：索引只在内存里，所以此前每次重启
  都把全部历史重新读一遍 —— 本机实测 258 个会话、404 MB、解压后 1.35 GB / 57 万行，**仅读取和解压就
  12.5 s**。现在按会话落成 `<DSH_HOME>/cache/dsh-plugin-usage/fold/<id>.json`，命中条件是后端给的
  `revision` 与条目一致；一个会话一个文件，所以一次扫描只重写变化的会话。
  实测（258 会话 / 30,186 条记录，日志全程不打开）：**热启动 0.08 s**，缓存写回 0.46 s。
  正确性约束：签名 = `FOLD_CACHE_VERSION` + 节假日历 `capturedAt`（折叠规则或节假表一变即失效）；
  记录的 `session` 必须与文件名一致，否则整条当未命中（防止串账）；解析失败、签名过期、记录形状不对
  一律降级为全量扫，绝不抛错。
  门（`tests/fold-cache.test.js`，10 条）：冷折叠与热启动逐字段相等、`open()` 在热启动时必须不被调用、
  revision 变化必重扫、串账记录被拒、缓存损坏/签名过期降级、`cache:false` 保持旧行为、孤儿会话被清理。
  变异验证：把命中分支改 `if (false)`、或不写条目，对应用例立即变红。

##### Changed
- **节假日历的年份范围跟着用量数据走，并向后顺延一年**（`scripts/lib/holiday-years.mjs`）：
  原来是 `[今年-1, 今年, 今年+1]` 的固定窗口，与「全部」里早期的会话无关 —— 2024 年的用量根本
  取不到 2024 的节假日。现在从会话目录里最早/最晚的会话文件取年份：往前留一年余量（文件
  mtime 是**最后**写入时间，最早那次可能更早）、往后**必多备一年**（次年安排 11 月才公布），
  并与「今年」取并集。`--holiday-years` / `--usage-from` / `--usage-to` 可显式覆盖。
  生成物新增 `coverage: {fromYear, toYear, basis, years}`。
- **未公布的年份要记下来，不能丢**：原来 `days: []` 的年份直接 `continue`，从表里消失 ——
  与「这一年没有节假日」不可区分，于是该年节假日被按高峰计价且界面上毫无提示。现在记成
  `unpublished: true`，`holidayCoverage()` 会带出去，参考成本的提示里写明覆盖范围与未公布年份。
- 顺手修掉一条**误报**：原来按「数据是否到 12-31」判断截断，而实际每年最后一个法定假日都在
  10 月初（国庆），于是 2025、2026 每年都报一条假警告。改成「是否缺当年的国庆（10-01）」。

##### Fixed
- **法定节假日被算成高峰价**：折叠时用的判定是 `isPeak(atMs)`（不带日历），而价目显示用的是带日历
  的那条 —— 同一天（例如 2026-10-01 国庆，周四）账单按高峰计价、界面却标「空闲」。DeepSeek 的规则
  是「周一至周五 01:00-04:00、06:00-10:00 UTC，**不含中国法定节假日**」，所以窗口内落在节假日的
  调用被最高多算一倍。
  修法在根上：`isPeak` 的默认参数改成**真正的日历**（`holidayOf` 移到 `peak.js`，与规则同源），
  `pricing.js` 反向复用同一份判定并 re-export，任何调用方漏传参数都不会再静默走「无节假日」。
  新增两道门：`tests/peak.test.js` 断言默认就认日历，`tests/tier-billing.test.js` 直接钉住
  `peakAt`（折叠实际用的那个函数）。变异验证：把默认改回 `undefined`，两道门同时红。

##### Changed
- **真机确认原生通道生效（2026-10-29，work-exp）**：dashboard 的查询/定价请求走
  `POST /api/dsh-plugin-usage/query` → 200，响应里的 `channel` 为
  `{"ok":true,"transport":"remote","reason":"registered 4 endpoints"}`；`/api/usage/*`
  只在自举阶段（面尚未挂载时）出现，随后自动切换。同一轮之前的两次失败分别暴露了
  `ctx.reflect` 取不到、以及激活期一次性探测 `ctx.get('typert')` 的时序问题，都已修掉。
- **修掉一个"宿主明明有、插件却说没有"的时序缺陷**：`ctx.get('typert')` 只返回**已激活**的服务
  （cordis `Context.get` → `_getImpl` 检查 `impl.fiber.state === 2`），而 typert 注册表在同一
  组合里可能比本插件晚激活。激活期一次性探测的结果就是 "no typert registry in this composition"
  并永久落到 Fetch。改成 `ctx.inject(['typert'], …)` 声明依赖、就绪时再注册（与 `connection`
  的写法一致）。
- **通道决策可查**：`registerTypert` 返回 `{ ok, transport, reason }`，随每次 dashboard 响应
  以 `channel` 字段下发；走 Fetch 时 reason 会写明原因（没有 typert 注册表 / ctx 不能
  provide / provide 抛错 / typert 拒收）。插件 logger 不一定进宿主日志，所以判断不再靠猜。
- **删掉 `client-source` 端点**（`src/host/client-source.js`）：它是动态插件时代"宿主读源码、
  前端 `new Function` 执行"的遗留，客户端早已改成真正的 bundle，这个端点既没人调用、又把
  源码文本经 RPC 发出去。换成一个只报端点名的 `contract` 端点 —— 浏览器半靠它在
  `remote.$mount` 时与宿主侧的清单对齐，不再各自维护一份端点列表。
- **client→host 走原生 typert Remote**（`src/host/typert.js`）：注册一份 typert 贡献
  （`package = dsh-plugin-usage`，namespace 与包名相同，参数/结果都是 strict codec）并
  `ctx.reflect.provide` 一个同名接收方服务（gateway 会核对 `typertRemote` 绑定）。浏览器半
  **优先**调 `remote['dsh-plugin-usage']`，失败自动落回 `/api/usage/*` 与 `/usage` 兜底 ——
  两条通道都常驻。注册被拒时会把接收方服务撤回去，不会留下"挂上了但调不到"的半面。
  旧代码里 `typert.register('usage', endpoints)` 的两参调用是错的形状，已删除。
- **按原生工程习惯收口（对照 `xshared-lib` 经验库第〇条「原生优先」）**：
  - 宿主日志走 `ctx.logger`（`ctx.get('logger')` → `ctx.logger` → `console` 三层兜底），
    不再直接 `console.warn`；挂载失败与端点异常都进宿主日志。
  - **原始错误不再上页面**：`dispatch` 把未处理异常压成稳定码 `internal`，界面按码
    自己说话（`rpcInternalError`），堆栈只写日志。
  - 设置页导航图标的 DOM 补缺注释补上**官方符号出处**（`settings.section` 只投影
    `{id, order, label}`、`navIcon(id)` 未知 id 回落齿轮），让「官方确实没有」这条
    反证可核，而不是"我觉得"。
  - 仓库里的门补了两处：`tests/dialog.test.cjs`（驱动构建产物的 70 项 UI 检查）从
    仓库外挪进 `tests/` 并接进 `npm test`（`pretest` 先构建）；新增
    `tests/fold-parity.test.js`，用 `scripts/fold-parity-fixture.mjs` 从官方
    `@deepseek-ai/dsh-token-meter` 录下的 `tokenUsage` 结果对账本插件的 fold。

参考成本这块的整理：把「同一个问题有好几处各自回答」的地方收成一处，并按原设计
补上参考模型的三类来源与 `-free` 的判定规则。删掉的是**第二条政策**和**第二套词表**。

##### Fixed

- **`-fast` / `-1017` 这类变体名被判成「未匹配」**：`deepseek-v4.1-flash-fast`（1,380 次）
  和 `deepseek-v4.1-flash-1017`（471 次）是同一个模型换了后缀，却因为表里没有这一行而
  按 0 计价 —— 全部历史里 1,865 次未定价基本就是它们。新增第 5 级**变体后缀**：
  `-free` / `-exp` / `-fast` / `-latest` / 四位日期，去掉后缀后必须在表里查到基模型，
  命中即按基模型的价估算、标「模糊」。这是封闭的改名规则（后缀表固定 + 基模型必须
  存在），不是相似度：`deepseek-v4-flash-0731` 没有基模型行，仍然未匹配。
- **`-free` 一律被算成「模糊」并按付费孪生计价**：孪生规则排在字面命中之前，于是
  价目表真实发布的 `glm-5.3-flash-free`、`deepseek-v4.1-flash-free` 等 13 行也被
  判成模糊，促销期的 0 元被换成一个没人付过的付费价。现在**精确优先**：表里真有这
  一行就是精确、按它自己的价；只有表里没有的变体名才走第 5 级。
- **「自定义」不是一组参考模型，而是「直接填单价」**：之前把它做成了第三个 id 分组，
  只能选「别的模型」；实际要的是在选择器顶部给一个「自定义」选项，选中后就在这一行
  填三个数（输入 / 输出 / 缓存读，展示币种、每百万 Token），确定后写进 `prices`，
  按填的价计。金额按当前展示币种换算成美元存储（价目表是美元），负数/非数字会被拒。
  同一个 key 只留一个答案：手填价顶掉已确认的匹配，确认匹配 / 收回答也会清掉手填价。
- **未匹配的模型在「定价匹配」里一行都看不见**：待选表按 `r.unpriced` 过滤，而
  propose 的行从来没有这个字段（它是查询那边「某条记录没价」的标记）——于是待选表
  永远为空，一个都没匹配上的会话反而显示「暂无待匹配的模型」。
- **价目表的两档价被折成一档之后再发出去**：`propose` 先把行折成「当下这一档」，
  弹窗只能印那一档，另一档凭空消失；而且「当下」是打开弹窗时的钟点，不是会话里的
  任何时刻。现在宿主把两档一起发（`rates.peak` / `rates.offPeak`）并标明该印哪档，
  另一档挂在同一格的 tooltip 上。
- **`DEFAULT_PRICES` 那一行 `group/auto-deepseek-v4-1-flash`**：它是 DeepSeek Flash
  旧空闲价的抄件，本身是单档（峰谷对它无效），又排在参考表前面（`how: 'custom'`），
  所以高峰期比参考价低 53%。归一化里补了路由器前缀规则之后，这个 id 由参考表自己
  回答，这行连同 `ALIAS_PRICES` / `mergePrices` 一起删掉，`prices` 默认改为空。
- **两套插件内词表**：宿主算出的 `how`（5 个值）在 client 里被再映射成四态，映射
  写死过一个阶梯里不存在的值。现在 `state`（exact / fuzzy / none / custom）由宿主
  `resolvePrice` 产出，client 只渲染。
- `query` 的 `pricing.source` 不再写死字符串，改从价目表 `sources` 派生。

##### Changed

- **一处查价**：`resolvePrice` 收下 `matchMap`（`matches`）成为唯一入口，
  `index.js` 的 `resolveWithMatches` 包装层删除；store 不再接受 `resolve` /
  `costFor` 注入，也不再有「没注入时按精确键查」的第二人格。
- **一种费率形状**：`ratesOf(price, tier)` 是唯一读价格字段的函数（flat 行 /
  DeepSeek 两档行 / 手填的 `inputPerM` 行都归一到 `{input, output, cacheRead,
  cacheWrite}`），`tierPriceOf` 删除。价格行以「发布时的样子」流过阶梯，档位只由
  计费点（`costOf` 的桶、`priceRow` 的展示）决定。
- 归一化新增两条规则：`.` 与 `-` 等价、去掉路由器加的 `auto-` 前缀。两条都有
  **89 行零冲突**的常驻门（`price-data.test.js`）。
- **参考模型 id 从一张扁平表变成三组**：`propose` 的 `table.ids` 换成
  `table.groups`（deepseek / zen / custom），每行的 `source` 说明这个价出自哪一类；
  选择器按组显示并带组头，匹配到的行旁边标出来源。
- 阶梯顺序改为「精确优先」：自定义 → 确认 → 精确 → 别名 → 孪生。

#### 0.4.0 · 2026-10-19（本地定价改造，随 0.5.0 发布）

参考成本的算法版本：从「10 行手抄的价目表 + 精确字符串匹配」换成「按上游定价源
生成、四级阶梯解析、高峰/空闲分档、未命中的模型可以在界面上确认」。这一版会把
账算得比 0.3.0 高 —— 因为 0.3.0 少算了，不是这版多算了（见下）。

##### Fixed

- **在售型号根本没进价目表，成本记 0**：旧表 10 行里有 7 行是已下线的型号 id，
  而 `deepseek-flash`、`deepseek/deepseek-v4.1-flash` 这类实际在用的 id 一行都
  匹配不上。本机 94 个会话实测：宿主的 `costUsage` 投影记 $62.8792，插件记
  $1.8378（2.9%）。价目表改由 `scripts/gen-prices.mjs` 从 opencode Zen 与
  DeepSeek 官方定价生成，生成物随包发布。
- **拉美价被当成通用价**：旧表 `deepseek-v4.1-flash` 一行 0.14 / 0.56 / **0.04**，
  缓存放大了 13.3 倍；官方在售价是 0.15 / 0.60 / 0.003。
- **模型多一层前缀就判未定价**：`provider/model` 与裸 `model` 之外没别的匹配，
  provider 前缀改了、分隔符换了（`_` / `.`）、大小写不同都算未命中。
- **弹窗里给未匹配模型选参考模型会报错**（`Cannot convert undefined or null to
  object`，行也不变脏）：`PricingDialog` 里的 `const [draft, setDraft] =
  React.useState({})` 遮蔽了同名的纯函数 `setDraft(prev, key, patch)`，组件内
  `setDraft((prev) => setDraft(prev, ...))` 调的是 setter 自己。

##### Added

- **价目表生成**：`npm run prices`（`scripts/gen-prices.mjs`）抓 opencode Zen
  与 DeepSeek 官方定价，输出 `src/host/prices.js`（89 个型号 + 每个型号的三档价
  与上下文加成）和 `src/host/holidays.js`（节假日历）。CI 每周跑一次，上游有变化
  才开 PR。生成物是 `.js` 而不是 `.json`：`tsconfig.json` 的 `rootDir` 是 `src`，
  发布只带 `lib/`，`.json` 到不了用户手里。
- **四级解析阶梯**（`src/host/pricing.js`）：自定义 → 别名 → 孪生（去 provider
  前缀、统一分隔符与大小写；`-free` 免费型号一律归到这里，不参与精确）→ 精确
  字面命中。**任何一级都不做相似度打分**：字面命中自动采用，0.62–0.90 那一段
  只提示、不自动确认。
- **高峰/空闲分档**：DeepSeek 两个在售型号按官方两档价计价，时段在**扫描时**记进
  Token 分桶（`rec.tokens.peak` / `rec.tokens.off`），切换币种不改写分桶。
  规则按北京时间：周一至周五（不含中国法定节假日）9:00-12:00、14:00-18:00 为高峰。
- **「定价匹配」弹窗**：参考成本卡右上角的按钮打开。会话内未匹配的模型列在最前，
  可从价目表里挑参考模型；已匹配的单独一张表可逐行清掉；历史匹配默认折叠。四种
  状态（精确 / 模糊 / 未匹配 / 自定义）常显。**不改动就不落盘**：草稿只活在弹窗里，
  点「确定」才 commit；没改动时「确定」就是关窗。
- **自定义价优先级最高**：设置里的 `prices`，以及弹窗里确认过的 `matchMap`，
  都排在自动匹配之前。
- **`unmatched` 与 `pricing` 元信息**：`usage/query` 响应带未命中列表、价目表来源
  与抓取日期、覆盖率，以及每行的 `how` / `target`；新增 `usage/pricing` 端点
  （`propose` 只读、`commit` 写入）。

##### Changed

- 成本卡脚注拆成三行：常驻的口径说明、高峰/空闲规则，以及只在有未定价调用时出现
  的提示。原来所有卡片共用一条 warn 色脚注，与事实不符。
