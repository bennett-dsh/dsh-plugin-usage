/**
 * Record the parity fixture for the plugin's event fold.
 *
 * The plugin folds durable session events into usage records because the
 * official `tokenUsage` projection only exposes per-session totals, while a
 * dashboard needs per-model / per-timestamp rows. Claiming "this mirrors the
 * official fold" is not evidence (xshared-lib experience ⓪.4), so this script
 * runs the OFFICIAL fold over a fixed event script and records its output.
 *
 * It extracts `@deepseek-ai/dsh-token-meter/lib/types/usage-projection.js` from
 * the installed Harness archive and executes its `apply` verbatim; only the
 * module's imports are replaced by local shims (zod is a chainable no-op, the
 * two helpers are copied from the same distribution). Regenerate with:
 *
 *   node scripts/fold-parity-fixture.mjs [path/to/app.asar]
 *
 * The recorded numbers belong to the Harness version printed in `provenance`:
 * re-run after a Harness upgrade, do not hand-edit.
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'tests', 'fixtures', 'token-usage-parity.json')
const archive = process.argv[2]
  || process.env.DSH_ASAR
  || 'E:\\FXS\\APP\\DSH NEXT\\resources\\app.asar'

if (!existsSync(archive)) {
  console.error('asar not found: ' + archive + '\npass it as argv[1] or set DSH_ASAR')
  process.exit(2)
}

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
    const bases = [8 + ((stringLen + 4 + 3) & ~3), 16 + ((stringLen + 3) & ~3)]
    const wantsJson = wanted.endsWith('.json')
    for (const base of bases) {
      readSync(fd, data, 0, entry.size, base + Number(entry.offset))
      const text = data.toString('utf8')
      if (wantsJson) {
        try { JSON.parse(text); return text } catch { continue }
      }
      if (text.includes(marker)) {
        // The data base can land a few bytes early, leaving the tail of the
        // previous entry in front of the file: cut to the first comment.
        const start = text.indexOf('/**')
        return start > 0 ? text.slice(start) : text
      }
    }
    throw new Error('could not decode ' + wanted)
  } finally {
    closeSync(fd)
  }
}

const PKG = 'node_modules/@deepseek-ai/dsh-token-meter'
const projectionSrc = readAsarEntry(archive, PKG + '/lib/types/usage-projection.js', 'export const tokenUsageProjectionDefinition')
const llmSrc = readAsarEntry(archive, PKG.replace('dsh-token-meter', 'dsh-llm') + '/lib/index.js', 'function lastAssistantStreamChunk')
const version = JSON.parse(readAsarEntry(archive, PKG + '/package.json', 'dsh-token-meter')).version

// `lastAssistantStreamChunk` verbatim from the same distribution.
const helper = /function lastAssistantStreamChunk\(stream, type\) \{[\s\S]*?\n\}/.exec(llmSrc)
if (!helper) throw new Error('could not find lastAssistantStreamChunk in @deepseek-ai/dsh-llm')

// Replace ONLY the imports: the fold body below them runs unmodified.
const body = projectionSrc
  .replace(/^import[^\n]*\n/gmu, '')
  .replace(/^\.map/m, '')
const shimmed = [
  '// zod stub: schemas are declared but never validated by apply().',
  'const chain = new Proxy(function () {}, { get: () => () => chain, apply: () => chain })',
  'const z = new Proxy({}, { get: () => (...args) => (args.length ? chain : chain) })',
  helper[0],
  'const SessionSeq = (n) => n',
  'const foldSurfaceProjection = () => ({})',
  body,
].join('\n')

const dir = mkdtempSync(join(tmpdir(), 'usage-parity-'))
const modPath = join(dir, 'usage-projection.mjs')
writeFileSync(modPath, shimmed)
if (process.env.USAGE_PARITY_KEEP) console.log('shim kept at ' + modPath)
const { tokenUsageProjectionDefinition } = await import(pathToFileURL(modPath).href)
if (!tokenUsageProjectionDefinition || typeof tokenUsageProjectionDefinition.apply !== 'function') {
  throw new Error('the official projection did not export apply()')
}

/*
 * The event script. Every branch of the official comment is covered:
 *   1. a settlement with `data.usage` adds;
 *   2. the same (turn, step) re-reporting a DIFFERENT figure replaces;
 *   3. the same (turn, step) re-reporting the SAME figure changes nothing;
 *   4. `llm/retry-started` closes the slot, so the retried attempt adds;
 *   5. an attempt with no `data.usage` bills from its last stream usage chunk;
 *   6. a message with neither reports nothing.
 */
const usage = (inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens) =>
  ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })
const chunkUsage = (u) => ({ type: 'chunk', chunk: { type: 'usage', usage: u } })
const chunkText = (text) => ({ type: 'chunk', chunk: { type: 'text', text } })

const events = [
  { seq: 1, time: 1761300000000, type: 'session', data: {} },
  { seq: 2, time: 1761300001000, type: 'request/context', data: { provider: 'deepseek-account', model: 'deepseek-flash' } },
  // 1. straight settlement
  { seq: 3, time: 1761300002000, type: 'assistant/message', data: { turn: 0, step: 0, usage: usage(1000, 200, 5000, 100) } },
  // 2. same step re-reports a bigger cumulative figure -> replace, not add
  { seq: 4, time: 1761300003000, type: 'assistant/message', data: { turn: 0, step: 0, usage: usage(1200, 250, 5000, 100) } },
  // 3. identical re-report -> no change
  { seq: 5, time: 1761300004000, type: 'assistant/message', data: { turn: 0, step: 0, usage: usage(1200, 250, 5000, 100) } },
  // 5. attempt billing from the stream (no data.usage)
  { seq: 6, time: 1761300005000, type: 'assistant/attempt', data: { turn: 1, step: 0, stream: [chunkText('hi'), chunkUsage(usage(300, 40, 0, 0))] } },
  // 4. retry: closes the slot, the retried attempt bills again
  { seq: 7, time: 1761300006000, type: 'llm/retry-started', data: { turn: 1, step: 0 } },
  { seq: 8, time: 1761300007000, type: 'assistant/message', data: { turn: 1, step: 0, usage: usage(310, 45, 10, 0) } },
  // 6. nothing to bill
  { seq: 9, time: 1761300008000, type: 'assistant/message', data: { turn: 2, step: 0, stream: [chunkText('no usage here')] } },
  // another turn, off a new model
  { seq: 10, time: 1761300009000, type: 'request/context', data: { provider: 'coding-plan', model: 'glm-5.3-flash' } },
  { seq: 11, time: 1761300010000, type: 'assistant/message', data: { turn: 2, step: 1, usage: usage(50, 5, 900, 0) } },
]

let state = tokenUsageProjectionDefinition.init()
for (const event of events) state = tokenUsageProjectionDefinition.apply(state, event)
const expected = tokenUsageProjectionDefinition.wire.view(state)

const fixture = {
  $comment:
    'Recorded, never hand-edited: expected is the OFFICIAL tokenUsage fold '
    + '(@deepseek-ai/dsh-token-meter ' + version + ') applied to these events by '
    + 'scripts/fold-parity-fixture.mjs. Re-run that script after a Harness upgrade.',
  provenance: {
    package: '@deepseek-ai/dsh-token-meter',
    version,
    projection: 'lib/types/usage-projection.js#tokenUsageProjectionDefinition',
    recordedAt: new Date().toISOString().slice(0, 10),
    generator: 'scripts/fold-parity-fixture.mjs',
  },
  events,
  expected,
}
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n')
console.log('official totals:', JSON.stringify(expected))
console.log('wrote ' + out)
