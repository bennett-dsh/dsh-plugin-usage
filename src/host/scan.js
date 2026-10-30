/**
 * Live/persisted session scanning + startup backfill.
 *
 * DSH 0.2.x session accessors (verified against @deepseek-ai/dsh-session and
 * @deepseek-ai/dsh-session-persistence 0.2.0-rc.2 / 0.2.1-rc.2):
 *
 *  - live:     `ctx.sessions.list()` -> `Session`, events via
 *              `session.snapshotEvents(fromSeq)`.
 *  - persisted: `ctx.sessionPersistence.list()` -> `{ header, revision,
 *              eventCount?, sizeBytes? }`, then `open(id, 'read')` and
 *              `handle.read(offset)`; the handle carries
 *              `inheritedEventCount` and must be closed.
 *
 * A forked session replays its parent's prefix; `inheritedEventCount` is the
 * cut, so folding starts there and the parent is never billed twice.
 *
 * Optimization lives here: bounded-concurrency backfill, per-session failure
 * backoff, revision-based skip (unchanged logs are not re-read), the on-disk fold
 * cache (unchanged logs are not even opened after a restart), progress callbacks,
 * and watermark repair when a log shrank.
 */
import { foldNew } from './fold.js';
import { cacheDir, readEntry, writeEntry } from './fold-cache.js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** How many persisted headers are read concurrently per batch. */
const BATCH_SIZE = 8;

/**
 * Per-session backoff bookkeeping, kept at module (closure) scope so it spans
 * multiple passes. Value is { failures, skipLeft }: consecutive failure count
 * plus the number of upcoming passes the session is skipped for
 * (2 ** failures, capped at 5; decays by one each pass).
 */
const backoffBySession = new Map();

/** True while a scanPersisted pass is in flight; overlapping passes are dropped. */
let persistedInFlight = false;

/**
 * Events of one live session at or after `fromSeq`.
 *
 * @param {any} session - live Session.
 * @param {number} fromSeq - first seq to return.
 * @returns {ReadonlyArray<object>} events in log order.
 */
export function liveEvents(session, fromSeq) {
  if (session === null || typeof session !== 'object') return [];
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents(fromSeq);
  // Legacy pre-0.2 sessions exposed the whole log as `events`.
  if (Array.isArray(session.events)) {
    return session.events.filter((event) => !event || typeof event.seq !== 'number' || event.seq >= fromSeq);
  }
  return [];
}

/** Scan live in-memory sessions (cheap, every tick). */
export function scanLive(ctx, state) {
  const sessions = ctx.get('sessions');
  if (sessions === undefined || sessions === null) return;
  for (const s of sessions.list()) {
    if (!s || !s.id) continue;
    const wm = state.watermarks.get(s.id) ?? -1;
    // Never bill the fork-inherited prefix to the child.
    const inherited = typeof s.inheritedEventCount === 'number' ? s.inheritedEventCount : 0;
    const from = Math.max(wm + 1, inherited);
    const next = foldNew(state, s.id, liveEvents(s, from), wm);
    if (next > wm) state.watermarks.set(s.id, next);
  }
}

/** Id of one persistence listing snapshot (`{header:{id}}` in 0.2.x). */
function snapshotId(snap) {
  if (!snap || typeof snap !== 'object') return undefined;
  if (snap.header && typeof snap.header.id === 'string') return snap.header.id;
  if (typeof snap.id === 'string') return snap.id;
  return undefined;
}

/**
 * Read events for one persisted session at or after `fromSeq`, preferring the
 * 0.2.x handle API and falling back to a legacy `readFrom` backend.
 *
 * @param {any} persistence - sessionPersistence service.
 * @param {string} id - session id.
 * @param {number} fromSeq - first seq to return.
 * @returns {Promise<{ events: ReadonlyArray<object>, inherited: number }>} events + fork cut.
 */
export async function readSessionEvents(persistence, id, fromSeq) {
  if (typeof persistence.open === 'function') {
    const handle = await persistence.open(id, 'read');
    try {
      const inherited = typeof handle.inheritedEventCount === 'number' ? handle.inheritedEventCount : 0;
      const page = await handle.read(Math.max(fromSeq, inherited));
      return { events: (page && page.events) || [], inherited };
    } finally {
      if (handle && typeof handle.close === 'function') {
        try {
          await handle.close();
        } catch {
          // A close failure must not turn a successful read into a failed scan.
        }
      }
    }
  }
  if (typeof persistence.readFrom === 'function') {
    const page = await persistence.readFrom(id, fromSeq);
    return { events: (page && page.events) || [], inherited: 0 };
  }
  return { events: [], inherited: 0 };
}

