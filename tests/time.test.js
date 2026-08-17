/**
 * P2-12: node:test unit coverage for src/host/time.js.
 * TZ is pinned to UTC after import so the fixed timestamps below yield
 * deterministic absolute calendar values on every platform.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  MAX_BUCKETS,
  alignBlock,
  alignFloor,
  bucketKeyFor,
  dayIndex,
  dayKey,
  stepDayKey,
  stepMs,
} from '../src/host/time.js';

process.env.TZ = 'UTC';

const T1 = Date.UTC(2025, 0, 7, 13, 45, 30, 123);

test('dayKey returns the local YYYY-MM-DD calendar day', () => {
  assert.equal(dayKey(T1), '2025-01-07');
  assert.equal(dayKey(Date.UTC(2025, 11, 31, 23, 59, 59)), '2025-12-31');
  assert.equal(dayKey(Date.UTC(2025, 0, 1, 0, 0, 0)), '2025-01-01');
});

test('bucketKeyFor hour/minute encode local YYYY-MM-DD HH:MM', () => {
  assert.equal(bucketKeyFor(T1, 'hour', 1), '2025-01-07 13:00');
  assert.equal(bucketKeyFor(T1, 'minute', 1), '2025-01-07 13:45');
  const t = Date.UTC(2025, 10, 3, 7, 5, 59);
  assert.equal(bucketKeyFor(t, 'hour', 1), '2025-11-03 07:00');
  assert.equal(bucketKeyFor(t, 'minute', 1), '2025-11-03 07:05');
});

test('bucketKeyFor day with stepDays=1 matches the UTC calendar day', () => {
  assert.equal(bucketKeyFor(T1, 'day', 1), '2025-01-07');
  assert.equal(bucketKeyFor(Date.UTC(2025, 5, 15, 23, 59, 59), 'day', 1), '2025-06-15');
});

test('bucketKeyFor day with stepDays>1 anchors blocks on epoch-aligned UTC days', () => {
  const block = Math.floor(dayIndex(T1) / 2) * 2;
  const expected = new Date(block * DAY_MS).toISOString().slice(0, 10);
  assert.equal(bucketKeyFor(T1, 'day', 2), expected);
  // Instants in the same 2-day block share a key; the next block differs.
  // T2 = 2025-01-08 has an even day index, so T2 and T2+1d land in one block.
  const T2 = Date.UTC(2025, 0, 8, 13, 45, 0);
  assert.equal(bucketKeyFor(T2, 'day', 2), bucketKeyFor(T2 + DAY_MS, 'day', 2));
  assert.notEqual(bucketKeyFor(T2, 'day', 2), bucketKeyFor(T2 + 2 * DAY_MS, 'day', 2));
});

test('stepDayKey range-anchors day blocks at the range first day', () => {
  const dayStart = alignFloor(Date.UTC(2025, 0, 1, 0, 0, 0), 'day');
  assert.equal(stepDayKey({ time: dayStart }, dayStart, 5), '2025-01-01');
  assert.equal(stepDayKey({ time: dayStart + 5 * DAY_MS }, dayStart, 5), '2025-01-06');
  assert.equal(stepDayKey({ time: dayStart + 9 * DAY_MS }, dayStart, 5), '2025-01-06');
  assert.equal(stepDayKey({ time: dayStart + 10 * DAY_MS }, dayStart, 5), '2025-01-11');
  // Sub-day offsets never leave their block: blocks are range-anchored, not epoch-anchored.
  assert.equal(stepDayKey({ time: dayStart + 12 * 3600000 }, dayStart, 5), '2025-01-01');
  assert.equal(stepDayKey({ time: dayStart + 3 * DAY_MS + 12 * 3600000 }, dayStart, 5), '2025-01-01');
  assert.equal(stepDayKey({ time: dayStart + 5 * DAY_MS + 12 * 3600000 }, dayStart, 5), '2025-01-06');
  // Instants before the range start anchor to earlier blocks.
  assert.equal(stepDayKey({ time: dayStart - DAY_MS }, dayStart, 5), '2024-12-27');
});

test('alignFloor floors to day/hour/minute boundaries', () => {
  assert.equal(alignFloor(T1, 'day'), Date.UTC(2025, 0, 7, 0, 0, 0, 0));
  assert.equal(alignFloor(T1, 'hour'), Date.UTC(2025, 0, 7, 13, 0, 0, 0));
  assert.equal(alignFloor(T1, 'minute'), Date.UTC(2025, 0, 7, 13, 45, 0, 0));
  assert.ok(alignFloor(T1, 'minute') <= T1);
  assert.ok(alignFloor(T1, 'minute') + 60000 > T1);
});

test('dayIndex maps a local calendar day to a UTC-day ordinal', () => {
  const d = new Date(T1);
  const expected = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  assert.equal(dayIndex(T1), expected);
  assert.equal(dayIndex(T1), dayIndex(T1 + 1000)); // same local calendar day
  assert.equal(dayIndex(T1) + 1, dayIndex(Date.UTC(2025, 0, 8, 1, 0, 0))); // next calendar day
});

test('stepDays=1 day buckets stay consistent with dayKey and alignBlock', () => {
  // With TZ=UTC, a stepDays=1 day bucket equals the local calendar day.
  assert.equal(bucketKeyFor(T1, 'day', 1), dayKey(T1));
  assert.equal(alignBlock(T1, 1), alignFloor(T1, 'day'));
  assert.equal(dayKey(alignBlock(T1, 1)), bucketKeyFor(T1, 'day', 1));
});

test('module constants are stable', () => {
  assert.equal(DAY_MS, 86400000);
  assert.equal(stepMs('day'), 86400000);
  assert.equal(stepMs('hour'), 3600000);
  assert.equal(stepMs('minute'), 60000);
  assert.equal(MAX_BUCKETS, 2000);
});
