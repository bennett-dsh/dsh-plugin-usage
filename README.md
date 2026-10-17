# dsh-plugin-usage

DeepSeek Harness 的 **Token 用量统计**插件（UI 参考 CC Switch 的「用量统计」功能）。

> A **token usage statistics** plugin for DeepSeek Harness, inspired by CC Switch's usage stats.
>
> GitHub: [bennett-dsh/dsh-plugin-usage](https://github.com/bennett-dsh/dsh-plugin-usage) · npm: `dsh-plugin-usage`

- 按天 / 自定义时间范围查看 Token 用量
- 按模型筛选，查看调用次数、输入/输出 Token、缓存命中、费用
- 可配置的每百万 Token 价格表（内置 DeepSeek 常见模型默认价，未配置的模型标记为「未定价」）
- 深/浅色主题自适应（使用 DSH 主题变量），无第三方图表库（手写堆叠柱状图）

> Features: daily / custom-range views · model filtering · call counts, in/out tokens, cache hits & cost · configurable per-million-token pricing (built-in defaults for common DeepSeek models; unpriced models are flagged) · dark/light theme via DSH tokens · zero chart dependencies (hand-written stacked bars).

## 功能特性 / Features

- 📊 **用量总览** — 总 Token、输入/输出 Token、调用次数、成本汇总卡片
- 📅 **时间范围** — 今日 / 近 7 天 / 近 30 天 / 自定义范围
- 🔍 **模型筛选** — 多选模型，按模型查看明细与占比
- 📈 **每日趋势** — 按天堆叠柱状图（输入=蓝、输出=绿），hover 查看明细
- 💰 **定价配置** — 为模型设置每百万 Token 价格（输入 / 输出 / 缓存命中 / 缓存创建），保存后立即生效
- 🌗 **主题自适应** — 跟随 DSH 深/浅色主题，无第三方图表库

## 效果图

![alt text](image.png)

![alt text](image-1.png)

## 安装与构建 / Install & Build

```sh
npm install        # 首次（devDependencies：typescript）
npm run build      # tsc 输出到 lib/，并生成 client 模块入口
```

### 通过官方命令安装（推荐）/ Install via the Official Command

插件已发布为 npm 包，使用 DSH 官方的插件管理命令安装：

```sh
dsh plugin --profile web add dsh-plugin-usage
dsh web            # 重启后生效
```

安装后 `dsh` 会检测到包的 `dsh.bundle` 声明，自动把 `dsh-plugin-usage` 加入
profile 的 `dsh.profile.bundles` 层栈，无需手动编辑任何配置文件。卸载 / 更新：

```sh
dsh plugin --profile web remove dsh-plugin-usage   # 卸载
dsh plugin --profile web update dsh-plugin-usage   # 更新
```

> 若 pnpm 因「发布时间过新」拒绝安装（`minimumReleaseAge` 校验），把
> `dsh-plugin-usage@<version>` 加入 profile 的 `pnpm-workspace.yaml` 的
> `minimumReleaseAgeExclude` 列表后重试（官方对新发布包同样采用此做法）。

### 从源码加载 / Load from Source

正式加载使用 patch 方式：把以下条目加入 `~/.dsh/profiles/web/cordis.patch.yml`（或使用 `--patch` 参数），路径替换为你本地的仓库路径：

```yaml
- insert:
  - id: usage-host
    name: '/path/to/dsh-plugin-usage/lib/host/index.js'
  - id: usage-client
    name: '/path/to/dsh-plugin-usage/lib/client/index.js'
```

然后启动：

```sh
dsh web --patch /path/to/dsh-plugin-usage/cordis.yml
```

开发期也可以在会话中通过动态插件（cordis_define）加载：Client UI 由 Host 的 `usage/client-source` RPC 从 `src/client/index.js` 实时读取并在浏览器中评估（UI 代码只有一份，改完刷新即生效）。

## 使用说明 / Usage

1. 打开设置（左下角）→ 左侧导航「用量统计」。
2. 顶部筛选：日期预设（今日 / 近 7 天 / 近 30 天 / 自定义）、模型多选。
3. 汇总卡：总 Token、输入 Token、输出 Token、调用次数、成本（未定价调用会在卡片下提示）。
4. 每日用量趋势：按天堆叠柱状图（输入=蓝、输出=绿），hover 查看明细。
5. 按模型明细表：请求数 / 输入 / 输出 / 总 Token / 成本 / 占比。
6. 「定价配置」区块：为模型设置每百万 Token 价格，保存后立即生效。

## 数据来源与口径 / Data Source

插件**不自己记录原始日志**，而是折叠 DSH 已持久化的会话日志：

- DSH 的 agent loop 把每次模型调用的用量写进会话日志：`assistant/message` 携带
  `usage`（输入/输出/缓存命中/缓存创建 Token）与 `message.source.{provider,model}`；
  重试或失败但已计费的调用记为 `assistant/attempt`（无 `usage` 字段，usage 在其
  `stream` 的最后一个 `usage` chunk 里）。日志是 v4 zstd（`~/.dsh/sessions/**/session.v4.jsonl.zstd`）。
- 读取走官方 0.2.x 访问器：活跃会话 `ctx.sessions.list()` + `session.snapshotEvents(seq)`；
  持久化会话 `ctx.sessionPersistence.list()`（`{header, revision, eventCount?}`）+
  `open(id, 'read')` → `handle.read(offset)`，并按 `revision` 跳过未变更的日志。
- 启动时**回填（backfill）全部历史会话**，之后每 2s 扫描活跃会话、每 30s 扫描持久化会话
  （按 seq 水位 + revision）。
- 覆盖范围：所有 agent loop 调用（含子代理）。compaction / session-title 等辅助调用不写入
  会话日志，不在统计范围内。
- 计费口径对齐官方 `tokenUsage` 投影：同一 `(turn, step)` 的后续样本**替换**先前样本；
  但 `llm/retry-started` 之后的重试是新的计费调用，**累加**。fork 会话按
  `inheritedEventCount` 跳过父会话前缀，不重复计费。
- 无 `message.source` 的结算按最近的 `request/context` / `request/header` 路由归因。
- 费用 = `(输入×输入价 + 输出×输出价 + 缓存命中×缓存命中价 + 缓存创建×缓存创建价) / 1e6`，价格表可改。
- 价格表就是插件配置：`src/host/index.js` 导出 schemastery `Config`，DSH 在
  Plugins 配置页生成表单并存入 profile patch（重启保留）；客户端定价编辑走官方
  `ctx.configForms.get('usage')`，不可用时回退 `usage/prices` RPC。

> 动态插件形态下数据保存在进程内存中，重启后自动从会话日志重新回填，无需落盘文件。

## 源码结构 / Project Structure

```
src/
├── host/
│   ├── index.js         Host 入口：接线 fold / scan / query / settings / aggregate / rpc / client-source，驱动定时扫描
│   ├── settings.js      价格表 + 费用计算（内置 DeepSeek 常见模型默认价，配置由 index.js 的 Config 承载）
│   ├── state.js         运行时状态：records / watermarks / revisions / lastSample / route / backfill / index
│   ├── aggregate.js     增量聚合索引：add / remove / recordsInRange，供查询高效取数
│   ├── fold.js          会话事件 → usage 记录（对齐官方 tokenUsage：替换槽、retry 累加、attempt/stream usage、路由归因）
│   ├── scan.js          启动回填 + 活跃/持久化会话增量扫描（0.2.x snapshotEvents / open+read，revision 跳过，水位修复）
│   ├── query.js         聚合与查询：按天/按模型汇总、未定价检测、heatmap
│   ├── rpc.js           传输注册：动态 harness / Typert 网关 / 静态安装的 Connection 共享 `/api` Fetch 路由（含旧版 `/usage` 前缀通道回退）
│   ├── client-source.js 读取 src/client/index.js 实时提供给浏览器（动态插件形态）
│   └── time.js          时间分桶：day/hour/minute 粒度与 step 网格（纯函数）
├── client/index.js   Client half：设置页「用量统计」仪表盘（筛选/汇总卡/柱状图/模型表/定价配置），样式内联
└── client/styles.js  UI 样式源（构建脚本已合并进 index.js，可删除）
scripts/
└── build-client.js   构建时生成 lib/client/index.js 模块入口（同一份 UI 代码的正式加载形态）
cordis.patch.yml      bundle patch：`dsh plugin add` 安装后由 `dsh.bundle` 声明自动激活
```

## 开发与测试 / Development & Testing

```sh
npm install        # 首次安装依赖（devDependencies：typescript）
npm run build      # tsc 输出到 lib/，再由 scripts/build-client.js 生成 client 模块入口
npm test           # node --test tests/
```

`src/host/` 下的宿主逻辑（fold / scan / query / aggregate / time / settings 等）均为可直接
import 的 ESM 模块，单元测试直接运行，无需启动 DSH harness。CI（Node 22/24）跑
install → build → test → bundle id 契约 → tarball 内容检查。

兼容性：`engines.dsh` 声明 `>=0.2.0-rc.2 <0.3.0`（0.2.x 官方 API），更早版本依赖
`readFrom` / `Session.events` 回退路径。

## 说明 / Notes

- 插件名 `usage`；动态插件运行在会话级，卸载后统计重新回填即可恢复。
- 价格表持久化策略见「数据来源与口径」（插件 `Config` → 官方 Plugins 配置页 → profile patch；
  0.2.x 没有可用的 `settingsScope` / `settings.register`，旧路径已删除）。
- 静态安装的传输：DSH 0.2+ 注册在 Connection 共享 `/api` 通道的 exact Fetch 路由上
  （`POST /api/usage/query`、`/api/usage/prices`、`/api/usage/client-source`，请求体为
  args JSON，响应为 `{ ok, value }` / `{ ok, error }`）；旧版宿主自动回退到 `/usage`
  前缀 RPC 通道。这条路由不依赖插件自身 fiber 注入 `webServer`——0.2.x 下后者会抛错并
  让通道静默消失（症状是查询一律 HTTP 405），见
  [#1](https://github.com/bennett-dsh/dsh-plugin-usage/issues/1)。
- 客户端 bundle 的 loader id 在构建时取自 `package.json#name`，因此 scoped 名、
  npm alias、`file:` tarball 等安装形态都能正常注册（不要手改 `lib/client/index.js`）。

## 开源协议 / License

[MIT](./LICENSE)
