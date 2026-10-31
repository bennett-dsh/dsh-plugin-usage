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
    ['backfill', 'epochs', 'index', 'lastPass', 'lastSample', 'matchMap', 'peakOf', 'prices', 'records', 'revisions', 'route', 'watermarks'],
  );
  assert.deepEqual(state.records, []);
  assert.ok(state.watermarks instanceof Map);
  assert.ok(state.revisions instanceof Map);
  assert.ok(state.lastSample instanceof Map);
  assert.ok(state.route instanceof Map);
  // Per-session count of folded-record changes: the fold cache compares it with
  // what it last wrote, so a pass that only saw non-usage events writes nothing.
  assert.ok(state.epochs instanceof Map);
  assert.equal(state.index, null);
  // Injected by apply(): the price-tier test and the user's confirmed matches.
  // Both default to "not wired", which is the behaviour the fold tests rely on.
  assert.equal(state.peakOf, null);
  assert.deepEqual(state.matchMap, {});
  assert.equal(state.prices, prices);
  // `started` is the lazy-start latch (see startBackfillOnDemand): the pass runs
  // on the first query, not at activation, so the cache-loading window is the
  // one the user can actually see.
  assert.deepEqual(state.backfill, { status: 'idle', total: 0, done: 0, started: false });
});

test('createState instances are isolated from each other', () => {
  const a = createState(null);
  const b = createState(null);
  a.records.push({ time: 1 });
  a.watermarks.set('s', 5);
  a.revisions.set('s', 'rev-1');
  a.lastSample.set('s', { turn: 1, step: 0, record: {} });
  a.route.set('s', { provider: 'p', model: 'm' });
  a.backfill.done = 1;
  assert.deepEqual(b.records, []);
  assert.equal(b.watermarks.size, 0);
  assert.equal(b.revisions.size, 0);
  assert.equal(b.lastSample.size, 0);
  assert.equal(b.route.size, 0);
  assert.deepEqual(b.backfill, { status: 'idle', total: 0, done: 0, started: false });
});
