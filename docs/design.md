# 设计说明

> 为什么这么实现、哪些口径不能改。装配细节见 [装配契约](reference/architecture.md)，
> 与原生 DSH 的距离见 [原生对齐](reference/native-alignment.md)，
> 踩坑记录见 [项目经验](experience/README.md)。

## 目标与非目标

**目标**：回答「今天 / 某段时间花了多少 Token 和钱、花在哪个模型上」。数据来自 DSH 已持久化的
会话事件，插件只做折叠与聚合，不自己记日志、不拦截模型调用。

**非目标**：不做账单（成本是「参考成本」）；不替代宿主自带的 `tokenUsage` 会话统计；
不顶替原生槽位里已有的占用者（求星行用的是追加型 list slot）；不为缺失的原生能力保留第二套
长期并行的实现。

## 1. 事件折叠口径

折叠逻辑在 `src/host/fold.js`，目标是和官方 `@deepseek-ai/dsh-token-meter` 的
`tokenUsage` 投影对同一批事件给出同样的总量（由 `tests/fold-parity.test.js` 对账）：

| 规则 | 实现 |
| --- | --- |
| 一条计费结算 | `assistant/message`（带 `data.usage`）或 `assistant/attempt` |
| attempt 没有 `usage` 字段 | 取 `data.stream` 里最后一个 `usage` chunk（重试/失败也可能计费） |
| 同一 `(turn, step)` 重复上报 | 后一条**原地替换**前一条，不累加 |
| `llm/retry-started` | 关闭该 `(turn, step)` 的替换槽，重试后的调用**累加** |
| 结算没有 `message.source` | 用最近的 `request/context` / `request/header` 路由归因 |
| `usage.totalTokens` 有值 | 直接采用，不自行加总 |
| fork 会话 | 按 `inheritedEventCount` 跳过父会话前缀，不重复计费 |

峰谷分档在折叠时完成，因为**事件自己的时间戳只在这里存在**：同一模型同一天可能同时有高峰与
空闲调用，事后再按聚合值计价必然偏高或偏低。记录因此携带 `tokens.peak` / `tokens.off`
（`src/host/fold.js`），缓存签名也带节假表的 `capturedAt`（`src/host/fold-cache.js`）。

## 2. 五级价格阶梯

`src/host/pricing.js` 的 `resolvePrice` 是唯一查价入口，五级顺序固定，**任何一级都不做相似度
打分**：

1. 用户自定义价（设置里的 `prices`，键可以是 `provider/model` 或裸 model）；
2. 用户在「定价匹配」里确认过的匹配（`matchMap`）；
3. 归一化后的字面命中（大小写、`provider/model` 前缀、`_`/`.`/`-` 分隔符、路由器 `auto-` 前缀）；
4. 别名表（`deepseek-chat` / `deepseek-reasoner` / `deepseek-v4-flash` 等已停用名）；
5. 变体后缀（`-free` / `-exp` / `-fast` / `-latest` / 四位日期）：去掉后缀后**基模型必须在表里**。

**精确优先**：价目表里真有这一行就是 `exact`，推断不能盖住事实。所以 `-free` 结尾的 id
只要表里有行就按它自己的价（促销期就是 0）；只有表里没有的变体名才落到第 5 级、标 `fuzzy`。
`deepseek-v4-flash-0731` 没有基模型行，仍是 `none`，不会被塞到最像的一行。

宿主只产出四态 `state`（`exact` / `fuzzy` / `none` / `custom`），客户端只渲染、不再二次解释
（`src/client/index.js` 的定价弹窗）。价目表以**美元 / 百万 Token** 为基准，显示 `¥` 时在查询
输出边界按固定 7:1 折算一次（`src/host/query.js`），价目表本身不改写。

峰谷规则来自 DeepSeek：北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00
为高峰，其余时段（含周末与法定节假日全天）为空闲。节假日历由 `scripts/gen-prices.mjs` 生成，
年份范围跟着用量数据的日期跨度走（`scripts/lib/holiday-years.mjs`），未公布年份记
`unpublished: true` 而不是丢表。

## 3. 天 × 模型汇总

