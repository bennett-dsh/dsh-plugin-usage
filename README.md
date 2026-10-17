# dsh-plugin-usage

DeepSeek Harness 的 **Token 用量统计**插件：按天 / 自定义范围查看 Token、调用次数与成本，支持模型筛选、定价配置和年度热力图。

> Token usage statistics for DeepSeek Harness.

![用量统计](image.png)
![明细与热力图](image-1.png)

## 功能

- 今日 / 近 7 天 / 近 30 天 / 自定义范围，按小时·天聚合
- 模型筛选、按模型明细（请求数、输入/输出、缓存、成本、占比）
- 可配置的每百万 Token 价格表（内置 DeepSeek 常见模型默认价）
- 年度热力图；深/浅色自适应，只用 DSH 主题变量，无第三方图表库

## 安装

插件已发布到 npm：`dsh-plugin-usage`。

- **DSH Desktop**：设置 → 插件 → 添加插件，输入 `dsh-plugin-usage`
- **Web / CLI profile**：`dsh plugin --profile <name> add dsh-plugin-usage`，重启生效

升级同理（桌面端在插件页点更新，CLI 用 `update`）。

> `desktop` profile 由 Electron 应用独占，不能用 `dsh plugin --profile desktop` 操作。

## 配置

设置 → 插件 → `dsh-plugin-usage` 可改 `currency` 和 `prices`（每百万 Token 价格），写入 profile patch，重启保留。

价格优先匹配 `provider/model`，其次裸 `model`；未配置的模型标为「未定价」，成本记 0。

## 数据来源与口径

折叠 DSH 会话日志中已持久化的用量事件，不自己记日志：

- 读取走官方接口：活跃会话 `snapshotEvents()`，历史会话 `sessionPersistence.open/read`，按 `revision` 跳过未变日志
- 计费对齐官方 `tokenUsage` 投影：同一 `(turn, step)` 替换；`llm/retry-started` 后的重试累加；`assistant/attempt` 的 stream 用量也计入
- fork 会话按 `inheritedEventCount` 跳过父会话前缀，不重复计费
- 费用 = Σ(各 Token 分桶 × 对应单价) / 1e6

## 兼容性

- DSH `>=0.2.0-rc.2 <0.3.0`（`engines.dsh`），Node ≥ 22
- 更早的宿主保留 `Session.events` / `readFrom` 回退路径

## 开发

```sh
npm install
npm run build   # tsc → lib/，再生成 lib/client/index.js
npm test        # node --test
```

CI 跑 install → build → test → bundle id 契约 → tarball 内容检查；推 `v*` tag 会校验版本、构建测试并创建 GitHub Release。

```
src/host/    宿主：scan / fold / query / settings / aggregate / rpc
src/client/  设置页「用量统计」仪表盘（纯 JS，样式内联）
scripts/     构建客户端 bundle 入口
```

> 开发期也可用 `--patch` 从源码加载：`dsh web --patch cordis.yml`（路径见 `cordis.yml`）。

## License

[MIT](./LICENSE)
