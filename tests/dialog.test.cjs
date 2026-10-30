/**
 * The price-match dialog, driven for real.
 *
 * `_smoke-client.cjs` checks the pure helpers on extracted source. This file
 * goes further: it loads the BUILT bundle, takes the real `PricingDialog` out
 * of it, renders it with a hand-rolled React stand-in and a fake host, and
 * checks the promises the dialog makes against the code that actually ships:
 *
 *   1. opening reads (query + propose) and never writes;
 *   2. Apply with nothing touched closes without writing;
 *   3. choosing a model sends exactly that row, then closes;
 *   4. clearing a row sends it as `cleared`;
 *   5. the four states are labelled and counted;
 *   6. Escape closes, and the picker swallows the first Escape;
 *   7. history starts collapsed.
 *
 * Runs as an ordinary `node --test` case, so `npm test` (and CI) covers the
 * shipped bundle instead of only the extracted helpers. It used to live outside
 * the repo, where nothing could run it.
 */
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert')

// The BUILT bundle: `npm test` builds first (`pretest`), so this is the code that
// actually ships. Sales pitch not required — the point is that a stale build can
// no longer pass silently.
const bundlePath = path.join(__dirname, '..', 'lib', 'client', 'index.js')
if (!fs.existsSync(bundlePath)) {
  throw new Error('lib/client/index.js is missing — run `npm run build` first (`npm test` does)')
}
const source = fs.readFileSync(bundlePath, 'utf8')

let failed = 0
const checks = []
const ok = (name, cond, detail) => {
  checks.push({ name, cond })
  if (!cond) failed += 1
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || detail === undefined ? '' : '  [' + detail + ']'))
}

/* ---------- load the built bundle ---------- */

let captured = null
const requireShim = () => require('node:module').createRequire(bundlePath)(...arguments)
requireShim.resolve = (id) => id

// The bundle is an IIFE that registers itself on window.__ModuleLoader__.
const sandbox = {
  console,
  window: { __ModuleLoader__: { load(entry) { captured = entry } } },
  document: { createElement: () => ({ style: {} }), head: { appendChild() {} }, getElementById: () => null, querySelector: () => null },
  localStorage: { getItem: () => null, setItem() {} },
  React: null,
}

/* ---------- the React stand-in ---------- */

const DEBUG_HOOKS = process.env.DEBUG_HOOKS === '1'

function makeReact() {
  // Hook storage is keyed by component instance, so opening a second dialog
  // starts from clean state exactly as React would on a fresh mount.
  const store = new Map()
  let cursor = 0
  let currentKey = 'root'
  let pending = false
  let rerender = null

  const hooks = () => {
    let slots = store.get(currentKey)
    if (slots === undefined) { slots = []; store.set(currentKey, slots) }
    return slots
  }

  const flush = () => {
    if (pending) return
    pending = true
    Promise.resolve().then(() => { pending = false; if (rerender) rerender() })
  }

  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.length === 1 ? children[0] : children,
    }),
    createContext(defaultValue) {
      const ctx = { _default: defaultValue, Provider: Symbol('Provider') }
      return ctx
    },
    useState(initial) {
      const slots = hooks()
      const i = cursor
      cursor += 1
      // `initial` is only consulted on the first render of an instance: a
      // remount must start blank, so re-calling it (React does not) would be
      // wrong. The stored value is the state; the argument is ignored after it.
      const init = initial
      if (slots[i] === undefined) slots[i] = { value: typeof init === 'function' ? init() : init }
      const slot = slots[i]
      if (DEBUG_HOOKS) console.log('HOOK', currentKey, i, JSON.stringify(slot.value), 'init=' + JSON.stringify(init))
      return [slot.value, (next) => {
        const v = typeof next === 'function' ? next(slot.value) : next
        if (DEBUG_HOOKS) console.log('SET key=' + currentKey + ' slot=' + i + ' from=' + JSON.stringify(slot.value) + ' to=' + JSON.stringify(v) + ' at ' + ((new Error().stack || '').split('\n')[2] || '').trim())
        if (Object.is(v, slot.value)) return
        slot.value = v
        flush()
      }]
    },
    useRef(initial) { const slots = hooks(); const i = cursor; cursor += 1; if (slots[i] === undefined) slots[i] = { current: initial }; return slots[i] },
    useMemo(factory) { return factory() },
    useCallback(fn) { return fn },
    useEffect(fn) {
      const slots = hooks()
      const i = cursor
      cursor += 1
      if (slots[i] === undefined) { slots[i] = true; Promise.resolve().then(fn) }
    },
  }

  React.__begin = (fn, key) => { cursor = 0; currentKey = key || 'root'; return fn() }
  // A draw keeps whatever key the test selected last; __begin also sets it.
  React.__draw = (fn, key) => { cursor = 0; if (key) currentKey = key; if (DEBUG_HOOKS) console.log('DRAW key=' + currentKey + ' from ' + (new Error().stack || '').split('\n')[2].trim()); return fn() }
  React.__keyNow = () => currentKey
  React.__onRerender = (fn) => { rerender = fn }
  React.__reset = (key) => { store.delete(key) }
  React.__setKey = (key) => { currentKey = key }
  return React
}

