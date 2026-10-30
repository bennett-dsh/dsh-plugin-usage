/**
 * Wiring gates (a few are source-level, the rest are behavioural): the point is
 * that the scan is *connected to the request path*, which no amount of
 * unit-testing `runBackfill` would prove — deleting the call site keeps every
 * behavioural test green while the panel goes back to showing nothing.
 *
 * The backfill starts on the first query, not at activation.
 *
 * Why this is a test and not a comment: the whole point of the lazy start is that
 * the cache-loading window (≈0.8 s warm, ≈12 s cold) happens while the panel is
 * open. Started from `apply` it finished before anyone looked, so the loading
 * state existed in code and never on screen — the user restarted a dozen times
 * and saw nothing. A future "let's warm the cache at startup, it's faster" edit
 * would silently bring that back, so it is pinned here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createState } from '../src/host/state.js'
import { startBackfillOnDemand } from '../src/host/scan.js'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const hostIndex = readFileSync(join(root, 'src/host/index.js'), 'utf8').replace(/\r\n/g, '\n')

const ctxWith = (persistence) => ({ get: (name) => (name === 'sessionPersistence' ? persistence : undefined) })

function slowPersistence(sessions) {
  const queue = Object.entries(sessions)
  return {
    list: async () => queue.map(([id]) => id),
    open: async (id) => sessions[id],
    read: async () => ({ events: [] }),
  }
}

test('the first query starts the scan and the response can say "running"', async () => {
  const state = createState(null)
  assert.equal(state.backfill.status, 'idle', 'a fresh process must not claim to be scanning')

  const ctx = ctxWith(slowPersistence({}))
  // The handler flips the visible state *before* rendering its response — that is
  // what makes the very first frame a loading frame instead of an empty panel.
  const started = startBackfillOnDemand(ctx, state, { cache: false })
  assert.equal(started, true)
  assert.equal(state.backfill.status, 'running')
  assert.equal(state.backfill.started, true)

  // Idempotent: every later query reads the state, none of them restarts the pass.
  assert.equal(startBackfillOnDemand(ctx, state, { cache: false }), false)
  assert.equal(state.backfill.status, 'running', 'a second query must not reset the counters')
});

test('without persistence the scan still settles, so the panel never hangs', () => {
  const state = createState(null)
  const started = startBackfillOnDemand(ctxWith(undefined), state, { cache: false })
  assert.equal(started, true)
  // runBackfill's synchronous prefix marks it done when there is nothing to read.
  assert.equal(state.backfill.status, 'done')
});

test('the scan that finishes flips to done, which is what stops the skeleton', async () => {
  const state = createState(null)
  const persistence = {
    list: async () => [],
    open: async () => ({ events: [] }),
    read: async () => ({ events: [] }),
  }
  startBackfillOnDemand(ctxWith(persistence), state, { cache: false })
  // The pass is async; let it run out.
  for (let i = 0; i < 50 && state.backfill.status !== 'done'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(state.backfill.status, 'done', 'an empty store must settle to done, not stay running')
  assert.equal(state.backfill.done, state.backfill.total)
});

test('the query handler is what starts it — not activation', () => {
  // The behaviour tests above prove the function works; this one proves it is
  // actually wired to the request path. Without it, deleting the call site leaves
  // every test green while the panel goes back to showing nothing at all.
  const queryHandler = /handlers\.set\('query',[\s\S]{0,600}?startBackfillOnDemand\(ctx, state/.exec(hostIndex)
  assert.ok(queryHandler, 'the query handler must call startBackfillOnDemand')

  // And activation must not do it eagerly: that is exactly the regression this
  // whole change exists to prevent (the pass finishes before anyone opens the
  // panel, so the loading state can never be seen).
  const applyTail = hostIndex.slice(hostIndex.indexOf('state.channel = registerRPC'))
  assert.ok(!/^\s*runBackfill\(/m.test(applyTail),
    'apply() must not start the full scan; it belongs to the first query')
});

test('a diagnostic sink that throws costs one line, never the host', async () => {
  // Not hypothetical: `logSink` returns a function, and calling `.warn(...)` on it
  // threw `TypeError: logSink(...).warn is not a function` inside the pass-end log.
  // The throw escaped `runBackfill`'s catch (which logged through the same broken
  // sink) and dsh died with `fatal load failure` the moment the usage screen opened.
  const state = createState(null)
  const persistence = { list: async () => [], open: async () => ({ events: [] }), read: async () => ({ events: [] }) }
  const exploding = () => { throw new TypeError('logSink(...).warn is not a function') }

  startBackfillOnDemand(ctxWith(persistence), state, { cache: false, log: exploding })
  for (let i = 0; i < 50 && state.backfill.status !== 'done'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(state.backfill.status, 'done', 'a broken logger must not leave the scan wedged in running')
});

test('a context probe that throws cannot crash the process from a read request', async () => {
  // `runBackfill` reads `ctx.get('sessionPersistence')` before its own try block.
  // Fire-and-forget without a catch therefore turns a throwing context access into
  // an unhandled rejection — which this host treats as fatal. The loading window is
  // opened by a plain GET, so it must be impossible for it to take dsh down.
  const state = createState(null)
  const hostileCtx = { get: () => { throw new Error('inject conflict') } }
  assert.equal(startBackfillOnDemand(hostileCtx, state, { cache: false }), true)
  for (let i = 0; i < 50 && state.backfill.status !== 'done'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(state.backfill.status, 'done', 'the rejection must be caught and the state settled')
});

test('logSink is used as a function, never as a logger object', () => {
  // The same shape bug existed in persist(): `const logger = logSink(ctx)` then
  // `logger.warn(...)`. Pin the contract so it cannot come back.
  assert.ok(!/logSink\(ctx\)\s*\.\s*(warn|error|info)\(/.test(hostIndex),
    'logSink returns a function — do not call .warn/.error on its result')
  assert.ok(!/const\s+logger\s*=\s*logSink\(ctx\)[\s\S]{0,400}?logger\.(warn|error|info)\(/.test(hostIndex),
    'do not alias logSink to a `logger` object and then call .warn on it')
});