/* -------------------------------------------------------------------------- *
 * Fold cache plumbing
 * -------------------------------------------------------------------------- */

/**
 * Open one scan pass.
 *
 * The cache is optional and never required: a pass without it behaves exactly as
 * before, which is what a failing cache degrades to.
 *
 * @param {{ cache?: boolean, cacheDir?: string }} [options]
 * @returns {{ dir: string | null, scanned: Set<string>, hydrated: number }}
 */
function beginPass(options) {
  const enabled = !(options && options.cache === false);
  return {
    dir: enabled ? (options && options.cacheDir) || cacheDir() : null,
    scanned: new Set(),
    hydrated: 0,
    startedAt: Date.now(),
    listMs: 0,
  };
}

/**
 * One line per pass, so a slow start explains itself instead of being guessed at.
 *
 * The line goes to the logger AND into `state.lastPass`, which the dashboard
 * response carries: on this host the plugin logger does not reliably reach the
 * desktop log file, and a probe nobody can read is not a probe.
 */
function reportPass(pass, counts, log) {
  const ms = Date.now() - pass.startedAt;
  const summary = {
    at: pass.startedAt,
    sessions: counts.total,
    hydrated: counts.hydrated,
    folded: counts.folded,
    listMs: pass.listMs,
    totalMs: ms,
  };
  return summary;
}

/** Records grouped by owning session, in one pass over the record array. */
function groupRecordsBySession(records) {
  const by = new Map();
  for (const record of records) {
    const id = record && record.session;
    if (typeof id !== 'string') continue;
    let list = by.get(id);
    if (list === undefined) {
      list = [];
      by.set(id, list);
    }
    list.push(record);
  }
  return by;
}

/**
 * Cache one hydrated session's records and bookkeeping into the live state.
 *
 * Refuses an entry whose records do not belong to `id`: a mixed-up file would
 * otherwise attribute one session's tokens to another.
 *
 * @returns {boolean} whether the entry was usable (and therefore consumed).
 */
function hydrateFromCache(state, id, entry, revision) {
  for (const record of entry.records) {
    if (!record || record.session !== id) return false;
  }
  for (const record of entry.records) {
    state.records.push(record);
    if (state.index) state.index.add(record);
  }
  state.watermarks.set(id, entry.watermark);
  if (revision !== undefined) state.revisions.set(id, revision);
  return true;
}

/**
 * Persist what this pass folded, then drop sessions that no longer exist.
 *
 * Only sessions this pass actually folded are rewritten: an untouched session's
 * entry stays valid because its revision did not change.
 */
function finishPass(state, headers, pass) {
  if (pass.dir === null) return;
  if (pass.scanned.size > 0) {
    const bySession = groupRecordsBySession(state.records);
    for (const id of pass.scanned) {
      writeEntry(pass.dir, id, {
        revision: state.revisions.get(id),
        watermark: state.watermarks.get(id) ?? -1,
        records: bySession.get(id) || [],
      });
    }
  }
  // ⚠️ Do NOT prune entries missing from this listing. `sp.list()` returns a
  // PARTIAL list while the session store is still warming up after a start, and a
  // prune keyed on "absent here" therefore deletes entries that are perfectly
  // valid. That is not hypothetical: it wiped 257 of 258 entries on a live
  // instance at 00:18 and every following start had to fold the whole history
  // again — the "numbers climb for 30 s" symptom. A stale entry costs disk and
  // nothing else (it is only read by id from a listing), so it is never worth
  // deleting speculatively.
}

/**
 * Incremental scan of persisted sessions (slow cadence). Headers are read in
 * small concurrent batches; unchanged revisions are skipped; a failing session
 * is backed off for an exponentially growing number of passes instead of
 * aborting the pass.
 */
