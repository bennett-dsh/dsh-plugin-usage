/**
 * P2-12: node:test unit coverage for src/host/query.js.
 * TZ is pinned to UTC for deterministic daily keys. The composite
 * provider/model byModel keys and hasPrice-based unpriced detection from the
 * parallel query workstream have landed, so those contract tests are live.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/host/state.js';
import { createPriceStore } from '../src/host/settings.js';
import { createUsageIndex } from '../src/host/aggregate.js';
import { query } from '../src/host/query.js';

process.env.TZ = 'UTC';

const RECORDS = [
  { time: Date.UTC(2025, 0, 2, 10, 15), session: 's1', provider: 'anthropic', model: 'claude', turn: 1, step: 0, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 1500 },
  { time: Date.UTC(2025, 0, 3, 12, 30), session: 's1', provider: 'openai', model: 'gpt', turn: 1, step: 0, inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 3000 },
  { time: Date.UTC(2025, 0, 4, 9, 0), session: 's1', provider: 'anthropic', model: 'claude', turn: 2, step: 0, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 1000 },
];

function makeState(records = RECORDS) {
  const prices = createPriceStore({});
  prices.setPrices({
    'anthropic/claude': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0, cacheWritePerM: 0 },
    'openai/gpt': { inputPerM: 2, outputPerM: 3, cacheReadPerM: 0, cacheWritePerM: 0 },
  });
  const state = createState(prices);
  state.records.push(...records);
  state.index = createUsageIndex(state);
  return state;
}

test('totals, daily and byModel over the 3-record fixture', () => {
  const state = makeState();
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1), granularity: 'day' });
  assert.deepEqual(res.total, {
    key: 'total',
    calls: 3,
    inputTokens: 3500,
    outputTokens: 2000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 5500,
    cost: 0.0735,
  });
  assert.deepEqual(res.daily.map((b) => b.key), ['2025-01-02', '2025-01-03', '2025-01-04']);
  assert.deepEqual(res.daily.map((b) => b.calls), [1, 1, 1]);
  assert.deepEqual(res.daily.map((b) => b.totalTokens), [1500, 3000, 1000]);
  assert.deepEqual(res.daily.map((b) => b.cost), [0.014, 0.049, 0.0105]);
  // byModel rows are keyed by provider/model composite.
  assert.deepEqual(res.byModel.map((b) => b.key), ['openai/gpt', 'anthropic/claude']); // sorted by totalTokens desc
  assert.deepEqual(res.byModel.map((b) => b.calls), [1, 2]);
  assert.deepEqual(res.byModel.map((b) => b.totalTokens), [3000, 2500]);
  assert.deepEqual(res.byModel.map((b) => b.cost), [0.049, 0.0245]);
  assert.deepEqual(res.models, [
    { key: 'anthropic/claude', provider: 'anthropic', model: 'claude' },
    { key: 'openai/gpt', provider: 'openai', model: 'gpt' },
  ]);
  assert.equal(res.unpricedCalls, 0);
  assert.deepEqual(res.backfill, { status: 'idle', total: 0, done: 0 });
});

test('query with no range returns present-only daily buckets', () => {
  const state = makeState();
  const res = query(state, {});
  assert.deepEqual(res.daily.map((b) => b.key), ['2025-01-02', '2025-01-03', '2025-01-04']);
  assert.equal(res.total.calls, 3);
  assert.equal(res.total.totalTokens, 5500);
  assert.deepEqual(res.backfill, { status: 'idle', total: 0, done: 0 });
});

test('fill emits zero buckets across the finite range', () => {
  const state = makeState();
  const res = query(state, {
    from: Date.UTC(2025, 0, 1),
    to: Date.UTC(2025, 0, 5),
    granularity: 'day',
    stepDays: 1,
    fill: true,
  });
  assert.deepEqual(res.daily.map((b) => b.key), ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05']);
  assert.deepEqual(res.daily.map((b) => b.calls), [0, 1, 1, 1, 0]);
  assert.deepEqual(res.daily.map((b) => b.totalTokens), [0, 1500, 3000, 1000, 0]);
  assert.deepEqual(res.daily[0], {
    key: '2025-01-01',
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: 0,
  });
  // Zero buckets are NOT emitted without fill.
  assert.equal(query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 0, 5) }).daily.length, 3);
});

test('heatmap is a zero-filled daily series for the current year (Date.now mocked)', (t) => {
  const state = makeState();
  const now = Date.UTC(2025, 0, 10, 12, 0, 0);
  t.mock.method(Date, 'now', () => now);
  const res = query(state, { heatmap: true });
  assert.ok(Array.isArray(res.heatmap));
  assert.equal(res.heatmap.length, 10); // Jan 1 .. Jan 10 inclusive
  assert.equal(res.heatmap[0].key, '2025-01-01');
  assert.equal(res.heatmap[9].key, '2025-01-10');
  assert.deepEqual(res.heatmap.map((b) => b.calls), [0, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(res.heatmap[1].inputTokens, 1000);
  assert.equal(res.heatmap[1].totalTokens, 1500);
  assert.equal(res.heatmap[1].cost, 0.014);
  assert.equal(query(state, {}).heatmap, undefined); // omitted unless requested
});

test('unpricedCalls counts records with a missing price entry', () => {
  const state = makeState([
    { time: Date.UTC(2025, 0, 6, 9, 0), session: 's1', provider: '', model: 'unlisted', turn: 4, step: 0, inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 50 },
  ]);
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
  assert.equal(res.unpricedCalls, 1);
  assert.equal(res.total.calls, 1);
});

test('byModel keeps providers distinct via composite keys when providers share a model', () => {
  const state = makeState([
    ...RECORDS,
    { time: Date.UTC(2025, 0, 5, 9, 0), session: 's1', provider: 'acme', model: 'claude', turn: 3, step: 0, inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 200 },
  ]);
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
  const keys = res.byModel.map((b) => b.key);
  assert.deepEqual(keys, ['openai/gpt', 'anthropic/claude', 'acme/claude']);
  assert.equal(keys.some((k) => k === 'claude'), false); // no bare-model rows
  assert.equal(res.byModel.find((b) => b.key === 'acme/claude').calls, 1);
  assert.deepEqual(res.models, [
    { key: 'anthropic/claude', provider: 'anthropic', model: 'claude' },
    { key: 'openai/gpt', provider: 'openai', model: 'gpt' },
    { key: 'acme/claude', provider: 'acme', model: 'claude' },
  ]);
});

test('unpriced uses hasPrice: a priced-zero model is not unpriced, a missing price is', () => {
  const state = makeState([
    ...RECORDS,
    { time: Date.UTC(2025, 0, 6, 9, 0), session: 's1', provider: '', model: 'free-zero', turn: 4, step: 0, inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 100 },
    { time: Date.UTC(2025, 0, 7, 9, 0), session: 's1', provider: '', model: 'unlisted', turn: 5, step: 0, inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 50 },
  ]);
  state.prices.setPrices({ 'free-zero': { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 } });
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
  assert.equal(res.unpricedCalls, 1); // only 'unlisted' has no price entry
  assert.equal(res.total.calls, 5);
  assert.equal(res.byModel.find((b) => b.key === 'free-zero').cost, 0); // priced row, cost 0
});

test('models lists every in-range model even when a selection filters the aggregates', () => {
  const state = makeState();
  const res = query(state, {
    from: Date.UTC(2025, 0, 1),
    to: Date.UTC(2025, 1, 1),
    models: ['anthropic/claude'],
  });
  // The dropdown is fed from `models`: it must not collapse to the selection.
  assert.deepEqual(res.models.map((m) => m.key), ['anthropic/claude', 'openai/gpt']);
  // Aggregates stay scoped to the selection.
  assert.deepEqual(res.byModel.map((b) => b.key), ['anthropic/claude']);
  assert.equal(res.total.calls, 2);
  assert.deepEqual(res.daily.map((b) => b.key), ['2025-01-02', '2025-01-04']);
});

test('models entries carry the composite key, including for an empty provider', () => {
  const state = makeState([
    { time: Date.UTC(2025, 0, 6, 9, 0), session: 's1', provider: '', model: 'solo', turn: 4, step: 0, inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 100 },
  ]);
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
  assert.deepEqual(res.models, [{ key: 'solo', provider: '', model: 'solo' }]);
  // Feeding that key back must select the record (a `provider + '/' + model`
  // client-side key would produce '/solo' and silently match nothing).
  const picked = query(state, {
    from: Date.UTC(2025, 0, 1),
    to: Date.UTC(2025, 1, 1),
    models: ['solo'],
  });
  assert.equal(picked.total.calls, 1);
  assert.equal(picked.total.totalTokens, 100);
});

test('models stays inside the requested time range', () => {
  const state = makeState([
    ...RECORDS,
    { time: Date.UTC(2024, 11, 20, 9, 0), session: 's1', provider: 'acme', model: 'old', turn: 1, step: 0, inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 10 },
  ]);
  const res = query(state, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
  assert.equal(res.models.some((m) => m.key === 'acme/old'), false);
});

test('currency converts the USD price table at the fixed 7:1 rate', () => {
  const state = makeState();
  const args = { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) };
  const usd = query(state, { ...args, currency: 'USD' });
  assert.deepEqual(usd.currency, { code: 'USD', symbol: '$' });
  assert.equal(usd.total.cost, 0.0105);
  const cny = query(state, { ...args, currency: 'CNY' });
  assert.deepEqual(cny.currency, { code: 'CNY', symbol: '¥' });
  assert.equal(cny.total.cost, 0.0735);
  assert.deepEqual(cny.daily.map((b) => b.cost), [0.014, 0.049, 0.0105]);
  // Conversion is display-only: token fields are untouched.
  assert.equal(cny.total.totalTokens, usd.total.totalTokens);
  assert.equal(cny.total.calls, usd.total.calls);
});

test('currency defaults to the configured value and unknown codes fall back', () => {
  const state = makeState();
  assert.deepEqual(query(state, {}).currency, { code: 'CNY', symbol: '¥' });
  assert.deepEqual(query(state, { currency: 'EUR' }).currency, { code: 'CNY', symbol: '¥' });
  state.prices.setCurrency('$');
  assert.deepEqual(query(state, {}).currency, { code: 'USD', symbol: '$' });
});

test('a currency query never rewrites the price table', () => {
  const state = makeState();
  const args = { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) };
  query(state, { ...args, currency: 'CNY' });
  assert.equal(state.prices.priceOf({ provider: 'anthropic', model: 'claude' }).inputPerM, 1);
  // A later USD query must still see the original USD numbers.
  assert.equal(query(state, { ...args, currency: 'USD' }).total.cost, 0.0105);
});
