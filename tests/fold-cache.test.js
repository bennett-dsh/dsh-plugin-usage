/**
 * The fold cache: what makes a restart cheap.
 *
 * Without it every start re-read and re-folded the whole persisted history; the
 * measured floor on this machine was 12.5 s of pure inflate for 404 MB across
 * 258 sessions. With it an unchanged session costs one JSON read.
 *
 * The tests here are about correctness, not speed: a cache that changes a number
 * is worse than no cache. So every case compares a hydrated state against a cold
 * fold, and every failure mode must degrade to the cold path.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createState } from '../src/host/state.js'
import { runBackfill, scanPersisted } from '../src/host/scan.js'
import { query } from '../src/host/query.js'
import { FOLD_CACHE_VERSION, foldSignature, readEntry, writeEntry } from '../src/host/fold-cache.js'

function usageEvent(seq, turn, step, input = 10) {
  return {
    seq,
    time: 1_700_000_000_000 + seq * 1000,
    type: 'assistant/message',
    data: {
      turn,
      step,
      usage: { inputTokens: input, outputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 0 },
      message: { source: { provider: 'p', model: 'm' } },
    },
  }
}

/** A real aggregation index, so hydration is exercised against the production one. */
function makeState() {
  const state = createState(null)
  // query() reads a price store; a local price is not what this file is about.
  state.prices = { lookup: () => ({ price: null }), costOf: () => 0, currency: 'CNY' }
  const indexed = []
  state.index = {
    add(record) { indexed.push(record) },
    remove(record) {
      const at = indexed.indexOf(record)
      if (at >= 0) indexed.splice(at, 1)
    },
    // query() walks the index; keep the fake honest about that contract.
    recordsInRange(from, to) {
      return indexed.filter((r) => r.time >= from && r.time < to)
    },
  }
  state.__indexed = indexed
  return state
}

/** Fake sessionPersistence: one log per id, with a mutable revision. */
function fakePersistence(sessions) {
  return {
    list: async () => Object.entries(sessions).map(([id, s]) => ({ header: { id }, revision: s.revision, eventCount: s.events.length })),
    open: async (id) => ({
      inheritedEventCount: 0,
      read: async () => ({ events: sessions[id].events }),
      close: async () => {},
    }),
  }
}

const ctxWith = (persistence) => ({ get: (name) => (name === 'sessionPersistence' ? persistence : undefined) })

const totals = (state) => ({
  records: state.records.length,
  indexed: state.__indexed.length,
  tokens: state.records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens + r.cacheReadTokens, 0),
})

