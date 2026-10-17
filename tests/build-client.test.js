/**
 * Regression coverage for scripts/build-client.js — issue #1, part 1.
 *
 * The emitted `window.__ModuleLoader__.load({ id, ... })` id must equal the
 * *installed package name*: the host resolves each bundle to its nearest
 * package.json and the browser waits for exactly that key. A hardcoded
 * `dsh-plugin-usage` breaks every scoped / aliased / file: install with an
 * opaque "Renderer boot failed for 1 plugin(s)".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildClientBundle,
  renderClientEntry,
  resolveBundleId,
} from '../scripts/build-client.js';

test('resolveBundleId follows the installed package name', () => {
  assert.equal(resolveBundleId({ name: 'dsh-plugin-usage' }), 'dsh-plugin-usage');
  // The exact failure from issue #1: a scoped install.
  assert.equal(resolveBundleId({ name: '@acme/dsh-plugin-usage' }), '@acme/dsh-plugin-usage');
  assert.equal(resolveBundleId({ name: '  dsh-plugin-usage  ' }), 'dsh-plugin-usage');
});

test('resolveBundleId fails closed instead of guessing an id', () => {
  // A guessed id is the exact failure class this derivation removes, so an
  // unnamed manifest must abort the build (PR #2).
  for (const pkg of [{}, { name: '   ' }, { name: 42 }]) {
    assert.throws(() => resolveBundleId(pkg), /Missing "name"/);
  }
  assert.throws(() => resolveBundleId(null), /Missing package\.json/);
});

test('renderClientEntry embeds the derived id in the loader call', () => {
  const bundle = renderClientEntry({
    id: '@acme/dsh-plugin-usage',
    source: 'return { inject: [], apply() {} };',
    out: '/tmp/lib/client/index.js',
    sourcePath: '/tmp/src/client/index.js',
  });

  assert.match(bundle, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(bundle, /id: "@acme\/dsh-plugin-usage",/);
  assert.doesNotMatch(bundle, /id: "dsh-plugin-usage",/);
  // The shared body still lands inside the factory untouched.
  assert.match(bundle, /return \{ inject: \[\], apply\(\) \{\} \};/);
});

test('buildClientBundle emits the package name for every install shape', () => {
  const roots = [];
  try {
    for (const name of ['dsh-plugin-usage', '@acme/dsh-plugin-usage', 'usage-alias']) {
      const root = mkdtempSync(join(tmpdir(), 'dsh-usage-build-'));
      roots.push(root);
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name }));
      mkdirSync(join(root, 'src/client'), { recursive: true });
      writeFileSync(join(root, 'src/client/index.js'), 'return { inject: [], apply() {} };');

      const { id, out, bytes } = buildClientBundle(root);
      const emitted = readFileSync(out, 'utf8');

      assert.equal(id, name);
      assert.ok(bytes > 0);
      assert.ok(emitted.includes('id: ' + JSON.stringify(name) + ','), `bundle for ${name} self-registers under its package name`);
      // The inline sourcemap keeps pointing at the real source file.
      const mapBase64 = emitted.split('//# sourceMappingURL=data:application/json;base64,')[1].trim();
      const map = JSON.parse(Buffer.from(mapBase64, 'base64').toString('utf8'));
      assert.deepEqual(map.sources, [join(root, 'src/client/index.js')]);
    }
  } finally {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  }
});

test('buildClientBundle refuses an unnamed manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-usage-build-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mkdirSync(join(root, 'src/client'), { recursive: true });
    writeFileSync(join(root, 'src/client/index.js'), 'return { inject: [], apply() {} };');
    assert.throws(() => buildClientBundle(root), /Missing "name"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildClientBundle refuses a missing manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-usage-build-'));
  try {
    mkdirSync(join(root, 'src/client'), { recursive: true });
    writeFileSync(join(root, 'src/client/index.js'), 'return { inject: [], apply() {} };');
    assert.throws(() => buildClientBundle(root), /Missing .*package\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildClientBundle refuses to emit without its source', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-usage-build-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dsh-plugin-usage' }));
    assert.throws(() => buildClientBundle(root), /Missing source file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
