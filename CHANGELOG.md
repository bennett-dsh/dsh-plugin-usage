# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
