# dsh-plugin-usage

DeepSeek Harness 的 **Token 用量统计**插件：按天 / 自定义范围查看 Token、调用次数与成本，支持模型筛选、定价配置和年度热力图。

> Token usage statistics for DeepSeek Harness.

<img width="1792" height="913" alt="0076afd6-8d44-49d3-8399-d49f94b4fbfb" src="https://github.com/user-attachments/assets/a29b952a-ae96-4185-b2e3-c7e7306054b1" />
<img width="1792" height="914" alt="df71f656-3ab9-4b1d-b882-eae45ed1b5ed" src="https://github.com/user-attachments/assets/022dd647-6076-427e-9891-0564df10ade6" />


## 功能

- 今日 / 近 7 天 / 近 30 天 / 全部 / 自定义范围（不限跨度），按小时·天聚合
- 模型筛选、按模型明细（请求数、输入/输出、缓存、成本、占比）
- KPI 网格里的「模型占比」卡：按总 Token 显示前 4 个模型与「其它」
- 参考成本可在 ¥ / $ 之间切换（固定汇率 1 USD = 7 CNY，宿主侧折算）
- 参考价目表由脚本从 opencode Zen 与 DeepSeek 官方定价生成，高峰/空闲按北京时间分档
- 参考成本卡右上角的按钮打开「定价匹配」：未匹配的模型可直接挑参考模型，已确认的可以清掉；不改动就不落盘
- 可配置的每百万 Token 价格表（自定义价格优先于自动匹配）
- 年度热力图；深/浅色自适应，只用 DSH 主题变量，无第三方图表库
- **输入区成本 pill**：composer 旁显示「今日 ¥x.xx」（今日无调用时不占位），title 带调用次数与 Token；币种跟随设置页的 ¥/$ 选择

## 安装

插件已发布到 npm：`dsh-plugin-usage`。

- **DSH Desktop**：设置 → 插件 → 添加插件，输入 `dsh-plugin-usage`
- **Web / CLI profile**：`dsh plugin --profile <name> add dsh-plugin-usage`，重启生效

升级同理（桌面端在插件页点更新，CLI 用 `update`）。

> `desktop` profile 由 Electron 应用独占，不能用 `dsh plugin --profile desktop` 操作。

## 配置

设置 → 插件 → `dsh-plugin-usage` 可改 `currency` 和 `prices`（每百万 Token 价格），写入 profile patch，重启保留。
`currency` 是默认显示币种；仪表盘参考成本卡里的 ¥ / $ 切换只影响当前界面（同浏览器记住选择）。

`prices` 默认**为空**，只用来放参考价目表给不了的 id（某条中转、某个私有 id）。
给一个价目表本来就能查到的 id 写行会盖住参考价 —— 这正是 0.4.0 之前那份手抄默认表
的问题（一行缓存价是官方 13.3 倍，七行是已下线的型号）。所以默认表不再预置任何行。

价格按下面的阶梯解析，**任何一级都不做相似度打分**：

1. 自定义（设置里的 `prices`，键可以是 `provider/model` 或裸 model）
2. 仪表盘「定价匹配」里确认过的模型（`matchMap`，可以指向价目表 id，也可以指向自定义价）
3. 精确字面命中（大小写、`provider/model` 前缀、`_`/`.`/`-` 分隔符、路由器加的
   `auto-` 前缀都归一再比）
4. 别名（`deepseek-chat`、`deepseek-reasoner`、`deepseek-v4-flash` 等已停用名的去向）
5. 变体后缀（`-free` / `-exp` / `-fast` / `-latest` / 四位日期，如 `-1017`）：
   去掉后缀后**能在表里查到基模型**才算命中，按基模型的价估算，标「模糊」

**精确优先**：价目表里真有这一行就是「精确」，推断不能盖住事实。所以 `-free` 结尾的
id 只要表里有这一行就是精确、按它自己的价（促销期就是 0，和宿主实际扣费一致）；只有
表里没有的变体名才落到第 5 级，标成「模糊」。

第 5 级是**封闭的改名规则，不是相似度**：后缀表固定，且基模型必须真实存在。
`deepseek-v4.1-flash-fast`、`deepseek-v4.1-flash-1017` → `deepseek-v4.1-flash`（模糊）；
`deepseek-v4-flash-0731` 没有基模型行，仍然「未匹配」，不会被塞到最像的那一行。

