/**
 * The `pricing` endpoint: propose matches, then commit what the user confirmed.
 *
 * The contract this file pins is "确定才保存": opening the dialog, or asking for a
 * proposal, must not change a single price. Only `action: 'commit'` touches the
 * persisted match map, and only rows that survive validation reach it — a bad id
 * here would become a silent zero cost later, which is the failure mode the whole
 * pricing rebuild exists to remove.
 *
 * A second contract lives here because the dialog depends on it and cannot fake
 * it: `propose` must classify a model exactly the way `query` prices it. When it
 * did not, every row in the dialog read 未匹配 while the dashboard happily billed
 * those same calls — the answer was computed, then discarded, and the badge was
 * derived from a field the proposal never set.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { apply } from '../src/host/index.js';
import { costOf, referenceTable } from '../src/host/pricing.js';

/**
 * A cordis-like host that mounts the plugin's Fetch routes and records the
 * settings writes, so a test can assert both the answer and the side effects.
 */
function makeHost(config) {
  const routes = new Map();
  const updates = [];
  const ctx = {
    get(name) {
      if (name === 'settings') {
        return { update: (id, patch) => { updates.push({ id, patch }); return Promise.resolve(patch); } };
      }
      return undefined;
    },
    interval() { return () => {}; },
    // cordis: `ctx.on(name, listener)` returns a disposer owned by the fiber.
    on() { return () => {}; },
    effect(fn) { return typeof fn === 'function' ? fn() : undefined; },
    inject(_deps, fn) {
      fn({
        connection: {
          fetch: {
            register(route) {
              routes.set(String(route.path).split('/').pop(), route.fetch);
            },
          },
        },
      });
      return () => {};
    },
  };
  apply(ctx, config);
  const post = async (endpoint, args) => {
    const route = routes.get(endpoint);
    assert.ok(route, `${endpoint} route was never mounted`);
    const res = await route(new Request('http://host/api/usage/' + endpoint, {
      method: 'POST',
      body: JSON.stringify(args),
    }));
    const body = await res.json();
    assert.equal(body.ok, true, JSON.stringify(body.error || null));
    return body.value;
  };
  return { post, updates, routes };
}

const FLASH = { key: 'deepseek-account/deepseek-flash', provider: 'deepseek-account', model: 'deepseek-flash' };
const ODD = { key: 'relay/odd-model', provider: 'relay', model: 'odd-model' };

test('propose reports the ladder level for every model and writes nothing', async () => {
  const host = makeHost({});
  const value = await host.post('pricing', {
    action: 'propose',
    models: [FLASH, { key: 'stepfun/step-5-preview', provider: 'stepfun', model: 'step-5-preview' }],
  });

  const flash = value.rows.find((r) => r.model === 'deepseek-flash');
  assert.equal(flash.how, 'normalized');
  assert.equal(flash.state, 'exact');
  assert.equal(flash.target, 'deepseek-flash');
  assert.ok(flash.rates && flash.rates.peak.input > 0);
  // Both tiers travel; the client prints the one the host calls current.
  assert.equal(flash.rates.offPeak.input, 0.15);
  assert.ok(flash.tier === 'peak' || flash.tier === 'off');

  const step = value.rows.find((r) => r.model === 'step-5-preview');
  assert.equal(step.how, 'unmatched');
  assert.equal(step.state, 'none');
  assert.equal(step.source, null);
  assert.equal(step.rates, null);

  // The reference ids travel grouped by kind, so the dialog needs no second trip
  // and no second source of truth about where an id comes from. Two groups: a
  // custom price is an OPTION in the dialog, not a list of ids.
  assert.deepEqual(value.table.groups.map((g) => g.source), ['deepseek', 'zen']);
  const deepseek = value.table.groups.find((g) => g.source === 'deepseek').ids;
  const zen = value.table.groups.find((g) => g.source === 'zen').ids;
  assert.ok(deepseek.includes('deepseek-v4.1-flash'), 'the official row is a DeepSeek reference');
  assert.ok(zen.includes('glm-5.3-flash'), 'a Zen-only row is a Zen reference');
  assert.equal(value.table.capturedAt, referenceTable().capturedAt);
  assert.deepEqual(host.updates, [], 'propose must not write the persisted config');
});

test('propose classifies a literal hit instead of dropping to unmatched', async () => {
  // These are the ids the dialog showed as 未匹配 in the report that opened this
  // bug: every one of them is a literal row of the shipped table.
  const host = makeHost({});
  const wanted = [
    { key: 'commandcode-plan/deepseek-v4.1-flash', provider: 'commandcode-plan', model: 'deepseek-v4.1-flash' },
    { key: 'coding-plan/glm-5.3-flash', provider: 'coding-plan', model: 'glm-5.3-flash' },
    { key: 'qwen-token-plan-cn/qwen3.8-flash', provider: 'qwen-token-plan-cn', model: 'qwen3.8-flash' },
  ];
  const value = await host.post('pricing', { action: 'propose', models: wanted });
  for (const row of value.rows) {
    assert.equal(row.how, 'normalized', `${row.key} is a literal table row and must classify as a literal hit`);
    assert.equal(row.state, 'exact', `${row.key} must show as 精确, not 未匹配`);
    assert.equal(row.target, row.model);
    assert.ok(row.rates !== null, `${row.key} must carry the price the query would bill`);
  }
});

