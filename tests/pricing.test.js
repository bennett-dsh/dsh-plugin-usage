/**
 * Resolution-ladder tests for the reference price lookup.
 *
 * The cases below are not invented: the model ids are the ones this machine's
 * session logs actually recorded, and the expected costs are what the harness's
 * own billing reports for the same records. A change that breaks any of them
 * changes what the dashboard claims the user spent.
 *
 * Two contracts are pinned beyond the ladder itself:
 *  - `resolvePrice` returns the row AS PUBLISHED and never a pre-selected tier;
 *    the tier belongs to the billing site, so `ratesOf(price, tier)` is how a
 *    test asks "what would a peak call cost".
 *  - `state` (exact / fuzzy / none / custom) is derived here, once. The client
 *    renders it and never re-derives it from `how`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALIASES,
  costOf,
  holidayOfDefault,
  normalizeId,
  priceRow,
  ratesOf,
  referenceGroups,
  referenceTable,
  resolvePrice,
} from '../src/host/pricing.js';

const TABLE = referenceTable();

test('normalizeId lowercases, drops the provider prefix and unifies separators', () => {
  assert.equal(normalizeId('DeepSeek/DeepSeek-V4.1-Flash'), 'deepseek-v4-1-flash');
  assert.equal(normalizeId('deepseek/deepseek-v4.1_flash'), 'deepseek-v4-1-flash');
  assert.equal(normalizeId('  deepseek-flash  '), 'deepseek-flash');
  assert.equal(normalizeId(''), '');
  assert.equal(normalizeId(null), '');
});

test('normalizeId drops the router prefix DSH itself reports', () => {
  // `group/auto-deepseek-v4-1-flash` is what the magpie router records. Without
  // this rule the id needed its own hand-copied row in the config table, which
  // then outranked the reference table and never followed the peak tiers.
  assert.equal(normalizeId('group/auto-deepseek-v4-1-flash'), 'deepseek-v4-1-flash');
  assert.equal(normalizeId('magpie/auto-glm-5.3-flash'), 'glm-5-3-flash');
});

test('normalizeId keeps version suffixes that are part of the id', () => {
  // Only the separator style is unified; a version or a published date is not
  // stripped, because `deepseek-v4-flash-0731` is a different generation.
  assert.equal(normalizeId('deepseek-v4-flash-latest'), 'deepseek-v4-flash-latest');
  assert.equal(normalizeId('deepseek-v4.1-flash-1017'), 'deepseek-v4-1-flash-1017');
});

test('level 2: the alias table bridges the vendor name to the table id', () => {
  const hit = resolvePrice({ model: 'deepseek-chat' });
  assert.equal(hit.how, 'alias');
  assert.equal(hit.state, 'fuzzy');
  assert.equal(hit.target, 'deepseek-v4.1-flash');
  assert.equal(hit.why, ALIASES['deepseek-chat'].why);
});

test('the live Flash name is a literal hit, so it keeps its two-tier price', () => {
  // It used to alias onto the Zen id; the table now carries the official
  // DeepSeek row under this very id, and aliasing away from it would hide the
  // off-peak half of the price.
  const hit = resolvePrice({ model: 'deepseek-flash' });
  assert.equal(hit.how, 'normalized');
  assert.equal(hit.target, 'deepseek-flash');
  assert.equal(ratesOf(hit.price, 'peak').input, 0.3);
  assert.equal(ratesOf(hit.price, 'off').input, 0.15);
});

test('level 2: every retired name still resolves', () => {
  for (const model of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash']) {
    const hit = resolvePrice({ model });
    assert.equal(hit.how, 'alias', `${model} should resolve through the alias table`);
    assert.ok(ratesOf(hit.price, 'peak').output > 0, `${model} should carry a price`);
  }
});

test('level 3: a normalized literal match needs no alias', () => {
  const cases = [
    'deepseek-v4.1-flash',
    'deepseek/deepseek-v4.1-flash',
    'group/auto-deepseek-v4-1-flash',
    'glm-5.3-flash',
    'qwen3.8-flash',
    'claude-opus-5-5',
  ];
  for (const model of cases) {
    const hit = resolvePrice({ model });
    assert.equal(hit.how, 'normalized', `${model} should resolve literally`);
    assert.ok(ratesOf(hit.price, 'peak').input !== null, `${model} should carry an input price`);
  }
});

test('level 1: a user price wins over every other level', () => {
  const custom = { 'acme/deepseek-flash': { input: 9, output: 8, cacheRead: 7, cacheWrite: 6 } };
  const composite = resolvePrice({ model: 'deepseek-flash', provider: 'acme', custom });
  assert.equal(composite.how, 'custom');
  assert.equal(composite.state, 'custom');
  assert.equal(ratesOf(composite.price, 'peak').input, 9);

  const bare = resolvePrice({ model: 'glm-5.3-flash', provider: 'acme', custom: { 'glm-5.3-flash': { input: 1 } } });
  assert.equal(bare.how, 'custom', 'a bare-model custom entry also wins');
  assert.equal(ratesOf(bare.price, 'peak').input, 1);
});

test('a -free id the table publishes is exact and keeps its published price', () => {
  // The rule: a `-free` id is fuzzy only when it is NOT an exact match. Zen
  // publishes these rows as free, so the reference cost of a call under them is
  // 0 — which is also what the harness charged. Pricing them at the paid
  // sibling (the old order) invented a cost nobody paid.
  const free = Object.keys(TABLE.models).filter((id) => /-free$/.test(id));
  assert.ok(free.length > 0, 'the table has no -free row, so this rule cannot be exercised');
  for (const id of free) {
    const hit = resolvePrice({ model: id });
    assert.equal(hit.how, 'normalized', `${id} is a published row and must be an exact hit`);
    assert.equal(hit.state, 'exact');
    assert.equal(hit.target, id);
    assert.equal(ratesOf(hit.price, 'peak').input, 0, `${id} is published as free`);
  }
});

test('a variant name the table does not publish resolves to its base as fuzzy', () => {
  // The report that produced this test: `deepseek-v4.1-flash-fast` and
  // `deepseek-v4.1-flash-1017` sat in 未匹配 (1,851 calls between them) although
  // both are the same model under a variant suffix. The suffix list is closed —
  // free/exp/fast/latest and a four-digit publish date — and the base has to be a
  // real row, so this is a rename rule, not a similarity score.
  const cases = [
    ['deepseek-v4.1-flash-fast', 'deepseek-v4.1-flash'],
    ['deepseek-v4.1-flash-1017', 'deepseek-v4.1-flash'],
    ['glm-5.3-flash-exp', 'glm-5.3-flash'],
    ['deepseek-v4.1-flash-exp', 'deepseek-v4.1-flash'],
  ];
  for (const [id, base] of cases) {
    const hit = resolvePrice({ model: id });
    assert.equal(hit.how, 'variant', `${id} must resolve through the variant rung`);
    assert.equal(hit.state, 'fuzzy');
    assert.equal(hit.target, base);
    assert.ok(TABLE.models[hit.target] !== undefined, `${id} must point at a table row`);
    assert.ok(ratesOf(hit.price, 'peak').input > 0, `${id} is billed at the base row`);
    assert.ok(hit.why.includes(base), 'the reason names the base it inferred');
  }
  // Billed at the base row's rate, not at zero and not at some other model's.
  const fast = resolvePrice({ model: 'deepseek-v4.1-flash-fast' });
  const base = resolvePrice({ model: 'deepseek-v4.1-flash' });
  assert.deepEqual(fast.price, base.price);
});

test('a variant suffix on an unknown base stays unmatched', () => {
  // The base must exist: `deepseek-v4-flash-0731` has no `deepseek-v4-flash-0731`
  // row and no `deepseek-v4-flash` row either, so it must NOT collapse onto the
  // nearest thing. This is the line between a rename rule and resemblance.
  for (const id of ['deepseek-v4-flash-0731', 'step-5-preview-1017', 'mock-flash-fast']) {
    assert.equal(resolvePrice({ model: id }).how, 'unmatched', `${id} has no base row`);
  }
});

test('the literal level runs before the inferred ones', () => {
  // `glm-5.3-flash-free` is both a literal table row and a variant candidate (its
  // base is priced). Literal wins: the table says what this id costs, and an
  // inference may not overrule a fact.
  const literal = resolvePrice({ model: 'glm-5.3-flash-free' });
  assert.equal(literal.how, 'normalized');
  assert.equal(literal.state, 'exact');
  assert.equal(ratesOf(literal.price, 'peak').input, 0);
  // The same model without the promo suffix is its own row, priced normally.
  const paid = resolvePrice({ model: 'glm-5.3-flash' });
  assert.equal(paid.how, 'normalized');
  assert.ok(ratesOf(paid.price, 'peak').input > 0);
});

test('unmatched ids are reported, never guessed', () => {
  for (const model of ['step-5-preview', 'mock-flash', 'default', '', 'deepseek-v4-flash-0731']) {
    const hit = resolvePrice({ model });
    assert.equal(hit.how, 'unmatched', `${model || '(empty)'} must stay unmatched`);
    assert.equal(hit.state, 'none');
    assert.equal(hit.price, null);
    assert.equal(hit.target, null);
    assert.equal(hit.source, null);
  }
});

test('every table id resolves exactly, and every alias is fuzzy', () => {
  // The exhaustive gate: the table is generated, so a row that the ladder cannot
  // reach is a data bug nobody would see until a cost came out zero. `state` is
  // the value the UI shows, so this is also the gate for the four-value
  // vocabulary the client renders.
  for (const id of Object.keys(TABLE.models)) {
    const hit = resolvePrice({ model: id });
    assert.equal(hit.how, 'normalized', `${id} must be reachable by its own id`);
    assert.equal(hit.state, 'exact');
    assert.equal(hit.target, id);
    assert.ok(hit.price !== null, `${id} must carry a price`);
  }
  for (const key of Object.keys(ALIASES)) {
    const hit = resolvePrice({ model: key });
    assert.equal(hit.how, 'alias', `${key} must resolve through the alias table`);
    assert.equal(hit.state, 'fuzzy');
  }
});

test('state is one of exactly four values', () => {
  const seen = new Set();
  for (const id of [...Object.keys(TABLE.models), ...Object.keys(ALIASES), 'no-such-model']) {
    seen.add(resolvePrice({ model: id }).state);
  }
  seen.add(resolvePrice({ model: 'deepseek-flash', custom: { 'deepseek-flash': { input: 1 } } }).state);
  seen.add(resolvePrice({ model: 'odd', matches: { odd: 'deepseek-flash' } }).state);
  assert.deepEqual([...seen].sort(), ['custom', 'exact', 'fuzzy', 'none']);
});

test('every hit names one of the three kinds of reference id', () => {
  // The dialog groups reference ids by origin and labels the row it matched.
  // 'custom' is the user's own price row — a kind that used to be unreachable.
  assert.equal(resolvePrice({ model: 'deepseek-flash' }).source, 'deepseek');
  assert.equal(resolvePrice({ model: 'glm-5.3-flash' }).source, 'zen');
  assert.equal(resolvePrice({ model: 'odd', custom: { odd: { input: 1 } } }).source, 'custom');
  assert.equal(resolvePrice({ model: 'no-such-model' }).source, null);
  // An alias reports where its target lives, not the fact that it was an alias.
  assert.equal(resolvePrice({ model: 'deepseek-chat' }).source, 'deepseek');
});

test('reference ids come in exactly two groups', () => {
  // 'custom' is NOT a group: in the dialog it is one option ("type your own
  // price"), because a hand-entered price is three numbers for one model key,
  // not a reference model anyone could point another id at.
  const groups = referenceGroups();
  assert.deepEqual(groups.map((g) => g.source), ['deepseek', 'zen']);
  const ids = groups.map((g) => g.ids);
  assert.ok(ids[0].length >= 2 && ids[1].length >= 80, 'DeepSeek and Zen rows are both listed');
  // A table id never shows up in two groups.
  const all = groups.flatMap((g) => g.ids);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, Object.keys(TABLE.models).length, 'every table row is offered exactly once');
  for (const group of groups) {
    assert.deepEqual(group.ids, [...group.ids].sort(), 'each group is stable-sorted');
  }
});


test('holidayOfDefault reads the generated calendar', () => {
  assert.equal(holidayOfDefault('2026-10-01'), true, '2026-10-01 is a public holiday');
  assert.equal(holidayOfDefault('2026-10-09'), false, '2026-10-09 is an ordinary workday');
  assert.equal(holidayOfDefault(undefined), false);
});

test('priceRow carries both tiers and the instant own tier', () => {
  // 2026-10-19 10:00 Beijing (peak window) and 20:00 (off-peak).
  const peakAt = Date.UTC(2026, 9, 19, 2, 0);
  const offAt = Date.UTC(2026, 9, 19, 12, 0);
  const hit = resolvePrice({ model: 'deepseek-flash' });
  const atPeak = priceRow(hit, peakAt);
  assert.equal(atPeak.tier, 'peak');
  assert.equal(atPeak.rates.peak.input, 0.3);
  assert.equal(atPeak.rates.offPeak.input, 0.15);
  const atNight = priceRow(hit, offAt);
  assert.equal(atNight.tier, 'off');
  assert.equal(atNight.rates.peak.input, 0.3, 'both tiers travel, whichever is current');
  assert.equal(priceRow(resolvePrice({ model: 'no-such-model' }), peakAt).rates, null);
});

/**
 * The cost arithmetic, pinned against the harness's own billing.
 *
 * Record: 69 sessions of deepseek-flash, aggregated usage
 *   input 27849720, output 6841763, cacheRead 2061403776.
 * The harness reports 14.923583058 for those tokens. That number is NOT what
 * this plugin should produce: the harness bills the instant of each call (mostly
 * off-peak), while a reference cost applies one tier. This test pins the
 * arithmetic on one tier — off-peak reproduces 14.4667, peak reproduces 28.9335 —
 * and leaves the scope difference to the UI, which says so.
 */
