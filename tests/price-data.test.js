/**
 * Data-integrity gates for the generated price table and holiday calendar.
 *
 * These are not "does the generator run" tests — they are the gates that turn a
 * silent pricing defect into a red build:
 *
 *  - a parsing change that yields an empty or tiny table;
 *  - a price table that stopped being refreshed (the capturedAt date);
 *  - a DeepSeek entry that lost its peak/off-peak pair (the fallback would then
 *    price it at Zen's peak rate, silently doubling every estimate);
 *  - holiday data that silently shrank to nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { REFERENCE_PRICES } from '../src/host/prices.js';
import { PUBLIC_HOLIDAYS } from '../src/host/holidays.js';
import { normalizeId } from '../src/host/pricing.js';

const DAY_MS = 86_400_000;

test('every table id normalizes to a key no other id claims', () => {
  // The lookup index is keyed by `normalizeId`, which unifies `.`/`-`, `_`,
  // case, the provider prefix and a router `auto-` prefix. Those rules are only
  // safe while they stay injective over the table: two rows collapsing into one
  // key would price one model at the other's rate, depending on object order.
  // This is the gate for that, and the reason the rules may be that broad.
  const keys = new Map();
  for (const id of Object.keys(REFERENCE_PRICES.models)) {
    const key = normalizeId(id);
    assert.equal(keys.has(key), false, `${id} and ${keys.get(key)} both normalize to ${key}`);
    keys.set(key, id);
  }
  assert.equal(keys.size, Object.keys(REFERENCE_PRICES.models).length);
});

test('every official DeepSeek model is tiered under its own id and its Zen twin', () => {
  // Pinned roster on purpose: these are the ids the two tables name differently,
  // and the failure this catches is invisible to a `source === 'deepseek'` scan —
  // a row reverted to Zen's single price simply stops being sourced deepseek, so
  // the tier test above would pass while every off-peak call was billed at double
  // (that is exactly how `deepseek-v4-pro` sat uncovered).
  for (const id of ['deepseek-flash', 'deepseek-v4.1-flash', 'deepseek-v4-pro']) {
    const entry = REFERENCE_PRICES.models[id];
    assert.ok(entry, `${id} must be in the table`);
    assert.equal(entry.source, 'deepseek', `${id} must carry the official two-tier row`);
    assert.ok(entry.peak && entry.offPeak, `${id} must keep both tiers`);
    assert.ok(entry.offPeak.input < entry.peak.input, `${id}: off-peak must be cheaper than peak`);
  }
  // The generator fetched this many DeepSeek rows; the table must carry at least
  // that many deepseek-sourced entries (the Zen twin adds one).
  const deepseek = REFERENCE_PRICES.sources.find((s) => s && s.name === 'DeepSeek');
  assert.ok(deepseek && Number.isInteger(deepseek.models) && deepseek.models >= 1, 'the source record must count its rows');
  const tiered = Object.values(REFERENCE_PRICES.models).filter((e) => e && e.source === 'deepseek').length;
  assert.ok(tiered >= deepseek.models, `only ${tiered} deepseek rows for ${deepseek.models} fetched`);
});

/** Every usable price field of one model entry, as numbers. */
function priceFields(entry) {
  const tiers = entry.source === 'deepseek' ? [entry.peak, entry.offPeak] : [entry];
  const out = [];
  for (const tier of tiers) {
    assert.ok(tier && typeof tier === 'object', 'every price tier must be an object');
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      const value = tier[key];
      assert.ok(
        value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0),
        `${key} must be a finite non-negative number or null, got ${JSON.stringify(value)}`,
      );
      if (typeof value === 'number') out.push(value);
    }
  }
  return out;
}

test('the table is non-trivial', () => {
  const ids = Object.keys(REFERENCE_PRICES.models);
  assert.ok(ids.length >= 80, `expected at least 80 models, got ${ids.length}`);
  assert.equal(REFERENCE_PRICES.unit, 'USD per 1M tokens');
  assert.ok(Array.isArray(REFERENCE_PRICES.sources) && REFERENCE_PRICES.sources.length >= 2);
});

test('the table was captured recently', () => {
  // 30 days: a stale table is a wrong table, and hiding that behind a green test
  // is exactly the failure this file exists to prevent.
  // capturedAt is a full ISO instant now (the dialog prints it to the second); a
  // date-only value from an older table still parses as UTC midnight.
  const raw = String(REFERENCE_PRICES.capturedAt || '');
  const captured = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00Z' : raw);
  assert.ok(Number.isFinite(captured), `capturedAt is not a date: ${REFERENCE_PRICES.capturedAt}`);
  const ageDays = (Date.now() - captured) / DAY_MS;
  assert.ok(ageDays <= 30, `price table is ${ageDays.toFixed(1)} days old — run scripts/gen-prices.mjs`);
});

test('every model carries at least one usable price', () => {
  const empty = [];
  for (const [id, entry] of Object.entries(REFERENCE_PRICES.models)) {
    assert.ok(entry && typeof entry === 'object', `${id}: entry must be an object`);
    assert.ok(entry.source === 'zen' || entry.source === 'deepseek', `${id}: unknown source ${entry.source}`);
    if (priceFields(entry).length === 0) empty.push(id);
  }
  assert.deepEqual(empty, [], 'these models have no usable price field at all');
});

