/**
 * P2-12: node:test unit coverage for src/host/aggregate.js
 * against the P1-5 locked contract (add/remove/recordsInRange).
 * The incremental day-slice index has landed; tests cover both the slice
 * bookkeeping and the defensive sweep over state.records.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageIndex } from '../src/host/aggregate.js';
import { DAY_MS } from '../src/host/time.js';

process.env.TZ = 'UTC';

function rec(time, label) {
  return { time, label, inputTokens: 1 };
}

function makeIndex(records = []) {
  return createUsageIndex({ records });
}

test('createUsageIndex exposes the locked contract members', () => {
  const index = makeIndex();
  assert.equal(typeof index.add, 'function');
  assert.equal(typeof index.remove, 'function');
  assert.equal(typeof index.recordsInRange, 'function');
});

test('recordsInRange is inclusive on both boundaries', () => {
  const records = [rec(100, 'a'), rec(200, 'b'), rec(300, 'c')];
  const index = makeIndex(records);
  assert.deepEqual([...index.recordsInRange(100, 300)], records);
  assert.deepEqual([...index.recordsInRange(200, 200)], [records[1]]);
  assert.deepEqual([...index.recordsInRange(101, 299)], [records[1]]);
  assert.deepEqual([...index.recordsInRange(300, 400)], [records[2]]);
  assert.deepEqual([...index.recordsInRange(0, 99)], []);
  assert.deepEqual([...index.recordsInRange(-Infinity, Infinity)], records);
});

test('add() indexes records; size() and recordsInRange reflect them', () => {
  const index = makeIndex([]);
  index.add(rec(100, 'a'));
  index.add(rec(200, 'b'));
  index.add(rec(300, 'c'));
  assert.equal(index.size(), 3);
  assert.deepEqual([...index.recordsInRange(0, Infinity)].map((r) => r.label), ['a', 'b', 'c']);
  assert.deepEqual([...index.recordsInRange(150, 250)].map((r) => r.label), ['b']);
});

test('remove() drops a record from the slices; unknown removes are tolerated', () => {
  const index = makeIndex([]);
  const a = rec(100, 'a');
  const b = rec(200, 'b');
  index.add(a);
  index.add(b);
  index.remove(b);
  assert.equal(index.size(), 1);
  assert.deepEqual([...index.recordsInRange(0, Infinity)].map((r) => r.label), ['a']);
  index.remove(b); // already gone
  index.remove(rec(999, 'zzz')); // never added
  assert.equal(index.size(), 1);
  assert.deepEqual([...index.recordsInRange(0, Infinity)].map((r) => r.label), ['a']);
});

test('records pushed directly on state.records are surfaced by the sweep, exactly once', () => {
  const index = makeIndex([rec(100, 'a'), rec(300, 'c')]);
  index.add(rec(200, 'b')); // only b lives in the slice index
  // Yield order: indexed slices first (b), then un-indexed records in array order (a, c).
  assert.deepEqual([...index.recordsInRange(0, Infinity)].map((r) => r.label), ['b', 'a', 'c']);
});

test('recordsInRange yields day-slices in ascending day order (chronological for fold input)', () => {
  const index = makeIndex([]);
  const t0 = Date.UTC(2025, 0, 1, 12, 0, 0); // distinct UTC days: Jan 1 / 2 / 3
  index.add(rec(t0 + 2 * DAY_MS, 'c'));
  index.add(rec(t0, 'a'));
  index.add(rec(t0 + DAY_MS, 'b'));
  // Day ordinals ascend by time regardless of insertion order.
  assert.deepEqual([...index.recordsInRange(0, Infinity)].map((r) => r.label), ['a', 'b', 'c']);
});

test('recordsInRange is a streaming generator, not a materialized array', () => {
  const index = makeIndex([rec(100, 'a')]);
  const it = index.recordsInRange(0, Infinity);
  assert.equal(typeof it[Symbol.iterator], 'function');
  assert.equal(typeof it.next, 'function');
});