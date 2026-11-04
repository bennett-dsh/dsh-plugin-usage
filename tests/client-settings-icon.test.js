/**
 * Settings navigation icon coverage (DSH 0.2.2-rc.1 native slot).
 *
 * 0.2.1 and earlier projected `settings.section` as `{id, order, label}` with no
 * icon hook, so this plugin painted its own glyph by marking the rendered row and
 * swapping the shape with a CSS mask. The code carried its own expiry note: once
 * the official slot exists, that workaround must be deleted rather than kept as
 * a parallel path.
 *
 * 0.2.2-rc.1 ships `settings.section.icon` (list / inline / root, declared by
 * `@deepseek-ai/dsh-client-ui-settings-general`). Its contract is stricter than a
 * usual list slot: the registration id must equal the target section id, because
 * the nav renders `renderSlot(..., { only: row.id })` — an unmatched id never
 * renders, with no error. That is exactly the silent failure this file pins.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientSource = readFileSync(join(root, 'src/client/index.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('the nav icon registers into settings.section.icon under the section id', () => {
  assert.match(clientSource, /slots\.inject\('settings\.section\.icon'/);
  // `only: row.id` matches on the registration id, so a mismatch renders nothing.
  assert.match(
    clientSource,
    /name: 'settings\.section\.icon', id: 'token-stats'/,
    'the icon registration id must equal the settings.section id (token-stats)',
  );
  assert.match(
    clientSource,
    /name: 'settings\.section', id: 'token-stats'/,
    'the section id this icon is addressed to must still be token-stats',
  );
});

test('the DOM icon workaround is gone, not left as a second path', () => {
  // Keeping the old hack alongside the native slot would paint two glyphs.
  for (const banned of ['data-tsd-nav', 'installSettingsNavIcon', 'NAV_ICON_MASK', 'NAV_ICON_CSS']) {
    assert.ok(!clientSource.includes(banned), `the 0.2.1 workaround must be deleted (${banned})`);
  }
});

test('the icon is sized by the owner and coloured by the theme', () => {
  const from = clientSource.indexOf('function SettingsNavIcon');
  assert.ok(from >= 0, 'SettingsNavIcon must exist');
  const body = clientSource.slice(from, from + 700);
  assert.match(body, /props\.size/, 'the owner passes {size} and the icon must honour it');
  assert.match(body, /fill: 'currentColor'/, 'the glyph must inherit the nav row colour');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(body), 'no hard-coded colour in the icon');
});

test('the bundle is allowed to see the slot owner module', () => {
  assert.ok(
    pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-general'),
    'dsh.client.inject must name @deepseek-ai/dsh-client-ui-settings-general',
  );
});