test('DeepSeek models carry both tiers, and off-peak is never above peak', () => {
  const deepseekIds = Object.entries(REFERENCE_PRICES.models)
    .filter(([, entry]) => entry.source === 'deepseek')
    .map(([id]) => id);
  assert.ok(deepseekIds.length >= 2, `expected the DeepSeek models to be present, got ${deepseekIds.join(', ') || 'none'}`);

  for (const id of deepseekIds) {
    const entry = REFERENCE_PRICES.models[id];
    assert.ok(entry.peak && entry.offPeak, `${id}: both peak and offPeak are required`);
    for (const key of ['input', 'output', 'cacheRead']) {
      const peak = entry.peak[key];
      const off = entry.offPeak[key];
      assert.ok(typeof peak === 'number' && peak > 0, `${id}.peak.${key} must be a positive number`);
      assert.ok(typeof off === 'number' && off > 0, `${id}.offPeak.${key} must be a positive number`);
      assert.ok(off <= peak, `${id}.${key}: off-peak (${off}) must not exceed peak (${peak})`);
    }
  }
});

test('deepseek-flash matches the published list price', () => {
  // Pinned on purpose: this is the row every estimate leans on, and a silent
  // change to it is indistinguishable from a parsing bug.
  const flash = REFERENCE_PRICES.models['deepseek-flash'];
  assert.ok(flash, 'deepseek-flash must be in the table');
  assert.equal(flash.source, 'deepseek');
  assert.deepEqual(flash.offPeak, { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: null });
  assert.deepEqual(flash.peak, { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: null });
});

test('Zen rows that exist for a DeepSeek model are kept only as a fallback', () => {
  for (const [id, entry] of Object.entries(REFERENCE_PRICES.models)) {
    if (entry.source !== 'deepseek' || entry.fallback === undefined) continue;
    assert.equal(entry.fallback.source, 'zen', `${id}: fallback must be the Zen row`);
    assert.ok(entry.fallback.input > 0, `${id}: fallback must carry a price`);
  }
});

test('the free-tier twins are zero-priced and their paid siblings are not', () => {
  const free = Object.keys(REFERENCE_PRICES.models).filter((id) => id.endsWith('-free'));
  assert.ok(free.length >= 10, `expected the free tier to be present, got ${free.length}`);
  for (const id of free) {
    const entry = REFERENCE_PRICES.models[id];
    const tiers = entry.source === 'deepseek' ? [entry.peak, entry.offPeak] : [entry];
    for (const tier of tiers) {
      assert.equal(tier.input, 0, `${id}: a -free row must price at 0`);
    }
  }
  // The paid twin of a promo twin must stay non-zero, otherwise `pricing.js`
  // would "fix" a free lookup into another free row. That row is now a DeepSeek
  // two-tier entry, so the non-zero price lives in `peak` / `offPeak`.
  const paid = REFERENCE_PRICES.models['deepseek-v4.1-flash'];
  assert.ok(paid, 'deepseek-v4.1-flash must be in the table');
  assert.ok(paid.peak.input > 0, 'the paid twin of deepseek-v4.1-flash-free must be non-zero');
});

test('the holiday calendar has real data and reports its coverage', () => {
  const dates = Object.keys(PUBLIC_HOLIDAYS.dates);
  assert.ok(dates.length >= 20, `expected a real holiday calendar, got ${dates.length} dates`);
  for (const date of dates) assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${date} is not a YYYY-MM-DD date`);
  const years = Object.keys(PUBLIC_HOLIDAYS.years).map(Number).sort((a, b) => a - b);
  assert.ok(years.length >= 1);
  for (const year of years) {
    const info = PUBLIC_HOLIDAYS.years[year];
    if (info.unpublished === true) {
      // The State Council publishes next year's arrangement in November. Such a
      // year must be RECORDED (the UI says so) rather than dropped — a dropped
      // year is indistinguishable from "no holidays", which bills them peak.
      assert.equal(info.offDays, 0, `${year} is unpublished, so it has no off days`);
      assert.equal(info.last, null, `${year} is unpublished, so it has no last date`);
      continue;
    }
    assert.ok(info.offDays > 0, `${year} has no off days`);
    // Coverage metadata is what the UI shows when the calendar stops early.
    assert.ok(info.last, `${year} must report the last covered date`);
  }
});

test('the calendar spans every usage year plus one forward', () => {
  const coverage = PUBLIC_HOLIDAYS.coverage;
  assert.ok(coverage, 'the table must record the span it was fetched for');
  assert.ok(Number.isInteger(coverage.fromYear) && Number.isInteger(coverage.toYear));
  assert.ok(coverage.toYear > coverage.fromYear, 'a span, not a single year');
  assert.ok(Array.isArray(coverage.years) && coverage.years.length === coverage.toYear - coverage.fromYear + 1);
  // Every year in the span is present, published or explicitly unpublished.
  for (let year = coverage.fromYear; year <= coverage.toYear; year += 1) {
    assert.ok(PUBLIC_HOLIDAYS.years[year], `${year} is in the span but missing from years`);
  }
  // The forward year exists: that is what keeps next January from being billed
  // at the peak rate on a holiday.
  assert.ok(PUBLIC_HOLIDAYS.years[coverage.toYear], 'the forward year must be present');
});

test('a known public holiday is present and a known workday is not', () => {
  assert.ok(PUBLIC_HOLIDAYS.dates['2026-10-01'], '2026-10-01 is a public holiday');
  assert.ok(PUBLIC_HOLIDAYS.dates['2026-02-17'], '2026 Spring Festival day is a public holiday');
  assert.equal(PUBLIC_HOLIDAYS.dates['2026-10-09'], undefined, '2026-10-09 is an ordinary workday');
});
