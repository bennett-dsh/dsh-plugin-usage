/**
 * Wiring gates (source-level, not behavioural): they assert that two places stay
 * connected to the same single source, because the failure mode is "both sides
 * look right on their own".
 *
 * The summary-card slot table is the single source of "how many cards".
 *
 * The loading skeleton used to hard-code five placeholders while the real card
 * row had six (「模型占比」 was added later), so the skeleton was one card short
 * and the row re-flowed the moment data arrived. Pinning both sides to the same
 * key list is what makes that impossible to repeat — and asserting it here is
 * what catches an edit that only touches one side.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const src = readFileSync(join(root, 'src/client/index.js'), 'utf8').replace(/\r\n/g, '\n')

test('the skeleton renders one placeholder per real summary card', () => {
  const slots = /const SUMMARY_CARD_SLOTS = \[([^\]]+)\]/.exec(src)
  assert.ok(slots, 'SUMMARY_CARD_SLOTS must exist — it is how the skeleton knows the card count')
  const slotKeys = [...slots[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])

  // The real card list: the `cards` array inside SummaryCards, one `key: 'x'` each.
  const body = src.slice(src.indexOf('function SummaryCards'), src.indexOf('function SummaryCards') + 4000)
  const cardsBlock = /const cards = \[([\s\S]*?)\n  \]/.exec(body)
  assert.ok(cardsBlock, 'SummaryCards must build its cards from a `cards` array')
  const cardKeys = [...cardsBlock[1].matchAll(/key: '([a-zA-Z]+)'/g)].map((m) => m[1])

  assert.deepEqual(slotKeys, cardKeys,
    'SUMMARY_CARD_SLOTS must list exactly the cards SummaryCards renders, in the same order');
  assert.equal(slotKeys.length, 6, 'the dashboard shows six summary cards today');

  // And the skeleton must derive from it rather than count by hand: an index
  // range like `[0, 1, 2, 3, 4]` is exactly the shape that drifted.
  const from = src.indexOf('function LoadingState')
  assert.ok(from >= 0, 'LoadingState must still exist')
  const skeleton = src.slice(from, from + 1600)
  assert.ok(/SUMMARY_CARD_SLOTS\.map/.test(skeleton),
    'the skeleton must map SUMMARY_CARD_SLOTS instead of hard-coding a count')
  assert.ok(!/\[0,\s*1,\s*2,\s*3,\s*4\]\.map/.test(skeleton),
    'a hard-coded index range is the bug this gate exists for')
});

test('an unfinished computation is a loading state, never partial data', () => {
  // The cold-start case: DSH has just booted and the host is still folding history.
  // Two failures this pins down:
  //  - 「暂无数据」 there says "you have no usage" while the numbers are being computed;
  //  - rendering the partial rows says "this is your total" and then climbs — the
  //    "numbers creep up for 30 seconds" complaint.
  // So: from boot until the host reports done, the panel is a loading state.
  const dash = src.slice(src.indexOf('const busy = status ==='), src.indexOf('const busy = status ===') + 900)
  assert.ok(/const computing = Boolean\(backfill && backfill\.status === 'running'\)/.test(dash),
    'the dashboard must derive `computing` from the host backfill status')

  const renderStart = src.indexOf('(!ready || computing) && !isError')
  assert.ok(renderStart > 0, 'the skeleton must cover the whole computation, not just the empty case')
  const render = src.slice(renderStart, renderStart + 1400)
  assert.ok(/isEmpty && !computing/.test(render),
    'the empty state must not render while the computation is unfinished')
  assert.ok(/!isEmpty && !computing/.test(render),
    'the data block must not render while the computation is unfinished (no climbing half-answers)')

  // A determinate bar while we know the denominator; the sweep only when we do not.
  assert.ok(/data-determinate/.test(src), 'the progress bar must support a determinate mode')
  assert.ok(/computeDone/.test(src) && /computeTotal/.test(src),
    'the determinate width must come from the host done/total counts')
});

test('every chart hover card shows the reference cost from the same row data', () => {
  // Three tips exist — trend bar, trend line, yearly heatmap — and they used to
  // repeat their markup three times, so a field added to one was missing from the
  // others. They now share TipRows; this pins that, and pins that the cost comes
  // from the row's own `cost` (host-computed, already in the display currency)
  // rather than being recomputed from tokens on the client.
  const rows = /function TipRows\(props\) \{([\s\S]*?)\n\}/.exec(src)
  assert.ok(rows, 'TipRows must exist — it is the shared tip content')
  assert.ok(/t\('cost'\)/.test(rows[1]), 'the shared tip must label the cost row')
  assert.ok(/formatCost\(row\.cost \|\| 0, currency\)/.test(rows[1]),
    'the tip cost must be the host bucket cost, not a second calculation')

  // All three sites go through it.
  const sites = src.match(/h\(TipRows, \{[^}]*\}\)/g) || []
  assert.equal(sites.length, 3, `expected three TipRows call sites, found ${sites.length}`)
  assert.ok(!/tsd-tooltip-date[\s\S]{0,600}?formatInt\(totOf\(tip\.row\)\)/.test(src),
    'the trend tips must not keep their own inline rows')

  // The currency reaches both cards from the dashboard (one symbol for the page).
  assert.ok(/h\(DailyChart, \{[^}]*currency: currencySymbol/s.test(src),
    'DailyChart must receive the display currency')
  assert.ok(/h\(HeatmapCard, \{[^}]*currency: currencySymbol/s.test(src),
    'HeatmapCard must receive the display currency')

  // Screen readers get the same information: the aria label and the native title
  // carry the cost too, or the card says more than the label does.
  for (const key of ['barAria', 'hmTitle']) {
    const zh = new RegExp(`${key}: '[^']*\{cost\}`).test(src)
    const en = (src.match(new RegExp(`${key}: '[^']*\{cost\}`, 'g')) || []).length >= 2
    assert.ok(zh && en, `${key} must mention {cost} in both locales`)
  }
});

test('only rows that correspond to a legend item carry a colour swatch', () => {
  // The dot answers "which colour in the legend is this row". 输入/输出 are in the
  // chart legend and 总 Token is the cell colour, so they get one; 参考成本 and
  // 调用次数 have no legend entry, so they get a blank 10px spacer for alignment
  // and no colour. Painting them was the bug this pins.
  const rows = /function TipRows\(props\) \{([\s\S]*?)\n\}/.exec(src)
  assert.ok(rows, 'TipRows must exist')
  const body = rows[1]

  const costRow = /key: 'cost'([\s\S]*?)\)\),/.exec(body)
  assert.ok(costRow, 'the cost row must exist')
  assert.ok(!/tsd-legend-cost|background/.test(costRow[1]),
    'the cost row must not paint a swatch')

  const callsRow = /key: 'calls'([\s\S]*?)\)\,/.exec(body)
  assert.ok(callsRow, 'the calls row must exist')
  assert.ok(!/background/.test(callsRow[1]), 'the calls row must not paint a swatch')

  // The spacer class itself has no background: that is what keeps alignment
  // without a colour, so it must stay colourless in the stylesheet.
  const dotCss = /\.tsd-tooltip-dot \{([\s\S]*?)\n\}/.exec(src)
  assert.ok(dotCss, '.tsd-tooltip-dot must exist')
  assert.ok(!/background/.test(dotCss[1]), '.tsd-tooltip-dot must not set a background')

  // And nothing references the removed colour class any more.
  assert.ok(!/tsd-legend-cost/.test(src), 'tsd-legend-cost was only used by the removed swatch')
});
