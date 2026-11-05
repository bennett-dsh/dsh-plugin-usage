/**
 * Plugin detail page: the star nudge (`plugins.detail.section`).
 *
 * Contract (DSH 0.2.2-rc.1, `@deepseek-ai/dsh-client-ui-plugin-manager`): the
 * section slot is rendered on EVERY plugin detail page (bundle, row, official
 * item) with `{ subject }`, so an entry must return null for subjects it does
 * not own or it pollutes other plugins' pages. A row page only exists when some
 * plugin registers `plugins.row.config`; registering that here would REPLACE the
 * official configuration form, which is why the star line uses the section slot.
 *
 * The test loads the built bundle (pretest builds it) with a fake module loader,
 * runs the plugin's `apply` with a minimal slot context, then renders the
 * registered entry directly — no DOM required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const bundlePath = join(root, 'lib/client/index.js');

/** Load the emitted bundle the way the browser loader does. */
function loadPlugin() {
  let loaded = null;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(bundlePath, 'utf8'))(window);
  assert.ok(loaded !== null, 'the bundle must call window.__ModuleLoader__.load');
  assert.equal(loaded.id, 'dsh-plugin-usage', 'the loader id equals the package name');
  return loaded.factory(require);
}

function fakeContext(registrations) {
  const slots = {
    inject: (_name, callback) => { callback(); return () => {}; },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  };
  const ctx = {
    get: (key) => (key === 'slots' ? slots : undefined),
    effect: (callback) => { callback(); return () => {}; },
    locale: {
      register: () => () => {},
      bind: () => ((key) => key),
    },
  };
  return ctx;
}

const skip = !existsSync(bundlePath) ? 'lib/client/index.js is not built — run `npm run build` first' : false;

test('the star line registers in plugins.detail.section under its own id', { skip }, () => {
  const registrations = [];
  loadPlugin().apply(fakeContext(registrations));
  const entry = registrations.find((r) => r.options.name === 'plugins.detail.section');
  assert.ok(entry, 'the plugin must register plugins.detail.section');
  assert.equal(entry.options.id, 'usage-star', 'a fresh id (not a shipped one) keeps the cell ours');
  assert.equal(entry.options.locale, 'usage', 'the entry must read the plugin dictionary');
  assert.ok(typeof entry.component === 'function', 'the entry is a component');
  // The market plugin's `dsh-market-source` row (order 90) is the page footer's
  // "查看仓库↗". The star line belongs to the plugin content, so it must sort
  // BEFORE that footer rather than after it.
  assert.equal(entry.options.order, 80, 'the star line renders above the market source footer (order 90)');
  assert.ok(entry.options.order < 90, 'a larger order would push the nudge below the repository footer');
});

test('the section renders only for this package and only as one text line', { skip }, () => {
  const registrations = [];
  loadPlugin().apply(fakeContext(registrations));
  const entry = registrations.find((r) => r.options.name === 'plugins.detail.section');
  const t = (key) => 'T:' + key;
  // The registered entry is a thin wrapper around the component; unwrap it so the
  // assertions describe the element the page actually gets.
  const render = (props) => {
    const wrapper = entry.component(props);
    if (wrapper === null) return null;
    return wrapper.type === 'p' ? wrapper : wrapper.type(wrapper.props);
  };

  const own = render({ subject: { kind: 'bundle', pkg: { name: 'dsh-plugin-usage' } }, t });
  assert.equal(own.type, 'p', 'the nudge is one paragraph, nothing more');
  assert.equal(own.props.className, 'tsd-star-line');
  assert.equal(own.props['data-usage-star'], 'detail');
  assert.equal(own.props.children, 'T:starLine', 'the copy comes from the locale dictionary');
  assert.equal(own.props.href, undefined, 'the line adds no link; the host footer already offers the repository');
  assert.equal(own.props.onClick, undefined);

  // A row subject belongs to the same package, so it renders too.
  assert.ok(render({ subject: { kind: 'row', pkg: { name: 'dsh-plugin-usage' }, row: { rowId: 'usage' } }, t }));
  // Everyone else must be untouched.
  assert.equal(render({ subject: { kind: 'bundle', pkg: { name: 'another-plugin' } }, t }), null);
  assert.equal(render({ subject: { kind: 'item', id: 'official-item' }, t }), null);
  assert.equal(render({ t }), null);
  assert.equal(render({}), null);
});

test('the star line never replaces the official configuration page', { skip }, () => {
  const registrations = [];
  loadPlugin().apply(fakeContext(registrations));
  assert.equal(
    registrations.some((r) => r.options.name === 'plugins.row.config'),
    false,
    'plugins.row.config would replace the auto configuration form; the nudge belongs in the section slot',
  );
});

test('the nudge is a Unicode star in theme colours, not a drawn icon', () => {
  const source = readFileSync(join(root, 'src/client/index.js'), 'utf8');
  assert.match(source, /const DETAIL_PACKAGE = 'dsh-plugin-usage'/);
  assert.match(source, /h\('p', \{ className: 'tsd-star-line'/);
  assert.ok(!/className: 'tsd-star-line'[\s\S]{0,200}h\('svg'/.test(source), 'no hand-drawn star icon');
  const css = /\.tsd-star-line \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(css, '.tsd-star-line must exist in the inline stylesheet');
  assert.match(css[1], /var\(--dsw-/, 'colours must come from theme tokens');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css[1]), 'no hard-coded colour');
});