test('every proposed row carries the price and the unit the card is priced in', async () => {
  const host = makeHost({});
  const value = await host.post('pricing', {
    action: 'propose',
    models: [FLASH, { key: 'commandcode-plan/deepseek-v4.1-flash', provider: 'commandcode-plan', model: 'deepseek-v4.1-flash' }],
  });
  for (const row of value.rows) {
    if (row.rates === null) continue;
    for (const tier of ['peak', 'offPeak']) {
      // The dialog prints these three fields; the card bills the same three.
      for (const field of ['input', 'output', 'cacheRead']) {
        assert.equal(typeof row.rates[tier][field], 'number', `${row.key} is missing rates.${tier}.${field}`);
      }
    }
    assert.ok(row.rates.peak.input > 0);
  }
  assert.equal(value.table.unit, referenceTable().unit, 'the dialog labels the column with the table unit');
});

test('a proposal never disagrees with the bill the dashboard shows', async () => {
  // The same record, priced through the dialog's path and through the query's
  // path, must agree. They used different shapes for the same number before.
  const host = makeHost({});
  const atMs = Date.UTC(2026, 9, 19, 12, 0); // 20:00 Beijing: off-peak
  const value = await host.post('pricing', {
    action: 'propose',
    models: [{ key: 'commandcode-plan/deepseek-v4.1-flash', provider: 'commandcode-plan', model: 'deepseek-v4.1-flash' }],
  });
  const row = value.rows[0];
  const record = {
    provider: 'commandcode-plan',
    model: 'deepseek-v4.1-flash',
    time: atMs,
    tokens: { off: { inputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0 } },
  };
  // The proposal's two tiers, fed back into the bill, must produce the off-peak
  // input rate for one million tokens — the rate the row itself prints.
  assert.equal(costOf(record, { peak: row.rates.peak, offPeak: row.rates.offPeak }), row.rates.offPeak.input);
});

test('commit validates every row, persists the good ones and reports the rest', async () => {
  const host = makeHost({});
  const value = await host.post('pricing', {
    action: 'commit',
    decisions: [
      { key: 'relay/odd-model', target: 'glm-5.3-flash' },
      { key: 'relay/bad-model', target: 'not-a-real-id' },
      { key: '', target: 'glm-5.3-flash' },
    ],
  });

  assert.equal(value.applied, 1);
  assert.equal(value.rejected.length, 2, 'an unknown target and a missing key are both refused');
  assert.equal(value.matchMap['relay/odd-model'], 'glm-5.3-flash');
  assert.equal(value.matchMap['relay/bad-model'], undefined);
  assert.equal(value.matchMap[''], undefined);

  const write = host.updates.find((u) => u.patch && u.patch.matchMap);
  assert.ok(write, 'a successful commit must write the config');
  assert.equal(write.id, 'usage');
  assert.equal(write.patch.matchMap['relay/odd-model'], 'glm-5.3-flash');
});

test('a confirmed match outranks the ladder, and clearing restores the ladder', async () => {
  const host = makeHost({ matchMap: { 'relay/odd-model': 'glm-5.3-flash' } });

  const confirmed = await host.post('pricing', { action: 'propose', models: [ODD] });
  const row = confirmed.rows[0];
  assert.equal(row.state, 'custom');
  assert.equal(row.how, 'confirmed');
  assert.equal(row.target, 'glm-5.3-flash');
  assert.ok(row.rates);

  const cleared = await host.post('pricing', { action: 'commit', cleared: ['relay/odd-model'] });
  assert.equal(cleared.cleared, 1);
  assert.equal(cleared.matchMap['relay/odd-model'], undefined);

  const back = await host.post('pricing', { action: 'propose', models: [ODD] });
  assert.equal(back.rows[0].state, 'none');
  assert.equal(back.rows[0].how, 'unmatched', 'without the confirmation the odd id is unpriced again');
});

test('an empty commit is a no-op rather than a wipe', async () => {
  const host = makeHost({ matchMap: { 'relay/odd-model': 'glm-5.3-flash' } });
  const value = await host.post('pricing', { action: 'commit' });
  assert.equal(value.applied, 0);
  assert.equal(value.cleared, 0);
  assert.equal(value.matchMap['relay/odd-model'], 'glm-5.3-flash');
  assert.deepEqual(host.updates, [], 'an empty commit must not write');
});

test('a confirmed target that left the table is reported, not silently repriced', async () => {
  const host = makeHost({ matchMap: { 'relay/odd-model': 'retired-model-id' } });
  const value = await host.post('pricing', { action: 'propose', models: [ODD] });
  const row = value.rows[0];
  assert.equal(row.how, 'unmatched');
  assert.equal(row.state, 'none');
  assert.equal(row.target, 'retired-model-id');
  assert.equal(row.rates, null);
});

