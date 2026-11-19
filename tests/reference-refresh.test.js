/**
 * The runtime price refresh: parse, validate, fetch, persist, swap.
 *
 * What this file protects, in order of how expensive the failure is:
 *
 *  1. the shared parser still reads the real pages (fixtures are the actual
 *     responses, so a vendor layout change fails HERE, not in someone's bill);
 *  2. a fetched table cannot replace the live one unless it passes the same
 *     gates the shipped table passes;
 *  3. a failed fetch, a broken page and a corrupt cache file all degrade to the
 *     bundled table instead of throwing inside activation;
 *  4. the table swap actually changes what `resolvePrice` answers — and can be
 *     undone.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MIN_ZEN_MODELS,
  buildHolidayCalendar,
  buildReferenceTable,
  parseDeepSeek,
  parseZen,
  validateHolidayCalendar,
  validateReferenceTable,
} from '../src/host/reference-parse.js';
import { fetchReferenceTable } from '../src/host/reference-refresh.js';
import {
  REFERENCE_STORE_VERSION,
  clearFetchedTable,
  readFetchedTable,
  referenceCacheDir,
  writeFetchedTable,
} from '../src/host/reference-store.js';
import { ratesOf, referenceOrigin, referenceTable, resolvePrice, setReferenceTable } from '../src/host/pricing.js';

const here = (name) => fileURLToPath(new URL('./fixtures/pricing/' + name, import.meta.url));
const [zenHtml, deepseekHtml] = await Promise.all([readFile(here('zen.html'), 'utf8'), readFile(here('deepseek.html'), 'utf8')]);

/** A fetch stub that answers two URLs with the given bodies. */
function stubFetch(pages) {
  return async (url) => {
    const entry = pages[url];
    if (entry === undefined) throw new Error('unexpected url ' + url);
    if (entry instanceof Error) throw entry;
    return {
      ok: entry.status === undefined || entry.status < 400,
      status: entry.status === undefined ? 200 : entry.status,
      text: async () => entry.body,
    };
  };
}

const liveTable = () => fetchReferenceTable({
  fetchImpl: stubFetch({
    'https://opencode.ai/v2/docs/console/models/': { body: zenHtml },
    'https://api-docs.deepseek.com/quick_start/pricing/': { body: deepseekHtml },
  }),
});

test('the real Zen page still parses into a usable catalogue', () => {
  const zen = parseZen(zenHtml);
  const ids = Object.keys(zen.models);
  assert.ok(ids.length >= MIN_ZEN_MODELS, `only ${ids.length} Zen models parsed`);
  const flash = zen.models['deepseek-v4.1-flash'];
  assert.ok(flash, 'the DeepSeek Flash row must be present');
  assert.equal(typeof flash.input, 'number');
  assert.ok(flash.input > 0);
  // Promotions are recorded, not silently overwritten by the list price.
  assert.ok(zen.notes.some((n) => n.kind === 'promo'), 'a promo row must be reported');
  assert.ok(Array.isArray(zen.deprecated) && zen.deprecated.length > 0, 'deprecation rows must be captured');
});

test('the real DeepSeek page still parses into a peak/off-peak pair', () => {
  const deepseek = parseDeepSeek(deepseekHtml);
  const flash = deepseek.models['deepseek-flash'];
  assert.ok(flash && flash.peak && flash.offPeak, 'deepseek-flash needs both tiers');
  for (const field of ['input', 'output', 'cacheRead']) {
    assert.ok(flash.peak[field] > 0, `peak.${field} must be positive`);
    assert.ok(flash.offPeak[field] < flash.peak[field], `offPeak.${field} must be cheaper than peak`);
  }
});