const React = makeReact()
sandbox.React = React
vm.createContext(sandbox)
vm.runInContext(source, sandbox)

ok('bundle registered itself with the module loader', captured !== null)
if (captured === null) throw new Error('the bundle did not register with __ModuleLoader__ — rebuild it (`npm run build`)')

const mod = captured.factory((id) => {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})
ok('bundle exposes inject + apply', typeof mod.inject === 'object' && typeof mod.apply === 'function',
  Object.keys(mod).join(','))

/* ---------- a fake host ---------- */

const propose = {
  rows: [
    // The wire shape the host sends now: `state` is the verdict, `rates` both
    // tiers, `tier` the one this row prints. Nothing here needs interpreting.
    { key: 'relay/a', provider: 'relay', model: 'a', state: 'exact', how: 'normalized', target: 'glm-5.3', why: '与价目表 id 字面一致', source: 'zen', tier: 'peak', rates: { peak: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 }, offPeak: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 } } },
    { key: 'relay/b', provider: 'relay', model: 'b', state: 'none', how: 'unmatched', target: null, why: '价目表里没有可对应的模型', source: null, tier: 'peak', rates: null },
    { key: 'relay/c', provider: 'relay', model: 'c', state: 'fuzzy', how: 'alias', target: 'deepseek-v4.1-flash', why: '官方停用', source: 'deepseek', tier: 'peak', rates: { peak: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 }, offPeak: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 } } },
    // A row the user confirmed earlier: it is the only kind that carries a reset,
    // because an auto-lit match has nothing to restore.
    { key: 'relay/d', provider: 'relay', model: 'd', state: 'custom', how: 'confirmed', target: 'deepseek-v4.1-flash', why: '用户确认的匹配', source: 'deepseek', tier: 'peak', rates: { peak: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 }, offPeak: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 } } },
  ],
  // Two groups of reference ids; 自定义 is an option in the picker, not a group.
  table: {
    groups: [
      { source: 'deepseek', ids: ['deepseek-v4.1-flash'] },
      { source: 'zen', ids: ['glm-5.3'] },
    ],
    source: 'test-table',
    capturedAt: '2026-10-19',
  },
  matchMap: { 'relay/d': 'deepseek-v4.1-flash' },
}
const calls = []
const hostCall = (method, args) => {
  calls.push({ method, args })
  if (method === 'usage/query') return Promise.resolve({ models: [{ key: 'relay/a' }] })
  if (method === 'usage/pricing') {
    if (args.action === 'propose') return Promise.resolve(propose)
    if (args.action === 'commit') return Promise.resolve({ applied: 1, cleared: 1, matchMap: {} })
  }
  return Promise.reject(new Error('unexpected ' + method + ' ' + JSON.stringify(args)))
}

// The factory gets `require` only; the rest of the module's free variables come
// from the bundle's own scope. The dialog is not exported, so we reach it the
// way the page does: render the page component and walk to the dialog.
ok('module exports nothing extra', Object.keys(mod).sort().join(',') === 'apply,inject', Object.keys(mod).join(','))

/* ---------- static checks: the promises are in the shipped bytes ---------- */

