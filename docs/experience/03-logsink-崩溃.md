# 03 · logSink 崩溃

## 症状

点开 设置 → 用量统计，页面直接报 `fatal load failure: TypeError: logSink(...).warn is not a function`，
随后 DSH 宿主进程退出，前端整块掉线。

## 根因

`logSink(ctx)` 的返回值是**函数** `(message, level?)`，不是 logger 对象。两处把它当对象用了：
`persist()` 里的 `const logger = logSink(ctx)` + `logger.warn(...)`，以及按需回填传入的
`log: (m) => logSink(ctx).warn(m)`。后者在 0.4.6 把回填搬到查询路径后立刻暴露：
扫描收尾写日志 → 抛错 → 进入 `catch` 又用同一个坏 sink 写日志 → 异常逃出 `runBackfill`
→ 宿主把未处理的 rejection 当致命错误，进程退出。

## 证据

- `CHANGELOG.md` 0.4.7 记录了完整调用链与修复；
- `src/host/scan.js` 的所有日志现在经过 `safeLog()`（sink 抛异常只丢一行）；
- `src/host/index.js` 的 `persist()` 注释明确写着「`logSink` returns a **function**, not a logger object」；
- `tests/lazy-backfill.test.js` 新增：日志 sink 抛异常时扫描仍落到 `done`；`logSink` 只能以函数形式
  调用（禁止 `.warn` / `.error`、禁止别名成 `logger` 对象）。

## 结论

- 后台任务（尤其由读请求拉起的）必须有 `.catch` 兜底，不能让 rejection 逃到宿主；
- 日志写入永远 best-effort：坏 logger 最多丢一行，不能弄挂进程；
- 把这条事故变成门（函数契约 + 坏 sink 用例），而不是只在注释里提醒。

## 日期

2026-10-31（0.4.7 修复）
