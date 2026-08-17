/**
 * P2-12: node:test unit coverage for src/host/fold.js.
 * The fold workstream (dedup by sessionId + turn + step) has landed, so the
 * dedup contract test below is a live contract, not a pending failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldEvent, foldNew } from '../src/host/fold.js';
import { createState } from '../src/host/state.js';

function mkEvent(seq, turn, step, over = {}) {
  return {
    seq,
    time: over.time ?? seq * 1000,
    type: 'assistant/message',
    data: {
      turn,
      step,
      usage: {
        inputTokens: over.input ?? 10,
        outputTokens: over.output ?? 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
      message: { source: { provider: over.provider ?? 'acme', model: over.model ?? 'm' } },
    },
  };
}

function makeState() {
  const st = createState(null);
  const calls = { add: 0, remove: 0 };
  st.index = {
    add: () => { calls.add += 1; },
    remove: () => { calls.remove += 1; },
  };
  return { st, calls };
}

test('foldEvent pushes a normalized record and feeds the index', () => {
  const { st, calls } = makeState();
  const e = mkEvent(1, 3, 2, { input: 100, output: 50, provider: 'p', model: 'm', time: 1000 });
  const rec = foldEvent(st, 's1', e);
  assert.ok(rec);
  assert.equal(st.records.length, 1);
  assert.equal(calls.add, 1);
  assert.equal(rec.session, 's1');
  assert.equal(rec.time, 1000);
  assert.equal(rec.provider, 'p');
  assert.equal(rec.model, 'm');
  assert.equal(rec.turn, 3);
  assert.equal(rec.step, 2);
  assert.equal(rec.inputTokens, 100);
  assert.equal(rec.outputTokens, 50);
  assert.equal(rec.totalTokens, 150);
  assert.equal(st.records[0], rec);
});

test('foldEvent ignores events without assistant/message usage', () => {
  const { st, calls } = makeState();
  assert.equal(foldEvent(st, 's', null), null);
  assert.equal(foldEvent(st, 's', { type: 'user/message', data: {} }), null);
  assert.equal(foldEvent(st, 's', { type: 'assistant/message' }), null);
  assert.equal(foldEvent(st, 's', { type: 'assistant/message', data: { usage: null } }), null);
  assert.equal(st.records.length, 0);
  assert.equal(calls.add, 0);
});

test('foldNew appends seq-progressed events and returns the new watermark', () => {
  const { st, calls } = makeState();
  const events = [
    mkEvent(1, 1, 0),
    mkEvent(2, 1, 1),
    mkEvent(2, 1, 1), // duplicate seq: skipped by the watermark
    mkEvent(4, 2, 0, { input: 99 }),
  ];
  const wm = foldNew(st, 's1', events, 0);
  assert.equal(wm, 4);
  assert.equal(st.records.length, 3); // e2/e3 share (turn=1, step=1): deduped
  assert.equal(calls.add, 4); // 3 pushes + 1 in-place replacement
  assert.equal(calls.remove, 1); // dropped duplicate sample
  assert.deepEqual(st.records.map((r) => r.inputTokens), [10, 10, 99]);
  assert.ok(st.records.every((r) => r.session === 's1'));
  // Stale events at or below an existing watermark are ignored.
  const wm2 = foldNew(st, 's1', [mkEvent(3, 2, 1)], wm);
  assert.equal(wm2, 4);
  assert.equal(st.records.length, 3);
});

test('dedup contract: same (turn, step) replaces in place; later values win; position preserved', () => {
  const { st, calls } = makeState();
  const first = mkEvent(1, 7, 0, { input: 10, output: 1, time: 1000 });
  const second = mkEvent(2, 7, 0, { input: 90, output: 9, time: 2000 });
  foldNew(st, 's1', [first, second], 0);
  assert.equal(st.records.length, 1);
  assert.equal(st.records[0].inputTokens, 90);
  assert.equal(st.records[0].outputTokens, 9);
  assert.equal(st.records[0].time, 2000);
  assert.equal(st.records[0].session, 's1');
  assert.equal(calls.add, 2); // initial insert + replacement
  assert.equal(calls.remove, 1); // dropped sample removed from the index
  assert.equal(st.dedup.get('s1:7:0'), 0); // original array position preserved
  // A different step appends.
  const third = mkEvent(3, 7, 1, { input: 5, output: 5, time: 3000 });
  const wm = foldNew(st, 's1', [third], 2);
  assert.equal(wm, 3);
  assert.equal(st.records.length, 2);
  assert.equal(st.records[1].step, 1);
  assert.equal(st.records[1].inputTokens, 5);
});

test('records without turn/step are never deduped (legacy logs)', () => {
  const { st, calls } = makeState();
  const e1 = mkEvent(1, undefined, undefined, { input: 1 });
  const e2 = mkEvent(2, undefined, undefined, { input: 2 });
  foldNew(st, 's', [e1, e2], 0);
  assert.equal(st.records.length, 2);
  assert.equal(calls.add, 2);
  assert.equal(calls.remove, 0);
});