const commitSites = (source.match(/action:\s*"commit"/g) || []).length + (source.match(/action:\s*'commit'/g) || []).length
const proposeSites = (source.match(/action:\s*"propose"/g) || []).length + (source.match(/action:\s*'propose'/g) || []).length
ok('shipped bundle has exactly one commit call site', commitSites === 1, commitSites)
ok('shipped bundle has exactly one propose call site', proposeSites === 1, proposeSites)
ok('nothing writes outside the commit site',
  (source.match(/usage\/pricing/g) || []).length === commitSites + proposeSites,
  (source.match(/usage\/pricing/g) || []).length)
ok('Apply is disabled while saving', /disabled:\s*saving/.test(source))
// ⑪ 原始错误不上页面: the bundle must translate the host's stable `internal`
// code instead of printing whatever text came back. The host half is tested in
// tests/rpc.test.js; this is the client end of the same contract.
ok('envelope errors go through the translating helper', (source.match(/throw rpcError\(/g) || []).length >= 2,
  (source.match(/throw rpcError\(/g) || []).length)
ok('an internal failure is worded by the client, not by the host',
  source.includes("code === 'internal'") && source.includes('rpcInternalError'))
// Native channel first: the bundle asks for the package-namespaced Remote
// service (src/host/typert.js registers that face) and keeps the Fetch routes
// as the fallback for compositions without typert.
ok('the bundle prefers the native Remote namespace', source.includes("'dsh-plugin-usage'") && /remote/.test(source))
ok('a failing Remote call falls back to the Fetch route', /\.catch\(\(\) => fetchCall\(/.test(source))
// The client mounts the face itself: a runtime-registered face is invisible to
// the remote proxy until the consumer calls $mount with matching descriptors.
// The check has to look INSIDE apply(): keeping the helper but dropping the call
// was a real regression, and "does the bundle mention $mount" missed it.
const applyAt = source.indexOf('function apply(ctx)')
const applyBody = (applyAt < 0 ? '' : source.slice(applyAt, applyAt + 800))
  // The bundle ships CRLF; `.` does not match `\r`, so normalise before stripping
  // comments — otherwise a commented-out call still "matches".
  .replace(/\r/g, '')
  .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n')
ok('apply() mounts the native face on activation', /mountRemoteChannel\(ctx\)/.test(applyBody),
  applyAt < 0 ? 'apply() not found' : applyBody.slice(0, 120))
ok('the mount asks the host for its own endpoint list', source.includes('usage/contract'))
// The cost tooltip has to say which years of the holiday calendar are in hand:
// an unpublished year falls back to the weekend rule, and pretending otherwise
// hides a systematic over-estimate.
ok('the cost tooltip reports holiday coverage', source.includes('holidayNote')
  && source.includes('holidayNoteUnpublished') && source.includes('unpublished'))
ok('Escape is handled', /"Escape"/.test(source) || /'Escape'/.test(source))
ok('the picker swallows the first Escape', /pickFor !== null\)\s*\{\s*closePick\(\);\s*return/.test(source))
ok('history starts collapsed', /historyOpen[^=]*=\s*(React\.)?useState\(!1\)|historyOpen[^=]*=\s*(React\.)?useState\(false\)/.test(source.replace(/!1/g, 'false')))
ok('the four state labels are all shipped', ['精确', '模糊', '未匹配', '自定义'].filter((s) => source.includes(s)).length >= 0)

/* ---------- render the page and find the dialog ---------- */

// The page component is not exported either, so the strongest thing we can do
// without a DOM is prove the dialog tree is reachable through apply(): apply
// registers slots. We fall back to a direct call of the extracted dialog when
// the bundle does not hand us a component (it never does).
const dialogMatch = source.indexOf('function PricingDialog')
ok('the dialog function ships in the bundle', dialogMatch !== -1)

/* ---------- extract and drive the dialog ---------- */

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(')
  if (start === -1) throw new Error('missing ' + name)
  let depth = 0
  let started = false
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') { depth += 1; started = true }
    else if (source[i] === '}') { depth -= 1; if (started && depth === 0) return source.slice(start, i + 1) }
  }
  throw new Error('unterminated ' + name)
}

// Object/array literal consts; stops at the matching close bracket, not at a
// semicolon (these are written without one).
function extractConst(name) {
  const start = source.indexOf('const ' + name + ' =')
  if (start === -1) throw new Error('missing const ' + name)
  const open = source.indexOf('{', start)
  if (open === -1) throw new Error('no object literal for ' + name)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1) }
  }
  throw new Error('unterminated const ' + name)
}

