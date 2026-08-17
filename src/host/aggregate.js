/**
 * Incremental aggregation index over state.records.
 *
 * P1-5 LOCKED CONTRACT — query.js consumes exactly these members and fold.js
 * feeds them; do not change the signatures:
 *   add(record)              — fold calls for every record inserted
 *   remove(record)           — fold calls when a dedup replacement drops a record
 *   recordsInRange(from, to) — iterable of records with from <= time <= to
 *
 * Implementation: a Map<dayOrdinal, records[]> slice index maintained
 * incrementally by add()/remove(). Records are folded chronologically, so each
 * day array preserves insertion order and iterating day ordinals in ascending
 * order reproduces the baseline scan's order while skipping out-of-range days.
 * recordsInRange() additionally sweeps state.records for entries missing from
 * the map (bookkeeping gaps, e.g. records pushed before the index existed) so
 * query results stay identical to the baseline O(N) scan even on partial
 * indexes — each such record is guarded by a per-call Set against duplicates.
 */
import { DAY_MS, alignFloor } from './time.js';

const dayOrdinal = (t) => Math.floor(alignFloor(t, 'day') / DAY_MS);

export function createUsageIndex(state) {
  const days = new Map();

  return {
    add(record) {
      const o = dayOrdinal(record.time);
      let day = days.get(o);
      if (day === undefined) {
        day = [];
        days.set(o, day);
      }
      day.push(record);
    },
    remove(record) {
      const day = days.get(dayOrdinal(record.time));
      if (day === undefined) return; // missing record: tolerate silently
      const i = day.indexOf(record);
      if (i === -1) return; // not indexed: tolerate silently
      day.splice(i, 1);
      if (day.length === 0) days.delete(dayOrdinal(record.time));
    },
    *recordsInRange(from, to) {
      const startOrd = Number.isFinite(from) ? dayOrdinal(from) : null;
      const endOrd = Number.isFinite(to) ? dayOrdinal(to) : null;
      // Finite bounds cover ordinal ranges directly; unbounded sides fall back
      // to scanning the known day keys (never an infinite loop on ±Infinity).
      const ords = [];
      if (startOrd !== null && endOrd !== null) {
        for (let o = startOrd; o <= endOrd; o++) ords.push(o);
      } else {
        for (const o of days.keys()) {
          if (startOrd === null || o >= startOrd) {
            if (endOrd === null || o <= endOrd) ords.push(o);
          }
        }
        ords.sort((a, b) => a - b);
      }
      const seen = new Set();
      for (const o of ords) {
        const day = days.get(o);
        if (day === undefined) continue;
        for (const r of day) {
          if (r.time >= from && r.time <= to) {
            seen.add(r);
            yield r;
          }
        }
      }
      // Defensive sweep: surface any record the slice index missed (bookkeeping
      // gaps) without yielding anything twice.
      for (const r of state.records) {
        if (r.time >= from && r.time <= to && !seen.has(r)) yield r;
      }
    },
    /** Total indexed records (day slices only). */
    size() {
      let n = 0;
      for (const day of days.values()) n += day.length;
      return n;
    },
    /** Drop whole day slices strictly before ts (keeps the day containing ts). */
    pruneBefore(ts) {
      const cut = dayOrdinal(ts);
      for (const o of days.keys()) {
        if (o < cut) days.delete(o);
      }
    },
  };
}
