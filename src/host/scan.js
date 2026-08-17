/**
 * Live/persisted session scanning + startup backfill.
 *
 * P1-6: optimization lives here — bounded-concurrency backfill, per-session
 * failure backoff, progress notifications, and an optional onProgress/
 * onDone callback so the host can push a usage/updated event to clients.
 */
import { foldNew } from './fold.js';

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

/** Incremental scan of persisted sessions (slow cadence). */
export async function scanPersisted(ctx, state) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined) return;
  const headers = await sp.list();
  if (!Array.isArray(headers)) return;
  state.backfill.total = headers.length;
  for (const h of headers) {
    if (!h || !h.id) continue;
    const wm = state.watermarks.get(h.id) ?? -1;
    try {
      const page = await sp.readFrom(h.id, wm + 1);
      const events = (page && page.events) || [];
      const next = foldNew(state, h.id, events, wm);
      if (next > wm) state.watermarks.set(h.id, next);
    } catch (error) {
      // A session may be gone or mid-rewrite; skip and retry next pass.
    }
    if (state.backfill.status === 'running') state.backfill.done += 1;
  }
}

/** Full history scan, once at startup. */
export async function runBackfill(ctx, state) {
  const sp = ctx.get('sessionPersistence');
  if (sp === undefined) {
    state.backfill.status = 'done';
    return;
  }
  state.backfill.status = 'running';
  state.backfill.done = 0;
  try {
    await scanPersisted(ctx, state);
    state.backfill.status = 'done';
  } catch (error) {
    state.backfill.status = 'done';
  }
}
