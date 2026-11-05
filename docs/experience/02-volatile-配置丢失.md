# 02 · volatile 配置丢失

## 症状

在设置里改的币种、手填单价、以及「定价匹配」里确认过的模型，**重启后全部回到默认**；
宿主日志里没有任何报错，界面也不提示保存失败。

## 根因

写配置走官方 `settings.update('usage', patch)`。官方 settings 服务只接受**全部由 volatile
字段组成**的 patch：没有任何字段标 `.volatile()` 时 `volatileForm(schema)` 是 `undefined`，
`write()` 直接抛 `has no volatile fields`；`validatePaths` 还会拒绝 patch 里的非 volatile 键。
当时的代码把 `settings.update(...)` 包在 `.catch(() => {})` 里，失败被完全吞掉，于是每次写入
都静默失败、每次重启都读回默认值。

## 证据

- `src/host/index.js` 的 `Config` 注释保留了这条事故：三个字段（`currency` / `prices` /
  `matchMap`）都必须 `.volatile()`，否则 `settings.update('usage', …)` 每次写都抛；
- 同一个文件里 `persist()` 现在把失败经 `logSink` 写进宿主日志，不再静默；
- `CHANGELOG.md` 0.5.0：「设置写入全部走 `.volatile()` 字段，重启后自定义价与已确认匹配不再丢失」。

## 结论

- 所有写回的配置字段一律 `.volatile()`，这是官方 settings 写入的硬要求；
- **写入失败必须记日志**，禁止 `.catch(() => {})`；
- 读取时还要解包 volatile 包装（`plainConfigValue`），否则 `Config()` 校验会抛
  `expected string but got [object Object]`，整个插件激活失败。

## 日期

2026-10-31（0.5.0 修复）
