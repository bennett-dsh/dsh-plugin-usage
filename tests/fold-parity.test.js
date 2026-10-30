/**
 * The fold parity gate.
 *
 * `src/host/fold.js` claims to mirror the official `tokenUsage` session
 * projection, and the dashboard's numbers are only trustworthy if that claim
 * holds. Tests/fixtures/token-usage-parity.json is a recording: the OFFICIAL
 * fold (@deepseek-ai/dsh-token-meter) applied to a fixed event script by
 * `scripts/fold-parity-fixture.mjs`. This test runs the same events through the
 * plugin's fold and demands the same totals — a claim, not a copy.
 *
 * The reference & the plugin's own reasoning both live in the fixture's
 * `$comment`; re-record after a Harness upgrade rather than editing numbers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldEvent } from '../src/host/fold.js';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/token-usage-parity.json', import.meta.url)), 'utf8'),
);

/** The smallest state capsule foldEvent() accepts. */
function freshState() {
  return { records: [], index: null, lastSample: new Map(), route: new Map() };
}

/** Totals of everything the fold billed, in the official projection's shape. */
function totalsOf(records) {
  const sum = (field) => records.reduce((acc, r) => acc + (r[field] || 0), 0);
  return {
    uncachedInputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
  };
}

test('the recorded fixture came from the official projection', () => {
  // Guard against a fixture that was hand-edited or recorded from the plugin
  // itself: the provenance must name the official package and its version.
  assert.equal(fixture.provenance.package, '@deepseek-ai/dsh-token-meter');
  assert.match(fixture.provenance.version, /^\d+\.\d+\.\d+/);
  assert.match(fixture.provenance.projection, /usage-projection/);
  assert.ok(Array.isArray(fixture.events) && fixture.events.length > 8);
  // Recording the plugin's own output would make this gate a tautology: the
  // script that produces it must be the asar reader, not the plugin.
  assert.equal(fixture.provenance.generator, 'scripts/fold-parity-fixture.mjs');
});

test('the plugin fold agrees with the official tokenUsage totals', () => {
  const state = freshState();
  for (const event of fixture.events) foldEvent(state, 'parity-session', event);
  assert.deepEqual(totalsOf(state.records), fixture.expected);
});

test('the fold keeps one row per billed attempt, not one per report', () => {
  // The totals above could match by luck while the rows are wrong. The script
  // reports the same (turn, step) twice (replace) and once more (no-op), so
  // only distinct attempts may survive.
  const state = freshState();
  for (const event of fixture.events) foldEvent(state, 'parity-session', event);
  const attempts = state.records.map((r) => `${r.turn}/${r.step}:${r.inputTokens}`);
  assert.deepEqual(attempts, ['0/0:1200', '1/0:300', '1/0:310', '2/1:50']);
});

test('a replaced settlement keeps its slot and takes the newer figures', () => {
  const state = freshState();
  const first = fixture.events.find((e) => e.seq === 3);
  const second = fixture.events.find((e) => e.seq === 4);
  const same = fixture.events.find((e) => e.seq === 5);
  foldEvent(state, 's', first);
  const row = state.records[0];
  foldEvent(state, 's', second);
  assert.equal(state.records.length, 1, 'a re-report must not append a row');
  assert.equal(state.records[0], row, 'it must reuse the same row object');
  assert.equal(row.inputTokens, 1200);
  foldEvent(state, 's', same);
  assert.equal(state.records.length, 1);
  assert.equal(row.inputTokens, 1200, 'an identical re-report changes nothing');
});

test('a retried attempt bills again instead of replacing', () => {
  const state = freshState();
  for (const event of fixture.events) {
    if (event.seq > 8) break;
    foldEvent(state, 's', event);
  }
  // 0/0 replaced, 1/0 stream attempt, then retry + a second 1/0 settlement.
  assert.deepEqual(state.records.map((r) => `${r.turn}/${r.step}:${r.inputTokens}`), ['0/0:1200', '1/0:300', '1/0:310']);
});
