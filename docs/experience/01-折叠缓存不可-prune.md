# 01 · 折叠缓存不可 prune

## 症状

重启 DSH 后打开「用量统计」，每次都要重新折叠全部历史（冷启动约 12 s），面板上的数字
「一格格往上爬」；折叠缓存目录里明明已经有文件。

## 根因

`src/host/scan.js` 曾在每轮扫描结束时按 `sessionPersistence.list()` 的结果**清理**不在列表里的
缓存条目。但 `list()` 在宿主启动预热期返回的是**部分列表**：「这次没列出来」不等于「会话已删除」。
于是一轮扫描把仍然有效的条目全删了，下一次启动又得全量重折 —— 正好是缓存要消除的那个症状。

## 证据

- 2026-10-30 00:18 实测：一次 `prune()` 删掉 **257 / 258** 条有效缓存；
- `src/host/fold-cache.js` 的注释保留了这段事故记录，并明确写出「There is deliberately no prune()」；
- `src/host/scan.js` 的 `finishPass` 同样保留「Do NOT prune entries missing from this listing」。

## 结论

- 缓存**只增不删**；过期条目只占几 KB 磁盘，且只会按 id 从列表里读取，不会被误用；
- 正确性靠签名（`FOLD_CACHE_VERSION` + 节假表 `capturedAt`）与 `revision` 命中条件保证，
  不靠目录清理；
- `tests/fold-cache.test.js` 把「不做 prune」钉成行为；要清理缓存请用户手动删目录，
  或等官方给出可靠的「已删除会话」信号。

## 日期

2026-10-30（事故）；2026-10-31（0.5.0 修复并加门）
