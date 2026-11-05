# 04 · bundle id

## 症状

插件在列表里能加载，但客户端半永远不出现；renderer 只报一行
`Renderer boot failed for 1 plugin(s)`，没有具体错误，也没有失败的插件条目。

## 根因

宿主按每个安装包**最近的 `package.json`** 解析包名，并在该 key 下把工厂投递给浏览器；
浏览器再按同一个 key 等待。构建脚本曾把 loader id 硬编码成 `dsh-plugin-usage`，于是
scoped 安装（`@acme/dsh-plugin-usage`）、npm alias、`file:` tarball 换名等场景下，
工厂落在了另一个 key 上，渲染器永远等不到。

## 证据

- `CHANGELOG.md` 0.2.1 记录了该修复（「客户端 bundle 硬编码 loader id」）；
- `scripts/build-client.js` 现在从 `package.json#name` 派生 id；
- `tests/client-bundle-id.test.js` 在临时树里用**别的包名**跑真实构建脚本，断言
  `__ModuleLoader__.load({ id })` 跟着变；没有 `name` 时构建必须失败而不是猜。

## 结论

- loader id、`cordis.patch.yml` 行、宿主解析的包名必须同源，唯一来源是 `package.json#name`；
- 不要用「本仓库自己的包名」做断言，那证明不了改名场景；用 fixture 树；
- 构建脚本对缺失 `name` 要显式失败（`Missing "name"`），不能回退到默认值。

## 日期

2026-10-18（0.2.1 修复）
