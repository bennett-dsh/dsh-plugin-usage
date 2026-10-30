/**
 * Peak / off-peak billing, end to end: the fold splits a settlement by the tier
 * its own timestamp fell into, and the store prices each bucket with the rate of
 * that tier.
 *
 * Why this file exists: the harness reports one aggregate per model, and DeepSeek
 * bills by the instant of each call. Measured on this machine, one model mixed
 * ~42% peak and ~58% off-peak inside a single month, so any single-rate estimate
 * is off by up to 2x — in a direction nobody can predict from the aggregate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/host/state.js';
import { foldEvent } from '../src/host/fold.js';
import { createPriceStore } from '../src/host/settings.js';
import { costOf, resolvePrice } from '../src/host/pricing.js';
import { isPeak } from '../src/host/peak.js';
import { peakAt } from '../src/host/index.js';

/** Beijing wall-clock -> epoch ms. */
function bj(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - 8 * 3_600_000;
}

/** A settlement carrying `usage`, attributed to `provider/model`. */
function message(seq, atMs, usage, model = 'deepseek-flash', provider = 'deepseek-account') {
  return {
    seq,
    time: atMs,
    type: 'assistant/message',
    data: { turn: 1, step: seq, usage, message: { source: { provider, model } } },
  };
}

const usage = (inputTokens) => ({ inputTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

test('the live tier rule is the holiday-aware one, not the bare window test', () => {
  // The fold asks the state capsule for a predicate. That predicate must know
  // the calendar: it once called isPeak() without one, so every public holiday
  // inside a window was billed at the peak rate while the price display (which
  // did use the calendar) showed it as off-peak.
  assert.equal(peakAt(bj('2026-10-29', '10:00')), true, 'an ordinary Thursday window is peak');
  assert.equal(peakAt(bj('2026-10-01', '10:00')), false, '2026-10-01 is National Day');
  assert.equal(peakAt(bj('2026-10-01', '10:00')), isPeak(bj('2026-10-01', '10:00')),
    'the wired predicate and the rule must agree');
  assert.equal(peakAt(bj('2026-10-31', '10:00')), false, 'Saturday stays off-peak');
});

/** An official two-tier price, shaped like a reference-table DeepSeek row. */
const TWO_TIER = {
  peak: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
  offPeak: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 },
};

test('a settlement inside a peak window lands in the peak bucket', () => {
  const state = createState(null);
  state.peakOf = (atMs) => isPeak(atMs, () => false);
  const rec = foldEvent(state, 's1', message(1, bj('2026-10-19', '10:00'), usage(1_000_000)));
  assert.ok(rec.tokens.peak, 'the peak bucket must exist');
  assert.equal(rec.tokens.off, undefined, 'nothing should be counted as off-peak');
  assert.equal(rec.tokens.peak.inputTokens, 1_000_000);
  // The flat fields stay: summaries and the token table never change shape.
  assert.equal(rec.inputTokens, 1_000_000);
});

test('a settlement outside the window lands in the off-peak bucket', () => {
  const state = createState(null);
  state.peakOf = (atMs) => isPeak(atMs, () => false);
  const rec = foldEvent(state, 's1', message(1, bj('2026-10-19', '20:00'), usage(1_000_000)));
  assert.ok(rec.tokens.off);
  assert.equal(rec.tokens.peak, undefined);
});

test('the tier follows the event, not the query time', () => {
  const state = createState(null);
  state.peakOf = (atMs) => isPeak(atMs, () => false);
  const peakRec = foldEvent(state, 's1', message(1, bj('2026-10-19', '09:30'), usage(1_000_000)));
  const offRec = foldEvent(state, 's2', message(2, bj('2026-10-19', '21:30'), usage(1_000_000)));
  assert.deepEqual(Object.keys(peakRec.tokens), ['peak']);
  assert.deepEqual(Object.keys(offRec.tokens), ['off']);
});

test('a re-reported settlement replaces its bucket instead of doubling it', () => {
  const state = createState(null);
  state.peakOf = (atMs) => isPeak(atMs, () => false);
  const at = bj('2026-10-19', '10:00');
  foldEvent(state, 's1', message(1, at, usage(1_000_000)));
  const second = message(2, at, usage(500_000));
  second.data.turn = 1;
  second.data.step = 1; // same (turn, step) as the first settlement's own step
  foldEvent(state, 's1', second);
  assert.equal(state.records.length, 1, 'the replacement slot keeps one record');
  assert.equal(state.records[0].tokens.peak.inputTokens, 500_000, 'the later sample wins');
});

test('without a peakOf the record keeps no buckets (the old shape)', () => {
  const state = createState(null);
  const rec = foldEvent(state, 's1', message(1, bj('2026-10-19', '10:00'), usage(10)));
  assert.equal(rec.tokens, undefined);
});

test('a mixed day is billed as the sum of its two tiers', () => {
  const state = createState(null);
  state.peakOf = (atMs) => isPeak(atMs, () => false);
  foldEvent(state, 's1', message(1, bj('2026-10-19', '10:00'), usage(1_000_000)));
  foldEvent(state, 's1', message(2, bj('2026-10-19', '20:00'), usage(1_000_000)));
  const billed = state.records.map((r) => costOf(r, TWO_TIER));
  assert.equal(billed[0], 0.3, '1M input at the peak rate');
  assert.equal(billed[1], 0.15, '1M input at the off-peak rate');
  // A float sum of two exact halves is 0.44999999999999996; the point of the
  // assertion is that neither bucket is priced twice or dropped.
  assert.ok(Math.abs(billed[0] + billed[1] - 0.45) < 1e-12, String(billed[0] + billed[1]));
});

test('the store has exactly one policy: injecting another changes nothing', () => {
  // The store used to accept `resolve` / `costFor` hooks, which is how a second
  // pricing policy survived for a release (exact-key lookup when nothing was
  // injected). They are gone; passing them must not resurrect a second answer.
  const flat = { model: 'deepseek-flash', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const plain = createPriceStore({}, '¥');
  const injected = createPriceStore({}, '¥', {
    resolve: () => ({ price: { inputPerM: 99, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 }, how: 'custom', target: null }),
    costFor: () => 42,
  });
  assert.equal(plain.costOf(flat), injected.costOf(flat));
  assert.equal(plain.lookup(flat).how, injected.lookup(flat).how);
});

test('an unpriced record still costs nothing and is reported as unmatched', () => {
  const state = createState(null);
  state.peakOf = () => true;
  const store = createPriceStore({}, '¥');
  const rec = foldEvent(state, 's1', message(1, bj('2026-10-19', '10:00'), usage(100), 'no-such-model'));
  assert.equal(store.costOf(rec), 0);
  assert.equal(store.hasPrice(rec), false);
  assert.equal(store.lookup(rec).how, 'unmatched');
});

test('the shipped table bills both live Flash ids at two tiers through the store', () => {
  // Regression gate. `deepseek-flash` used to alias onto Zen's single-price row,
  // and that number is DeepSeek's PEAK rate, so every off-peak call was billed at
  // double while the dialog reported a confident 按名称归一 hit.
  const store = createPriceStore({}, '¥');
  const oneM = (at, model) => ({
    time: at,
    provider: 'deepseek-account',
    model,
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  for (const model of ['deepseek-flash', 'deepseek-v4.1-flash']) {
    assert.equal(store.costOf(oneM(bj('2026-10-19', '10:00'), model)), 0.3, `${model} at peak`);
    assert.equal(store.costOf(oneM(bj('2026-10-19', '20:00'), model)), 0.15, `${model} at off-peak`);
  }
  // A retired name rides the alias table onto the same two-tier row.
  assert.equal(store.costOf(oneM(bj('2026-10-19', '20:00'), 'deepseek-chat')), 0.15);
});
