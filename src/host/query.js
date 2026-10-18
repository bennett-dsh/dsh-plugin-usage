/**
 * Aggregation/query logic — pure over the runtime state.
 *
 * P1-7 (unpriced detection) and P1-8 (provider/model composite keys in the
 * by-model table and model candidate list) are owned here.
 */
import {
  dayKey, DAY_MS, bucketKeyFor, stepMs, alignFloor, stepDayKey, MAX_BUCKETS,
} from './time.js';

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
    const cost = state.prices.costOf(r);
    if (r.totalTokens > 0 && !state.prices.hasPrice(r)) unpricedCalls += 1;

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
      addToBucket(b, r, state.prices.costOf(r));
    }
    heatmap = [];
    const todayStart = alignFloor(now, 'day');
    for (let d = new Date(year, 0, 1); d.getTime() <= todayStart; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d.getTime());
      heatmap.push(hmMap.get(k) || emptyBucket(k));
    }
  }

  return {
    daily,
    byModel,
    total,
    models,
    unpricedCalls,
    ...heatmap === null ? {} : { heatmap },
    backfill: { status: state.backfill.status, total: state.backfill.total, done: state.backfill.done },
  };
}
