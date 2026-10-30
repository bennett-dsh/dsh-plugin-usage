/**
 * Verify the native Remote channel against the REAL cordis and typert registry.
 *
 * The unit tests fake the registry, which cannot catch the failure this plugin
 * actually hit: `ctx.get(name)` only returns a service whose providing fiber is
 * ACTIVE (cordis `Context.get` -> `_getImpl`: `if (strict && impl.fiber.state
 * !== 2) return`), so a one-shot probe at activation time reports "no typert
 * registry" on a host that has one. This script mounts the shipped code beside
 * the shipped registry and checks both directions:
 *
 *   A. registry first + `ctx.inject(['typert'])`  -> must reach Remote
 *   B. registry first + a one-shot `ctx.get`      -> must fail (the old bug)
 *
 *   node scripts/verify-remote-channel.mjs [path/to/app.asar]
 *
 * Needs the harness archive (cordis + typert-registry + protocol + zod are read
 * out of it). Without one it reports SKIPPED and exits 0; the structural gates
 * in tests/typert.test.js still run everywhere.
 */
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const archive = process.argv[2] || process.env.DSH_ASAR || 'E:\\FXS\\APP\\DSH NEXT\\resources\\app.asar'
if (!existsSync(archive)) {
  console.log('SKIPPED: no harness archive at ' + archive)
  console.log('(pass it as argv[1] or set DSH_ASAR; tests/typert.test.js still covers the shape)')
  process.exit(0)
}

/** Read one package tree out of an Electron asar. */
function extract(src, dest, pkgs) {
  const fd = openSync(src, 'r')
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerLen = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(headerLen)
  readSync(fd, jsonBuf, 0, headerLen, 16)
  const header = JSON.parse(jsonBuf.toString('utf8'))
  // Data begins after the pickle whose size sits at offset 4 (already aligned).
  const bases = [8 + head.readUInt32LE(4), 8 + ((headerLen + 4 + 3) & ~3), 16 + ((headerLen + 3) & ~3)]
  const getEntry = (path) => path.split('/').reduce((n, p) => (n && n.files ? n.files[p] : undefined), header)
  const readEntry = (entry) => {
    const data = Buffer.alloc(entry.size)
    for (const base of bases) {
      readSync(fd, data, 0, entry.size, base + Number(entry.offset))
      const text = data.toString('utf8')
      if (text.includes('\uFFFD')) continue
      if (entry.size > 0 && !/^[\s\S]/.test(text)) continue
      return data
    }
    return null
  }
  try {
    for (const pkg of pkgs) {
      const root = getEntry('node_modules/' + pkg)
      if (!root || !root.files) throw new Error('package not in archive: ' + pkg)
      const walk = (directory, rel) => {
        for (const [name, entry] of Object.entries(directory.files || {})) {
          const childRel = rel === '' ? name : rel + '/' + name
          if (entry.files) { walk(entry, childRel); continue }
          if (entry.unpacked || typeof entry.offset !== 'string') continue
          const data = readEntry(entry)
          if (data === null) throw new Error('undecodable: ' + pkg + '/' + childRel)
          if (name.endsWith('.json')) JSON.parse(data.toString('utf8'))
          const out = join(dest, 'node_modules', ...posix.normalize(pkg + '/' + childRel).split('/'))
          mkdirSync(dirname(out), { recursive: true })
          writeFileSync(out, data)
        }
      }
      walk(root, '')
    }
  } finally {
    closeSync(fd)
  }
}

const work = mkdtempSync(join(tmpdir(), 'usage-remote-'))
extract(archive, work, [
  '@deepseek-ai/cordis',
  '@deepseek-ai/cosmokit',
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-typert-protocol',
  'zod',
])

const mods = (p) => pathToFileURL(join(work, 'node_modules', ...p.split('/'))).href
const cordis = await import(mods('@deepseek-ai/cordis/lib/index.js'))
const registry = await import(mods('@deepseek-ai/dsh-typert-registry/lib/index.js'))
const { registerTypert } = await import(pathToFileURL(join(here, '..', 'src', 'host', 'typert.js')).href)

const Context = cordis.Context || cordis.default?.Context
const registryPlugin = registry.apply || registry.default
if (typeof Context !== 'function') throw new Error('cordis has no Context export')
if (typeof registryPlugin !== 'function') throw new Error('the typert registry has no apply()')

const HANDLERS = new Map([
  ['query', (args) => ({ kind: 'query', args })],
  ['prices', () => ({ prices: {} })],
  ['pricing', (args) => ({ kind: 'pricing', args })],
  ['contract', () => ({ package: 'dsh-plugin-usage', names: ['query', 'prices', 'pricing'] })],
])
const tick = () => new Promise((resolve) => setTimeout(resolve, 250))

/** A. the shipped shape: declare the dependency, register when it is live. */
const fixed = new Context()
fixed.plugin(registryPlugin)
const channel = { ok: false, transport: 'fetch', reason: 'pending' }
const usagePlugin = (ctx) => {
  ctx.inject(['typert'], (typertCtx) => {
    Object.assign(channel, registerTypert(typertCtx, HANDLERS, () => {}))
  })
}
usagePlugin.inject = []
fixed.plugin(usagePlugin)
await tick()

const typert = fixed.get('typert')
const face = typert && typert.local && typeof typert.local.get === 'function'
  ? typert.local.get('dsh-plugin-usage/query')
  : undefined
const receiver = fixed.get('dsh-plugin-usage')

let failed = 0
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || detail === undefined ? '' : '  [' + detail + ']'))
  if (!cond) failed += 1
}

check('the declared dependency activates the registration', channel.transport === 'remote', channel.reason)
check('the registry stores the face under <package>/<endpoint>', Boolean(face), face === undefined ? 'not registered' : 'ok')
if (face !== undefined) {
  check('the stored invocation names the package as its namespace', face.namespace === 'dsh-plugin-usage', String(face.namespace))
  check('the stored invocation exposes the endpoint as its method', face.method === 'query', String(face.method))
}
check('the receiver service is provided on the app', Boolean(receiver), receiver === undefined ? 'missing' : 'ok')
check('the receiver carries the typertRemote binding', Boolean(receiver && receiver.typertRemote
  && receiver.typertRemote.serviceKey === 'dsh-plugin-usage'
  && receiver.typertRemote.namespace === 'dsh-plugin-usage'))

/** B. the old bug: a one-shot probe while the registry has not activated yet. */
const broken = new Context()
let probedEarly = true
const earlyPlugin = (ctx) => {
  probedEarly = typeof ctx.get === 'function' ? ctx.get('typert') !== undefined : false
}
earlyPlugin.inject = []
broken.plugin(earlyPlugin)
broken.plugin(registryPlugin)
await tick()
check('a one-shot probe before activation sees nothing (the bug this guards)',
  probedEarly === false && broken.get('typert') !== undefined, 'probe=' + String(probedEarly))

rmSync(work, { recursive: true, force: true })
console.log(failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED')
process.exit(failed === 0 ? 0 : 1)