test('a hydrated pass produces exactly what a cold fold produced', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = {
      s1: { revision: 'r1', events: [usageEvent(0, 1, 0), usageEvent(1, 1, 1)] },
      s2: { revision: 'r1', events: [usageEvent(0, 1, 0, 99)] },
      s3: { revision: 'r1', events: [] },
    }
    const persistence = fakePersistence(sessions)

    const cold = makeState()
    await scanPersisted(ctxWith(persistence), cold, { cacheDir: dir })
    const coldTotals = totals(cold)
    assert.equal(coldTotals.records, 3, 'the cold fold saw all three settlements')

    // Fresh process: nothing in memory, the cache on disk is all there is.
    const warm = makeState()
    await scanPersisted(ctxWith(persistence), warm, { cacheDir: dir })

    assert.deepEqual(totals(warm), coldTotals, 'hydration must match the cold fold')
    assert.deepEqual(warm.records.map((r) => r.session).sort(), ['s1', 's1', 's2'])
    assert.equal(warm.watermarks.get('s1'), 1, 'the watermark is restored, not recomputed')
    assert.equal(warm.revisions.get('s1'), 'r1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a changed revision is a miss and re-folds, and the cache follows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const persistence = fakePersistence(sessions)

    const first = makeState()
    await scanPersisted(ctxWith(persistence), first, { cacheDir: dir })
    assert.equal(first.records.length, 1)

    // Append a settlement: the revision changes, so the entry must not be used.
    sessions.s1 = { revision: 'r2', events: [usageEvent(0, 1, 0), usageEvent(1, 1, 1)] }
    const second = makeState()
    await scanPersisted(ctxWith(persistence), second, { cacheDir: dir })
    assert.equal(second.records.length, 2, 'the appended settlement is folded')
    assert.equal(second.revisions.get('s1'), 'r2')

    // And the entry written by that pass is already usable again.
    const third = makeState()
    await scanPersisted(ctxWith(persistence), third, { cacheDir: dir })
    assert.equal(third.records.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt entry is a miss, never a crash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const persistence = fakePersistence(sessions)
    const cold = makeState()
    await scanPersisted(ctxWith(persistence), cold, { cacheDir: dir })

    // Corrupt the file the previous pass wrote.
    const [name] = readdirSync(dir)
    writeFileSync(join(dir, name), '{ this is not json')

    const warm = makeState()
    await scanPersisted(ctxWith(persistence), warm, { cacheDir: dir })
    assert.equal(warm.records.length, 1, 'the cold path still folded it')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an entry from another fold signature is a miss', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const persistence = fakePersistence(sessions)
    const cold = makeState()
    await scanPersisted(ctxWith(persistence), cold, { cacheDir: dir })

    // Pretend the fold rule or the holiday calendar changed.
    const [name] = readdirSync(dir)
    const path = join(dir, name)
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    payload.sig = 'old-signature'
    writeFileSync(path, JSON.stringify(payload))

    assert.equal(readEntry(dir, 's1'), null, 'a stale signature is refused')

    const warm = makeState()
    await scanPersisted(ctxWith(persistence), warm, { cacheDir: dir })
    assert.equal(warm.records.length, 1, 'and the session is folded again')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the cache is optional: cache:false keeps the old behaviour', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const persistence = fakePersistence(sessions)
    const state = makeState()
    await scanPersisted(ctxWith(persistence), state, { cache: false, cacheDir: dir })
    assert.equal(state.records.length, 1)
    assert.deepEqual(readdirSync(dir), [], 'nothing was written')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a partial listing never deletes cache entries', async () => {
  // This is the incident that made every start slow: `sp.list()` returns a
  // PARTIAL list while the session store warms up, and pruning on "absent from
  // this listing" deleted 257 of 258 valid entries. A missing entry costs one
  // re-fold; deleting them costs one re-fold of the whole history per start.
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] }, s2: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    await scanPersisted(ctxWith(fakePersistence(sessions)), makeState(), { cacheDir: dir })
    assert.equal(readdirSync(dir).length, 2)

    // The store now reports only s1; s2 is simply not enumerated yet.
    const partial = {
      list: async () => [{ header: { id: 's1' }, revision: 'r1', eventCount: 1 }],
      open: async (id) => ({ inheritedEventCount: 0, read: async () => ({ events: sessions[id].events }), close: async () => {} }),
    }
    await scanPersisted(ctxWith(partial), makeState(), { cacheDir: dir })
    assert.equal(readdirSync(dir).length, 2, 'nothing was deleted')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an entry holding another session\u2019s records is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const persistence = fakePersistence(sessions)
    await scanPersisted(ctxWith(persistence), makeState(), { cacheDir: dir })

    // Swap in a record that belongs to a different session: accepting it would
    // attribute one session's tokens to another.
    const [name] = readdirSync(dir)
    const path = join(dir, name)
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    payload.records = [{ session: 'other', time: 1, inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }]
    writeFileSync(path, JSON.stringify(payload))

    const warm = makeState()
    await scanPersisted(ctxWith(persistence), warm, { cacheDir: dir })
    assert.deepEqual(warm.records.map((r) => r.session), ['s1'], 'the foreign record never lands')
    assert.equal(warm.records.length, 1, 'the session was folded from its log instead')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a warm pass never opens the session log', async () => {
  // The cache is only worth anything if the log is not read. Make `open()` throw
  // on the second pass: a warm start that still opens logs fails loudly instead of
  // quietly being as slow as before.
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = {
      s1: { revision: 'r1', events: [usageEvent(0, 1, 0), usageEvent(1, 1, 1)] },
      s2: { revision: 'r1', events: [usageEvent(0, 1, 0)] },
    }
    const cold = fakePersistence(sessions)
    await scanPersisted(ctxWith(cold), makeState(), { cacheDir: dir })

    const sealed = {
      list: cold.list,
      open: async (id) => {
        throw new Error('a warm pass must not open ' + id)
      },
    }
    const warm = makeState()
    await scanPersisted(ctxWith(sealed), warm, { cacheDir: dir })
    assert.equal(warm.records.length, 3, 'all records came from the cache')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('each pass reports its own timing line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = {
      s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] },
      s2: { revision: 'r1', events: [usageEvent(0, 1, 0)] },
    }
    const persistence = fakePersistence(sessions)

    const coldLogs = []
    await scanPersisted(ctxWith(persistence), makeState(), { cacheDir: dir, log: (m) => coldLogs.push(m) })
    assert.equal(coldLogs.length, 1, 'one line per pass')
    assert.match(coldLogs[0], /2 sessions, 0 from cache, 2 folded, list \d+ms, total \d+ms/)

    const warmLogs = []
    await scanPersisted(ctxWith(persistence), makeState(), { cacheDir: dir, log: (m) => warmLogs.push(m) })
    assert.match(warmLogs[0], /2 sessions, 2 from cache, 0 folded, list \d+ms, total \d+ms/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the dashboard response and the cache dir both carry the last pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] } }
    const state = makeState()
    await scanPersisted(ctxWith(fakePersistence(sessions)), state, { cacheDir: dir })

    // The response field: readable through the dashboard call, no log plumbing.
    const out = query(state, { from: 0, to: Date.UTC(2030, 0, 1), granularity: 'day' })
    assert.ok(out.scan, 'the response carries the pass summary')
    assert.equal(out.scan.sessions, 1)
    assert.equal(out.scan.hydrated, 0)
    assert.ok(out.scan.totalMs >= 0 && out.scan.listMs >= 0)

    // The file next to the cache, for a host whose logger swallows plugin lines.
    const summary = JSON.parse(readFileSync(join(dir, '..', 'last-pass.json'), 'utf8'))
    assert.equal(summary.sessions, 1)
    assert.equal(summary.folded, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a second runBackfill while one is running does not reset the counters', async () => {  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] }, s2: { revision: 'r1', events: [] } }
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const slow = {
      list: async () => {
        await gate
        return Object.entries(sessions).map(([id, s]) => ({ header: { id }, revision: s.revision, eventCount: s.events.length }))
      },
      open: async (id) => ({ inheritedEventCount: 0, read: async () => ({ events: sessions[id].events }), close: async () => {} }),
    }
    const state = makeState()
    const first = runBackfill(ctxWith(slow), state, { cacheDir: dir })
    // While the first pass is in flight, a second call must return instead of
    // zeroing `done` — that used to surface as `status: done, total: 258, done: 0`.
    await runBackfill(ctxWith(slow), state, { cacheDir: dir })
    assert.equal(state.backfill.done, 0, 'the second call left the counters alone')
    release()
    await first
    assert.equal(state.backfill.status, 'done')
    assert.equal(state.backfill.done, state.backfill.total, 'done catches up to total')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBackfill waits for an in-flight pass instead of announcing done: 0', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    const sessions = { s1: { revision: 'r1', events: [usageEvent(0, 1, 0)] }, s2: { revision: 'r1', events: [] } }
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const slow = {
      list: async () => {
        await gate
        return Object.entries(sessions).map(([id, s]) => ({ header: { id }, revision: s.revision, eventCount: s.events.length }))
      },
      open: async (id) => ({ inheritedEventCount: 0, read: async () => ({ events: sessions[id].events }), close: async () => {} }),
    }
    const state = makeState()
    // A cadence pass is already running when the plugin activates.
    const inFlight = scanPersisted(ctxWith(slow), state, { cacheDir: dir })
    const backfill = runBackfill(ctxWith(slow), state, { cacheDir: dir })
    release()
    await Promise.all([inFlight, backfill])

    assert.equal(state.backfill.status, 'done')
    assert.equal(state.backfill.total, 2)
    assert.equal(state.backfill.done, 2, 'the retry produced a consistent counter')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the signature covers the fold version and the holiday calendar', () => {  const sig = foldSignature()
  assert.ok(sig.startsWith(String(FOLD_CACHE_VERSION) + ':'), 'the version leads')
  assert.ok(sig.length > String(FOLD_CACHE_VERSION).length + 1, 'the calendar is part of it')
})

test('writeEntry round-trips, and refuses a shapeless entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-foldcache-'))
  try {
    assert.equal(writeEntry(dir, 'x/y z', { revision: 'r', watermark: 7, records: [{ a: 1 }] }), true)
    assert.deepEqual(readEntry(dir, 'x/y z'), { revision: 'r', watermark: 7, records: [{ a: 1 }] })
    assert.equal(writeEntry(dir, 'bad', { watermark: 1 }), false, 'records are required')
    mkdirSync(join(dir, 'nested'), { recursive: true })
    assert.equal(readEntry(dir, 'missing'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