test('costOf multiplies each token bucket by its own rate', () => {
  const usage = { inputTokens: 27849720, outputTokens: 6841763, cacheReadTokens: 2061403776, cacheWriteTokens: 0 };
  const off = { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 };
  const peak = { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 };
  // Tolerance, not equality: the harness multiplies in its own order and the last
  // bits differ (6.9e-18 on a single call). One nanodollar is a million times
  // smaller than a cent and still catches a wrong factor.
  assert.ok(Math.abs(costOf(usage, off) - 14.466727128) < 1e-9, String(costOf(usage, off)));
  assert.ok(Math.abs(costOf(usage, peak) - 28.933454256) < 1e-9, String(costOf(usage, peak)));
});

test('costOf reproduces a single-call sample', () => {
  // input 50681, output 22231, cacheRead 1983104 at the published off-peak rate.
  // The harness stored 0.026890061999999992 for exactly this call.
  const record = { inputTokens: 50681, outputTokens: 22231, cacheReadTokens: 1983104, cacheWriteTokens: 0 };
  const off = { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 };
  assert.ok(Math.abs(costOf(record, off) - 0.026890061999999992) < 1e-15, String(costOf(record, off)));
});

test('costOf splits peak and off-peak buckets per record', () => {
  const record = {
    tokens: {
      peak: { inputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      off: { inputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  };
  const price = { peak: { input: 0.3, output: 1.2, cacheRead: 0.006 }, offPeak: { input: 0.15, output: 0.6, cacheRead: 0.003 } };
  assert.ok(Math.abs(costOf(record, price) - 0.45) < 1e-12);
});

test('costOf never throws on a missing record or price', () => {
  assert.equal(costOf(null, { input: 1 }), 0);
  assert.equal(costOf({ inputTokens: 100 }, null), 0);
  assert.equal(costOf({}, {}), 0);
});

test('the table the resolver reads is the generated one', () => {
  assert.ok(TABLE.models['deepseek-v4.1-flash'], 'the official Flash row must be present');
  assert.ok(Object.keys(TABLE.models).length >= 80);
});
