/**
 * Fold durable session events into usage records.
 *
 * This mirrors the official `tokenUsage` session projection
 * (@deepseek-ai/dsh-token-meter) so a third-party dashboard and the built-in
 * stats agree on what one session consumed:
 *
 *  - A **billed settlement** is `assistant/message` or `assistant/attempt`.
 *    `assistant/message` carries `data.usage`; a retried/failed attempt has no
 *    usage field but can still have reported usage on its exact stream, so the
 *    last raw `usage` chunk of `data.stream` is used when the field is absent.
 *  - `llm/retry-started` closes the replacement slot for that (turn, step):
 *    the retried attempt is a NEW billable attempt and must add, not replace.
 *  - Otherwise a later sample for the same (turn, step) replaces the previous
 *    one in place (index remove + add), because a settlement re-reports the
 *    cumulative usage of its step.
 *  - `request/context` and `request/header` provide the route (provider/model)
 *    for settlements that carry no `message.source`.
 *
 * Records without turn/step (legacy logs) are never deduped — they always
 * append.
 */

/**
 * Last raw `usage` chunk of one durable assistant stream.
 *
 * @param {unknown} stream - `AssistantStreamRecord[]` (packed records included).
 * @returns {object | undefined} the reported usage, when the stream has one.
 */
export function streamUsage(stream) {
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record && record.type === 'chunk' && record.chunk && record.chunk.type === 'usage') {
      return record.chunk.usage;
    }
  }
  return undefined;
}

/**
 * Usage reported by one durable assistant settlement.
 *
 * @param {{ type?: string, data?: any }} event - session event.
 * @returns {object | undefined} reported usage, when the settlement billed one.
 */
export function usageOf(event) {
  const data = event && event.data;
  if (event.type === 'assistant/message' && data && data.usage !== undefined) return data.usage;
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined;
  return streamUsage(data && data.stream);
}

/** Route carried by a request event, when present. */
function routeOf(event) {
  const data = event.data || {};
  if (event.type === 'request/context') {
    if (typeof data.provider === 'string' && typeof data.model === 'string') {
      return { provider: data.provider, model: data.model };
    }
    return undefined;
  }
  if (event.type === 'request/header') {
    const config = data.header && data.header.config;
    if (config && typeof config.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model };
    }
  }
  return undefined;
}

/**
 * Fold one durable event into the usage records.
 *
 * @param {object} state - runtime state capsule (see state.js).
 * @param {string} sessionId - owning session.
 * @param {{ type?: string, seq?: number, time?: number, data?: any }} e - session event.
 * @returns {object | null} the affected record, or null when the event billed nothing.
 */
export function foldEvent(state, sessionId, e) {
  if (!e || typeof e !== 'object') return null;

  // Route tracking: every settlement of a turn is priced/attributed under the
  // route its request ran on.
  const route = routeOf(e);
  if (route !== undefined) {
    state.route.set(sessionId, route);
    return null;
  }

  // Retry boundary: the retried attempt is a new billable attempt.
  if (e.type === 'llm/retry-started') {
    const data = e.data || {};
    const last = state.lastSample.get(sessionId);
    if (last && last.turn === data.turn && last.step === data.step) {
      state.lastSample.delete(sessionId);
    }
    return null;
  }

  if (e.type !== 'assistant/message' && e.type !== 'assistant/attempt') return null;
  const usage = usageOf(e);
  if (usage === undefined || usage === null || typeof usage !== 'object') return null;

  const data = e.data || {};
  const source = (data.message && data.message.source) || state.route.get(sessionId) || {};
  const u = usage;
  const inputTokens = u.inputTokens || 0;
  const outputTokens = u.outputTokens || 0;
  const cacheReadTokens = u.cacheReadTokens || 0;
  const cacheWriteTokens = u.cacheWriteTokens || 0;
  const rec = {
    time: e.time,
    session: sessionId,
    provider: source.provider || '',
    model: source.model || '',
    turn: data.turn,
    step: data.step,
    attempt: e.type === 'assistant/attempt',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens: u.reasoningTokens || 0,
    // Prefer the provider's authoritative full-call total when reported.
    totalTokens: typeof u.totalTokens === 'number'
      ? u.totalTokens
      : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
  };
  // Peak / off-peak buckets. This is the only place an event's own timestamp is
  // available, and DeepSeek bills by that timestamp: one model can mix both
  // tiers inside a single day, so an aggregate priced after the fact is always
  // either too high or too low. `state.peakOf` is injected by apply(), which
  // keeps this function a pure function of its arguments in tests.
  if (typeof state.peakOf === 'function') {
    const peak = state.peakOf(e.time) === true;
    rec.tokens = {
      [peak ? 'peak' : 'off']: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
    };
  }

  const previous = state.lastSample.get(sessionId);
  if (previous !== undefined
    && data.turn !== undefined && data.step !== undefined
    && previous.turn === data.turn && previous.step === data.step) {
    const prev = previous.record;
    if (state.index) state.index.remove(prev);
    Object.assign(prev, rec);
    if (state.index) state.index.add(prev);
    state.lastSample.set(sessionId, { turn: data.turn, step: data.step, record: prev });
    return prev;
  }

  state.records.push(rec);
  if (state.index) state.index.add(rec);
  if (data.turn !== undefined && data.step !== undefined) {
    state.lastSample.set(sessionId, { turn: data.turn, step: data.step, record: rec });
  } else {
    state.lastSample.delete(sessionId);
  }
  return rec;
}

/**
 * Fold events with seq > watermark for one session; returns the new watermark.
 *
 * @param {object} state - runtime state capsule.
 * @param {string} sessionId - owning session.
 * @param {ReadonlyArray<object>} events - events in log order.
 * @param {number} wm - current watermark (last folded seq).
 * @returns {number} the new watermark.
 */
export function foldNew(state, sessionId, events, wm) {
  let max = wm;
  if (!Array.isArray(events)) return max;
  for (const e of events) {
    if (e && typeof e.seq === 'number' && e.seq > wm) {
      foldEvent(state, sessionId, e);
      if (e.seq > max) max = e.seq;
    }
  }
  return max;
}
