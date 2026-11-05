<p align="center">
  <img src="https://github.com/user-attachments/assets/a29b952a-ae96-4185-b2e3-c7e7306054b1" alt="用量统计仪表盘：KPI 卡片、每日趋势、年度热力图与按模型明细" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/bennett-dsh/dsh-plugin-usage?style=flat&amp;label=release&amp;color=08C" alt="GitHub release">
  <img src="https://img.shields.io/badge/plugin-Token%20%E7%BB%9F%E8%AE%A1-47848F?style=flat" alt="Token statistics plugin">
  <img src="https://img.shields.io/badge/DSH%20Web%20GUI-Windows%20%7C%20macOS%20%7C%20Linux-4493F8?style=flat" alt="Windows | macOS | Linux">
  <img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License">
  <a href="https://github.com/bennett-dsh/dsh-plugin-usage/actions/workflows/ci.yml"><img src="https://github.com/bennett-dsh/dsh-plugin-usage/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center"><sub>简体中文 · <a href="README.en.md">English</a></sub></p>

<h3 align="center">按天 / 自定义范围查看 Token、调用次数与参考成本，按模型归因的一站式用量面板</h3>

<p align="center"><a href="#安装"><ins><code>dsh plugin --profile web add dsh-plugin-usage</code></ins></a></p>

`dsh-plugin-usage` 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **Token 用量统计插件**：折叠 DSH 会话日志里已持久化的用量事件，按模型、按交易时刻计价，在设置页渲染仪表盘，并在输入区常驻一个「今日参考成本」pill。它不自己记账，也不改任何系统源码。

- **今日 / 近 7 天 / 近 30 天 / 全部 / 自定义范围**（不限跨度），按小时·天聚合
- **按模型明细**：请求数、输入/输出、缓存、成本、占比；模型筛选即时生效
- **参考成本**：内置 opencode Zen + DeepSeek 价目，高峰/空闲按时段计价，支持 ¥ / $ 切换
- **定价匹配**：五级确定性阶梯，未匹配的模型可在弹窗里手动指定参考模型或直接填单价
- **年度热力图**、每日/每小时趋势图，深/浅色自适应，只用 DSH 主题变量
- **输入区成本 pill**：composer 旁显示「今日 ¥x.xx」（今日无调用时不占位），币种跟随设置
- **插件详情页求星行**：插件管理器的详情页底部一行「⭐ 用着顺手？给个 Star 支持一下」

> **语言**：界面文案与插件元信息随 DSH 语言切换，内置 **8 种官方语言**（zh / en / ja / de / es / fr / pt / ru）。其中 ja / de / es / fr / pt / ru 为机器翻译（人工粗校），欢迎在 Issue 里纠正；中文与英文由维护者维护。本 README 提供 [简体中文](README.md) 与 [English](README.en.md) 两版。

## 安装

