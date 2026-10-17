/**
 * Config contract: the price table is the plugin's durable configuration.
 *
 * DSH 0.2.x materializes this schemastery schema as the plugin entry's form
 * (Plugins settings tab -> profile patch). The old hand-rolled
 * `settings.register('usage.prices', ...)` path does not exist in 0.2.x.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Config } from '../src/host/index.js';
import { DEFAULT_CURRENCY, DEFAULT_PRICES, mergePrices } from '../src/host/settings.js';

test('Config resolves the default currency and price table', () => {
  const resolved = Config({});
  assert.equal(resolved.currency, DEFAULT_CURRENCY);
  assert.deepEqual(resolved.prices['deepseek-chat'], DEFAULT_PRICES['deepseek-chat']);
  assert.ok(Object.prototype.hasOwnProperty.call(resolved.prices, 'deepseek-v4.1-flash-1017'));
});

test('a user price entry overrides the table; apply() re-merges the defaults', () => {
  const resolved = Config({
    currency: '$',
    prices: {
      'deepseek-v4.1-flash-1017': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 3, cacheWritePerM: 4 },
    },
  });
  assert.equal(resolved.currency, '$');
  assert.deepEqual(resolved.prices['deepseek-v4.1-flash-1017'], {
    inputPerM: 1, outputPerM: 2, cacheReadPerM: 3, cacheWritePerM: 4,
  });
  // schemastery dicts replace rather than deep-merge, so apply() layers the
  // configured table over DEFAULT_PRICES: untouched models keep their defaults.
  const merged = mergePrices(resolved.prices);
  assert.deepEqual(merged['deepseek-chat'], DEFAULT_PRICES['deepseek-chat']);
});