test('the merged table keeps Zen rows as the fallback under the official tiers', () => {
  const table = buildReferenceTable({
    zen: parseZen(zenHtml),
    deepseek: parseDeepSeek(deepseekHtml),
    capturedAt: '2026-11-19T00:00:00.000Z',
  });
  assert.deepEqual(validateReferenceTable(table), []);
  const twin = table.models['deepseek-v4.1-flash'];
  assert.equal(twin.source, 'deepseek');
  assert.ok(twin.peak && twin.offPeak);
  assert.equal(twin.fallback.source, 'zen');
  assert.equal(table.unit, 'USD per 1M tokens');
  assert.equal(table.capturedAt, '2026-11-19T00:00:00.000Z');
});

test('validation refuses every table that would misprice silently', () => {
  const good = buildReferenceTable({ zen: parseZen(zenHtml), deepseek: parseDeepSeek(deepseekHtml) });
  assert.deepEqual(validateReferenceTable(good), []);

  const truncated = { ...good, models: Object.fromEntries(Object.entries(good.models).slice(0, 5)) };
  assert.match(validateReferenceTable(truncated).join(' '), /只有 5 个模型/);

  const noTiers = { ...good, models: { ...good.models, 'deepseek-flash': { source: 'deepseek', peak: { input: 1 }, offPeak: null } } };
  assert.match(validateReferenceTable(noTiers).join(' '), /deepseek-flash/);

  const wrongUnit = { ...good, unit: 'CNY per 1M tokens' };
  assert.match(validateReferenceTable(wrongUnit).join(' '), /单位/);

  const emptyRow = { ...good, models: { ...good.models, 'ghost-model': { source: 'zen', input: 'n/a' } } };
  assert.match(validateReferenceTable(emptyRow).join(' '), /没有任何可用价格/);

  assert.deepEqual(validateReferenceTable(null), ['价目表不是一个对象']);
});