test('an explicit price still wins over a confirmed match', async () => {
  const host = makeHost({
    matchMap: { 'relay/odd-model': 'glm-5.3-flash' },
    prices: { 'relay/odd-model': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0, cacheWritePerM: 0 } },
  });
  const value = await host.post('pricing', { action: 'propose', models: [ODD] });
  assert.equal(value.rows[0].how, 'custom');
  assert.equal(value.rows[0].state, 'custom');
  assert.equal(value.rows[0].target, null, 'a hand-entered price has no reference model');
  // Canonical on the wire, even though the config row is spelled with `PerM`.
  assert.deepEqual(value.rows[0].rates.peak, { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(value.rows[0].rates.offPeak, value.rows[0].rates.peak, 'a hand-entered price has one tier');
});

test('prices persistence keeps working', async () => {
  const host = makeHost({});
  const value = await host.post('prices', { prices: { 'relay/odd-model': { inputPerM: 2, outputPerM: 4, cacheReadPerM: 0.2, cacheWritePerM: 0 } } });
  assert.ok(value.prices['relay/odd-model']);
  const write = host.updates.find((u) => u.patch && u.patch.prices);
  assert.ok(write, 'the prices endpoint still persists');
  // The config still speaks `inputPerM`; the store speaks canonical fields.
  assert.equal(write.patch.prices['relay/odd-model'].inputPerM, 2);
  assert.equal(write.patch.prices['relay/odd-model'].input, undefined);
});

test('the 自定义 option stores three hand-typed rates for one model key', async () => {
  // The dialog's 自定义 is not a reference id: it is three numbers the user types
  // for THIS model. They arrive in the display currency (¥, 7 per USD) and are
  // stored USD-denominated, because the whole table is USD.
  const host = makeHost({});
  const committed = await host.post('pricing', {
    action: 'commit',
    currency: 'CNY',
    customs: [{ key: 'relay/odd-model', input: 7, output: 14, cacheRead: 0.7 }],
  });
  assert.equal(committed.custom, 1, 'one hand-typed price applied');
  assert.deepEqual(committed.rejected, []);

  const write = host.updates.find((u) => u.patch && u.patch.prices);
  assert.ok(write, 'the typed price is persisted');
  assert.deepEqual(write.patch.prices['relay/odd-model'], {
    inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0,
  }, 'stored in USD, in the config\'s spelling');

  // …and the row is now priced from it, both tiers, as a custom reference.
  const after = await host.post('pricing', { action: 'propose', models: [ODD] });
  const row = after.rows[0];
  assert.equal(row.how, 'custom');
  assert.equal(row.state, 'custom');
  assert.equal(row.source, 'custom');
  assert.deepEqual(row.rates.peak, { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 });
  assert.deepEqual(row.rates.offPeak, row.rates.peak, 'a hand-typed price has one tier');
});

test('a hand-typed price outranks a confirmed match, and clearing drops both', async () => {
  const host = makeHost({ matchMap: { 'relay/odd-model': 'glm-5.3-flash' } });
  await host.post('pricing', {
    action: 'commit',
    currency: 'USD',
    customs: [{ key: 'relay/odd-model', input: 9, output: 9, cacheRead: 9 }],
  });
  const typed = await host.post('pricing', { action: 'propose', models: [ODD] });
  assert.equal(typed.rows[0].how, 'custom', 'the typed price wins (the ladder checks it first)');
  assert.equal(typed.rows[0].rates.peak.input, 9);

  const cleared = await host.post('pricing', { action: 'commit', cleared: ['relay/odd-model'] });
  assert.equal(cleared.cleared, 1);
  assert.equal(cleared.prices['relay/odd-model'], undefined, 'clearing drops the typed price too');
  const back = await host.post('pricing', { action: 'propose', models: [ODD] });
  assert.equal(back.rows[0].state, 'none');
});

test('typing a price takes the key out of the confirmed-match map', async () => {
  // One key, one answer: a typed price and a confirmed target would both sit
  // there, and the ladder would silently prefer the typed one while the dialog's
  // history drawer still showed a match that no longer applies.
  const host = makeHost({ matchMap: { 'relay/odd-model': 'glm-5.3-flash' } });
  const value = await host.post('pricing', {
    action: 'commit',
    currency: 'USD',
    customs: [{ key: 'relay/odd-model', input: 1, output: 1, cacheRead: 0 }],
  });
  assert.equal(value.custom, 1);
  assert.equal(value.matchMap['relay/odd-model'], undefined, 'the stale match is dropped');
});

test('a malformed hand-typed price is refused, not stored as zero', async () => {
  const host = makeHost({});
  const value = await host.post('pricing', {
    action: 'commit',
    currency: 'CNY',
    customs: [
      { key: 'relay/a', input: -1, output: 1, cacheRead: 0 },
      { key: 'relay/b', input: 'abc', output: 1, cacheRead: 0 },
      { key: '', input: 1, output: 1, cacheRead: 0 },
    ],
  });
  assert.equal(value.custom, 0);
  assert.equal(value.rejected.length, 3);
  assert.deepEqual(host.updates, [], 'a rejected row must not write the config');
});
