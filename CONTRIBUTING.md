# 贡献指南

感谢你愿意改进 `dsh-plugin-usage`。这是一个 DeepSeek Harness 插件，代码分为宿主半（`src/host/`）与浏览器半（`src/client/`），测试分为纯函数、构建产物行为、fold 对账与文档链接四层。

## 开发环境

- Node.js ≥ 22（CI 用 22 / 24）
- 一个可用的 DSH 安装（跑两个原生契约门需要本机 `app.asar`；没有时它们会明确报 `SKIPPED`，不会假装通过）
- 平台：Windows / macOS / Linux 均可；本项目在 Windows + PowerShell 7 上日常开发

```sh
npm install
npm run build      # tsc -> lib/，再生成 lib/client/index.js
npm test           # pretest 会先 build；跑单测、构建产物门、文档链接门
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 清空 `lib/`、编译宿主半、生成客户端 bundle |
| `npm test` | 单测 + 构建产物行为门 + `tools/check-docs.mjs` |
| `npm run check:docs` | 只校验公开文档的相对链接与锚点 |
| `npm run prices` | 重新生成价目表与节假日历（需要网络） |
| `npm run verify:typert` | 用本机 asar 里的官方 loader 校验 typert 贡献 |
| `npm run verify:remote` | 用真实 cordis + typert 注册表跑通原生通道 |
| `node scripts/fold-parity-fixture.mjs` | 从本机 asar 重新录制 fold 对账 fixture（DSH 升级后跑） |

> **沙箱提示**：在受限的 DSH 会话里，`node --test` 的默认每文件子进程会 `spawn EPERM`，`npm test` 会整体失败。可用 `node --test --test-isolation=none` 在单进程里跑；其中 `tests/client-bundle-id.test.js` 的 3 条仍需要可写环境或 CI（它们真的 `execFileSync` 一个 build 进程）。

## 改代码的规矩

1. **先取证原生**：能用官方槽位/服务就不自研。自研补缺必须在 `docs/reference/native-alignment.md` 写清「官方确实没有」的反证。
2. **一处事实源**：价格阶梯只写在 `pricing.js`；四态判定由宿主给出，客户端不重算；设置命名空间 = patch 行 id `usage`。
3. **配置字段必须 `.volatile()`**：否则官方 settings 服务拒绝写入，重启后丢失。
4. **写盘只允许 fold-cache 与 last-pass**，且全部异步；`tests/native-hygiene.test.js` 会拦住新的同步写。
5. **新增文案要补 8 本字典**（zh / en / ja / de / es / fr / pt / ru），键集与占位符必须一致；`tests/i18n.test.js` 会校验。
6. **测试**：修 bug 先写/改一条会红的断言；改客户端行为优先测构建产物（`tests/*.test.cjs`），不是只测源码字符串。

## 文档

- 公开文档只记**已发生的事实**（版本、实测数字、文件位置），放在 [docs/](docs/README.md)。
- 计划、未定稿取舍、调研、本机环境放 `docs-private/`（只有入口 README 入库）。
- 面向用户的变更同步更新 `README.md` / `README.en.md` 与 `CHANGELOG.md`；命令、版本号、链接要能点开。

## 提交与 PR

- 一个 PR 做一件事；描述里写「现象 / 根因 / 证据（命令或日志）/ 验证方式」。
- 涉及行为变化时附 `npm test` 结果；涉及 UI 时附截图（亮/暗至少各一张）。
- 不要提交 `lib/`、`.cache/`、`docs-private/` 的内容（均被 `.gitignore` 排除）。
- 不要在同一 PR 里顺手升级依赖、改格式化或重排无关代码。

## License

贡献即同意以 [MIT](LICENSE) 许可证发布。
