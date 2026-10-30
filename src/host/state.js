/**
 * Mutable runtime state capsule for the usage host half.
 *
 * - records: folded usage records, one per billed assistant settlement
 *   (`assistant/message` or `assistant/attempt`) that reported usage. A record
 *   may also carry `tokens: { peak?, off? }` — the same usage split by the price
 *   tier its own timestamp fell into (see fold.js).
 * - watermarks: sessionId -> last folded event seq.
 * - revisions: sessionId -> last persisted revision folded (opaque equality
 *   token from `sessionPersistence.list()`); lets the slow scan skip sessions
 *   whose log did not change.
 * - backfill: progress counters surfaced through query results.
 * - prices: the price store from settings.js.
 * - lastSample: sessionId -> { turn, step, record } — the replacement slot the
 *   official tokenUsage projection keeps, so a later sample for the same
 *   (turn, step) replaces in place and `llm/retry-started` clears it.
 * - route: sessionId -> { provider, model } from the latest request route,
 *   used to attribute settlements that carry no `message.source`
 *   (`assistant/attempt` never does).
 * - index: incremental aggregation index (aggregate.js), kept in sync by
 *   fold.js and consumed by query.js.
 * - peakOf: `(atMs) => boolean` price-tier test, injected by apply(). Absent
 *   means "record flat token fields only", which is what the tests rely on.
 * - matchMap: model key -> reference model id, the user's confirmed matches.
 *   A key that is present overrides the automatic ladder in pricing.js.
 */
export function createState(priceStore) {
  return {
    records: [],
    watermarks: new Map(),
    revisions: new Map(),
    // 启动回填是**按需**触发的：`idle` 一直保持到第一次查询（面板真正要被看）。
    // 这样"缓存加载"这件事发生在用户眼前，而不是在进程启动的头一秒里悄悄做完。
    // `started` 与 `status` 分开：调用方会先把 status 置 running 好让这一帧就带上
    // 加载态，所以不能用 status 当"只跑一次"的守卫。
    backfill: { status: 'idle', total: 0, done: 0, started: false },
    // Last scan pass summary: how long listing took, how much came from the fold
    // cache, how long the whole pass took. Surfaced in the dashboard response —
    // the plugin logger does not reliably reach the host log file on this host.
    lastPass: null,
    prices: priceStore,
    lastSample: new Map(),
    route: new Map(),
    index: null, // wired by apply() after createUsageIndex(state)
    peakOf: null, // wired by apply() once the holiday calendar is known
    matchMap: {},
  };
}
