/**
 * Aggregation/query logic — pure over the runtime state.
 *
 * P1-7 (unpriced detection) and P1-8 (provider/model composite keys in the
 * by-model table and model candidate list) are owned here.
 */
import {
  dayKey, DAY_MS, bucketKeyFor, stepMs, alignFloor, stepDayKey, MAX_BUCKETS,
} from './time.js';
import { currencyOf } from './settings.js';
import { costOf, holidayCoverage, priceRow, referenceTable } from './pricing.js';

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

function addToBucket(b, r, cost) {
  b.calls += 1;
  b.inputTokens += r.inputTokens;
  b.outputTokens += r.outputTokens;
  b.cacheReadTokens += r.cacheReadTokens;
  b.cacheWriteTokens += r.cacheWriteTokens;
  b.totalTokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
  b.cost += cost;
  return b;
}

/** Composite model key: `provider/model`, or the bare model when provider is empty. */
function compositeModelKey(r) {
  return r.provider ? r.provider + '/' + r.model : r.model;
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
  const modelMatches = (r) => {
    if (!modelSet) return true;
    if (modelSet.has(r.model)) return true;
    return Boolean(r.provider) && modelSet.has(r.provider + '/' + r.model);
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
  // 90k times. `costOf` is then billed from the row already resolved, which also
  // removes the second lookup the store's own `costOf()` performed.
  const hitByModel = new Map(); // composite key -> ladder hit
  const hitOf = (key, r) => {
    let hit = hitByModel.get(key);
    if (hit === undefined) {
      hit = state.prices.lookup(r);
      hitByModel.set(key, hit);
    }
    return hit;
  };
  // Range-anchored day-step grid: blocks start at the range's first day.
  const dayAnchor = Number.isFinite(from) ? alignFloor(from, 'day') : null;
  const useStepGrid = granularity === 'day' && stepDays > 1 && dayAnchor !== null;

  for (const r of state.index ? state.index.recordsInRange(from, to) : state.records) {
    if (r.time < from || r.time > to) continue;
    // Candidate list first, selection filter second: the dropdown must offer
    // every model that has data in the range, not only the ones already ticked
    // (ticking one used to collapse the list to that single entry).
    const modelKey = compositeModelKey(r);
    if (!seenModels.has(modelKey)) seenModels.set(modelKey, { key: modelKey, provider: r.provider, model: r.model });
    if (!modelMatches(r)) continue;
    const hit = hitOf(modelKey, r);
    const cost = hit.price === null ? 0 : costOf(r, hit.price);
    if (r.totalTokens > 0 && hit.price === null) {
      unpricedCalls += 1;
      const seen = unmatched.get(modelKey);
      if (seen === undefined) {
        unmatched.set(modelKey, { key: modelKey, provider: r.provider, model: r.model, calls: 1, totalTokens: r.totalTokens });
      } else {
        seen.calls += 1;
        seen.totalTokens += r.totalTokens;
      }
    }
    if (!resolution.has(modelKey)) resolution.set(modelKey, priceRow(hit));

    const dk = useStepGrid ? stepDayKey(r, dayAnchor, stepDays) : bucketKeyFor(r.time, granularity, stepDays);
    let db = dailyMap.get(dk);
    if (db === undefined) {
      db = emptyBucket(dk);
      dailyMap.set(dk, db);
    }
    addToBucket(db, r, cost);

    let mb = modelMap.get(modelKey);
    if (mb === undefined) {
      mb = emptyBucket(modelKey);
      modelMap.set(modelKey, mb);
    }
    addToBucket(mb, r, cost);

    addToBucket(total, r, cost);
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
  // today, zero-filled.
  let heatmap = null;
  if (args.heatmap) {
    const now = Date.now();
    const year = new Date(now).getFullYear();
    const hmMap = new Map();
    const yearStart = new Date(year, 0, 1).getTime();
    for (const r of state.index ? state.index.recordsInRange(yearStart, now) : state.records) {
      if (r.time < yearStart || r.time > now) continue;
      if (!modelMatches(r)) continue;
      const dk = dayKey(r.time);
      let b = hmMap.get(dk);
      if (b === undefined) {
        b = emptyBucket(dk);
        hmMap.set(dk, b);
      }
      // The heatmap covers a year the main pass may only partly overlap, so it
      // shares the same per-model memo rather than resolving the ladder again.
      const hmHit = hitOf(compositeModelKey(r), r);
      addToBucket(b, r, hmHit.price === null ? 0 : costOf(r, hmHit.price));
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
