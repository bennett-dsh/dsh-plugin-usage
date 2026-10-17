/**
 * Mutable runtime state capsule for the usage host half.
 *
 * - records: folded usage records, one per billed assistant settlement
 *   (`assistant/message` or `assistant/attempt`) that reported usage.
 * - watermarks: sessionId -> last folded event seq.
 * - revisions: sessionId -> last persisted revision folded (opaque equality
 *   token from `sessionPersistence.list()`); lets the slow scan skip sessions
 *   whose log did not change.
 * - backfill: progress counters surfaced through query results.
 * - prices: the price store from settings.js.
 * - lastSample: sessionId -> { turn, step, record } — the replacement slot the
 *   official tokenUsage projection keeps, so a later sample for the same
 *   (turn, step) replaces in place and `llm/retry-started` clears it.
 * - route: sessionId -> { provider, model } from the latest request route,
 *   used to attribute settlements that carry no `message.source`
 *   (`assistant/attempt` never does).
 * - index: incremental aggregation index (aggregate.js), kept in sync by
 *   fold.js and consumed by query.js.
 */
export function createState(priceStore) {
  return {
    records: [],
    watermarks: new Map(),
    revisions: new Map(),
    backfill: { status: 'idle', total: 0, done: 0 },
    prices: priceStore,
    lastSample: new Map(),
    route: new Map(),
    index: null, // wired by apply() after createUsageIndex(state)
  };
}
