/**
 * Verify the plugin's typert contribution with the OFFICIAL validator.
 *
 * The rules a contribution must satisfy live in the shipped harness, so this
 * script reads them from the installed archive instead of restating them: it
 * extracts `@deepseek-ai/dsh-typert-loader/lib/index.js`, keeps the validation
 * half (everything before `apply`), and runs `validateTypertManifest` on the
 * contribution this plugin would register.
 *
 *   node scripts/verify-typert.mjs [path/to/app.asar]
 *
 * When no archive is reachable the check reports SKIPPED (exit 0): a laptop
 * without the harness installed cannot answer the question, and pretending it
 * passed would be worse than saying so. CI runs the structural gate in
 * tests/typert.test.js regardless.
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const archive = process.argv[2] || process.env.DSH_ASAR || 'E:\\FXS\\APP\\DSH NEXT\\resources\\app.asar'

/** Read one entry out of an Electron asar (chromium pickle header). */
function readAsarEntry(file, wanted, marker) {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const stringLen = head.readUInt32LE(12)
    const json = Buffer.alloc(stringLen)
    readSync(fd, json, 0, stringLen, 16)
    const header = JSON.parse(json.toString('utf8'))
    const entry = wanted.split('/').reduce((node, part) => {
      if (!node || !node.files || !node.files[part]) throw new Error('missing ' + part + ' in ' + wanted)
      return node.files[part]
    }, header)
    if (typeof entry.offset !== 'string') throw new Error('not a file: ' + wanted)
    const data = Buffer.alloc(entry.size)
    for (const base of [8 + ((stringLen + 4 + 3) & ~3), 16 + ((stringLen + 3) & ~3)]) {
      readSync(fd, data, 0, entry.size, base + Number(entry.offset))
      const text = data.toString('utf8')
      if (text.includes(marker)) {
        const start = text.indexOf('/**')
        return start > 0 ? text.slice(start) : text
      }
    }
    throw new Error('could not decode ' + wanted)
  } finally {
    closeSync(fd)
  }
}

if (!existsSync(archive)) {
  console.log('SKIPPED: no harness archive at ' + archive)
  console.log('(pass it as argv[1] or set DSH_ASAR; the structural gate still runs in npm test)')
  process.exit(0)
}

const LOADER = 'node_modules/@deepseek-ai/dsh-typert-loader/lib/index.js'
let loaderSrc
try {
  loaderSrc = readAsarEntry(archive, LOADER, 'function validateTypertManifest')
} catch (error) {
  console.log('SKIPPED: this archive has no typert loader (' + String(error.message) + ')')
  process.exit(0)
}

// Keep the validation half only: `apply` needs the imports we are dropping.
const cut = loaderSrc.indexOf('async function apply')
if (cut < 0) throw new Error('could not find the apply() boundary in the official loader')
// `z` is only used to declare the plugin's config schema at module scope — a
// chainable no-op keeps that declaration harmless while the validator (which
// never touches zod) runs for real.
const zodShim = 'const z = new Proxy(function () {}, { get: () => () => z, apply: () => z });\n'
const validation = (zodShim + loaderSrc
  .slice(0, cut)
  .replace(/^import[^\n]*\n/gmu, ''))
  .concat('\nexport { validateTypertManifest };\n')

const dir = mkdtempSync(join(tmpdir(), 'usage-typert-'))
const modPath = join(dir, 'loader-validation.mjs')
writeFileSync(modPath, validation)
const { validateTypertManifest } = await import(pathToFileURL(modPath).href)

const { USAGE_SERVICE, typertContribution } = await import(pathToFileURL(join(here, '..', 'src', 'host', 'typert.js')).href)

const endpoints = ['query', 'prices', 'pricing', 'contract']
try {
  const contribution = typertContribution(endpoints)
  validateTypertManifest(USAGE_SERVICE, contribution)
  console.log('OK: the official loader accepts the contribution (' + endpoints.length + ' endpoints, namespace ' + USAGE_SERVICE + ')')
} catch (error) {
  console.error('FAIL: the official loader rejected the contribution')
  console.error('  ' + String((error && error.message) || error))
  process.exit(1)
}
