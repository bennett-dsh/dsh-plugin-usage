/**
 * Incremental aggregation index over state.records.
 *
 * P1-5 LOCKED CONTRACT — query.js consumes exactly these members and fold.js
 * feeds them; do not change the signatures:
 *   add(record)              — fold calls for every record inserted
 *   remove(record)           — fold calls when a dedup replacement drops a record
 *   recordsInRange(from, to) — iterable of records with from <= time <= to
 *
 * Baseline implementation scans state.records on demand (correct, O(N)).
 * The optimization workstream replaces the internals with an incrementally
 * maintained day-keyed slice index (and any safe memory bound) WITHOUT
 * changing this contract or the observable query results.
 */
export function createUsageIndex(state) {
  return {
    add(record) {
      // baseline: records are already pushed by fold.js
    },
    remove(record) {
      // baseline: no-op
    },
    *recordsInRange(from, to) {
      for (const r of state.records) {
        if (r.time >= from && r.time <= to) yield r;
      }
    },
  };
}
