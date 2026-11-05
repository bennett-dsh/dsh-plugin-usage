# 文档导航

> 入口文档。装配与兼容细节见 `reference/`，踩坑记录见 `experience/`。

> 面向使用者与贡献者的公开文档。维护者的作业手册在 [MAINTAINING.md](../MAINTAINING.md)，
> 私有材料（路线图 / 决策过程 / 发版清单）在 [docs-private/README.md](../docs-private/README.md)
> —— 该目录只有 README 入库，其余内容留在本机。

## 公开与私有的分工

| 层 | 位置 | 入库 | 读者 |
| --- | --- | --- | --- |
| 公开 | `README.md` / `README.en.md` / `docs/` | ✅ | 使用者、贡献者 |
| 维护者 | `MAINTAINING.md` | ✅ | 维护者（作业流程与发版记录） |
| 私有 | `docs-private/` | 仅入口 README | 维护者（计划、决策过程、本机环境） |

规则：**公开文档只记已发生的事实**；面向未来的计划、未定稿的取舍、本机信息留在私有，
结论稳定后再按 [升级路径](../docs-private/README.md) 提升为公开文档。

## 我想先用起来

| 文档 | 内容 |
| --- | --- |
| [项目 README](../README.md) | 是什么、怎么安装、功能与截图 |
| [配置项](guide/configuration.md) | `currency` / `prices` / `matchMap` 三个设置、存储位置、生效方式 |
| [故障排查](guide/troubleshooting.md) | 常见症状 → 原因 → 处理 |

## 我想理解它怎么工作

| 文档 | 内容 |
| --- | --- |
| [设计说明](design.md) | 目标与取舍：事件折叠口径、五级价格阶梯、天×模型汇总、按需回填、求星行位置 |
| [装配契约](reference/architecture.md) | 宿主/客户端装配、槽位、服务、两条通道、缓存目录、文件布局 |
| [版本兼容](reference/compatibility.md) | `engines.dsh` / `verifiedAgainst`、降级矩阵、DSH 升级对账清单 |
| [与原生 DSH 的距离](reference/native-alignment.md) | L2 补缺的取证、已知自建旁路、已对齐清单 |

## 我想确认它可靠

| 文档 | 内容 |
| --- | --- |
| [验收记录](testing.md) | 四层自动化门、两个原生契约门、fold-parity fixture 录制方式、实测基线 |

## 我想知道踩过哪些坑

| 文档 | 内容 |
| --- | --- |
| [项目经验](experience/README.md) | 症状 → 根因 → 证据 → 结论，按条目编号 |

## 我想参与

- [贡献指南](../CONTRIBUTING.md)
- [安全策略](../SECURITY.md)
- [更新日志](../CHANGELOG.md)
- [维护者手册](../MAINTAINING.md)
