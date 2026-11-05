# 配置项

插件有三个 durable 配置字段，schema 定义在 `src/host/index.js` 的 `Config`，三个字段都标了 `.volatile()`。
**当前内核（0.2.2-rc.1）不会为本插件自动生成配置页**：本插件没有注册 `plugins.row.config`，
所以插件页里没有「配置」控件；界面上的写入口是仪表盘本身（见下）。

| 字段 | 界面入口 | 持久化 |
| --- | --- | --- |
| `prices` | 仪表盘「定价匹配」→ 顶部「自定义」填三个单价，点确定 | `settings.update('usage', …)` → profile patch |
| `matchMap` | 仪表盘「定价匹配」→ 选参考模型，点确定 | 同上 |
| `currency` | **没有界面入口**（参考成本卡的 ¥/$ 只改本浏览器显示） | 直接编辑 profile patch 的 `usage` 行 `config` |

> 高级用法：在 `profiles/<name>/cordis.patch.yml` 的 `usage` 行下写 `config: { currency: USD }`，
> 重启后生效；`prices` 的手写行同理（键是模型 id，值是 `inputPerM` / `outputPerM` /
> `cacheReadPerM` / `cacheWritePerM`）。不要改 `settings.yaml` —— 0.2.x 没有这条路径。

| 字段 | 取值 | 默认 | 含义 |
| --- | --- | --- | --- |
| `currency` | `¥` / `$`（也接受 `CNY` / `USD`） | `¥` | 宿主侧默认显示币种；请求未带 `currency` 时使用 |
| `prices` | `{ 模型 id: { inputPerM, outputPerM, cacheReadPerM, cacheWritePerM } }` | `{}` | 自定义参考价，单位**美元 / 百万 Token**；只用于价目表答不了的 id |
| `matchMap` | `{ 模型 id: 参考模型 id }` | `{}` | 「定价匹配」里确认过的匹配 |

## `prices` 为什么默认是空的

`prices` 是**覆盖**，不是价目表。价目表能回答的 id 必须由生成的表回答；默认预置一份手抄价
会造成两个事实源，而且阶梯先查 `prices`，过时的那份会静默胜出（0.4.0 之前就有一行缓存价是
官方 13.3 倍、十行里七行是已下线的型号）。

给一个价目表本来就能查到的 id 写行会盖住参考价；只有中转、私有 id 这类表里没有的模型才需要
在这里填。价目表基准是美元，界面按展示币种换算。

## 存储位置

- 值写在当前 profile 的 Cordis patch（`profiles/<name>/cordis.patch.yml`），跟随 profile；
- 写入走官方插件配置路径 `settings.update('usage', patch)`，`usage` 是
  `cordis.patch.yml` 里的行 id；
- **所有写回字段都必须是 `.volatile()`**：官方 settings 服务会拒绝含非 volatile 字段的
  patch（`has no volatile fields`），旧代码的 `.catch(() => {})` 曾把失败藏起来，
  导致自定义价与已确认匹配每次重启都丢（见 [经验 02](../experience/02-volatile-配置丢失.md)）。

## 生效方式

| 改动 | 生效 |
| --- | --- |
| `currency` / `prices` / `matchMap`（经 UI / `settings.update` 写入） | 即时（下一次查询/写入即生效，无需重启） |
| 手动改 profile patch 的 `usage` 行 `config` | **重启 app**（patch 在启动时组合） |
| 客户端 `lib/client/index.js` | 刷新页面 |
| 宿主半 `lib/host/*` | 重启 app，或在插件页把本行关掉再打开（`已关闭 → 运行中`） |
| `locale/*.json` 的包标题/描述 | **重启 app**（宿主启动时读取；刷新页面只重载客户端） |

## 仪表盘币种与「定价匹配」

- 参考成本卡里的 **¥ / $ 切换只影响当前界面**，同浏览器记住选择
  （`localStorage` 键 `dsh-plugin-usage:display-currency`）；输入区 pill 读同一份选择。
  宿主按请求里的 `currency` 在输出边界换算一次，切换后立即重查，不会「换了符号没换数字」。
- 「定价匹配」是**两段式**：打开弹窗只调 `pricing` 的 `propose`，不写任何东西；点「确定」
  才 `commit` 写进 `matchMap`（或 `prices`）。不改动就不落盘。
- 弹窗顶部另有一个**自定义**选项：它不是一组参考模型，而是「直接填单价」——选中后填
  输入 / 输出 / 缓存读三个数（单位是表格的展示币种、每百万 Token），确定后写进 `prices`，
  两档（高峰/空闲）同价。金额按当前展示币种换算成美元存储。
- 同一个 key 只留一个答案：手填价顶掉已确认的匹配，确认匹配 / 收回也会清掉手填价。
- 未匹配的模型排在最前面；选好参考模型点「确定」后写进 `matchMap`，五级都不中的成本记 0。