export async function scanPersisted(ctx, state, options) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined || sp === null) return false;
  if (persistedInFlight) return false; // previous pass still running: skip this tick
  persistedInFlight = true;
  const pass = beginPass(options);
  try {
    const listedAt = Date.now();
    const headers = await sp.list();
    pass.listMs = Date.now() - listedAt;
    if (!Array.isArray(headers)) return true;
    state.backfill.total = headers.length;
    for (let i = 0; i < headers.length; i += BATCH_SIZE) {
      const batch = headers.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((h) => processHeader(sp, state, h, options, pass)));
    }
    finishPass(state, headers, pass);
    // The counters must agree at the end, WHOEVER started the pass: a cadence
    // pass runs while status is already 'done', and gating on status left
    // `{status: done, total: 258, done: 0}` in the response — which reads as
    // "nothing was scanned" while every record was in fact loaded.
    state.backfill.done = headers.length;
    const summary = reportPass(pass, { total: headers.length, hydrated: pass.hydrated, folded: pass.scanned.size });
    state.lastPass = summary;
    // Also leave it on disk: the log line needs a logger that reaches the host
    // log (this host does not always), while the file is readable without a
    // browser. Best effort: a failed diagnostic must never fail the pass.
    if (pass.dir !== null) {
      try {
        writeFileSync(join(dirname(pass.dir), 'last-pass.json'), JSON.stringify(summary, null, 2));
      } catch {
        // diagnostics only
      }
    }
    if (options && typeof options.log === 'function') {
      safeLog(options.log, '[usage] scan pass: ' + summary.sessions + ' sessions, ' + summary.hydrated
        + ' from cache, ' + summary.folded + ' folded, list ' + summary.listMs + 'ms, total ' + summary.totalMs + 'ms');
    }
  } finally {
    persistedInFlight = false;
    if (options && typeof options.onDone === 'function') {
      options.onDone({
        status: state.backfill.status,
        total: state.backfill.total,
        done: state.backfill.done,
      });
    }
  }
}

/** Read + fold one persisted session header; bounded by the batch caller. */
async function processHeader(sp, state, snap, options, pass) {
  const id = snapshotId(snap);
  if (id === undefined) return;
  const backoff = backoffBySession.get(id);
  if (backoff && backoff.skipLeft > 0) {
    backoff.skipLeft -= 1; // decay the skip count one pass at a time
    return;
  }
  try {
    const revision = snap && snap.revision;
    if (revision !== undefined && Object.is(state.revisions.get(id), revision)) {
      // The backend reports the same change token: the log is unchanged.
      backoffBySession.delete(id);
      return;
    }
    // Cache hit: same change token as the snapshot on disk, so the folded
    // records are still exactly what a fresh fold would produce. This is the
    // whole point of the cache — after a restart, an unchanged session costs one
    // JSON read instead of a full log read + inflate + fold.
    if (pass !== undefined && pass !== null && pass.dir !== null && revision !== undefined) {
      const entry = readEntry(pass.dir, id);
      if (entry !== null && entry.revision === revision && hydrateFromCache(state, id, entry, revision)) {
        pass.hydrated += 1;
        backoffBySession.delete(id);
        return;
      }
    }

    let wm = state.watermarks.get(id) ?? -1;
    // A crash-repaired or migrated log can shrink below our watermark; the
    // backend reports the current event count, so repair instead of stalling.
    if (typeof snap.eventCount === 'number' && wm >= snap.eventCount) {
      wm = -1;
      state.watermarks.set(id, -1);
      state.lastSample.delete(id);
    }
    const { events } = await readSessionEvents(sp, id, wm + 1);
    const next = foldNew(state, id, events, wm);
    if (next > wm) state.watermarks.set(id, next);
    if (revision !== undefined) state.revisions.set(id, revision);
    if (pass !== undefined && pass !== null) pass.scanned.add(id);
    backoffBySession.delete(id); // success resets the consecutive-failure chain
  } catch (error) {
    // A session may be gone or mid-rewrite: back off before trying again.
    const b = backoffBySession.get(id) || { failures: 0, skipLeft: 0 };
    b.failures += 1;
    b.skipLeft = Math.min(5, 2 ** b.failures);
    backoffBySession.set(id, b);
    return;
  } finally {
    if (state.backfill.status === 'running') {
      state.backfill.done += 1;
      if (options && typeof options.onProgress === 'function') {
        options.onProgress({
          status: state.backfill.status,
          total: state.backfill.total,
          done: state.backfill.done,
        });
      }
    }
  }
}

