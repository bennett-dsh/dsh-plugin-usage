/**
 * Fold session events into usage records.
 *
 * foldNew is called by scan.js for both live and persisted sessions.
 *
 * P0-2: dedup ownership lives here. Records are keyed by
 * state.dedup (sessionId + turn + step); a later sample for the same
 * (turn, step) REPLACES the previous one in place instead of appending,
 * calling state.index.remove() for the dropped record and state.index.add()
 * for the replacement. Records without turn/step (legacy logs) are never
 * deduped — they always append.
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
  const key = sessionId + ':' + rec.turn + ':' + rec.step;
  if (rec.turn !== undefined && rec.step !== undefined) {
    const prevIndex = state.dedup.get(key);
    if (prevIndex !== undefined) {
      const prev = state.records[prevIndex];
      if (state.index) state.index.remove(prev);
      Object.assign(prev, rec);
      if (state.index) state.index.add(prev);
      return prev;
    }
    state.records.push(rec);
    state.dedup.set(key, state.records.length - 1);
    if (state.index) state.index.add(rec);
    return rec;
  }
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
