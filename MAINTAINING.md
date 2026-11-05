# 维护者手册

本文件是**公开的维护者作业规则**：发版、宿主升级对账、安装硬规矩、文档分层与诊断入口。面向未来的计划、决策过程、本机环境在 `docs-private/`（只有入口 README 入库）。

## 仓库与发布渠道

| 渠道 | 位置 | 说明 |
| --- | --- | --- |
| 仓库 | `github.com/bennett-dsh/dsh-plugin-usage` | 主干 `main`；功能分支 + PR |
| npm | `dsh-plugin-usage` | 包名与仓库名一致；`dsh plugin add dsh-plugin-usage` |
| 插件市场 | 上游目录条目 | 描述/版本更新走上游 PR，需批准 |
| Release | GitHub Releases | `.github/workflows/release.yml` 在 `v*` tag 上校验版本、构建测试、建 Release |

`release.yml` **不发布 npm**。npm 发布是一次独立、需明确批准的动作；发布前 `prepublishOnly` 会重跑 `build` / `test` / `verify:typert` / `verify:remote`。

## 日常验证

```sh
npm ci
npm run build
npm test                 # 单测 + 构建产物门 + 文档链接门
npm run verify:typert    # 官方 loader 校验 typert 贡献（4 端点）
npm run verify:remote    # 真实 cordis + typert 注册表（7/7）
npm run check:docs       # 只跑文档链接
```

CI（`.github/workflows/ci.yml`）在 Node 22/24 上跑 install → build → test → bundle id 契约 → tarball 内容检查。价目/节假表由 `prices.yml` 每周重生成，只有数据变化才提 PR。

## 发版步骤

1. 确认 `CHANGELOG.md` 有本版定版段（Added / Changed / Fixed / Tests / Verified）。
2. 改 `package.json` 的 `version`（语义化；只改文档也走补丁版）。
3. 跑完整验证：`npm test`、两个契约门；`docs/testing.md` 的实机清单逐项勾选。
4. 提交并推 `main`；打 annotated tag `vX.Y.Z`（tag 必须等于 `package.json` 版本）。
5. 推 tag → `release.yml` 建 GitHub Release（正文取 CHANGELOG 对应段）。
6. **经批准后**发布 npm：`npm publish --provenance`（或后续接入 Trusted Publishing 后走 Actions）；核对 `dist-tags.latest` 与 tarball 内容。
7. 市场条目按需更新（描述前缀、版本、截图）；对外动作逐项批准。

发版后回写 `docs/experience/` 与私有 `release/X.Y.Z-checklist.md` 的结论；不要把本机路径带进公开文档。

## 宿主基线升级

DSH 升级后，按顺序做，不要先改代码：

1. `npm run verify:typert` → 应仍是 4 端点 OK；
2. `npm run verify:remote` → 应仍是 7/7；
3. `node scripts/fold-parity-fixture.mjs` → 重录 `tests/fixtures/token-usage-parity.json`；数值必须与旧 fixture 一致，只有 `provenance.version` / `recordedAt` 变化；**不要手改数字**；
4. 跑 `npm test`；若有失败，先判断是契约变化还是环境（沙箱 spawn EPERM 不是代码问题）；
5. 更新 `package.json` 的 `dsh.verifiedAgainst` 与 README / docs 的基线；`engines.dsh` 只在确实缩小支持范围时才收窄；
6. 在 `docs/experience/` 记录本次对账结论（版本、结果、差异）。

## 安装与升级的硬规矩

用官方插件管理器装（`plugin_manager install_bundle` + `file:` tarball）。pnpm 对**同版本号、同路径**的 `file:` 依赖有坑（实测 2026-10-31，pnpm 11.7/11.28）：

| 尝试 | 结果 |
| --- | --- |
| 同版本、换掉 tarball 内容后再 `install_bundle` | `ambiguous-install`：只有清理没有新增 |
| `pnpm install --force` | `Already up to date`，仍装旧内容 |
| 删掉 `node_modules/<pkg>` 再 `pnpm install` | 依旧 `Already up to date`，目录不会恢复 |

唯一稳的路径：**升版本号 → `install_bundle` → 重启**。不要为同版本重装写脚本兜底。

> ⚠️ 不要在 DSH 运行时手工覆盖 `node_modules/<pkg>`：2026-10-31 02:00 实测，tarball 铺进运行中的 profile 后约 0.8 秒宿主以 `0xC0000005` 退出。先退出 DSH，或走管理器 + 重启。
>
> 开发期用 junction / `link:` 安装时，`npm run build` 会重写 `lib/`，而运行中的宿主正在读它；构建避开长时间任务。

装完必须核对产物：读 `package.json` 版本、`grep` 本次新增标识；客户端改动刷新页面，宿主半改动重启应用。管理器回 `applied` 不等于改动已生效。

## 文档分层

| 层 | 位置 | 入库 | 读者 |
| --- | --- | --- | --- |
| 公开 | `README.md` / `README.en.md` / `docs/` | ✅ | 使用者、贡献者 |
| 维护者 | 本文件 | ✅ | 维护者 |
| 私有 | `docs-private/` | 仅入口 README | 维护者（计划、决策、本机环境） |

规则：公开文档只记已发生的事实；计划、未定稿取舍、本机信息留私有，结论稳定后按 `docs-private/README.md` 的升级路径提升。改文档后跑 `npm run check:docs`。

## 诊断面

页面与日志之外，插件把「为什么是这个结果」放在数据里，排查时先看这些：

- `usage/query` 响应的 `channel`：实际走了 `remote` 还是 `fetch`，以及原因；
- `backfill`：`status` / `done` / `total`（面板加载态的依据）；
- `scan`：最近一轮扫描的会话数、缓存命中数、耗时；
- `<DSH_HOME>/cache/dsh-plugin-usage/last-pass.json`：同一份扫描摘要落盘；
- `<DSH_HOME>/logs/`：`host.kernel.usage-host` 的日志行（插件 logger 不总是落到桌面日志）。

不要为了排查顺手改 `node_modules` 或删缓存目录以外的内容；缓存目录可以整目录删除重算。
