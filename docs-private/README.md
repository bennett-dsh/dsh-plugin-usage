# 私有文档（不入库）

这里放**不公开**的材料：路线图、待办、决策记录、调研/实验、发版草稿、本机环境记录。

- 公开文档在 [docs/](../docs/README.md)，维护者作业规则在 [MAINTAINING.md](../MAINTAINING.md)；
- 本目录**除本 README 外全部被 `.gitignore` 排除**（`docs-private/*` + `!docs-private/README.md`），
  不会进入 git 仓库，也不会随 npm 包发布；
- **不放密钥 / token / 密码** —— 凭据用系统凭据管理，这里只记“用哪个键、在哪配”；
- 本机绝对路径、实例名、端口可以写，但不要复制到公开 Issue / PR / 文档；
- 结论一旦稳定，就**升级为公开文档**（见下表），私有件只保留过程与草稿。

## 目录与命名

```text
docs-private/
├── README.md                        ← 唯一入库文件（本文件）
├── roadmap.md                       ← 方向、优先级、明确不做的
├── todo.md                          ← 可勾选待办（短周期，做完就删/归档）
├── decisions/NNNN-短标题.md          ← 决策记录（ADR），四位编号
├── research/YYYY-MM-DD-主题.md       ← 调研 / 实验 / 现场取证
├── env/machine.md                   ← 本机环境快照（版本、路径、链接方式）
├── release/X.Y.Z-checklist.md       ← 发版前私有检查清单
└── release/X.Y.Z-notes.md           ← Release / 市场文案草稿
```

- 与时间相关的文档带日期（`YYYY-MM-DD`），与顺序相关的带编号（`NNNN` / `X.Y.Z`）；
- 过期材料不删，移入 `archive/` 并在顶部标「历史存档 · 已被 X 取代」。

## 升级路径（私有 → 公开）

| 私有材料 | 升级成 |
| --- | --- |
| 决策记录（已定） | `docs/design.md` 或 `docs/reference/*`（只留结论与理由，过程留在私有） |
| 调研 / 实验 / 现场取证 | `docs/experience/NN-*.md`（症状 → 根因 → 证据 → 结论） |
| 发版检查清单 | 脱敏后合并进 `docs/testing.md` 的发布前清单 |
| 发版说明草稿 | `CHANGELOG.md` 定版段 + GitHub Release 正文 |
| 本机环境记录 | `docs/testing.md` 的验收表（只留版本与结果，路径留在私有） |
| 路线图 / 待办 | 一般不公开；变成用户可见能力时写进 README / design |

## 当前内容（本机）

> 这些文件**被 `.gitignore` 排除**，只存在于维护者本机；新克隆的仓库里只有本 README。
> 按规则，本 README 不链接未入库文件，只以行内代码列名字。

| 文件 | 内容 |
| --- | --- |
| `roadmap.md` | 方向、优先级、明确不做 |
| `todo.md` | 0.6.0 发布前 / 发布 / 跟进三组待办 |
| `decisions/0001-文档分层.md` | 公开 / 维护者 / 私有三层与升级路径 |
| `decisions/0002-八语言全量.md` | 页面级 i18n vs 8 语言全量（含机器翻译披露） |
| `decisions/0003-求星行槽位.md` | `plugins.row.config` vs `plugins.detail.section` |
| `decisions/0004-工程习惯对齐.md` | name / NS / volatile / 槽位 / 诊断面 |
| `research/2026-11-05-求星槽位取证.md` | 0.2.2-rc.1 详情页槽位与 subject 契约取证 |
| `env/machine.md` | 本机 DSH / profile / junction / 端口 |
| `release/0.6.0-checklist.md` | 0.6.0 发版前私有清单 |

## 模板

### 决策记录（ADR）

```md
# NNNN · 一句话标题

- 日期：YYYY-MM-DD
- 状态：提案 / 已定 / 已废弃（被 NNNN 取代）

## 背景
为什么现在要做这个决定；约束是什么。

## 选项

| 选项 | 优点 | 代价 |
| --- | --- | --- |
| A |  |  |
| B |  |  |

## 决定
选哪个，为什么；明确不做什么。

## 后果
行为变化、兼容性、需要同步更新的公开文档 / 测试。

## 证据
命令、日志、源码位置、实机结果（可复跑）。
```

### 调研 / 实验

```md
# YYYY-MM-DD · 主题

## 问题
## 方法（版本、命令、样本、口径）
## 数据 / 输出（原始结果，脱敏）
## 结论
## 对公开文档 / 代码的影响
```

### 本机环境快照

```md
# 本机环境（YYYY-MM-DD）

| 项 | 值 |
| --- | --- |
| DSH NEXT | 版本 / 安装目录 |
| Harness 内核 | 版本 / app.asar 路径 |
| 本机 home / profile | 路径 / profile 名 |
| 插件安装方式 | junction / npm / tarball，解析到的真实路径 |
| Node / 运行时 | 版本与解释器路径 |
```

### 发版检查清单

```md
# X.Y.Z 发版检查清单（私有）

- [ ] `npm test`（单测 + 构建产物门 + 文档链接门）
- [ ] `npm run verify:typert` / `npm run verify:remote`（附基线版本）
- [ ] `docs/testing.md` 的实机清单逐项勾选
- [ ] 版本号、CHANGELOG 定版、tag、Release、npm、市场（对外动作逐项批准）
- [ ] `locale/*.json` 改动已重启验证
- [ ] 全文脱敏（无本机路径 / 凭据）
```