插件已发布到 npm：`dsh-plugin-usage`（见 [registry.npmjs.org](https://www.npmjs.com/package/dsh-plugin-usage)）。

- **DSH Desktop**：侧栏 → 插件 → 添加插件，输入 `dsh-plugin-usage`
- **Web / CLI profile**：`dsh plugin --profile <name> add dsh-plugin-usage`，重启生效
- **从 GitHub 安装**（等价，可锁 tag 或 commit）：

  ```sh
  dsh plugin --profile web add github:bennett-dsh/dsh-plugin-usage#v0.6.0
  ```

- **本地目录 / tarball**（开发或离线环境）：

  ```sh
  dsh plugin --profile web add ./dsh-plugin-usage
  dsh plugin --profile web add ./dsh-plugin-usage-0.6.0.tgz
  ```

升级同理（桌面端在插件页点更新，CLI 用 `update`）。卸载：`dsh plugin --profile <name> remove dsh-plugin-usage`。

> `desktop` profile 由 Electron 应用独占，不能用 `dsh plugin --profile desktop` 操作；桌面端请走插件页。
> 安装后核对产物与重启规则见 [MAINTAINING.md](MAINTAINING.md#安装与升级的硬规矩)。

## 配置

配置字段只有三个，落在当前 profile 的 Cordis patch（`settings.update('usage', …)`），全部标 `.volatile()`：运行时写入即生效、重启保留；手动改 profile patch 则需重启。

| 字段 | 含义 |
| --- | --- |
| `currency` | 默认显示币种（固定汇率 1 USD = 7 CNY） |
| `prices` | 自定义参考定价：模型 id → 每百万 Token 的输入/输出/缓存读/缓存写，单位美元 |
| `matchMap` | 已确认的模型匹配：模型 id → 参考模型 id（在「定价匹配」里点确定时写入） |

`prices` 默认**为空**，只用来放参考价目表给不了的 id（某条中转、某个私有 id）。给一个价目表本来就能查到的 id 写行会盖住参考价 —— 这正是 0.4.0 之前那份手抄默认表的问题（一行缓存价是官方 13.3 倍，七行是已下线的型号）。所以默认表不再预置任何行。

价格按下面的阶梯解析，**任何一级都不做相似度打分**：

1. 自定义（设置里的 `prices`，键可以是 `provider/model` 或裸 model）
2. 仪表盘「定价匹配」里确认过的模型（`matchMap`）
3. 精确字面命中（大小写、`provider/model` 前缀、`_`/`.`/`-` 分隔符、路由器加的 `auto-` 前缀都归一再比）
4. 别名（`deepseek-chat`、`deepseek-reasoner`、`deepseek-v4-flash` 等已停用名的去向）
5. 变体后缀（`-free` / `-exp` / `-fast` / `-latest` / 四位日期，如 `-1017`）：去掉后缀后能在表里查到基模型才算命中，按基模型的价估算，标「模糊」

**精确优先**：价目表里真有这一行就是「精确」，推断不能盖住事实。第 5 级是**封闭的改名规则，不是相似度**：后缀表固定，且基模型必须真实存在。

参考模型候选按来源分两组：**DeepSeek 官方**、**opencode Zen**。列表顶部另有一个 **自定义** 选项 —— 直接填三个数（输入 / 输出 / 缓存读，单位是表格的展示币种、每百万 Token），写进 `prices`，两档（高峰/空闲）同价。

DeepSeek 的两个型号按高峰/空闲两档计价：**北京时间周一至周五（不含中国法定节假日）9:00-12:00、14:00-18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。**

> 仪表盘参考成本卡里的 ¥ / $ 切换只影响当前浏览器（`localStorage`），不改 `currency`。当前内核不会为本插件自动生成配置页：`prices` / `matchMap` 的界面入口是仪表盘的「定价匹配」，要改 `currency` 默认值或手写 `prices`，编辑 profile 的 `cordis.patch.yml` 里 `usage` 行的 `config`（详见 [配置项](docs/guide/configuration.md)）。
> 改 `locale/*.json` 的插件标题/描述需要**重启应用**（宿主启动时读取）；改客户端界面字典刷新页面即可。详见 [配置项](docs/guide/configuration.md)。

## 数据来源与口径

输入区 pill 与设置页共用同一条 `usage/query` 通道，口径一致（今日 00:00 → 现在，按记录里的 `provider/model` 逐条计价）。它不看官方 `tokenUsage` 投影：那个投影只有会话内合计、不带模型归因，用来算钱会把不同单价混成一个数。口径是「今日」而不是「本会话」——宿主渲染 `conversation.composer.dock` 时不传 props，dock 条目拿不到会话标识。

折叠 DSH 会话日志中已持久化的用量事件，不自己记日志：

- 读取走官方接口：活跃会话由 `session/event` **推送**驱动（每个事件提交即折叠一次）；历史会话走 `sessionPersistence.open/read`，按 `revision` 跳过未变日志；30 s 的那轮持久化扫描兼作补漏
- 折叠结果落盘缓存（`~/.dsh/cache/dsh-plugin-usage/fold/<会话>.json`，可用 `DSH_HOME` 改根目录）：一个会话一个文件，命中条件是该会话的 `revision` 与缓存里的一致；签名里带 `FOLD_CACHE_VERSION` 与节假日历的 `capturedAt`
- 计费对齐官方 `tokenUsage` 投影：同一 `(turn, step)` 替换；`llm/retry-started` 后的重试累加；`assistant/attempt` 的 stream 用量也计入
- fork 会话按 `inheritedEventCount` 跳过父会话前缀，不重复计费
- 费用 = Σ(各 Token 分桶 × 对应单价) / 1e6；DeepSeek 的分桶在扫描时就按当时的时段记成高峰/空闲，切换币种不改写分桶
- 价目表以**美元 / 百万 Token** 为基准；显示 `¥` 时按固定 7:1 折算
- 价目表与节假日历由 `scripts/gen-prices.mjs` 生成（`npm run prices`），CI 每周跑一次，上游有变化才提 PR
- 法定节假日取自 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)；年份范围由用量数据的日期跨度决定并向后再顺延一年

## 兼容性

- DSH `>=0.2.1-rc.3 <0.3.0`（`engines.dsh`；在 `0.2.2-rc.1` 上验证过两个原生契约门与 250 项单测），Node ≥ 22
- 设置页导航图标走官方 `settings.section.icon`（0.2.2-rc.1）：注册 id 必须等于 section id（`token-stats`）；更早的内核没有这个槽，行内图标退化成官方齿轮，其余功能不变
- 插件详情页求星行走官方 `plugins.detail.section`（0.2.2-rc.1）：更早的内核没有这个槽，页面只是少一行
- 输入区成本 pill 依赖 0.2.1 的 `conversation.composer.dock`：0.2.0 没有这个 slot，注入失败只告警，不影响设置页
- 更早的宿主保留 `Session.events` / `readFrom` 回退路径

## 文档

公开文档库在 [docs/](docs/README.md)：设计取舍、装配契约、配置、故障排查、版本兼容、项目经验。维护者作业手册在 [MAINTAINING.md](MAINTAINING.md)，路线图/决策/调研等私有材料在 `docs-private/`（只有入口 README 入库）。

- [设计说明](docs/design.md) · [装配契约](docs/reference/architecture.md) · [原生对齐记录](docs/reference/native-alignment.md)
- [配置项](docs/guide/configuration.md) · [故障排查](docs/guide/troubleshooting.md) · [验收记录](docs/testing.md)
- [更新日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

## 开发

```sh
npm install
npm run build          # tsc → lib/，再生成 lib/client/index.js
npm test               # 先构建（pretest），再跑单测 + 文档链接门
npm run verify:typert  # 用本机 DSH 里的官方 loader 校验 typert 贡献（缺 asar 会明确 SKIPPED）
npm run verify:remote  # 用本机真实的 cordis + typert 注册表跑通原生通道（同上）
npm run check:docs     # 只跑公开文档的相对链接/锚点校验
```

`npm test` 有五层，缺一层就会漏掉一类问题：

| 层 | 覆盖什么 | 失败会长什么样 |
| --- | --- | --- |
| `tests/*.test.js` | 纯函数与宿主行为（fold / pricing / rpc / typert / i18n …） | 断言 |
| `tests/*.test.cjs` | **构建产物**里的定价弹窗与插件详情页：真实 bundle + 假宿主，75 项 | `CHECK(S) FAILED` 并列出名字 |
| `tests/fold-parity.test.js` | 事件 fold 与官方 `tokenUsage` 投影的**对账** | 四个计数不相等 |
| `npm run verify:remote` | 真实 cordis + 真实 typert 注册表：面注册、接收方服务、以及"激活期一次性探测会失败"这个回归 | `CHECK(S) FAILED` |
| `node tools/check-docs.mjs` | 公开文档的相对链接与锚点 | 列出失效链接 |

对账用的 fixture 是**录**下来的，不是手写：`scripts/fold-parity-fixture.mjs` 从本机 asar 里取出官方 `@deepseek-ai/dsh-token-meter` 的 `usage-projection.js`、原样执行、把结果写进 `tests/fixtures/token-usage-parity.json`。DSH 升级后重跑它，别手改数字。

CI 跑 install → build → test → bundle id 契约 → tarball 内容检查；推 `v*` tag 会校验版本、构建测试并创建 GitHub Release。

```text
src/host/    宿主：scan / fold / fold-cache / query / state / aggregate / prices / pricing / peak / holidays / settings / rpc / typert
src/client/  设置页「用量统计」仪表盘 + 插件详情页求星行（纯 JS，样式内联）
scripts/     构建入口 + 价目与节假表生成（gen-prices / holiday-years）+ fold 对账录制 + 两个原生契约校验
docs/        公开文档库（导航 / 设计 / 参考 / 指南 / 经验 / 验收）
docs-private/ 私有文档库（只有入口 README 入库，其余被 .gitignore 排除）
tests/       单测、构建产物行为门、fold 对账、i18n 与文档链接门
```

浏览器半 → 宿主半的通道：优先走原生 typert Remote（`src/host/typert.js` 注册面、客户端 `remote.$mount` 挂载），取不到时自动落回 `connection.fetch` 的 `/api/usage/*`。两条都常驻，实际走了哪条由 dashboard 响应里的 `channel` 字段写明。

### 安装与升级的硬规矩

用官方插件管理器装（`plugin_manager install_bundle` + `file:` tarball）。但 pnpm 对 **同版本号、同路径**的 `file:` 依赖有一条让人踩坑的判定链（实测 2026-10-31，pnpm 11.7/11.28）：

| 尝试 | 结果 |
| --- | --- |
| 同版本、换掉 tarball 内容后再 `install_bundle` | `ambiguous-install`：只有清理没有新增，什么都没装 |
| `pnpm install --force` | `Already up to date`（或仍装旧内容）——它按**锁文件里的 integrity** 从 store 取 |
| 删掉 `node_modules/<pkg>` 再 `pnpm install` | 依旧 `Already up to date`，目录**不会**被补回来 |

所以同版本替换**没有**可靠办法。唯一稳的路径是：**升版本号 → `install_bundle` → 重启**。

> ⚠️ **不要在 DSH 运行时手工覆盖 `node_modules/<pkg>`。** 2026-10-31 02:00 实测：把 tarball 直接铺进正在运行的 profile 后约 0.8 秒，宿主进程以 `0xC0000005` 退出。**先退出 DSH，再改文件；或走管理器 + 重启。**
>
> 开发期用 junction / `link:` 安装时，`npm run build` 会重写 `lib/`，而运行中的宿主正在读它；构建尽量避开长时间任务，客户端改动刷新页面，宿主半改动需要重启。

版本号只在"值得发版"时动；装完必须**核对产物**（读 `package.json` 版本、`grep` 本次新增标识），不能只看管理器回 `applied`。

> 开发期也可用 `--patch` 从源码加载：`dsh web --patch cordis.yml`（路径见 `cordis.yml`）。

## License

[MIT](./LICENSE)
