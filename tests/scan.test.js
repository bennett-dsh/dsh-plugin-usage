/**
 * Scan contract tests.
 *
 * Regression coverage for the DSH 0.2.x accessors: the previous implementation
 * used `Session.events` and `sessionPersistence.readFrom()`, neither of which
 * exists in 0.2.0-rc.2 / 0.2.1-rc.2, so both scans silently produced zero
 * records. Live sessions are folded from the `session/event` feed (the poll that
 * read the deprecated `snapshotEvents()` is gone); persisted scans read
 * `snapshot.header.id` + `open(id,'read').read(offset)`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/host/state.js';
import {
  foldLiveEvent,
  readSessionEvents,
  runBackfill,
  scanPersisted,
} from '../src/host/scan.js';

function usageEvent(seq, turn, step, input = 10) {
  return {
    seq,
    time: seq * 1000,
    type: 'assistant/message',
    data: {
      turn,
      step,
      usage: { inputTokens: input, outputTokens: 1 },
      message: { source: { provider: 'p', model: 'm' } },
    },
  };
}

function makeState() {
  const state = createState(null);
  state.index = { add() {}, remove() {} };
  return state;
}

function ctxWith(getter) {
  return { get: (name) => getter(name) };
}

test('a live event folds its settlement and advances the watermark', () => {
  const state = makeState();
  const session = { id: 's1', inheritedEventCount: 0 };
  assert.equal(foldLiveEvent(state, session, usageEvent(0, 1, 0)), true);
  assert.equal(state.records.length, 1);
  assert.equal(state.watermarks.get('s1'), 0);
  // The feed can replay an event (a listener attached late); it must not bill twice.
  assert.equal(foldLiveEvent(state, session, usageEvent(0, 1, 0)), false);
  assert.equal(state.records.length, 1);
});

test('a live event never bills the fork-inherited prefix to the child', () => {
  const state = makeState();
  // A fork child replays seq 0..1 from its parent; only seq 2 is child work.
  const child = { id: 'child', inheritedEventCount: 2 };
  assert.equal(foldLiveEvent(state, child, usageEvent(0, 1, 0)), false);
  assert.equal(foldLiveEvent(state, child, usageEvent(1, 1, 1)), false);
  assert.equal(foldLiveEvent(state, child, usageEvent(2, 1, 2)), true);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].session, 'child');
  assert.equal(state.watermarks.get('child'), 2);
});

test('a malformed session or event is ignored instead of throwing', () => {
  const state = makeState();
  assert.equal(foldLiveEvent(state, null, usageEvent(0, 1, 0)), false);
  assert.equal(foldLiveEvent(state, { id: 's1' }, null), false);
  assert.equal(foldLiveEvent(state, { id: 's1' }, { seq: 'x' }), false);
  assert.equal(state.records.length, 0);
});

test('a persisted log that lags the live feed is resumed, not replayed', async () => {
  // The live feed can run ahead of what is on disk. Re-folding from zero then
  // would duplicate every retried attempt (`llm/retry-started` clears the
  // replacement slot), so the repair path compares the reported count with the
  // highest one this process has seen instead of with the watermark.
  const state = makeState();
  const session = { id: 's1', inheritedEventCount: 0 };
  foldLiveEvent(state, session, usageEvent(0, 1, 0));
  foldLiveEvent(state, session, usageEvent(1, 1, 1));
  let readFrom = null;
  const persistence = {
    list: async () => [{ header: { id: 's1' }, revision: 'r1', eventCount: 1 }],
    open: async () => ({
      inheritedEventCount: 0,
      read: async (from) => { readFrom = from; return { events: [] }; },
      close: async () => {},
    }),
  };
  await scanPersisted(ctxWith((name) => (name === 'sessionPersistence' ? persistence : undefined)), state);
  assert.equal(readFrom, 2, 'the pass resumed at the watermark instead of replaying the log');
  assert.equal(state.records.length, 2);
});

test('a persisted log that really shrank is folded again from the start', async () => {
  const state = makeState();
  state.persistedCounts.set('s1', 5); // this process has seen five events before
  let readFrom = null;
  const persistence = {
    list: async () => [{ header: { id: 's1' }, revision: 'r2', eventCount: 2 }],
    open: async () => ({
      inheritedEventCount: 0,
      read: async (from) => { readFrom = from; return { events: [] }; },
      close: async () => {},
    }),
  };
  await scanPersisted(ctxWith((name) => (name === 'sessionPersistence' ? persistence : undefined)), state);
  assert.equal(readFrom, 0, 'a repaired log is read from the beginning');
  assert.equal(state.watermarks.get('s1'), -1);
});

test('readSessionEvents opens a read handle, reads from the offset, and closes it', async () => {
  const seen = {};
  const persistence = {
    open: async (id, access) => {
      seen.open = [id, access];
      return {
        inheritedEventCount: 0,
        read: async (offset) => {
          seen.read = offset;
          return { events: [usageEvent(offset, 1, 0)] };
        },
        close: async () => {
          seen.closed = true;
        },
      };
    },
  };
  const page = await readSessionEvents(persistence, 's1', 3);
  assert.deepEqual(seen.open, ['s1', 'read']);
  assert.equal(seen.read, 3);
  assert.equal(seen.closed, true);
  assert.equal(page.events.length, 1);
});

test('runBackfill folds persisted sessions with 0.2.x snapshots and stores the revision', async () => {
  const state = makeState();
  const seen = { reads: [] };
  const persistence = {
    list: async () => [{ header: { id: 'persisted-1' }, revision: 'rev-a', eventCount: 2 }],
    open: async () => ({
      inheritedEventCount: 0,
      read: async (offset) => {
        seen.reads.push(offset);
        return { events: [usageEvent(0, 1, 0), usageEvent(1, 1, 1)] };
      },
      close: async () => {},
    }),
  };
  await runBackfill(ctxWith((name) => (name === 'sessionPersistence' ? persistence : undefined)), state, { cache: false });

  assert.equal(state.records.length, 2);
  assert.equal(state.watermarks.get('persisted-1'), 1);
  assert.equal(state.revisions.get('persisted-1'), 'rev-a');
  assert.deepEqual(seen.reads, [0]);
  assert.equal(state.backfill.status, 'done');
  assert.equal(state.backfill.total, 1);
  assert.equal(state.backfill.done, 1);
});

test('an unchanged revision is not re-read on the next pass', async () => {
  const state = makeState();
  let reads = 0;
  const persistence = {
    list: async () => [{ header: { id: 's' }, revision: 'r1' }],
    open: async () => ({
      inheritedEventCount: 0,
      read: async () => {
        reads += 1;
        return { events: [] };
      },
      close: async () => {},
    }),
  };
  const ctx = ctxWith((name) => (name === 'sessionPersistence' ? persistence : undefined));
  await scanPersisted(ctx, state, { cache: false });
  await scanPersisted(ctx, state, { cache: false });
  assert.equal(reads, 1);
});

test('a shrunk log resets the watermark instead of stalling forever', async () => {
  const state = makeState();
  // The shrink is judged against the highest count this process has seen: a log
  // that merely lags the live feed reports a lower count too, and replaying that
  // one from zero would duplicate every retried attempt.
  state.persistedCounts.set('s', 99);
  state.watermarks.set('s', 99);
  const offsets = [];
  const persistence = {
    list: async () => [{ header: { id: 's' }, revision: 'r2', eventCount: 2 }],
    open: async () => ({
      inheritedEventCount: 0,
      read: async (offset) => {
        offsets.push(offset);
        return { events: [usageEvent(0, 1, 0), usageEvent(1, 1, 1)] };
      },
      close: async () => {},
    }),
  };
  await runBackfill(ctxWith((name) => (name === 'sessionPersistence' ? persistence : undefined)), state, { cache: false });
  assert.deepEqual(offsets, [0]);
  assert.equal(state.records.length, 2);
  assert.equal(state.watermarks.get('s'), 1);
});

test('readSessionEvents falls back to a legacy readFrom backend', async () => {
  const persistence = {
    readFrom: async (id, from) => ({ events: [usageEvent(from, 1, 0)] }),
  };
  const page = await readSessionEvents(persistence, 's', 4);
  assert.equal(page.events[0].seq, 4);
});

test('runBackfill reports done when persistence is unavailable', async () => {
  const state = makeState();
  const calls = [];
  await runBackfill(ctxWith(() => undefined), state, { cache: false, onDone: (progress) => calls.push(progress) });
  assert.equal(state.backfill.status, 'done');
  assert.deepEqual(calls, [{ status: 'done', total: 0, done: 0 }]);
});
