# 05 · live 推送替代轮询

## 症状

活跃会话的用量大约每 2 秒才动一次；宿主日志/性能探针里能看到同一个会话的日志被反复读取，
即使期间没有任何新事件。

## 根因

活跃会话原来靠 2 s 轮询 `scanLive`，读侧是 `session.snapshotEvents()`。这个 API 在
0.2.1-rc.4 已标 deprecated（"new calls are prohibited"），而且每次轮询都把同一段日志重走一遍
才发现没有新东西 —— 既延迟，又浪费。

## 证据

- `src/host/scan.js` 的 `foldLiveEvent` 注释保留了 deprecated 原文与改造理由；
- `CHANGELOG.md` 0.5.1：「活跃会话改成 `session/event` 推送……2 s 轮询删除；30 s 的持久化扫描保留」；
- `tests/scan.test.js` 的推送门覆盖：事件折叠、fork 前缀不重复计费、重复投递不重复计费、
  坏事件不抛、落后的持久化日志只从水位续读、真变短的日志才从头重折；
- `tests/native-hygiene.test.js` 钉住 `apply` 必须订阅 `session/event` 且不得再出现 `scanLive`。

## 结论

- 每个事件提交即折叠一次（`ctx.on('session/event')`，监听器随 fiber 卸载），延迟从「最多 2 s」
  变成「提交即到」；
- 30 s 持久化扫描保留，既按 `revision` 跳过未变日志，也兼作补漏（激活前就在跑的会话、
  或扫描途中提交的事件）；
- 顺带修掉重复计费隐患：用「本进程见过的最大持久化事件数」（`state.persistedCounts`）判断
  日志是否真的变短，落后的日志只从水位继续读，不再被当成「日志缩短」而从头重折。

## 日期

2026-11-05（0.5.1）
