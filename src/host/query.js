/**
 * Aggregation/query logic — pure over the runtime state.
 *
 * P1-7 (unpriced detection) and P1-8 (provider/model composite keys in the
 * by-model table and model candidate list) are owned here.
 */
import {
  dayKey, DAY_MS, bucketKeyFor, stepMs, alignFloor, stepDayKeyFromDay, MAX_BUCKETS,
} from './time.js';
import { currencyOf } from './settings.js';
import { costOfSums, holidayCoverage, priceRow, referenceTable } from './pricing.js';
import { compositeModelKey, contributionOfRecord } from './aggregate.js';

function emptyBucket(key) {
  return {
    key,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

/**
 * Fold one contribution into a bucket.
 *
 * A contribution is either a rollup cell (a whole day of one model) or a single
 * record shaped the same way, which is why the two paths cannot disagree about
 * what a bucket holds.
 */
function accumulate(bucket, contribution, cost) {
  bucket.calls += contribution.calls;
  bucket.inputTokens += contribution.peakInput + contribution.offInput;
  bucket.outputTokens += contribution.peakOutput + contribution.offOutput;
  bucket.cacheReadTokens += contribution.peakRead + contribution.offRead;
  bucket.cacheWriteTokens += contribution.peakWrite + contribution.offWrite;
  bucket.totalTokens += contribution.peakInput + contribution.offInput
    + contribution.peakOutput + contribution.offOutput
    + contribution.peakRead + contribution.offRead
    + contribution.peakWrite + contribution.offWrite;
  bucket.cost += cost;
}

/**
 * Where the numbers came from, so the dashboard can say it out loud.
 *
 * A reference cost is an estimate against a published list, not a bill: the card
 * has to name both sources and the day they were read, or a user comparing it to
 * an invoice has no way to tell a wrong number from a different scope.
 *
 * @param {object} state - runtime state capsule.
 * @returns {{ source: string, capturedAt: string|null, note: string, holidays: object }}
 */
function pricingMeta(state) {
  const table = referenceTable();
  const names = Array.isArray(table.sources) ? table.sources.map((s) => s && s.name).filter(Boolean) : [];
  return {
    // Named from the table itself: a hard-coded string here is a second source
    // of truth that keeps claiming a source the generator no longer reads.
    source: names.length > 0 ? names.join(' + ') : '—',
    capturedAt: typeof table.capturedAt === 'string' ? table.capturedAt : null,
    note: '按 opencode Zen 和 DeepSeek 最新定价口径估算',
    holidays: holidayCoverage(),
  };
}

export function query(state, args) {
  const from = typeof args.from === 'number' ? args.from : -Infinity;
  const to = typeof args.to === 'number' ? args.to : Infinity;
  const granularity = args.granularity === 'minute' || args.granularity === 'hour' ? args.granularity : 'day';
  const stepDays = granularity === 'day' && Number.isInteger(args.stepDays) && args.stepDays > 0 ? args.stepDays : 1;
  // Zero-filled step series require a finite range.
  const fill = Boolean(args.fill) && Number.isFinite(from) && Number.isFinite(to);
  const modelSet = Array.isArray(args.models) && args.models.length > 0
    ? new Set(args.models)
    : null;
  /** Match either a bare model id or a `provider/model` composite key. */
  const modelSelected = (provider, model) => {
    if (modelSet === null) return true;
    if (modelSet.has(model)) return true;
    return provider !== '' && modelSet.has(provider + '/' + model);
  };

  const dailyMap = new Map();
  const modelMap = new Map();
  const total = emptyBucket('total');
  const seenModels = new Map(); // composite key -> {key, provider, model} (first composite wins)
  let unpricedCalls = 0;
  // Models that resolved to no price at all, and how the rest were priced. The
  // dialog reads the first list; the card note reads the second (a reference
  // price and a hand-entered one are not the same claim).
  const unmatched = new Map(); // composite key -> { key, provider, model, calls, totalTokens }
  const resolution = new Map(); // composite key -> priceRow()
  // One ladder resolution per distinct model, not per record. The ladder depends
  // only on (provider, model) plus the store's own tables, and neither changes
  // while one query runs — so a 30k-record scan used to walk the same five rungs
  // 90k times. The row is then billed from the price already resolved.
  const pricedByModel = new Map(); // composite key -> { hit, row }
  const pricedOf = (key, provider, model) => {
    let priced = pricedByModel.get(key);
    if (priced === undefined) {
      const hit = state.prices.lookup({ provider, model });
      priced = { hit, row: priceRow(hit) };
      pricedByModel.set(key, priced);
    }
    return priced;
  };
  // Range-anchored day-step grid: blocks start at the range's first day.
  const dayAnchor = Number.isFinite(from) ? alignFloor(from, 'day') : null;
  const useStepGrid = granularity === 'day' && stepDays > 1 && dayAnchor !== null;
  /** Bucket key of one instant (hour/minute buckets, or a partial edge day). */
  const bucketOfTime = (t) => (useStepGrid
    ? stepDayKeyFromDay(alignFloor(t, 'day'), dayAnchor, stepDays)
    : bucketKeyFor(t, granularity, stepDays));
  /** Bucket key of a whole local day (rollup cells). */
  const bucketOfDay = (start) => (useStepGrid
    ? stepDayKeyFromDay(start, dayAnchor, stepDays)
    : dayKey(start));

  /** Fold one model's contribution in one bucket into every output view. */
  const apply = (bucketKey, key, provider, model, contribution) => {
    // Candidate list first, selection filter second: the dropdown must offer
    // every model that has data in the range, not only the ones already ticked
    // (ticking one used to collapse the list to that single entry).
    if (!seenModels.has(key)) seenModels.set(key, { key, provider, model });
    if (!modelSelected(provider, model)) return;
    const priced = pricedOf(key, provider, model);
    const cost = priced.hit.price === null ? 0 : costOfSums(contribution, priced.hit.price);
    if (contribution.recordTotalTokens > 0 && priced.hit.price === null) {
      unpricedCalls += contribution.callsWithTotal;
      const seen = unmatched.get(key);
      if (seen === undefined) {
        unmatched.set(key, {
          key, provider, model, calls: contribution.callsWithTotal, totalTokens: contribution.recordTotalTokens,
        });
      } else {
        seen.calls += contribution.callsWithTotal;
        seen.totalTokens += contribution.recordTotalTokens;
      }
    }
    if (!resolution.has(key)) resolution.set(key, priced.row);

    let db = dailyMap.get(bucketKey);
    if (db === undefined) {
      db = emptyBucket(bucketKey);
      dailyMap.set(bucketKey, db);
    }
    accumulate(db, contribution, cost);

    let mb = modelMap.get(key);
    if (mb === undefined) {
      mb = emptyBucket(key);
      modelMap.set(key, mb);
    }
    accumulate(mb, contribution, cost);

    accumulate(total, contribution, cost);
  };

  // Day granularity reads the rollup cells: a whole day is billed once per
  // (day, model), so a year-wide range costs days x models instead of records.
  // Only the days a range cuts through at its edges fall back to their records,
  // which keeps a range that starts or ends mid-day exact.
  const rollups = Boolean(state.index)
    && typeof state.index.cellsInRange === 'function'
    && typeof state.index.dayRecords === 'function'
    // Only when the index covers every record: a record pushed straight onto
    // state.records (the gap the sweep tolerates) has no cell, so an incomplete
    // rollup must not be trusted for a day-granularity answer.
    && state.index.size() === state.records.length;
  if (rollups && granularity === 'day') {
    for (const { start, cells } of state.index.cellsInRange(from, to)) {
      const bucketKey = bucketOfDay(start);
      if (start >= from && start + DAY_MS - 1 <= to) {
        for (const cell of cells.values()) apply(bucketKey, cell.key, cell.provider, cell.model, cell);
        continue;
      }
      const day = state.index.dayRecords(start);
      if (day === null) continue;
      for (const r of day) {
        if (r.time < from || r.time > to) continue;
        apply(bucketOfTime(r.time), compositeModelKey(r), r.provider, r.model, contributionOfRecord(r));
      }
    }
  } else {
    for (const r of state.index ? state.index.recordsInRange(from, to) : state.records) {
      if (r.time < from || r.time > to) continue;
      apply(bucketOfTime(r.time), compositeModelKey(r), r.provider, r.model, contributionOfRecord(r));
    }
  }

  let daily;
  if (fill) {
    let start;
    let step;
    let end;
    if (granularity === 'day') {
      step = stepDays * DAY_MS;
      start = dayAnchor !== null ? dayAnchor : alignFloor(from, 'day');
      end = alignFloor(to, 'day') + step;
    } else {
      step = stepMs(granularity);
      start = alignFloor(from, granularity);
      end = alignFloor(to, granularity) + step;
    }
    const count = Math.round((end - start) / step);
    if (count <= MAX_BUCKETS) {
      daily = [];
      for (let i = 0; i < count; i++) {
        const t = start + i * step;
        const k = useStepGrid ? dayKey(t) : bucketKeyFor(t, granularity, stepDays);
        daily.push(dailyMap.get(k) || emptyBucket(k));
      }
    } else {
      // Degenerate: too many steps; fall back to present-only buckets.
      daily = [...dailyMap.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }
  } else {
    daily = [...dailyMap.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const models = [...seenModels.values()];

  // GitHub-style yearly heatmap: every calendar day of the current year up to
  // today, zero-filled. It covers a year the main pass may only partly overlap,
  // so it reads the same rollup cells (or the same records when there is no
  // index) and shares the per-model price memo.
  let heatmap = null;
  if (args.heatmap) {
    const now = Date.now();
    const year = new Date(now).getFullYear();
    const hmMap = new Map();
    const yearStart = new Date(year, 0, 1).getTime();
    const addToHeatmap = (at, key, provider, model, contribution) => {
      if (!modelSelected(provider, model)) return;
      const priced = pricedOf(key, provider, model);
      const cost = priced.hit.price === null ? 0 : costOfSums(contribution, priced.hit.price);
      const dk = dayKey(at);
      let b = hmMap.get(dk);
      if (b === undefined) {
        b = emptyBucket(dk);
        hmMap.set(dk, b);
      }
      accumulate(b, contribution, cost);
    };
    if (rollups) {
      for (const { start, cells } of state.index.cellsInRange(yearStart, now)) {
        for (const cell of cells.values()) addToHeatmap(start, cell.key, cell.provider, cell.model, cell);
      }
    } else {
      for (const r of state.index ? state.index.recordsInRange(yearStart, now) : state.records) {
        if (r.time < yearStart || r.time > now) continue;
        addToHeatmap(r.time, compositeModelKey(r), r.provider, r.model, contributionOfRecord(r));
      }
    }
    heatmap = [];
    const todayStart = alignFloor(now, 'day');
    for (let d = new Date(year, 0, 1); d.getTime() <= todayStart; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d.getTime());
      heatmap.push(hmMap.get(k) || emptyBucket(k));
    }
  }

  // Display currency: the price table is denominated in USD and stays as it is
  // (it is shared, polled, and never mutated per request). Conversion happens
  // here, once, at the output boundary — including the heatmap and the totals,
  // so no two views of the same data disagree. Six decimals keep float tails
  // out of the sums.
  const money = currencyOf(args.currency, state.prices.currency);
  const toDisplay = (v) => (money.perUsd === 1 ? v : Math.round(v * money.perUsd * 1e6) / 1e6);
  for (const b of daily) b.cost = toDisplay(b.cost);
  for (const b of byModel) b.cost = toDisplay(b.cost);
  total.cost = toDisplay(total.cost);
  if (heatmap !== null) for (const b of heatmap) b.cost = toDisplay(b.cost);

  // Per-model verdict, straight from the ladder's own row shape (`priceRow`), so
  // a model the dashboard bills and the dialog shows carry the same four-value
  // `state` — the dashboard does not re-derive one from `how` any more.
  for (const row of byModel) {
    const known = resolution.get(row.key);
    if (known !== undefined) Object.assign(row, known);
    if (unmatched.has(row.key)) row.unpriced = true;
  }

  return {
    daily,
    byModel,
    total,
    models,
    unpricedCalls,
    unmatched: [...unmatched.values()],
    pricing: pricingMeta(state),
    currency: { code: money.code, symbol: money.symbol },
    // Which client→host channel this process actually opened, and why — the
    // plugin logger is not always wired into the harness log, so the decision
    // rides along with the data the dashboard already asks for.
    channel: state.channel ?? null,
    ...heatmap === null ? {} : { heatmap },
    backfill: { status: state.backfill.status, total: state.backfill.total, done: state.backfill.done },
    // Diagnostics for "why was the first load slow": one object per scan pass.
    scan: state.lastPass || null,
  };
}
