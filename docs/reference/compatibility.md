# 版本兼容

> 本插件跟随 DSH 实例升级。每次升级的结论与证据记在 [CHANGELOG.md](../../CHANGELOG.md)，
> 取证细节见 [原生对齐](native-alignment.md)。

## 验证基线

| 项 | 值 |
| --- | --- |
| 插件版本 | **0.6.0**（2026-11-05 定版；npm 发布前） |
| Harness 内核 | **0.2.2-rc.1** |
| `dsh.verifiedAgainst` | `0.2.2-rc.1` |
| `engines.dsh` | `>=0.2.1-rc.3 <0.3.0` |
| `engines.node` | `>=22` |

`engines.dsh` 不随基线一起收紧：`0.2.1-rc.3` 也验证过，抬 `verifiedAgainst` 只表示「更新的
构建上验过」，不缩小可安装范围。DSH 判定时用 `includePrerelease: true`，rc 版本落在区间内。

## 兼容矩阵

| 内核 | 设置页仪表盘 | 导航图标 | 输入区 pill | 详情页求星行 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 0.2.2-rc.1 | ✅ | ✅ 官方槽位 | ✅ | ✅ | 当前验证基线 |
| 0.2.1-rc.4 / rc.3 / rc.2 | ✅ | 齿轮（无 `settings.section.icon`） | ✅ | ❌ | 图标与求星行是 0.2.2 新增槽位 |
| 0.2.0 | ✅ | 齿轮 | ❌（无 composer dock） | ❌ | 更早的宿主保留 `Session.events` / `readFrom` 回退路径 |

**降级是刻意的**：没有的槽位 `slots.inject` 不触发，对应入口静默消失，插件不为它保留第二套
自绘实现；其余功能（统计、定价、两条通道）不受影响。

## 只在新内核上才有的能力

| 能力 | 依赖 | 首次可用 |
| --- | --- | --- |
| 导航行图标（非齿轮） | `settings.section.icon` | 0.2.2-rc.1 |
| 详情页底部求星行 | `plugins.detail.section` | 0.2.2-rc.1 |
| 输入区成本 pill | `conversation.composer.dock` | 0.2.1-rc.1 |
| 活跃会话按 `session/event` 推送折叠 | `session/event` 事件 | 0.2.1-rc.1 |
| 原生 typert Remote 通道 | `typert` 注册表 | 已在 0.2.1-rc.3 / 0.2.2-rc.1 验证 |

## DSH 升级对账清单

1. `npm run verify:typert` —— 官方 `validateTypertManifest` 接受贡献（4 端点）；
2. `npm run verify:remote` —— 真实 cordis + typert 注册表下 7/7，含「激活期一次性探测必然失败」
   的反向验证；
3. 重跑 `node scripts/fold-parity-fixture.mjs`，再跑 `tests/fold-parity.test.js`；
4. `npm test` —— 四层自动化门（沙箱内按 [验收记录](../testing.md) 的读法记录 EPERM）；
5. 对照 [装配契约](architecture.md) 的槽位与服务清单，用实时 Slots 目录复核槽位名；
6. 实机点一遍：设置页 / 输入区 pill / 详情页求星行 / 定价匹配；
7. 把结论与证据写进 `CHANGELOG.md`（零迁移也要写依据）。

0.5.1 在 0.2.2-rc.1 上的逐文件比对结论（0.6.0 运行时相同）：会话持久化 `list()` / `read(offset, length, options)`
签名未变，`tokenUsage` 投影字段未变（只有 `contextPressure` 多了 `summary: false`），
`settings.section` / `conversation.composer.dock` 槽位契约未变。

## 容易踩的两条

- **包标题/描述在宿主启动时读取**：改 `locale/*.json` 的 `meta` 后必须重启 app，刷新页面只
  重载客户端；界面字典（`ctx.locale.register`）则刷新即可。
- **`verifiedAgainst` 必须落在 `engines.dsh` 区间内**：验证了更新的构建就把基线抬上去，但不要
  顺手收紧下限；`tests/native-hygiene.test.js` 按区间判定而不是字符串相等。
