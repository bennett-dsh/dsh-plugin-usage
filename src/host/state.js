/**
 * Mutable runtime state capsule for the usage host half.
 *
 * - records: folded usage records, one per assistant/message with usage.
 * - watermarks: sessionId -> last folded event seq.
 * - backfill: progress counters surfaced through query results.
 * - prices: the price store from settings.js.
 * - dedup: (sessionId, turn, step) -> index in records; owned by fold.js.
 * - index: incremental aggregation index (aggregate.js), kept in sync by
 *   fold.js and consumed by query.js.
 */
export function createState(priceStore) {
  return {
    records: [],
    watermarks: new Map(),
    backfill: { status: 'idle', total: 0, done: 0 },
    prices: priceStore,
    dedup: new Map(),
    index: null, // wired by apply() after createUsageIndex(state)
  };
}
