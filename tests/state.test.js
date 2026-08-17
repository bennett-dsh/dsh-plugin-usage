/**
 * P2-12: node:test unit coverage for src/host/state.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/host/state.js';

test('createState exposes the full runtime capsule shape', () => {
  const prices = { priceOf() {} };
  const state = createState(prices);
  assert.deepEqual(
    Object.keys(state).sort(),
    ['backfill', 'dedup', 'index', 'prices', 'records', 'watermarks'],
  );
  assert.deepEqual(state.records, []);
  assert.ok(state.watermarks instanceof Map);
  assert.ok(state.dedup instanceof Map);
  assert.equal(state.index, null);
  assert.equal(state.prices, prices);
  assert.deepEqual(state.backfill, { status: 'idle', total: 0, done: 0 });
});

test('createState instances are isolated from each other', () => {
  const a = createState(null);
  const b = createState(null);
  a.records.push({ time: 1 });
  a.watermarks.set('s', 5);
  a.dedup.set('k', 0);
  a.backfill.done = 1;
  assert.deepEqual(b.records, []);
  assert.equal(b.watermarks.size, 0);
  assert.equal(b.dedup.size, 0);
  assert.deepEqual(b.backfill, { status: 'idle', total: 0, done: 0 });
});
