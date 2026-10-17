/**
 * The emitted client bundle must self-register under the package name.
 *
 * The host resolves each installed bundle to its nearest package.json and the
 * loader keys factories by that resolved name, so a bundle that registers
 * anything else is never activated: the row waits forever for a factory that
 * arrived under a different key and the renderer only reports
 * "Renderer boot failed for N plugin(s)" — no message, no failing entry.
 *
 * Asserting against this repo's own package name would prove nothing, because
 * the name the id used to be hardcoded to is this repo's name too. The real
 * subject is the rename/scoped/vendored case, so these tests run the actual
 * script against a fixture tree whose package.json says something else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const REGISTER = /__ModuleLoader__\.load\(\{\s*id:\s*("(?:[^"\\]|\\.)*")/;

/**
 * Run the real build script in a throwaway tree that mimics the repo layout,
 * with `pkgJson` as its package.json. Returns { id, error }.
 */
function build(pkgJson) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-usage-build-'));
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'src', 'client'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'build-client.js'), readFileSync(join(root, 'scripts', 'build-client.js')));
    writeFileSync(join(dir, 'src', 'client', 'index.js'), 'return { inject: [], apply() {} };\n');
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson));
    try {
      execFileSync(process.execPath, [join(dir, 'scripts', 'build-client.js')], { stdio: 'pipe' });
    } catch (error) {
      return { error: String((error.stderr ?? '') || error.message) };
    }
    const bundle = readFileSync(join(dir, 'lib', 'client', 'index.js'), 'utf8');
    const match = REGISTER.exec(bundle);
    assert.ok(match, 'bundle must call window.__ModuleLoader__.load({ id, factory })');
    return { id: JSON.parse(match[1]) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a scoped install registers under the scoped package name', () => {
  assert.deepEqual(build({ name: '@acme/dsh-plugin-usage' }), { id: '@acme/dsh-plugin-usage' });
});

test('a plain rename registers under the new name', () => {
  assert.deepEqual(build({ name: 'dsh-plugin-usage-vendored' }), { id: 'dsh-plugin-usage-vendored' });
});

test('a package.json without a name fails the build instead of guessing', () => {
  const { error } = build({});
  assert.match(String(error), /Missing "name"/);
});

test('the built bundle in this repo matches its own package.json', (t) => {
  const built = join(root, 'lib', 'client', 'index.js');
  if (!existsSync(built)) {
    t.skip('lib/client/index.js is not built — run `npm run build` first');
    return;
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const match = REGISTER.exec(readFileSync(built, 'utf8'));
  assert.ok(match, 'bundle must call window.__ModuleLoader__.load({ id, factory })');
  assert.equal(JSON.parse(match[1]), pkg.name);
});