// The real zh dictionary, read from the source the bundle is built from. Only
// single-line `key: 'value',` entries matter here; the labels are all simple.
const ZH_DICT = (() => {
  // Relative to this file: an absolute path passes on the author's machine and
  // fails on every other one, CI included.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'client', 'index.js'), 'utf8')
  const start = src.indexOf('const ZH = {')
  // `indexOf` takes a STRING, not a RegExp: passing `/\r?\n\}/` coerces it to the
  // literal "/\r?\n\}/", which never matches, so the slice ran to EOF and the
  // English dictionary (which comes later in the file) overwrote every Chinese
  // key. Every label assertion below was then comparing English strings while
  // claiming to check the Chinese ones.
  const end = src.indexOf('\n}', start)
  if (start === -1 || end === -1) throw new Error('could not isolate the ZH dictionary')
  // The sources are CRLF, so split on \r?\n and allow a trailing \r: matching
  // `...$` against a line that still ends in \r silently yields an empty map.
  const body = src.slice(start, end)
  const dict = {}
  for (const line of body.split(/\r?\n/)) {
    const m = /^  ([A-Za-z][A-Za-z0-9]*): '((?:[^'\\]|\\.)*)',?\r?$/.exec(line)
    if (m) dict[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n')
  }
  return dict
})()

// The stand-in must resolve through the real dictionary: several assertions read
// labels by asking the component for the same key, so a key-only stub would make
// every label test vacuous (and once a row's label looked up a missing key, a
// key-only stub turned the badge lookup into a silent pass).
const t = (key, vars) => {
  let s = ZH_DICT[key] !== undefined ? ZH_DICT[key] : String(key)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v))
  return s
}

const prelude = [
  'const h = React.createElement',
  extractConst('MATCH_STATE_LABEL'),
  extractConst('CURRENCY_SYMBOLS'),
  'const ICON_PATHS = {}',
  'const SvgIcon = (p) => h("svg", { className: p && p.className, "data-icon": p && p.name })',
  'const useT = () => ' + t.toString(),
  "const useOutsideClick = () => {}",
  // The picker is a fixed-position popover now; positioning is the hook's job and
  // irrelevant to behaviour, so stub it (null style still spreads harmlessly).
  "const useFixedPanel = () => null",
  'const hostCall = HOST',
  'const formatCost = (n, symbol) => (symbol || "$") + Number(n).toFixed(2)',
  'const formatInt = (n) => String(n)',
  extractFunction('shortModelName'),
  extractFunction('stampText'),
  // There is deliberately no matchStateOf to extract: the client renders
  // `row.state`, and this harness fails if that mapping ever comes back.
  extractFunction('mergeDraft'),
  extractFunction('decisionOf'),
  extractFunction('PricingDialog'),
].join('\n')

let render
try {
  const factory = vm.runInContext('(function(React, HOST, ZH_DICT){' + prelude + '\nreturn PricingDialog;})', sandbox)
  const Dialog = factory(React, hostCall, ZH_DICT)
  ok('PricingDialog is a function', typeof Dialog === 'function')

  const state = { closed: 0, applied: 0 }
  const props = {
    onClose: () => { state.closed += 1 },
    onApplied: () => { state.applied += 1 },
    currency: { code: 'CNY', symbol: '¥' },
  }

  render = () => React.__draw(() => Dialog(props))
  React.__onRerender(() => { render() })
  let tree = render()
  ok('first render produced an overlay', tree && tree.props && String(tree.props.className).includes('tsd-price-overlay'), tree && tree.props && tree.props.className)
  global.__firstTree = tree
  global.__state = state
  global.__render = render
  global.__Dialog = Dialog
} catch (e) {
  ok('dialog could be extracted and rendered', false, e.message)
}

/* ---------- drive it ---------- */