参考模型候选按来源分两组：**DeepSeek 官方**、**opencode Zen**。列表顶部另有一个
**自定义** 选项 —— 它不是一组参考模型，而是「直接填单价」：选中后在行内填三个数
（输入 / 输出 / 缓存读，单位就是表格的展示币种、每百万 Token），确定后写进 `prices`，
这一行的参考价就按你填的算，两档（高峰/空闲）同价。匹配到的行会在旁边标出来源。

五级都不中的模型在「定价匹配」里标为「未匹配」（排在待选表最前面），成本记 0；
选好参考模型点「确定」后写进 `matchMap`。DeepSeek 的两个型号按高峰/空闲两档计价：
**北京时间周一至周五（不含中国法定节假日）9:00-12:00、14:00-18:00 为高峰时段；
其余时段，包括周末及中国法定节假日全天均为空闲时段。**

## 数据来源与口径

> 输入区 pill 与设置页共用同一条 `usage/query` 通道，口径一致（今日 00:00 → 现在，按记录里的 `provider/model` 逐条计价）。它不看官方 `tokenUsage` 投影：那个投影只有会话内合计、不带模型归因，用来算钱会把不同单价混成一个数。口径是「今日」而不是「本会话」——宿主渲染 `conversation.composer.dock` 时不传 props，dock 条目拿不到会话标识。

折叠 DSH 会话日志中已持久化的用量事件，不自己记日志：

- 读取走官方接口：活跃会话由 `session/event` **推送**驱动（每个事件提交即折叠一次；原来每 2 s 轮询的
  `snapshotEvents()` 在 0.2.1-rc.4 已废弃），历史会话走 `sessionPersistence.open/read`，按 `revision`
  跳过未变日志；30 s 的那轮持久化扫描兼作补漏
- 折叠结果落盘缓存（`~/.dsh/cache/dsh-plugin-usage/fold/<会话>.json`，可用 `DSH_HOME` 改根目录）：
  一个会话一个文件，命中条件是该会话的 `revision` 与缓存里的一致，所以追加过的日志必然未命中重扫。
  签名里带 `FOLD_CACHE_VERSION` 与节假日历的 `capturedAt` —— 折叠规则或节假表一变，旧条目自动失效
  （缓存的 `tokens.peak/off` 只能由产生它的那份日历解释）。缓存坏了/读不了就当未命中，退回全量扫。
  实测：258 个会话、30k 条记录，热启动 0.08 s；冷启动仅读取+解压就要 12.5 s
- 计费对齐官方 `tokenUsage` 投影：同一 `(turn, step)` 替换；`llm/retry-started` 后的重试累加；`assistant/attempt` 的 stream 用量也计入
- fork 会话按 `inheritedEventCount` 跳过父会话前缀，不重复计费
- 费用 = Σ(各 Token 分桶 × 对应单价) / 1e6；DeepSeek 的分桶在扫描时就按当时的时段
  记成高峰/空闲，切换币种不改写分桶
- 价目表以**美元 / 百万 Token** 为基准（与 DeepSeek 官方价一致）；显示 `¥` 时按固定 7:1 折算，价目表本身不改写
- 价目表与节假日历由 `scripts/gen-prices.mjs` 生成（`npm run prices`），CI 每周跑一次，
  上游有变化才提 PR；生成物是 `.js` 而不是 `.json`，因为发布只带 `lib/`
- 法定节假日取自 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)；
  年份范围由**用量数据的日期跨度**决定并向后再顺延一年（`scripts/lib/holiday-years.mjs`）：
  取会话目录里最早/最晚的会话文件年份，往前留一年余量、往后多备一年，所以旧会话与来年
  一月都落在覆盖范围内。`--holiday-years 2024-2027` / `--usage-from` / `--usage-to` 可显式覆盖。
- 还未公布的年份（国务院一般 11 月公布次年安排）会以 `unpublished: true` 记进表里，不丢掉；
  「参考成本」的提示里会写明覆盖到哪一年、哪年未公布 —— 那种年份只能按周末规则判定，
  窗口内撞上节假日的调用会偏高（不会偏低）。

## 兼容性

- DSH `>=0.2.1-rc.3 <0.3.0`（`engines.dsh`；在 `0.2.1-rc.4` 上验证过两个原生契约门），Node ≥ 22
- 输入区成本 pill 依赖 0.2.1 的 `conversation.composer.dock`：0.2.0 没有这个 slot，注入失败只告警，不影响设置页
- 更早的宿主保留 `Session.events` / `readFrom` 回退路径

## 开发