/**
 * Start the full-history scan on demand, from the first query.
 *
 * Why not at activation: the pass is the only moment "缓存加载" is visible, and it
 * takes ~0.8 s warm (12 s cold). Started from `apply` it finishes before anyone
 * opens the panel, so the loading state can never be seen — the user restarted a
 * dozen times and saw nothing. Started from the first query, the panel's own
 * opening *is* the computation window, so the skeleton and the progress line are
 * on screen for exactly as long as the work takes.
 *
 * Returns true when this call started it, false when it was already started.
 */
export function startBackfillOnDemand(ctx, state, options) {
  if (state.backfill.started === true) return false;
  // Flip the visible state first: the caller renders the response for this very
  // request, and it must already say "running" or the client shows the empty
  // dashboard for one frame. `runBackfill` flips `started` synchronously.
  state.backfill.status = 'running';
  state.backfill.done = 0;
  const log = options && typeof options.log === 'function' ? options.log : undefined;
  // Fire-and-forget **with** a catch. An unhandled rejection here is fatal on this
  // host, and `runBackfill`'s own try only begins after its `ctx.get(...)` probe,
  // so a throwing context access would otherwise crash the process from a plain
  // read request. Same failure class as the `logSink(...).warn` crash: background
  // work must never be able to take the host down.
  void runBackfill(ctx, state, options).catch((error) => {
    state.backfill.status = 'done';
    if (log !== undefined) safeLog(log, '[usage] backfill rejected: ' + (error && error.message ? error.message : String(error)));
  });
  return true;
}

/** Full history scan, once per process (lazily, from `startBackfillOnDemand`). */
export async function runBackfill(ctx, state, options) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined || sp === null) {
    state.backfill.status = 'done';
    fireBackfillDone(options, state);
    return;
  }
  // "只跑一次"由 `started` 记，不由 `status` 记：按需启动时调用方会先把 status
  // 置成 running（好让发起查询的那一帧就带上加载态），用 status 当守卫会把真正
  // 要干的活挡在门外。
  if (state.backfill.started === true) return;
  state.backfill.started = true;
  state.backfill.status = 'running';
  state.backfill.done = 0;
  // Delegate progress while the pass runs; onDone is fired right here exactly
  // once so the pass callback does not double-report backfill completion.
  const log = options && typeof options.log === 'function' ? options.log : undefined;
  // Forward every scan option (cache / cacheDir included) instead of rebuilding
  // the object: rebuilding dropped `cache: false` and quietly used the real cache
  // directory in tests. `onDone` stays here — runBackfill fires it exactly once.
  const { onDone: ignoredOnDone, ...scanOptions } = options || {};
  if (log !== undefined) scanOptions.log = log;
  try {
    let ran = await scanPersisted(ctx, state, scanOptions);
    // A cadence pass may already be in flight when the plugin activates. That pass
    // does the work, but "done" must not be announced before anything was read —
    // that is how the response ended up saying `done: 0` while every record was
    // loaded.
    for (let attempt = 0; ran === false && attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      ran = await scanPersisted(ctx, state, scanOptions);
    }
    state.backfill.status = 'done';
    fireBackfillDone(options, state);
  } catch (error) {
    // A failed pass must not wedge the plugin in `running` — but it must not
    // vanish either: "the dashboard never filled in" is unanswerable if the
    // reason was swallowed here.
    // Logging is best-effort: a broken sink must cost one line, never the host.
    // (This catch used to re-throw through a bad logger and took dsh down.)
    state.backfill.status = 'done';
    if (log !== undefined) safeLog(log, '[usage] backfill failed: ' + (error && error.message ? error.message : String(error)));
    fireBackfillDone(options, state);
  }
}

/** Call a diagnostic sink without ever letting it throw into the work. */
function safeLog(sink, message) {
  try {
    sink(message);
  } catch {
    // A logger that throws is a logging problem, not a scanning problem.
  }
}

function fireBackfillDone(options, state) {
  if (options && typeof options.onDone === 'function') {
    options.onDone({
      status: state.backfill.status,
      total: state.backfill.total,
      done: state.backfill.done,
    });
  }
}
