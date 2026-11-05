# 故障排查

> 每条都是「症状 → 原因 → 处理」。根因的证据与代码位置见 [项目经验](../experience/README.md)。

## 打开「用量统计」后一直显示骨架 / `正在统计 n/N 个会话…`

- **原因**：全量统计由第一次查询拉起（按需回填），冷缓存要读并解压全部历史，本机实测
  258 个会话 / 404 MB / 解压后 1.35 GB，仅读取+解压约 **12.5 s**；暖缓存约 **0.78 s**。
  这是加载态，不是卡死。
- **处理**：等它跑完；`n/N` 会推进。若永远不动，看宿主日志里有没有
  `[usage] backfill failed` / `backfill rejected`（后台任务有 rejection 兜底，不会弄挂宿主）。

## 数字先显示半份、再一格格往上爬

- **原因**：0.4.5 之前只在「数据为空」时给骨架，半份结果会先显示出来。现在
  `backfill.status === 'running'` 期间整段是骨架 + 确定进度条。
- **处理**：刷新页面拿新客户端 bundle；宿主半的统计行为不需要重启。

## 参考成本全是 0 / 显示「未匹配」

- **原因**：模型 id 五级阶梯都没命中（自定义价 → 确认匹配 → 精确 → 别名 → 变体后缀），
  成本记 0；不是账单接口失败。
- **处理**：打开参考成本卡右上角的「定价匹配」，未匹配的模型排在最前面；选参考模型或
  手填单价后点「确定」写进 `matchMap` / `prices`。`-free` 等变体只有**表里没有该行**时才
  走模糊匹配，基模型不存在就仍是未匹配（不做相似度猜测）。

## 和宿主自带的 usage pill 数字对不上

- **原因**：口径不同。宿主 pill 读官方 `tokenUsage` 投影（会话内合计、不带模型归因）；
  本插件的 pill 是「今日」、按记录里的 `provider/model` 逐条计价。
- **处理**：比较同一区间与同一模型集合；事件折叠本身由 `tests/fold-parity.test.js`
  与官方 fold 对账，不会各算一套。

## 输入区没有成本 pill

- **原因**：今日没有调用时按设计不占位；或内核 < 0.2.1 没有 `conversation.composer.dock`
  （注入失败只告警，不影响设置页）；或页面还在跑旧 bundle。
- **处理**：确认今天有调用；刷新页面；升级内核到 0.2.1+。

## 设置页导航行显示的是官方齿轮，不是插件图标

- **原因**：`settings.section.icon` 是 0.2.2-rc.1 才有的槽位，更早的内核没有；或注册 id
  与 section id 不一致（该槽按 `only: row.id` 匹配，对不上**永不渲染、也不报错**）。
- **处理**：升级到 0.2.2-rc.1+；本插件两处注册 id 都是 `token-stats`，由
  `tests/client-settings-icon.test.js` 钉住。

## dashboard 响应里的 `channel` 是 `fetch`

- **原因**：原生 typert Remote 没挂上，自动落回 Fetch 兜底。`reason` 会写明原因：
  没有 typert 注册表 / ctx 不能 provide / provide 抛错 / typert 拒收。
- **处理**：两条通道都常驻，Fetch 下功能完整；要确认原生通道，跑
  `npm run verify:remote`（真实 cordis + typert 注册表，7 项检查）。激活期一次性探测
  `ctx.get('typert')` 必然失败，这是已知的 cordis 时序，不要改回去。

## 设置改了，重启后又变回默认

- **原因**：配置字段不是 `.volatile()`（官方 settings 服务会拒绝整份 patch），或宿主根本没有
  `settings` 服务（此时只在内存里生效，日志有一行 `settings service unavailable`）。
- **处理**：确认字段带 `.volatile()`；看宿主日志；重装/重启后核对 profile patch 里 `usage` 行的 `config` 值。

## 首载很慢，之后正常

- **原因**：折叠缓存未命中（首次运行、DSH 升级、折叠规则或节假表版本变化、缓存损坏），
  退回全量扫；命中条件是会话的 `revision` 与缓存条目一致。
- **处理**：正常等待一次；缓存目录在 `<DSH_HOME>/cache/dsh-plugin-usage/fold`
  （默认 `~/.dsh/cache/...`），可整目录删除强制重算。缓存**不做 prune**：过期条目只占磁盘，
  不会被误删（见 [经验 01](../experience/01-折叠缓存不可-prune.md)）。