```sh
npm install
npm run build          # tsc → lib/，再生成 lib/client/index.js
npm test               # 先构建（pretest），再跑单测 + 驱动构建产物的 UI 门
npm run verify:typert  # 用本机 DSH 里的官方 loader 校验 typert 贡献（缺 asar 会明确 SKIPPED）
npm run verify:remote  # 用本机真实的 cordis + typert 注册表跑通原生通道（同上）
```

`npm test` 有三层，外加一个真机契约门，缺一层就会漏掉一类问题：

| 层 | 覆盖什么 | 失败会长什么样 |
|---|---|---|
| `tests/*.test.js` | 纯函数与宿主行为（fold / pricing / rpc / typert …） | 断言 |
| `tests/dialog.test.cjs` | **构建产物**里的定价弹窗：真实 bundle + 假宿主，75 项 | `CHECK(S) FAILED` 并列出名字 |
| `tests/fold-parity.test.js` | 事件 fold 与官方 `tokenUsage` 投影的**对账** | 四个计数不相等 |
| `npm run verify:remote` | 真实 cordis + 真实 typert 注册表：面注册、接收方服务、以及"激活期一次性探测会失败"这个回归 | `CHECK(S) FAILED` |

对账用的 fixture 是**录**下来的，不是手写：`scripts/fold-parity-fixture.mjs` 从本机 asar 里取出
官方 `@deepseek-ai/dsh-token-meter` 的 `usage-projection.js`、原样执行、把结果写进
`tests/fixtures/token-usage-parity.json`。DSH 升级后重跑它，别手改数字。

CI 跑 install → build → test → bundle id 契约 → tarball 内容检查；推 `v*` tag 会校验版本、构建测试并创建 GitHub Release。

```
src/host/    宿主：scan / fold / fold-cache / query / state / aggregate / prices / pricing / peak / holidays / settings / rpc / typert
src/client/  设置页「用量统计」仪表盘（纯 JS，样式内联）
scripts/     构建入口 + 价目与节假表生成（gen-prices / holiday-years）+ fold 对账录制 + 两个原生契约校验
docs/        与原生 DSH 的距离：L2 补缺的取证（含"读请求触发写"这条权衡）、升级路径与已对齐清单
```

浏览器半 → 宿主半的通道：优先走原生 typert Remote（`src/host/typert.js` 注册面、客户端
`remote.$mount` 挂载），取不到时自动落回 `connection.fetch` 的 `/api/usage/*`。两条都常驻，
所以宿主有没有那个服务都不会让页面瞎掉；实际走了哪条由 dashboard 响应里的 `channel` 字段写明。

### 装进本机 profile 时的一条硬规矩

用官方插件管理器装（`plugin_manager install_bundle` + `file:` tarball）。但 pnpm 对
**同版本号、同路径**的 `file:` 依赖有一条让人踩坑的判定链，实测（2026-10-31，pnpm 11.7/11.28）：

| 尝试 | 结果 |
|---|---|
| 同版本、换掉 tarball 内容后再 `install_bundle` | `ambiguous-install`：只有清理没有新增，什么都没装 |
| `pnpm install --force` | `Already up to date`（或仍装旧内容）——它按**锁文件里的 integrity** 从 store 取，不看文件本身变了 |
| 删掉 `node_modules/<pkg>` 再 `pnpm install` | 依旧 `Already up to date`，目录**不会**被补回来 |

所以同版本替换**没有**可靠办法，别去试。唯一稳的路径是：**升版本号 → `install_bundle` → 重启**。

> ⚠️ **不要在 DSH 运行时手工覆盖 `node_modules/<pkg>`。** 2026-10-31 02:00 实测：把 tarball 直接
> 铺进正在运行的 profile 后约 0.8 秒，宿主进程以 `0xC0000005`（STATUS_ACCESS_VIOLATION）退出，
> 前端整块掉线。崩溃日志里没有本插件的栈帧（这不是 JS 异常），但时间点与覆盖完全吻合——
> 运行中的宿主正在读这些文件，替换它们是不可接受的操作。**先退出 DSH，再改文件；或干脆走管理器 + 重启。**

版本号只在"值得发版"时动：曾经一天之内 0.4.1→0.4.7 七个补丁，其中三个纯粹是为了绕过上面这条，
等于把工具约束写进了产品版本线。

装完必须**核对产物**，不能只看管理器回 `applied`：读 `package.json` 的版本、
`grep` 一两个本次新增的标识（如 `TipRows`），再决定要不要重启——**只改客户端就刷新页面，改了宿主半才需要重启**。

> 开发期也可用 `--patch` 从源码加载：`dsh web --patch cordis.yml`（路径见 `cordis.yml`）。

## License

[MIT](./LICENSE)
