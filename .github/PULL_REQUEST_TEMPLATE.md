## 这个 PR 做了什么

<!-- 一句话说明 -->

## 为什么需要

<!-- 关联 Issue、现象或使用场景 -->

## 改动范围

- [ ] 浏览器半（`src/client/`）
- [ ] 宿主半（`src/host/`）
- [ ] 文案 / 语言（`locale/*.json`、8 本字典）
- [ ] 测试与工具（`tests/`、`scripts/`、`tools/`）
- [ ] 文档（`docs/`、README、CHANGELOG）

## 验证方式

<!-- 勾选并附证据（命令输出 / 截图 / 模型 id 与时段） -->

- [ ] `npm test` 通过（单测 + 构建产物门 + 文档链接门）
- [ ] `npm run verify:typert` / `npm run verify:remote` 通过（附 DSH / Harness 版本）
- [ ] 实机点过：设置 → 用量统计、输入区 pill、插件详情页求星行
- [ ] 多语言：切到 ja / de / ru 时新增文案不回落、无中文夹带
- [ ] 老内核降级不受影响（0.2.1 及更早没有 `plugins.detail.section`）

## 是否影响已发布行为

- [ ] 否
- [ ] 是（已在 `CHANGELOG.md` 记录）

## 截图（UI 改动必填）

<!-- 亮色 / 暗色至少各一张；不要贴含真实会话内容的截图 -->