test('a successful fetch returns a validated table and a summary', async () => {
  const result = await liveTable();
  assert.equal(result.ok, true);
  assert.ok(Object.keys(result.table.models).length >= MIN_ZEN_MODELS);
  assert.ok(result.summary.models >= MIN_ZEN_MODELS);
  assert.ok(result.summary.deepseek >= 1);
  assert.match(result.summary.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('each failure carries the code the dialog needs to explain it', async () => {
  const zenUrl = 'https://opencode.ai/v2/docs/console/models/';
  const deepseekUrl = 'https://api-docs.deepseek.com/quick_start/pricing/';

  const http = await fetchReferenceTable({
    fetchImpl: stubFetch({ [zenUrl]: { status: 503, body: '' }, [deepseekUrl]: { body: deepseekHtml } }),
  });
  assert.equal(http.ok, false);
  assert.equal(http.code, 'http');
  assert.equal(http.details.page, 'opencode Zen');

  const aborted = new Error('The operation was aborted due to timeout');
  aborted.name = 'TimeoutError';
  const timeout = await fetchReferenceTable({
    fetchImpl: stubFetch({ [zenUrl]: { body: zenHtml }, [deepseekUrl]: aborted }),
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.code, 'timeout');
  assert.equal(timeout.details.page, 'DeepSeek');

  const parse = await fetchReferenceTable({
    fetchImpl: stubFetch({ [zenUrl]: { body: '<html><body>maintenance</body></html>' }, [deepseekUrl]: { body: deepseekHtml } }),
  });
  assert.equal(parse.ok, false);
  assert.equal(parse.code, 'parse');

  // 一张只有三行的表能解析，但绝不能上线。
  const tiny = '<table><tr><td>Model</td><td>Model ID</td></tr><tr><td>a</td><td>a-1</td></tr></table>'
    + '<table><tr><td>Model</td><td>Input</td><td>Output</td><td>Cached Read</td><td>Cached Write</td></tr>'
    + '<tr><td>a</td><td>$1</td><td>$2</td><td>$0.1</td><td>-</td></tr></table>';
  const invalid = await fetchReferenceTable({ fetchImpl: stubFetch({ [zenUrl]: { body: tiny }, [deepseekUrl]: { body: deepseekHtml } }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'table-invalid');
  assert.ok(Array.isArray(invalid.details.problems));
});

test('the store round-trips a validated table and refuses anything else', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'usage-reference-'));
  t.after(() => rm(home, { recursive: true, force: true }));

  assert.equal(await readFetchedTable(home), null, 'nothing stored yet');

  const table = buildReferenceTable({ zen: parseZen(zenHtml), deepseek: parseDeepSeek(deepseekHtml) });
  const calendar = buildHolidayCalendar({
    years: [2026],
    payloads: { 2026: { days: [{ date: '2026-10-01', name: '国庆节', isOffDay: true }] } },
    capturedAt: '2026-11-19T00:00:00.000Z',
  });
  assert.deepEqual(validateHolidayCalendar(calendar), []);

  assert.equal(await writeFetchedTable({ table, calendar }, home), true);
  const stored = await readFetchedTable(home);
  assert.ok(stored && stored.table);
  assert.equal(Object.keys(stored.table.models).length, Object.keys(table.models).length);
  assert.match(stored.savedAt, /^\d{4}-/);
  // Both halves travel together: the peak rule needs the calendar the prices came with.
  assert.ok(stored.calendar, 'the calendar must round-trip');
  assert.equal(stored.calendar.dates['2026-10-01'], '国庆节');
  assert.equal(referenceCacheDir(home).endsWith(join('cache', 'dsh-plugin-usage', 'reference')), true);

  // A malformed or outdated payload is "no stored table", never a throw.
  const file = join(referenceCacheDir(home), 'table.json');
  await writeFile(file, '{ not json');
  assert.equal(await readFetchedTable(home), null);
  await writeFile(file, JSON.stringify({ version: REFERENCE_STORE_VERSION + 1, table, calendar }));
  assert.equal(await readFetchedTable(home), null);
  await writeFile(file, JSON.stringify({ version: REFERENCE_STORE_VERSION, table: { models: {} } }));
  assert.equal(await readFetchedTable(home), null, 'an invalid table is not adopted');
  // A broken calendar costs only the calendar; the table is still usable.
  await writeFile(file, JSON.stringify({
    version: REFERENCE_STORE_VERSION,
    table,
    calendar: { dates: { nope: 'x' }, years: {} },
  }));
  const partial = await readFetchedTable(home);
  assert.ok(partial && partial.table, 'the table survives a broken calendar');
  assert.equal(partial.calendar, null);

  assert.equal(await writeFetchedTable({ table: { models: {} } }, home), false, 'invalid tables are never written');

  assert.equal(await clearFetchedTable(home), true);
  assert.equal(await readFetchedTable(home), null);
  assert.equal(await clearFetchedTable(home), false, 'clearing twice is not an error');
});

test('the calendar is built with the years the usage reaches, and unpublished years are named', () => {
  const calendar = buildHolidayCalendar({
    years: [2026, 2027, 2028],
    payloads: {
      2026: { days: [{ date: '2026-10-01', name: '国庆节', isOffDay: true }, { date: '2026-05-01', name: '劳动节', isOffDay: true }] },
      2027: { days: [] },
      // 2028 is absent: not fetched or not published.
    },
    capturedAt: '2026-11-19T00:00:00.000Z',
  });
  assert.deepEqual(Object.keys(calendar.dates).sort(), ['2026-05-01', '2026-10-01']);
  assert.equal(calendar.years[2026].offDays, 2);
  assert.equal(calendar.years[2027].unpublished, true, 'an empty year is recorded, not dropped');
  assert.equal(calendar.years[2028].unpublished, true, 'an unfetched year is unpublished too');
  assert.deepEqual(calendar.coverage.years, [2026, 2027, 2028]);
  assert.deepEqual(validateHolidayCalendar(calendar), []);
  assert.match(validateHolidayCalendar({ dates: { '2026/10/01': 'x' }, years: {} }).join(' '), /YYYY-MM-DD/);
  assert.match(validateHolidayCalendar({ dates: {}, years: {} }).join(' '), /空的/);
});

test('one refresh fetches prices and the holiday calendar together', async () => {
  const result = await fetchReferenceTable({
    holidayYears: [2026],
    fetchImpl: stubFetch({
      'https://opencode.ai/v2/docs/console/models/': { body: zenHtml },
      'https://api-docs.deepseek.com/quick_start/pricing/': { body: deepseekHtml },
      'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json': {
        body: JSON.stringify({ days: [{ date: '2026-10-01', name: '国庆节', isOffDay: true }] }),
      },
    }),
  });
  assert.equal(result.ok, true);
  assert.ok(result.calendar, 'the calendar comes back with the table');
  assert.equal(result.calendar.dates['2026-10-01'], '国庆节');
  assert.equal(result.summary.holidays.status, 'ok');
  assert.equal(result.summary.holidays.dates, 1);
});

test('a blocked holiday source notes the fact instead of failing the refresh', async () => {
  const result = await fetchReferenceTable({
    holidayYears: [2026],
    fetchImpl: stubFetch({
      'https://opencode.ai/v2/docs/console/models/': { body: zenHtml },
      'https://api-docs.deepseek.com/quick_start/pricing/': { body: deepseekHtml },
      'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json': new Error('blocked by proxy'),
    }),
  });
  // Prices are the primary content: a proxied github must not cost the user the
  // whole refresh, and the UI has one sentence for the partial case.
  assert.equal(result.ok, true);
  assert.equal(result.calendar, null);
  assert.equal(result.summary.holidays.status, 'invalid', 'an empty calendar never replaces the bundled one');
  assert.deepEqual(result.summary.holidays.failed, [2026]);
});

test('a fetched table actually changes what the ladder answers, and can be undone', (t) => {
  t.after(() => setReferenceTable(null));
  const builtin = referenceTable();
  assert.equal(referenceOrigin(), 'builtin');

  const id = 'deepseek-v4.1-flash';
  const before = ratesOf(resolvePrice({ model: id }).price, 'peak').input;
  assert.ok(before > 0);

  const patched = JSON.parse(JSON.stringify(builtin));
  patched.capturedAt = '2026-11-19T00:00:00.000Z';
  patched.models[id].peak.input = 42;
  setReferenceTable(patched);

  assert.equal(referenceOrigin(), 'fetched');
  assert.equal(ratesOf(resolvePrice({ model: id }).price, 'peak').input, 42);
  assert.equal(resolvePrice({ model: id }).how, 'normalized', 'the id index must be rebuilt, not left stale');
  assert.equal(referenceTable().capturedAt, '2026-11-19T00:00:00.000Z');

  setReferenceTable(null);
  assert.equal(referenceOrigin(), 'builtin');
  assert.equal(ratesOf(resolvePrice({ model: id }).price, 'peak').input, before);
});

test('every UI string the refresh needs exists in all eight dictionaries', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/client/index.js', import.meta.url)), 'utf8');
  const keys = [
    'pricingPull',
    'pricingPhaseFetch',
    'pricingPhaseMatch',
    'pricingRefreshDone',
    'pricingRefreshNotSaved',
    'pricingReset',
    'pricingOriginBuiltin',
    'pricingOriginFetched',
    'pricingErrNetwork',
    'pricingErrParse',
    'pricingErrInvalid',
    'pricingErrUnsupported',
    'pricingRefreshHolidayWarn',
  ];
  for (const key of keys) {
    const count = source.split(key + ':').length - 1;
    assert.equal(count, 8, `${key} must be translated in all 8 dictionaries (found ${count})`);
  }
  // The refresh must not ride on the Remote-first helper: its handler is async.
  assert.match(source, /hostCallLong\('usage\/refresh'/, 'the dialog must call the refresh endpoint over a transport that awaits');
  assert.match(source, /onClick: refreshNow/, 'the footer button must trigger the network refresh');
  assert.match(source, /onClick: resetTable/, 'there must be a way back to the bundled table');
});