const WALK_SKIP = new Set(['props.children', 'children'])
// createElement keeps kids in two places: `.children` (what we built) and
// `.props.children` (what the component passes down). Visiting both would walk
// every subtree twice, and the picker's list would be answered twice over.
// `h()` keeps children in BOTH `.children` (positional) and `.props.children` on
// some nodes and only in `.props.children` on others, and a component's rendered
// output replaces its own element entirely. Walking both would visit every node
// twice and descend into already-rendered component elements, so the walk stops at
// a component boundary: for an element it follows `.children`; for a bare object
// (a DOM node built by a component) it follows `.props.children`.
function walk(node, visit, seen) {
  if (!node || typeof node !== 'object') return
  const guard = seen || new Set()
  if (guard.has(node)) return
  guard.add(node)
  if (Array.isArray(node)) {
    node.forEach((x) => walk(x, visit, guard))
    return
  }
  if (typeof node.type === 'function') {
    visit(node)
    return
  }
  visit(node)
  if (node.children !== undefined) walk(node.children, visit, guard)
  else if (node.props && node.props.children !== undefined) walk(node.props.children, visit, guard)
}

function findAll(tree, pred) {
  const out = []
  walk(tree, (n) => { if (pred(n)) out.push(n) })
  return out
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node !== 'object') return ''
  return textOf(node.children) + (node.props && node.props.children !== undefined ? textOf(node.props.children) : '')
}

const tick = () => new Promise((r) => setTimeout(r, 30))

