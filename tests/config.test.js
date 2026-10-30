/**
 * Config contract: overrides + currency + confirmed matches, nothing else.
 *
 * DSH 0.2.x materializes this schemastery schema as the plugin entry's form
 * (Plugins settings tab -> profile patch). The old hand-rolled
 * `settings.register('usage.prices', ...)` path does not exist in 0.2.x.
 *
 * The invariant this file now pins: the config's price table starts EMPTY. Every
 * number the reference table can answer must come from the table, because a
 * config row outranks it — the shipped defaults were a stale copy that silently
 * won (one row billed cached input at 13.3× the official list).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Config, resolveConfig } from '../src/host/index.js';
import { resolvePrice } from '../src/host/pricing.js';
import { DEFAULT_CURRENCY } from '../src/host/settings.js';

/**
 * Every field the plugin writes back must be `.volatile()`.
 *
 * The official settings service refuses anything else — `dsh-settings/lib/index.js`
 * `write()`: `volatileForm(schema)` is `undefined` when no field is volatile and
 * it throws `Plugin entry "usage" has no volatile fields`, then `validatePaths`
 * rejects any non-volatile key in the patch. Without the markers every
 * `settings.update('usage', …)` threw, and the swallowed rejection is exactly why
 * confirmed matches and custom prices disappeared on restart.
 */
test('every field the plugin persists is volatile', () => {
  const written = ['currency', 'prices', 'matchMap'];
  for (const key of written) {
    assert.equal(typeof Config.dict[key], 'function', `${key} must be a schema field`);
    assert.equal(Config.dict[key].meta.volatile, true, `${key} must be declared .volatile()`);
  }
});

test('resolveConfig unwraps volatile fields back to plain values', () => {
  // A volatile field is a wrapper object with `get()`; the plugin must read the
  // value, not the wrapper (a wrapper in `prices` would price nothing).
  const resolved = resolveConfig({});
  assert.equal(resolved.currency, DEFAULT_CURRENCY);
  assert.deepEqual(resolved.prices, {});
  assert.deepEqual(resolved.matchMap, {});
});

test('resolveConfig accepts the loader shape, where volatile values arrive wrapped', () => {
  // What the settings line hands the plugin is `Config(...)`'s own output — i.e.
  // wrappers. Validating that a second time used to throw
  // `ValidationError: $.currency expected string but got [object Object]`, which
  // killed activation outright: no Remote face, no Fetch routes, every call 404.
  const fromLoader = Config({
    currency: '$',
    prices: { m: { inputPerM: 3, outputPerM: 4, cacheReadPerM: 0, cacheWritePerM: 0 } },
    matchMap: { m: 'deepseek-flash' },
  });
  const resolved = resolveConfig(fromLoader);
  assert.equal(resolved.currency, '$');
  assert.deepEqual(resolved.prices, { m: { inputPerM: 3, outputPerM: 4, cacheReadPerM: 0, cacheWritePerM: 0 } });
  assert.deepEqual(resolved.matchMap, { m: 'deepseek-flash' });
});

test('every config field explains itself in both languages', () => {  // The settings form renders `meta.description` through resolveText(), so a
  // locale map is what an official plugin ships. Without it the form shows bare
  // key names and nobody learns that `prices` is USD-denominated.
  for (const key of ['currency', 'prices', 'matchMap']) {
    const description = Config.dict[key].meta.description;
    assert.equal(typeof description, 'object', `${key} needs a locale map`);
    assert.equal(typeof description.zh, 'string', `${key} needs zh`);
    assert.equal(typeof description.en, 'string', `${key} needs en`);
  }
});

test('Config ships an empty override table, and the ladder prices the defaults', () => {
  const resolved = resolveConfig({});
  assert.equal(resolved.currency, DEFAULT_CURRENCY);
  assert.deepEqual(resolved.prices, {});
  assert.deepEqual(resolved.matchMap, {});
  // The ids the old table shadowed are priced by the ladder now. (`-1017` is not
  // in this list: no table publishes it any more, so it is honestly unmatched —
  // the old defaults were the only thing that ever claimed to know its price.)
  for (const id of ['deepseek-chat', 'deepseek-v4.1-flash', 'deepseek-reasoner', 'deepseek-flash']) {
    assert.notEqual(resolvePrice({ model: id }).how, 'unmatched', `${id} must stay priced without a config row`);
  }
  // DSH's router id resolves through normalization, so it needs no row either.
  assert.equal(resolvePrice({ provider: 'magpie', model: 'group/auto-deepseek-v4-1-flash' }).how, 'normalized');
});

test('a configured row is kept verbatim, in the spelling the form persists', () => {
  const resolved = resolveConfig({
    currency: '$',
    prices: { 'relay/odd': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 3, cacheWritePerM: 4 } },
  });
  assert.equal(resolved.currency, '$');
  assert.deepEqual(resolved.prices['relay/odd'], { inputPerM: 1, outputPerM: 2, cacheReadPerM: 3, cacheWritePerM: 4 });
});

test('a configured row for an id the ladder can price would shadow it', () => {
  // Not a bug to fix here — it is the documented precedence — but the reason the
  // shipped default table must stay empty. Pinned so the precedence cannot drift
  // silently: a user row answers first, and says so.
  const resolved = resolveConfig({ prices: { 'deepseek-flash': { inputPerM: 99, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 } } });
  const hit = resolvePrice({ model: 'deepseek-flash', custom: resolved.prices });
  assert.equal(hit.how, 'custom');
  assert.equal(hit.state, 'custom');
});
