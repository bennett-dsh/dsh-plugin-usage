#!/usr/bin/env node
// ============================================================================
// 文档链接校验 —— 公开文档里的相对链接与锚点必须存在
// ----------------------------------------------------------------------------
// 范围：README / CHANGELOG / MAINTAINING / CONTRIBUTING / SECURITY / docs/** / .github/**。
// 只校验仓库内相对链接：http(s) / mailto / data: 跳过；目录链接允许；`file.md#anchor`
// 会按 GitHub 的 slug 规则核对目标标题。
//
// 用法：node tools/check-docs.mjs   （已包含在 `npm test` 里）
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function walkMarkdown(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walkMarkdown(full, out)
    } else if (/\.md$/i.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const files = [
  ...['README.md', 'README.en.md', 'CHANGELOG.md', 'MAINTAINING.md', 'CONTRIBUTING.md', 'SECURITY.md',
    // 私有文档只有入口 README 入库，其余被 .gitignore 排除；入口里的链接也要可验
    'docs-private/README.md']
    .map((name) => path.join(ROOT, name)),
  ...walkMarkdown(path.join(ROOT, 'docs')),
  ...walkMarkdown(path.join(ROOT, '.github')),
].filter((file) => fs.existsSync(file))

// GitHub 标题锚点：去格式标记、小写、标点剔除、空格转连字符（CJK 保留）。
function slugify(heading) {
  return heading
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

function anchorsOf(file) {
  const anchors = new Set()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const hit = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (hit !== null) anchors.add(slugify(hit[1]))
  }
  return anchors
}

const cache = new Map()
const getAnchors = (file) => {
  if (!cache.has(file)) cache.set(file, anchorsOf(file))
  return cache.get(file)
}

const LINK = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const EXTERNAL = /^(?:[a-zA-Z][\w+.-]*:|\/\/)/
const errors = []

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  // 代码块与行内代码里的方括号不是链接
  const text = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  for (const match of text.matchAll(LINK)) {
    const target = match[2]
    if (target === '' || EXTERNAL.test(target)) continue
    const [rawPath, rawAnchor] = target.split('#')
    const filePart = decodeURIComponent(rawPath)
    const rel = path.relative(ROOT, file)
    if (filePart === '') {
      // 同文件锚点
      if (rawAnchor !== undefined && !getAnchors(file).has(decodeURIComponent(rawAnchor))) {
        errors.push(`${rel}: 锚点不存在 #${rawAnchor}`)
      }
      continue
    }
    const resolved = path.resolve(path.dirname(file), filePart)
    if (!fs.existsSync(resolved)) {
      errors.push(`${rel}: 目标不存在 ${target}`)
      continue
    }
    if (rawAnchor !== undefined && /\.md$/i.test(resolved)) {
      const anchor = decodeURIComponent(rawAnchor)
      if (!getAnchors(resolved).has(anchor)) {
        errors.push(`${rel}: 锚点不存在 ${target}`)
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`check-docs: ${errors.length} 处链接失效`)
  for (const error of errors) console.error('  ' + error)
  process.exit(1)
}
console.log(`check-docs: ${files.length} 个文档，链接与锚点全部有效`)
