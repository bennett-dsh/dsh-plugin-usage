/**
 * Incremental aggregation index over state.records.
 *
 * LOCKED CONTRACT — query.js consumes exactly these members; do not change the
 * signatures:
 *   add(record)              — fold calls for every record inserted
 *   remove(record)           — fold calls when a dedup replacement drops a record
 *   recordsInRange(from, to) — iterable of records with from <= time <= to
 *   cellsInRange(from, to)   — day rollups overlapping the range, oldest first
 *   dayRecords(start)        — the records of one local day, or null
 *
 * Two indexes over the same records, because a query needs two different faces:
 *
 *  - **day slices** (`records`): the per-record face. Hour/minute buckets, model
 *    filters over a partial edge day and any bookkeeping the rollups cannot
 *    answer still read records through it.
 *  - **day rollup cells** (`cells`): per (local day, model) token sums. A
 *    day-granularity query then costs O(days x models) instead of O(records) —
 *    the difference between 366 x 6 cells and a 100k-record walk on every
 *    dashboard refresh.
 *
 * Cost is deliberately NOT stored in a cell: it depends on the price table and
 * on the user's confirmed matches, both of which can change while the records
 * stay the same. Cells keep tokens; the query bills them with the rates current
 * when it runs.
 *
 * Records are folded chronologically, so each day array preserves insertion
 * order and iterating day ordinals in ascending order reproduces the baseline
 * scan's order while skipping out-of-range days. recordsInRange() additionally
 * sweeps state.records for entries missing from the map (bookkeeping gaps, e.g.
 * records pushed before the index existed) so query results stay identical to
 * the baseline O(N) scan even on partial indexes — each such record is guarded
 * by a per-call Set against duplicates.
 */
import { DAY_MS, alignFloor } from './time.js';
import { tierAt } from './pricing.js';

const dayOrdinal = (t) => Math.floor(alignFloor(t, 'day') / DAY_MS);

/** Composite model key: `provider/model`, or the bare model when provider is empty. */
export function compositeModelKey(record) {
  return record.provider ? record.provider + '/' + record.model : record.model;
}

/**
 * A contribution is one record's or one cell's worth of usage, in the shape the
 * query accumulates. Tier sums exist because DeepSeek bills peak and off-peak
 * separately; the flat token totals the UI shows are their sum.
 *
 * @returns {object} a zeroed contribution.
 */
export function emptyContribution() {
  return {
    calls: 0,
    callsWithTotal: 0,
    recordTotalTokens: 0,
    peakInput: 0,
    peakOutput: 0,
    peakRead: 0,
    peakWrite: 0,
    offInput: 0,
    offOutput: 0,
    offRead: 0,
    offWrite: 0,
  };
}

/** Add (or, with sign -1, subtract) one tier bucket's four token counts. */
function addTier(contribution, tier, bucket, sign) {
  const input = ((bucket && bucket.inputTokens) || 0) * sign;
  const output = ((bucket && bucket.outputTokens) || 0) * sign;
  const read = ((bucket && bucket.cacheReadTokens) || 0) * sign;
  const write = ((bucket && bucket.cacheWriteTokens) || 0) * sign;
  if (tier === 'peak') {
    contribution.peakInput += input;
    contribution.peakOutput += output;
    contribution.peakRead += read;
    contribution.peakWrite += write;
  } else {
    contribution.offInput += input;
    contribution.offOutput += output;
    contribution.offRead += read;
    contribution.offWrite += write;
  }
}

/**
 * Fold one record into a contribution.
 *
 * A record folded with a calendar carries its own tier split (`tokens.peak` /
 * `tokens.off`); a legacy record without one is classified with the same rule
 * `costOf` uses for it, so the rollup and the per-record bill agree.
 *
 * @param {object} contribution - target contribution.
 * @param {object} record - usage record.
 * @param {number} [sign] - 1 to add, -1 to subtract.
 */
