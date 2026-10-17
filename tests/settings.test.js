/**
 * P2-12: node:test unit coverage for src/host/settings.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CURRENCY,
  DEFAULT_PRICES,
  createPriceStore,
  mergePrices,
} from '../src/host/settings.js';

const base = () => createPriceStore(DEFAULT_PRICES, DEFAULT_CURRENCY);
const FULL_ZERO = { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 };

test('priceOf falls back to the bare model price', () => {
  const store = base();
  assert.deepEqual(store.priceOf({ model: 'deepseek-chat' }), DEFAULT_PRICES['deepseek-chat']);
  assert.deepEqual(store.priceOf({ provider: '', model: 'deepseek-chat' }), DEFAULT_PRICES['deepseek-chat']);
  assert.equal(store.priceOf({ model: 'nope' }), undefined);
});

test('priceOf prefers the provider/model composite over the bare model', () => {
  const store = base();
  const composite = { inputPerM: 9, outputPerM: 8, cacheReadPerM: 7, cacheWritePerM: 6 };
  store.setPrices({ 'acme/deepseek-chat': composite });
  assert.deepEqual(store.priceOf({ provider: 'acme', model: 'deepseek-chat' }), composite);
  assert.deepEqual(store.priceOf({ provider: 'other', model: 'deepseek-chat' }), DEFAULT_PRICES['deepseek-chat']);
  assert.deepEqual(store.priceOf({ model: 'deepseek-chat' }), DEFAULT_PRICES['deepseek-chat']);
});

test('hasPrice reports explicit entries, composite first, zero prices included', () => {
  const store = base();
  store.setPrices({ 'acme/only-composite': FULL_ZERO });
  assert.ok(store.hasPrice({ provider: 'acme', model: 'deepseek-chat' })); // composite wins
  assert.ok(store.hasPrice({ provider: 'other', model: 'deepseek-chat' })); // bare fallback
  assert.ok(store.hasPrice({ provider: 'acme', model: 'only-composite' })); // composite-only entry
  assert.ok(!store.hasPrice({ model: 'only-composite' })); // no bare entry exists
  assert.ok(!store.hasPrice({ provider: 'acme', model: 'missing' }));
  assert.ok(!store.hasPrice({ model: 'unknown' }));
  // A zero-value price entry still counts as priced.
  store.setPrices({ 'free-model': { inputPerM: 0, outputPerM: 0 } });
  assert.ok(store.hasPrice({ model: 'free-model' }));
});

test('costOf computes per-million token cost across all four fields', () => {
  const store = base();
  store.setPrices({ 'acme/m': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 3, cacheWritePerM: 4 } });
  store.setPrices({ 'free-zero': { inputPerM: 0, outputPerM: 0 } });
  const r = {
    provider: 'acme', model: 'm',
    inputTokens: 1000000, outputTokens: 500000,
    cacheReadTokens: 200000, cacheWriteTokens: 100000,
  };
  assert.equal(store.costOf(r), 3);
  assert.equal(store.costOf({ ...r, model: 'nope' }), 0); // missing price -> 0
  assert.equal(
    store.costOf({ provider: 'acme', model: 'm', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    0,
  );
  assert.equal(store.costOf({ model: 'free-zero', inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), 0);
});

test('setPrices coerces number fields and ignores non-objects', () => {
  const store = base();
  store.setPrices({ m1: { inputPerM: '2.5', outputPerM: '3', cacheReadPerM: 'x', cacheWritePerM: null } });
  assert.deepEqual(store.priceOf({ model: 'm1' }), { inputPerM: 2.5, outputPerM: 3, cacheReadPerM: 0, cacheWritePerM: 0 });
  const before = store.snapshot();
  for (const bad of [null, undefined, 'nope', 42, [1, 2], {}]) {
    store.setPrices(bad);
  }
  assert.deepEqual(store.snapshot(), before);
});

test('setCurrency accepts non-empty strings and ignores everything else', () => {
  const store = createPriceStore(DEFAULT_PRICES); // default currency
  assert.equal(store.currency, DEFAULT_CURRENCY);
  store.setCurrency('$');
  assert.equal(store.currency, '$');
  store.setCurrency('');
  assert.equal(store.currency, '$');
  store.setCurrency(123);
  assert.equal(store.currency, '$');
  store.setCurrency(null);
  assert.equal(store.currency, '$');
  assert.equal(createPriceStore(DEFAULT_PRICES, '€').currency, '€');
});

test('mergePrices layers configured prices over the defaults', () => {
  assert.deepEqual(mergePrices(undefined), DEFAULT_PRICES);
  assert.deepEqual(mergePrices({}), DEFAULT_PRICES);
  const merged = mergePrices({
    'deepseek-v4.1-flash-1017': { inputPerM: 0, outputPerM: 1, cacheReadPerM: 0, cacheWritePerM: 0 },
  });
  assert.deepEqual(merged['deepseek-v4.1-flash-1017'], { inputPerM: 0, outputPerM: 1, cacheReadPerM: 0, cacheWritePerM: 0 });
  assert.deepEqual(merged['deepseek-chat'], DEFAULT_PRICES['deepseek-chat']); // untouched default survives
  // The input table is never mutated.
  assert.deepEqual(DEFAULT_PRICES['deepseek-chat'], { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 });
});
