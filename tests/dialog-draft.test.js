/**
 * Regression guard for the dialog's draft helpers.
 *
 * `setDraft` used to be the pure merge helper AND, inside `PricingDialog`, the
 * `useState` setter — so `setDraft((prev) => setDraft(prev, ...))` called the
 * setter twice and merged `undefined` into the draft: choosing a reference
 * model for an unpriced row threw `Cannot convert undefined or null to object`
 * and the row never became dirty. The functional check that catches it lives
 * outside this suite (it drives the real component); this one pins the merge
 * contract so the helper keeps its name and its shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8');

/** Extract a top-level `function name(...) { ... }` body by brace matching. */
function extractFunction(name) {
  const start = SOURCE.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  let depth = 0;
  let opened = false;
  for (let i = start; i < SOURCE.length; i += 1) {
    const ch = SOURCE[i];
    if (ch === '{') { depth += 1; opened = true; }
    else if (ch === '}') {
      depth -= 1;
      if (opened && depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

const mergeDraft = new Function(extractFunction('mergeDraft').replace('function mergeDraft(', 'return function mergeDraft('))();

/** Drop line/block comments, so prose about a bug is never read as the bug. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('mergeDraft marks the row dirty and keeps the target', () => {
  const next = mergeDraft({}, 'relay/b', { target: 'glm-5.3', cleared: false, key: 'relay/b' });
  assert.deepEqual(next['relay/b'], { target: 'glm-5.3', cleared: false, dirty: true, key: 'relay/b' });
});

test('mergeDraft records a clear without dropping the key', () => {
  const prev = { 'relay/a': { target: 'glm-5.3', cleared: false, dirty: true, key: 'relay/a' } };
  const next = mergeDraft(prev, 'relay/a', { target: null, cleared: true, key: 'relay/a' });
  assert.deepEqual(next['relay/a'], { target: null, cleared: true, dirty: true, key: 'relay/a' });
});

test('mergeDraft never mutates its input', () => {
  const prev = {};
  mergeDraft(prev, 'relay/b', { target: 'x', cleared: false, key: 'relay/b' });
  assert.deepEqual(prev, {});
});

test('the dialog does not shadow the merge helper with a state setter', () => {
  const dialog = stripComments(extractFunction('PricingDialog'));
  assert.match(dialog, /const \[draft, setDraft\] = React\.useState\(\{\}\)/, 'the draft state keeps its setter name');
  assert.doesNotMatch(dialog, /setDraft\(\(prev\) => setDraft\(prev,/, 'the draft setter must not call itself');
  assert.match(dialog, /mergeDraft\(prev, key,/, 'the setter merges through the pure helper');
  // The comment stripping above is what lets this test read code only; if it
  // ever stops working, the `doesNotMatch` above starts failing for the wrong
  // reason (the explanatory comment quotes the broken call verbatim).
  const raw = extractFunction('PricingDialog');
  assert.match(raw, /setDraft\(\(prev\) => setDraft\(prev,/, 'the comment explaining the bug is still present');
});
