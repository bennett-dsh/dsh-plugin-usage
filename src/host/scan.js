/**
 * Live/persisted session scanning + startup backfill.
 *
 * P1-6: optimization lives here — bounded-concurrency backfill, per-session
 * failure backoff, progress notifications, and an optional onProgress/
 * onDone callback so the host can push a usage/updated event to clients.
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

/** Scan live in-memory sessions (cheap, every tick). */
export function scanLive(ctx, state) {
  const sessions = ctx.get('sessions');
  if (sessions === undefined) return;
  for (const s of sessions.list()) {
    if (!s || !s.id) continue;
    const wm = state.watermarks.get(s.id) ?? -1;
    const next = foldNew(state, s.id, s.events || [], wm);
    if (next > wm) state.watermarks.set(s.id, next);
  }
}

/**
 * Incremental scan of persisted sessions (slow cadence). Headers are read in
 * small concurrent batches; a failing session is backed off for an
 * exponentially growing number of passes instead of aborting the pass.
 */
export async function scanPersisted(ctx, state, options) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined) return;
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
async function processHeader(sp, state, h, options) {
  if (!h || !h.id) return;
  const id = h.id;
  const backoff = backoffBySession.get(id);
  if (backoff && backoff.skipLeft > 0) {
    backoff.skipLeft -= 1; // decay the skip count one pass at a time
    return;
  }
  const wm = state.watermarks.get(id) ?? -1;
  try {
    const page = await sp.readFrom(id, wm + 1);
    const events = (page && page.events) || [];
    const next = foldNew(state, id, events, wm);
    if (next > wm) state.watermarks.set(id, next);
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
  if (sp === undefined) {
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
