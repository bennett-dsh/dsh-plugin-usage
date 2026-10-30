/**
 * The price store: user rows, both spellings, and the ladder behind it.
 *
 * Two contracts are worth pinning here because the store used to have a second
 * personality (exact-key lookup when nothing was injected) and both personalities
 * answered differently for the same model. There is one now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CURRENCY,
  configPrices,
  createPriceStore,
  normalizePrices,
} from '../src/host/settings.js';
import { ratesOf, resolvePrice } from '../src/host/pricing.js';

/** Beijing wall-clock -> epoch ms. */
function bj(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - 8 * 3_600_000;
}

const oneMillion = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

test('normalizePrices accepts both spellings and coerces every field', () => {
  const rows = normalizePrices({
    'relay/a': { inputPerM: '2.5', outputPerM: '3', cacheReadPerM: 'x', cacheWritePerM: null },
    'relay/b': { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    broken: null,
    'also-broken': 'nope',
  });
  assert.deepEqual(rows['relay/a'], { input: 2.5, output: 3, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(rows['relay/b'], { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
  assert.equal(Object.prototype.hasOwnProperty.call(rows, 'broken'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rows, 'also-broken'), false);
  assert.deepEqual(normalizePrices(undefined), {});
  assert.deepEqual(normalizePrices([1, 2]), {});
});

test('configPrices round-trips normalizePrices', () => {
  const canonical = { 'relay/a': { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } };
  assert.deepEqual(normalizePrices(configPrices(canonical)), canonical);
});

test('the store resolves a table id through the ladder, not by exact key', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY);
  // A session id and a table id spell the same model differently.
  for (const id of ['deepseek-flash', 'deepseek-v4.1-flash', 'group/auto-deepseek-v4-1-flash']) {
    const hit = store.lookup({ model: id });
    assert.equal(hit.state, 'exact', `${id} resolves`);
    assert.ok(hit.price !== null);
  }
  assert.equal(store.lookup({ model: 'no-such-model-anywhere' }).state, 'none');
});

test('a user row still wins over the table, composite before bare id', () => {
  const store = createPriceStore({
    'acme/deepseek-flash': { inputPerM: 9, outputPerM: 8, cacheReadPerM: 7, cacheWritePerM: 6 },
  }, DEFAULT_CURRENCY);
  const own = store.lookup({ provider: 'acme', model: 'deepseek-flash' });
  assert.equal(own.how, 'custom');
  assert.equal(ratesOf(own.price, 'peak').input, 9);
  // Another provider gets the table's price, not acme's.
  const table = store.lookup({ provider: 'other', model: 'deepseek-flash' });
  assert.equal(table.how, 'normalized');
  assert.equal(ratesOf(table.price, 'peak').input, 0.3);
});

test('hasPrice counts zero rows and rejects unknown ids', () => {
  const store = createPriceStore({ 'free-model': { inputPerM: 0, outputPerM: 0 } }, DEFAULT_CURRENCY);
  assert.ok(store.hasPrice({ model: 'free-model' }));
  assert.ok(store.hasPrice({ model: 'deepseek-flash' }));
  assert.ok(!store.hasPrice({ model: 'unknown' }));
  assert.ok(!store.hasPrice(null));
});

test('costOf bills each token bucket at its own tier', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY);
  const record = {
    provider: 'deepseek-account', model: 'deepseek-flash',
    tokens: { peak: { ...oneMillion }, off: { ...oneMillion } },
  };
  // 0.30 peak + 0.15 off-peak per 1M input tokens, from the shipped table.
  assert.ok(Math.abs(store.costOf(record) - 0.45) < 1e-12);
});

test('costOf prices a record without buckets at its own instant', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY);
  const base = { provider: 'deepseek-account', model: 'deepseek-flash', ...oneMillion };
  assert.equal(store.costOf({ ...base, time: bj('2026-10-19', '10:00') }), 0.3);
  assert.equal(store.costOf({ ...base, time: bj('2026-10-19', '20:00') }), 0.15);
});

test('setPrices merges, coerces and ignores non-objects', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY);
  store.setPrices({ m1: { inputPerM: '2.5', outputPerM: '3' } });
  assert.deepEqual(store.snapshot().prices, { m1: { input: 2.5, output: 3, cacheRead: 0, cacheWrite: 0 } });
  const before = store.snapshot();
  for (const bad of [null, undefined, 'nope', 42, [1, 2], {}]) store.setPrices(bad);
  assert.deepEqual(store.snapshot(), before);
});

test('setCurrency accepts non-empty strings and ignores everything else', () => {
  const store = createPriceStore({});
  assert.equal(store.currency, DEFAULT_CURRENCY);
  store.setCurrency('$');
  assert.equal(store.currency, '$');
  for (const bad of ['', 123, null]) store.setCurrency(bad);
  assert.equal(store.currency, '$');
});

test('a confirmed match outranks the ladder, and only a live target counts', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY, {
    matches: { 'acme/odd-id': 'deepseek-v4-pro' },
  });
  const hit = store.lookup({ provider: 'acme', model: 'odd-id' });
  assert.equal(hit.how, 'confirmed');
  assert.equal(hit.state, 'custom');
  assert.equal(hit.target, 'deepseek-v4-pro');

  // The store reads the getter on every lookup, so a commit is visible at once.
  let live = {};
  const mutable = createPriceStore({}, DEFAULT_CURRENCY, { matches: () => live });
  assert.equal(mutable.lookup({ model: 'odd-id' }).state, 'none');
  live = { 'odd-id': 'deepseek-v4-pro' };
  assert.equal(mutable.lookup({ model: 'odd-id' }).state, 'custom');
});

test('a confirmed target that left the table is reported, not repriced', () => {
  const store = createPriceStore({}, DEFAULT_CURRENCY, { matches: { 'odd-id': 'retired-model' } });
  const hit = store.lookup({ model: 'odd-id' });
  assert.equal(hit.price, null);
  assert.equal(hit.state, 'none');
  assert.equal(hit.target, 'retired-model');
});

test('the store and the ladder answer the same question identically', () => {
  // The regression this guards: propose used to re-derive its own verdict from a
  // field the ladder never set, so the dialog said 未匹配 on billed models.
  const store = createPriceStore({}, DEFAULT_CURRENCY);
  for (const id of ['deepseek-flash', 'deepseek-v4.1-flash', 'deepseek-chat', 'no-such-model']) {
    const fromStore = store.lookup({ model: id });
    const fromLadder = resolvePrice({ model: id });
    assert.equal(fromStore.how, fromLadder.how, id);
    assert.equal(fromStore.state, fromLadder.state, id);
    assert.equal(fromStore.target, fromLadder.target, id);
  }
});
