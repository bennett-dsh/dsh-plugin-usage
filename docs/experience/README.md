# 项目经验

> 症状 → 根因 → 证据 → 结论。改代码前先扫一遍，避免把踩过的坑再踩一次。

| # | 条目 | 一句话 |
| --- | --- | --- |
| 01 | [折叠缓存不可 prune](01-折叠缓存不可-prune.md) | 启动预热期的会话列表是部分的，按「不在列表里」删缓存会删掉有效条目 |
| 02 | [volatile 配置丢失](02-volatile-配置丢失.md) | 非 volatile 字段让整份 settings patch 被拒，旧 `.catch` 又把失败藏了起来 |
| 03 | [logSink 崩溃](03-logsink-崩溃.md) | `logSink` 返回函数不是 logger，`.warn` 把读请求变成宿主退出 |
| 04 | [bundle id](04-bundle-id.md) | 客户端 loader id 硬编码，scoped / alias 安装永远等不到工厂 |
| 05 | [live 推送替代轮询](05-live-推送替代轮询.md) | 2 s 轮询读的是已废弃的 `snapshotEvents()`，改成 `session/event` 推送 |
| 06 | [读请求触发写](06-读请求触发写.md) | 在 `apply` 里预热，加载态永远发生在面板打开之前 |
| 07 | [求星行自过滤](07-求星行自过滤.md) | `plugins.detail.section` 每个详情页都派发，条目必须按包名自过滤 |
| 08 | [槽位 id 对齐](08-槽位-id-对齐.md) | `settings.section.icon` 按 `only: row.id` 匹配，对不上永不渲染也不报错 |
| 09 | [测试污染真实缓存](09-测试污染真实缓存.md) | 扫描用例不传 `cache:false` 会写真实 fold 缓存，第二次运行必红 |
| 10 | [求星行被页脚压到最后](10-求星行被页脚压到最后.md) | 与市场来源行同占一个 slot；order 100 > 90 会被排到「查看仓库↗」之后 |
