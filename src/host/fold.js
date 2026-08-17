/**
 * Fold session events into usage records.
 *
 * foldNew is called by scan.js for both live and persisted sessions.
 *
 * P0-2: dedup ownership lives here. The baseline pushes every
 * assistant/message usage record; the optimization keys records by
 * state.dedup (sessionId + turn + step) and REPLACES the previous sample for
 * the same (turn, step) instead of appending, calling state.index.remove()
 * for the dropped record and state.index.add() for the replacement.
 */
export function foldEvent(state, sessionId, e) {
  if (!e || e.type !== 'assistant/message' || !e.data || !e.data.usage) return null;
  const source = (e.data.message && e.data.message.source) || {};
  const u = e.data.usage;
  const rec = {
    time: e.time,
    session: sessionId,
    provider: source.provider || '',
    model: source.model || '',
    turn: e.data.turn,
    step: e.data.step,
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    cacheReadTokens: u.cacheReadTokens || 0,
    cacheWriteTokens: u.cacheWriteTokens || 0,
    reasoningTokens: u.reasoningTokens || 0,
    totalTokens: (u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0),
  };
  state.records.push(rec);
  if (state.index) state.index.add(rec);
  return rec;
}

/** Fold events with seq > watermark for one session; returns new watermark. */
export function foldNew(state, sessionId, events, wm) {
  let max = wm;
  for (const e of events) {
    if (e && typeof e.seq === 'number' && e.seq > wm) {
      foldEvent(state, sessionId, e);
      if (e.seq > max) max = e.seq;
    }
  }
  return max;
}
