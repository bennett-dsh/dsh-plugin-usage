/**
 * Regression coverage for the composer-dock cost pill (P3, DSH 0.2.1).
 *
 * 0.2.1-rc.1 split the input-area statistics extension into two dock entries
 * (`activity`, `usage`) under `conversation.composer.dock`; plugins that
 * overrode the old `stats` row must re-register. The pill is the only contract
 * this repo shares with that slot, and it fails silently when wrong (no entry,
 * no error), so pin it here.
 *
 * The slot is owned by `@deepseek-ai/dsh-client-ui-conversation`, and a static
 * bundle only receives the client modules named in `dsh.client.inject`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientSource = readFileSync(join(root, 'src/client/index.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('the dock pill registers into conversation.composer.dock after the host rows', () => {
  assert.match(clientSource, /slots\.inject\('conversation\.composer\.dock'/);
  assert.match(clientSource, /name: 'conversation\.composer\.dock', id: 'usage-cost', order: 2/);
});

test('the legacy stats row id is not re-registered', () => {
  // 0.2.1 replaced the single `stats` entry; keeping that id would render nothing.
  assert.doesNotMatch(clientSource, /id: 'stats'/);
});

test('the bundle is allowed to see the slot owner module', () => {
  assert.ok(
    pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'),
    'dsh.client.inject must name @deepseek-ai/dsh-client-ui-conversation',
  );
});

test('the pill takes its symbol from the host-resolved currency', () => {
  // The host resolves the display currency per request and returns
  // `{ code, symbol }`; rendering a hardcoded symbol would print ¥ in a USD view.
  const pill = clientSource.slice(clientSource.indexOf('function CostPill'));
  const body = pill.slice(0, pill.indexOf('/* ---'));
  assert.match(body, /r\.currency && r\.currency\.symbol/);
  assert.match(body, /state\.symbol \+ costDigits\(state\.cost\)/);
});