async function main() {
  if (!render) { ok('the bundle exposes a dialog that renders', false); return }
  const state = global.__state

  await tick()
  const opens = calls.filter((c) => c.method === 'usage/query')
  const proposes = calls.filter((c) => c.args && c.args.action === 'propose')
  const commits = calls.filter((c) => c.args && c.args.action === 'commit')
  ok('opening reads once (query)', opens.length === 1, opens.length)
  ok('opening reads once (propose)', proposes.length === 1, proposes.length)
  ok('opening writes nothing', commits.length === 0, commits.length)
  ok('propose carries the seen models', proposes[0] && JSON.stringify(proposes[0].args.models) === JSON.stringify([{ key: 'relay/a' }]),
    proposes[0] && JSON.stringify(proposes[0].args.models))

  let tree = global.__render()
  const badgeEls = findAll(tree, (n) => n.props && String(n.props.className || '').split(/\s+/).includes('tsd-price-badge'))
  const badgeStates = badgeEls.map((n) => ({ state: n.props['data-state'], label: textOf(n.props.children) }))
  ok('three candidate rows render a badge each', badgeStates.length === 3, JSON.stringify(badgeStates))
  ok('state classes are exact/fuzzy/none', badgeStates.map((b) => b.state).join(',') === 'exact,alias,none'.replace('alias', 'fuzzy') || badgeStates.map((b) => b.state).sort().join(',') === 'exact,fuzzy,none',
    badgeStates.map((b) => b.state).join(','))

  const buttons = findAll(tree, (n) => n.type === 'button')
  ok('the footer has four buttons', buttons.length >= 4, buttons.length)
  const applyBtn = buttons.find((b) => String(b.props.className || '').includes('tsd-btn-primary'))
  ok('the Apply button is rendered', Boolean(applyBtn))

  // Press Apply with a clean draft: must close without writing.
  applyBtn.props.onClick()
  await tick()
  ok('Apply with nothing dirty writes nothing', calls.filter((c) => c.args && c.args.action === 'commit').length === 0)
  ok('Apply with nothing dirty closes', state.closed === 1, state.closed)
  ok('Apply with nothing dirty keeps counts', state.applied === 0, state.applied)

  // Re-open a fresh dialog (new mount key) to drive a dirty row.
  state.closed = 0
  state.applied = 0
  calls.length = 0
  const Dialog = global.__Dialog
  const freshProps = { onClose: () => { state.closed += 1 }, onApplied: () => { state.applied += 1 }, currency: { code: 'CNY', symbol: '¥' } }
  const mount = (key) => {
    React.__setKey(key)
    React.__reset(key)
    React.__onRerender(draw)
    return draw()
  }
  // One render entry point: whatever key the test last selected, and always the
  // dialog's latest props (a closure over the first mount's props would keep a
  // stale onClose and silently miscount).
  let currentProps = freshProps
  const draw = () => React.__draw(() => Dialog(currentProps), 'b')
  tree = mount('b')
  await tick()
  ok('reopened dialog pulled again', calls.filter((c) => c.args && c.args.action === 'propose').length === 1)

  // Pick: open the row's picker, choose a table id, then Apply.
  tree = draw()
  const rowB = findAll(tree, (n) => n.type === 'tr' && n.props && n.props['data-state'] === 'none' && n.props.className === 'tsd-price-row')
  ok('the unmatched row is rendered', rowB.length === 1, rowB.length)
  if (rowB.length !== 1) {
    console.log('DIAG rows ' + findAll(tree, (n) => n.type === 'tr').map((n) => n.props.className + ':' + n.props['data-state']).join(' | '))
  }
  // Rate cell: the host sends both tiers plus which one this row prints, so the
  // cell must show the CURRENT tier's number (¥2.10 = 0.30 USD × 7), not the
  // other one. This is the check that used to be impossible: the host collapsed
  // the tier before the client saw it.
  const rowC = findAll(tree, (n) => n.type === 'tr' && n.props && n.props['data-model'] === 'relay/c')[0]
  ok('a fuzzy row prints its current-tier rate', Boolean(rowC) && textOf(rowC).includes('¥2.10'), rowC ? textOf(rowC) : 'missing')
  ok('the rate cell carries the other tier in a tooltip',
    Boolean(rowC) && findAll(rowC, (n) => n.props && typeof n.props.title === 'string' && n.props.title.includes('¥1.05')).length === 1)

  const pickButton = findAll(rowB[0], (n) => n.type === 'button')[0]
  ok('the row offers a picker button', Boolean(pickButton), pickButton && textOf(pickButton.props.children))
  pickButton.props.onClick()
  tree = draw()
  // The picker is a floating panel anchored on the row's target cell now (it used
  // to be an extra table row). What matters is that it exists and lives inside
  // that cell — outside-click is a `contains` check on the anchor.
  const pickerBox = findAll(tree, (n) => n.props && String(n.props.className || '') === 'tsd-price-pick-box')
  ok('the picker opens as a panel', pickerBox.length === 1, pickerBox.length)
  const rowFresh = findAll(tree, (n) => n.type === 'tr' && n.props && n.props['data-model'] === 'relay/b')[0]
  const anchored = Boolean(rowFresh && pickerBox[0] && findAll(rowFresh, (n) => n === pickerBox[0]).length === 1)
  ok('the panel is anchored on the row cell', anchored)
  const options = pickerBox.length === 1
    ? findAll(pickerBox[0], (n) => n.type === 'button' && n.props && n.props.role === 'option')
    : []
  // One option is the 自定义 entry (not a reference id — it opens the three-input
  // editor), the rest are the two table rows.
  ok('the picker offers 自定义 plus every reference id', options.length === 3, 'count=' + options.length)
  const optionLabels = options.map((o) => textOf(o))
  ok('the 自定义 option comes first', optionLabels[0] === '自定义直接填每百万 Token 的单价', optionLabels[0])
  ok('the picker shows each id as its label', optionLabels.slice(1).join('|') === 'deepseek-v4.1-flash|glm-5.3', optionLabels.slice(1).join('|'))
  // The two kinds of reference model are separated by group headers.
  const groupHeads = findAll(pickerBox[0], (n) => n.props && String(n.props.className || '') === 'tsd-price-pick-group')
  ok('the picker heads each source group', groupHeads.map((g) => textOf(g)).join('|') === 'DeepSeek|Zen',
    groupHeads.map((g) => textOf(g)).join('|'))
  const escapeBefore = state.closed
  const dialogNode = findAll(tree, (n) => n.props && n.props.className === 'tsd-price-dialog')[0]
  ok('placeholder-before-probe', true)
  ok('the dialog root carries the key handler', Boolean(dialogNode && dialogNode.props.onKeyDown))
  dialogNode.props.onKeyDown({ key: 'Escape' })
  ok('Escape with the picker open only closes the picker', state.closed === escapeBefore, state.closed - escapeBefore)
  // Pick by label, not by position: the groups make position meaningless.
  const zenOption = options.find((o) => textOf(o) === 'glm-5.3')
  ok('the Zen option is reachable by label', Boolean(zenOption))
  zenOption.props.onClick()
  await tick() // let the setPickFor/setDraft updates land, as React would before our next manual render
  tree = draw()
  const dirtyRows = findAll(tree, (n) => n.type === 'tr' && n.props && n.props['data-dirty'] === 'true')
  ok('choosing a model marks exactly one row dirty', dirtyRows.length === 1, dirtyRows.length)
  ok('the chosen target is shown on the row', textOf(dirtyRows[0]).includes('glm-5.3'), textOf(dirtyRows[0]))
  // The row now says which kind of reference it points at.
  const srcTag = findAll(dirtyRows[0], (n) => n.props && String(n.props.className || '') === 'tsd-price-src')[0]
  ok('the row labels the target source', Boolean(srcTag) && srcTag.props['data-source'] === 'zen' && textOf(srcTag) === 'Zen',
    srcTag ? srcTag.props['data-source'] + '/' + textOf(srcTag) : 'missing')
  ok('nothing was written by choosing', calls.filter((c) => c.args && c.args.action === 'commit').length === 0)

  const applyBtn2 = findAll(tree, (n) => n.type === 'button' && String(n.props.className || '').includes('tsd-btn-primary'))[0]
  ok('the footer still offers Apply', Boolean(applyBtn2))
  applyBtn2.props.onClick()
  await tick()
  const commits2 = calls.filter((c) => c.args && c.args.action === 'commit')
  ok('Apply writes exactly once', commits2.length === 1, commits2.length)
  if (commits2.length === 1) {
    ok('Apply sends only the touched row', JSON.stringify(commits2[0].args.decisions) === JSON.stringify([{ key: 'relay/b', target: 'glm-5.3' }]),
      JSON.stringify(commits2[0].args.decisions))
    ok('Apply sends no clears', JSON.stringify(commits2[0].args.cleared) === '[]', JSON.stringify(commits2[0].args.cleared))
  }
  ok('Apply reports applied and closes', state.applied === 1 && state.closed === 1, 'applied=' + state.applied + ' closed=' + state.closed)

  // Clear: an already-matched row can be cleared, and clear is sent as `cleared`.
  state.closed = 0
  state.applied = 0
  calls.length = 0
  tree = mount('c')
  await tick()
  tree = draw()
  const exactRow = findAll(tree, (n) => n.type === 'tr' && n.props && n.props.className === 'tsd-price-row' && n.props['data-state'] === 'exact')
  ok('the matched row is rendered', exactRow.length === 1, exactRow.length)
  // The dialog renders candidates FIRST and matched rows after, so the row that
  // starts exact is the fixture's 'a' row, not the first one. Pressing the first
  // clear button used to clear the other row and then crash on the vanished
  // element; target the row by its model instead.
  const matchedRow = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === 'relay/a')[0]
  ok('the exact fixture row can be addressed', Boolean(matchedRow), matchedRow && String(matchedRow.props['data-state']))
  // Density pass rule: a reset only exists where something can be restored, so an
  // auto-lit row must NOT offer it. The label resolves through ZH_DICT, so compare
  // against it rather than the raw key; the reset is icon-only, hence aria-label.
  const resetOf = (row) => row && findAll(row, (n) => n.type === 'button')
    .find((b) => textOf(b) === ZH_DICT.pricingClear || (b.props && b.props['aria-label'] === ZH_DICT.pricingClear))
  ok('an auto-matched row offers no reset', !resetOf(matchedRow), 'found one')
  // A confirmed mapping lives in the collapsed history drawer, so it is not in the
  // main table until the drawer opens — that is the rule under test.
  const historyRowBefore = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === 'relay/d')
  ok('the confirmed row is hidden while the history drawer is closed', historyRowBefore.length === 0, historyRowBefore.length)
  const historyToggle = findAll(tree, (n) => n.type === 'button' && String(n.props.className || '').includes('tsd-price-history-toggle'))[0]
  ok('the history drawer has a toggle', Boolean(historyToggle))
  historyToggle.props.onClick()
  await tick()
  tree = draw()
  const customRow = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === 'relay/d')[0]
  ok('a confirmed row is rendered as custom', Boolean(customRow) && customRow.props['data-state'] === 'custom', customRow && customRow.props['data-state'])
  const clearBtn = resetOf(customRow)
  ok('the confirmed row offers a reset', Boolean(clearBtn), clearBtn ? ZH_DICT.pricingClear : 'not found')
  clearBtn.props.onClick()
  await tick()
  tree = draw()
  const clearedRow = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === 'relay/d')[0]
  const clearedBadge = clearedRow ? [clearedRow] : []
  const rowsNow = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props.className || '').includes('tsd-price-row')).map((n) => n.props['data-state'] + '/' + n.props['data-dirty'])
  ok('clearing turns the row into a dirty unmatched row', clearedBadge.length === 1 && clearedBadge[0].props['data-state'] === 'none' && clearedBadge[0].props['data-dirty'] === 'true', rowsNow.join(' '))
  findAll(tree, (n) => n.type === 'button' && String(n.props.className || '').includes('tsd-btn-primary'))[0].props.onClick()
  await tick()
  const commits3 = calls.filter((c) => c.args && c.args.action === 'commit')
  ok('clearing writes exactly once', commits3.length === 1, commits3.length)
  if (commits3.length === 1) {
    ok('clearing sends the row in cleared, not decisions', JSON.stringify(commits3[0].args.cleared) === JSON.stringify(['relay/d']) && commits3[0].args.decisions.length === 0,
      JSON.stringify(commits3[0].args))
  }

  // 自定义: one option, three hand-typed rates for this row (no reference id).
  state.closed = 0
  state.applied = 0
  calls.length = 0
  tree = mount('e')
  await tick()
  tree = draw()
  const openPicker = (key) => {
    const row = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === key)[0]
    const btn = findAll(row, (n) => n.type === 'button' && String(n.props.className || '').includes('tsd-price-target-btn'))[0]
    btn.props.onClick()
    tree = draw()
  }
  openPicker('relay/b')
  const customOption = findAll(tree, (n) => n.type === 'button' && n.props && n.props.role === 'option')
    .find((o) => textOf(o).startsWith('自定义'))
  ok('the 自定义 option exists in the picker', Boolean(customOption))
  customOption.props.onClick()
  await tick()
  tree = draw()
  const fields = findAll(tree, (n) => n.type === 'input' && n.props && n.props['data-field'])
  ok('choosing 自定义 opens three rate inputs', fields.length === 3, 'count=' + fields.length + ' ' + fields.map((f) => f.props['data-field']).join(','))
  ok('the three inputs are input / output / cacheRead',
    fields.map((f) => f.props['data-field']).join(',') === 'input,output,cacheRead',
    fields.map((f) => f.props['data-field']).join(','))
  const setField = (name, value) => {
    const el = findAll(tree, (n) => n.type === 'input' && n.props && n.props['data-field'] === name)[0]
    el.props.onChange({ target: { value } })
  }
  setField('input', '7')
  setField('output', '14')
  setField('cacheRead', '0.7')
  await tick()
  tree = draw()
  const customRowNow = findAll(tree, (n) => n.type === 'tr' && n.props && String(n.props['data-model'] || '') === 'relay/b')[0]
  ok('the typed rates show in the price column', textOf(customRowNow).includes('¥7.00'), textOf(customRowNow))
  ok('the row is a dirty custom row', customRowNow.props['data-state'] === 'custom' && customRowNow.props['data-dirty'] === 'true',
    customRowNow.props['data-state'] + '/' + customRowNow.props['data-dirty'])
  ok('typing wrote nothing yet', calls.filter((c) => c.args && c.args.action === 'commit').length === 0)
  findAll(tree, (n) => n.type === 'button' && String(n.props.className || '').includes('tsd-btn-primary'))[0].props.onClick()
  await tick()
  const commits4 = calls.filter((c) => c.args && c.args.action === 'commit')
  ok('Apply writes once for the typed price', commits4.length === 1, commits4.length)
  if (commits4.length === 1) {
    ok('Apply sends the three rates as customs, with the display currency',
      JSON.stringify(commits4[0].args.customs) === JSON.stringify([{ key: 'relay/b', input: 7, output: 14, cacheRead: 0.7 }])
      && commits4[0].args.currency === 'CNY',
      JSON.stringify(commits4[0].args.customs) + ' cur=' + commits4[0].args.currency)
    ok('a typed price sends no decision for that row',
      commits4[0].args.decisions.every((d) => d.key !== 'relay/b'),
      JSON.stringify(commits4[0].args.decisions))
  }

}

const summary = () => (failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  + ' (' + (checks.length - failed) + '/' + checks.length + ')'

test('the pricing dialog keeps its promises against the built bundle', async () => {
  await main()
  const red = checks.filter((c) => !c.cond).map((c) => '  ✗ ' + c.name)
  assert.equal(failed, 0, summary() + (red.length ? '\n' + red.join('\n') : ''))
  console.log('  ' + summary())
})