`src/host/aggregate.js` 维护两套索引：按天的记录切片（逐条查询用）与「天 × 模型」汇总单元格。
日粒度查询读单元格，代价从 O(记录数) 降到 O(天 × 模型)：

- 单元格**只存 Token、不存成本**：价目表和用户确认的匹配随时可变，成本在查询时按当时费率算；
- 范围两端被切开的那些天回到记录扫描，所以「从 05:00 起」这类不按天对齐的区间依然精确；
- 只有 `index.size() === state.records.length` 时才信任汇总单元格；绕过 `add()` 直接塞进
  `state.records` 的记录会让查询退回记录扫描，宁可慢也不给半份汇总；
- `pruneBefore()` 提供了按天裁剪的实现，但当前**没有调用点**：「全部」范围要求保留全历史，
  所以单元格与记录一起常驻；它是留给未来「只保留最近 N 天」策略的接缝，不是现有行为。

本机实测（30k / 100k 条记录）：今日 + 热力图 **2.5 / 7.0 ms**，全部 + 热力图
**3.5 / 2.8 ms**，全部（不带热力图）**1.0 ms**（`CHANGELOG.md` 0.5.1）。

## 4. 按需回填

全量统计**不在激活时跑**，由第一次查询拉起（`startBackfillOnDemand`，`src/host/scan.js`）。
这是刻意的「读请求带写副作用」：

- 暖缓存统计约 **0.78 s**、冷缓存约 **12 s**，面板又是按需挂载的 —— 在 `apply` 里预热，
  这段加载永远发生在用户打开面板之前，代码里的加载态一帧都看不见；
- 现在是「面板打开的那一刻就是统计开始的那一刻」，骨架屏与 `正在统计 n/N 个会话…` 的可见
  时长等于工作本身的时长；
- 查询是幂等的：`state.backfill.started` 闩住，只有第一次真正启动；
- 写入的只是派生物缓存（`<DSH_HOME>/cache/dsh-plugin-usage/fold`，可整目录删除），
  不碰用户数据、不写设置；
- 后台任务不可能弄死宿主：`void runBackfill(...).catch(...)` 兜底，日志经 `safeLog()`
  —— 这两条是实际事故的产物（见 [经验 03](experience/03-logsink-崩溃.md)）。

## 5. 求星行的位置

详情页底部那行 `⭐` 注册在 `plugins.detail.section`（`src/client/index.js` 的
`DetailStarLine`）。这个 list slot 在**每一个**插件详情页上派发
`{ subject: { kind, pkg, row? } }`（组合包页、行页、官方插件页都算），所以条目必须自过滤：
只有 `subject.pkg.name === 'dsh-plugin-usage'` 才渲染，其余返回 `null`。

**为什么不用 `plugins.row.config`**：那个 keyed slot 会占用该行的配置页，而本插件没有自建配置页；
`prices` / `matchMap` 的界面入口是仪表盘的定价弹窗（写回 `settings.update('usage', …)`），`currency`
是默认币种（界面上的 ¥/$ 只改本浏览器显示）。求星提示只是一行文本，
`plugins.detail.section` 才是原生、非侵入的座位；若注册 `plugins.row.config`，反而要重做一个
包含 `prices` 字典与 `matchMap` 的完整表单。

## 6. 不能破的不变量

| 不变量 | 原因 |
| --- | --- |
| 包名 = typert namespace = 接收方服务键 = 客户端 `remote.<包名>` | 四处不一致时通道挂载成功但永远调不到 |
| `cordis.patch.yml` 行 id = `settings.update` 的命名空间（`usage`） | 配置写回会落到不存在的表单上 |
| 所有写回的配置字段都 `.volatile()` | 官方 settings 服务拒绝非 volatile patch，旧代码的 `.catch(() => {})` 曾把失败藏起来 |
| 客户端 bundle 的 loader id 从 `package.json#name` 派生 | 硬编码 id 会让 scoped / alias / vendored 安装永远等不到工厂 |
| 折叠缓存不做 prune | 会话列表在启动预热期是**部分**的，「不在列表里」不等于「已删除」 |
| 读请求只写派生物缓存，且带 rejection 兜底 | 后台任务不能把宿主弄挂 |