export function addToContribution(contribution, record, sign = 1) {
  const total = typeof record.totalTokens === 'number' ? record.totalTokens : 0;
  contribution.calls += sign;
  if (total > 0) contribution.callsWithTotal += sign;
  contribution.recordTotalTokens += sign * total;
  const tokens = record.tokens;
  if (tokens && (tokens.peak || tokens.off)) {
    if (tokens.peak) addTier(contribution, 'peak', tokens.peak, sign);
    if (tokens.off) addTier(contribution, 'off', tokens.off, sign);
  } else {
    addTier(contribution, tierAt(record.time), record, sign);
  }
}

/** One record as a standalone contribution (the per-record query path). */
export function contributionOfRecord(record) {
  const contribution = emptyContribution();
  addToContribution(contribution, record, 1);
  return contribution;
}

export function createUsageIndex(state) {
  const days = new Map();
  const cells = new Map(); // local-day start ms -> Map<composite key, cell>
  // Records held in the day slices. `query` compares it with `state.records`
  // length: a record pushed straight onto the array (the bookkeeping gap the
  // defensive sweep tolerates) is not in the rollup cells either, so the query
  // falls back to the record scan instead of trusting an incomplete rollup.
  let indexed = 0;

  /** Add or subtract one record's usage in its (day, model) cell. */
  function addToCells(record, sign) {
    const start = alignFloor(record.time, 'day');
    const key = compositeModelKey(record);
    let day = cells.get(start);
    if (day === undefined) {
      if (sign < 0) return; // a day that never held a cell has nothing to subtract
      day = new Map();
      cells.set(start, day);
    }
    let cell = day.get(key);
    if (cell === undefined) {
      if (sign < 0) return;
      cell = Object.assign({ key, provider: record.provider || '', model: record.model || '' }, emptyContribution());
      day.set(key, cell);
    }
    addToContribution(cell, record, sign);
    if (cell.calls === 0) {
      day.delete(key);
      if (day.size === 0) cells.delete(start);
    }
  }

  return {
    add(record) {
      const o = dayOrdinal(record.time);
      let day = days.get(o);
      if (day === undefined) {
        day = [];
        days.set(o, day);
      }
      day.push(record);
      indexed += 1;
      addToCells(record, 1);
    },
    remove(record) {
      const o = dayOrdinal(record.time);
      const day = days.get(o);
      if (day !== undefined) {
        const i = day.indexOf(record);
        if (i !== -1) {
          day.splice(i, 1);
          indexed -= 1;
          if (day.length === 0) days.delete(o);
        }
      }
      addToCells(record, -1);
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
    /**
     * The rollup cells of every local day overlapping [from, to], oldest first.
     *
     * @param {number} from - inclusive lower bound (may be -Infinity).
     * @param {number} to - inclusive upper bound (may be Infinity).
     * @returns {Iterable<{ start: number, cells: Map<string, object> }>} day start plus its cells.
     */
    *cellsInRange(from, to) {
      const starts = [];
      for (const start of cells.keys()) {
        if (start > to) continue;
        if (start + DAY_MS - 1 < from) continue;
        starts.push(start);
      }
      starts.sort((a, b) => a - b);
      for (const start of starts) {
        const day = cells.get(start);
        if (day !== undefined) yield { start, cells: day };
      }
    },
    /** The records of one local day, or null when nothing was indexed for it. */
    dayRecords(start) {
      return days.get(Math.floor(start / DAY_MS)) || null;
    },
    /** Total indexed records (day slices only). */
    size() {
      return indexed;
    },
    /** Drop whole day slices strictly before ts (keeps the day containing ts). */
    pruneBefore(ts) {
      const cut = dayOrdinal(ts);
      for (const o of days.keys()) {
        if (o < cut) days.delete(o);
      }
      const cutStart = alignFloor(ts, 'day');
      for (const start of cells.keys()) {
        if (start < cutStart) cells.delete(start);
      }
    },
  };
}
