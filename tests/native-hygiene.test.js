/**
 * Native-hygiene gates (mostly source-level by design — they police *shape*, not
 * behaviour: which renderer owns a verdict, where disk writes may live, which
 * namespace the settings line targets). A behavioural test cannot catch "the
 * client re-derives what the host decided", because both halves pass on their own.
 *
 * Native-hygiene gates: the four habits that keep this plugin honest about what
 * it borrows from the harness and what it decides for itself.
 *
 * Every case here pins a lesson that was paid for once:
 *  - the baseline version must be declared (exp-version: one place, never a
 *    range wider than what was verified);
 *  - the client renders the host's verdict instead of re-deriving it (today's
 *    bug: the table said 未定价 for a model the user had priced at 0);
 *  - disk writes live only in the cache module and the one diagnostics line
 *    (第〇条 3: no new bypass without a documented counter-proof);
 *  - the settings namespace equals the patch row id (a mismatch silently
 *    writes to a namespace nobody reads).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')

const pkg = JSON.parse(read('package.json'))

/** Compare two `x.y.z(-tag.n)` versions; prerelease sorts below the release. */
function cmpVersion(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).split('-')
    return { nums: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
  }
  const A = parse(a)
  const B = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const x = A.nums[i] || 0
    const y = B.nums[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  if (A.pre.length === 0 && B.pre.length === 0) return 0
  if (A.pre.length === 0) return 1
  if (B.pre.length === 0) return -1
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i += 1) {
    const x = A.pre[i]
    const y = B.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x)
    const ny = Number(y)
    const numeric = Number.isFinite(nx) && Number.isFinite(ny)
    if (numeric ? nx !== ny : x !== y) return (numeric ? nx < ny : x < y) ? -1 : 1
  }
  return 0
}

test('the manifest declares the harness build this plugin was verified against', () => {
  const declared = pkg.dsh && pkg.dsh.verifiedAgainst
  assert.equal(typeof declared, 'string', 'package.json dsh.verifiedAgainst must name a build');
  assert.match(declared, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'verifiedAgainst is one concrete version, not a range');
  // The baseline has to be *inside* the declared support range. It may be newer
  // than the floor (a build verified later must not narrow who can install), but
  // it must never fall outside — that would be advertising a build we never ran.
  const range = String(pkg.engines && pkg.engines.dsh)
  const m = /^>=(\S+)\s+<(\S+)$/.exec(range)
  assert.ok(m, `engines.dsh must stay a simple lower/upper range, got ${range}`);
  assert.ok(cmpVersion(declared, m[1]) >= 0, `verifiedAgainst ${declared} is below the floor ${m[1]}`);
  assert.ok(cmpVersion(declared, m[2]) < 0, `verifiedAgainst ${declared} is outside the ceiling ${m[2]}`);
});

test('the model table renders the host verdict instead of re-deriving it', () => {
  const src = read('src/client/index.js');
  assert.ok(
    src.includes('unpriced: r.unpriced === true'),
    'ModelTable must take `unpriced` from the host response',
  );
  // The re-derivation that caused the 未定价 regression: cost 0 + tokens > 0 was
  // treated as "no price", so a user-priced zero row could never show ¥0.00.
  for (const banned of ['!(r.cost > 0)', '!(s.cost > 0)', 's.tokens > 0 &&']) {
    assert.ok(!src.includes(banned), `client must not re-derive a cost verdict (${banned})`);
  }
});

test('disk writes stay in the cache module and the one diagnostics line', () => {
  const hostDir = join(root, 'src/host');
  const offenders = [];
  for (const name of readdirSync(hostDir)) {
    if (!name.endsWith('.js')) continue;
    const src = readFileSync(join(hostDir, name), 'utf8');
    const writes = src.match(/writeFileSync|appendFileSync|createWriteStream|mkdirSync|renameSync/g) || [];
    if (writes.length === 0) continue;
    offenders.push(`${name}: ${writes.join(', ')}`);
  }
  assert.deepEqual(offenders, [], 'a new disk write needs its own counter-proof in docs/native-transport.md §3');
});

test('the settings namespace is the patch row id', () => {
  const patch = read('cordis.patch.yml');
  const ids = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.ok(ids.includes('usage'), 'cordis.patch.yml must declare the usage row explicitly');
  const host = read('src/host/index.js');
  const namespaces = [...host.matchAll(/settings\.update\(\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(namespaces.length > 0, 'the plugin persists through settings.update');
  for (const ns of namespaces) assert.equal(ns, 'usage', 'settings.update must target the row id from the patch');
});
