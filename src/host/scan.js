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
 * backoff, revision-based skip (unchanged logs are not re-read), progress
 * callbacks, and watermark repair when a log shrank.
 */
import { foldNew } from './fold.js';

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

/**
 * Incremental scan of persisted sessions (slow cadence). Headers are read in
 * small concurrent batches; unchanged revisions are skipped; a failing session
 * is backed off for an exponentially growing number of passes instead of
 * aborting the pass.
 */
export async function scanPersisted(ctx, state, options) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined || sp === null) return;
  if (persistedInFlight) return; // previous pass still running: skip this tick
  persistedInFlight = true;
  try {
    const headers = await sp.list();
    if (!Array.isArray(headers)) return;
    state.backfill.total = headers.length;
    for (let i = 0; i < headers.length; i += BATCH_SIZE) {
      const batch = headers.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((h) => processHeader(sp, state, h, options)));
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
async function processHeader(sp, state, snap, options) {
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

/** Full history scan, once at startup. */
export async function runBackfill(ctx, state, options) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined || sp === null) {
    state.backfill.status = 'done';
    fireBackfillDone(options, state);
    return;
  }
  state.backfill.status = 'running';
  state.backfill.done = 0;
  // Delegate progress while the pass runs; onDone is fired right here exactly
  // once so the pass callback does not double-report backfill completion.
  const scanOptions = options && typeof options.onProgress === 'function'
    ? { onProgress: options.onProgress }
    : undefined;
  try {
    await scanPersisted(ctx, state, scanOptions);
    state.backfill.status = 'done';
    fireBackfillDone(options, state);
  } catch (error) {
    state.backfill.status = 'done';
    fireBackfillDone(options, state);
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
