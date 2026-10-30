/**
 * usage — Token usage statistics host half (entry module).
 *
 * Wires the submodules (fold / scan / query / settings / pricing / aggregate /
 * rpc / typert) into the cordis plugin lifecycle. Strategy notes:
 *  - DSH persists every loop model call's token usage in each session log as
 *    an `assistant/message` (or `assistant/attempt`) settlement carrying
 *    `usage`; this plugin folds those events with the same replacement /
 *    retry semantics as the official `tokenUsage` projection instead of
 *    tapping `llm/stream` (unreachable from an agent-scoped dynamic plugin).
 *  - Live sessions are scanned from the in-memory store every poll tick;
 *    persisted sessions are backfilled at startup and re-scanned incrementally
 *    (watermark + revision per session).
 *  - The fold also splits each settlement by the price tier its own timestamp
 *    fell into, because DeepSeek bills peak and off-peak separately and one
 *    model can mix both inside a day.
 *  - Aggregation and the model list are served through src/host/rpc.js; prices
 *    come from the generated reference table (prices.js) unless the user has
 *    entered their own.
 *
 * The price table is the plugin's own config: the exported `Config` schema is
 * the official, durable form surface (`Plugins` settings tab -> profile
 * patch), replacing the 0.1.x `settings.register`/`settings.yaml` path that
 * does not exist in DSH 0.2.x.
 *
 * The same entry doubles as the cordis.yml host plugin module (exports name /
 * inject / Config / apply) and as the `code.host` function body for a dynamic
 * plugin.
 */
import Schema from '@deepseek-ai/schemastery';

import { DEFAULT_CURRENCY, configPrices, createPriceStore, currencyOf, normalizePrices } from './settings.js';
import { createState } from './state.js';
import { createUsageIndex } from './aggregate.js';
import { scanLive, scanPersisted, startBackfillOnDemand } from './scan.js';
import { query } from './query.js';
import { registerRPC, logSink } from './rpc.js';
import { USAGE_SERVICE } from './typert.js';
import { priceRow, referenceGroups, referenceTable } from './pricing.js';
import { isPeak } from './peak.js';

export const name = 'usage-host';
export const inject = ['timer'];

/**
 * Durable overrides + currency + the user's confirmed model matches,
 * materialized as the plugin's config form.
 *
 * `prices` defaults to EMPTY on purpose: every price the reference table can
 * answer must come from the table (see settings.js). A row here is an override
 * for an id only the user knows, and the ladder consults it first.
 *
 * `matchMap` is deliberately a free-form `dict(string)`: it maps a model key
 * exactly as a session log recorded it (`provider/model`, including a `/` inside
 * the model id) to a reference-table id. A plain dict rather than a structured
 * object because the keys are user data, and a schema that rejected an
 * unexpected shape would silently drop confirmed matches on save.
 */
export const Config = Schema.object({
  // ⚠️ Every field this plugin writes back must be `.volatile()`. The official
  // settings service refuses anything else:
  //   dsh-settings/lib/index.js `write()`: `volatileForm(schema)` is undefined
  //   when no field is volatile, and it throws `has no volatile fields`;
  //   `validatePaths` then rejects any non-volatile key in the patch.
  // Without these markers `settings.update('usage', …)` threw on every write,
  // and the old `.catch(() => {})` hid it — so confirmed matches, custom prices
  // and the currency were lost at every restart.
  currency: Schema.string().default(DEFAULT_CURRENCY).volatile().description({
    zh: '参考成本卡片与单价使用的币种（固定汇率 1 USD = 7 CNY）',
    en: 'Currency for the reference-cost card and rates (fixed rate: 1 USD = 7 CNY)',
  }),
  prices: Schema.dict(Schema.object({
    inputPerM: Schema.number().default(0),
    outputPerM: Schema.number().default(0),
    cacheReadPerM: Schema.number().default(0),
    cacheWritePerM: Schema.number().default(0),
  })).default({}).volatile().description({
    zh: '自定义参考定价：模型 id → 每百万 token 的输入/输出/缓存读/缓存写价，单位美元（界面里按币种换算显示）',
    en: 'Custom reference prices: model id → input/output/cache-read/cache-write per million tokens, in USD (the UI converts for display)',
  }),
  matchMap: Schema.dict(Schema.string()).default({}).volatile().description({
    zh: '已确认的模型匹配：模型 id → 参考模型 id（在「定价匹配」里点确定时写入）',
    en: 'Confirmed model matches: model id → reference model id (written when you confirm in the pricing dialog)',
  }),
});

const LIVE_POLL_MS = 2000;
const PERSISTED_POLL_MS = 30000;

/**
 * Whether an instant bills at DeepSeek's peak rate.
 *
 * Wired into the state capsule rather than imported by fold.js so the fold stays
 * a pure function of its arguments: tests pass their own predicate and never
 * depend on today's calendar. Exported so a test can pin the wiring itself —
 * the fold used to call `isPeak()` bare, which billed every public holiday at
 * the peak rate while the price display showed it as off-peak.
 *
 * @param {number} atMs - epoch milliseconds.
 * @returns {boolean} true inside a Beijing peak window on a non-holiday weekday.
 */
export function peakAt(atMs) {
  return isPeak(atMs);
}

/**
 * Validate one `pricing` commit row.
 *
 * Nothing reaches the persisted config unless it passes: a bad id here becomes a
 * silent zero cost later, which is the failure mode this whole rebuild exists to
 * remove.
 *
 * @param {unknown} decision - `{ key, target }` from the dialog.
 * @returns {{ ok: true, key: string, target: string } | { ok: false, key: string, why: string }} verdict.
 */
function checkDecision(decision) {
  const key = decision && typeof decision.key === 'string' ? decision.key : '';
  if (key === '') return { ok: false, key, why: '缺少模型 key' };
  const target = decision.target;
  if (typeof target !== 'string' || target.trim() === '') {
    return { ok: false, key, why: '目标必须是一个参考模型 id' };
  }
  if (referenceTable().models[target] === undefined) {
    return { ok: false, key, why: '参考模型不在当前价目表中：' + target };
  }
  return { ok: true, key, target };
}

/**
 * Validate one hand-typed reference price.
 *
 * This is the dialog's 自定义 option: not a reference model but three rates the
 * user enters, stored as a `prices` row for that model key. Values arrive in the
 * DISPLAY currency the dialog printed (¥ by default), so they are converted to
 * the table's USD here — the one place that knows the exchange rate.
 *
 * @param {unknown} entry - `{ key, input, output, cacheRead }`.
 * @param {number} perUsd - display units per USD.
 * @returns {{ ok: true, key: string, rate: object } | { ok: false, key: string, why: string }} verdict.
 */
function checkCustom(entry, perUsd) {
  const key = entry && typeof entry.key === 'string' ? entry.key : '';
  if (key === '') return { ok: false, key, why: '缺少模型 key' };
  const rate = {};
  for (const field of ['input', 'output', 'cacheRead']) {
    const v = Number(entry[field]);
    if (!Number.isFinite(v) || v < 0) return { ok: false, key, why: '单价必须是非负数字：' + field };
    // Six decimals: a price per million tokens never needs more, and dividing by
    // 7 otherwise stores 0.09999999999999999 where the user typed 0.7.
    rate[field] = Math.round((v / (perUsd > 0 ? perUsd : 1)) * 1e6) / 1e6;
  }
  rate.cacheWrite = 0;
  return { ok: true, key, rate };
}

/**
 * Unwrap a cordis "volatile" config value.
 *
 * `Schema.prototype.volatile()` marks a field writable at runtime, and cordis
 * then keeps the raw value in a wrapper (so a `!!js` expression stays unevaluated
 * until someone asks). Neighbouring official code unwraps it — `dsh-settings`
 * does `if (isVolatile(value)) value = value.get()` — and so must we: without
 * this, `currency`/`prices`/`matchMap` arrive as wrapper objects.
 */
function plainConfigValue(value) {
  if (value === null || typeof value !== 'object') return value;
  // The wrapper is a plain object carrying `get` plus `Symbol(cosmokit.volatile.write)`,
  // so detect it by that symbol rather than by its prototype.
  const volatileOfValue = Object.getOwnPropertySymbols(value).some((symbol) => String(symbol).includes('cosmokit.volatile'));
  if (volatileOfValue && typeof value.get === 'function') return value.get();
  return value;
}

/**
 * Resolved configuration: defaults applied, volatile wrappers unwrapped.
 *
 * ⚠️ Unwrap the INPUT too. The loader hands us the value the settings line
 * stored, which for a volatile field is already the wrapper; calling `Config()`
 * on it throws `ValidationError: $.currency expected string but got [object
 * Object]` and the whole plugin fails to activate — no Remote face, no Fetch
 * routes, every dashboard call 404/405. `dsh-settings` unwraps before validating
 * for exactly this reason (`projectForm(…, plainConfig(raw) …)`).
 *
 * Exported because the tests must see exactly what `apply` sees.
 */
export function resolveConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  // Deep-clone into mutable plain JSON: the values inside a volatile wrapper are
  // frozen (`schemastery` freezes dict defaults), and re-validating a frozen
  // object throws `Cannot assign to read only property …` inside the schema.
  const clone = (value) => {
    if (value === null || typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };
  const plain = {};
  for (const key of ['currency', 'prices', 'matchMap']) {
    const value = plainConfigValue(source[key]);
    if (value !== undefined) plain[key] = clone(value);
  }
  let resolved;
  try {
    resolved = Config(plain);
  } catch {
    // A hand-edited patch with a wrong type must not take the plugin down: fall
    // back to the shipped defaults (the dashboard still works, the row shows 0).
    resolved = Config({});
  }
  return {
    currency: plainConfigValue(resolved.currency),
    prices: plainConfigValue(resolved.prices),
    matchMap: plainConfigValue(resolved.matchMap),
  };
}

export function apply(ctx, config) {
  const resolved = resolveConfig(config);
  const priceStore = createPriceStore(
    resolved.prices,
    resolved.currency || DEFAULT_CURRENCY,
    // A getter, not the map: a commit replaces `state.matchMap`, and a store
    // closed over the old object would keep pricing from the pre-commit map.
    { matches: () => state.matchMap },
  );
  const state = createState(priceStore);
  state.index = createUsageIndex(state);
  state.peakOf = peakAt;
  state.matchMap = resolved.matchMap && typeof resolved.matchMap === 'object' ? { ...resolved.matchMap } : {};

  /**
   * Write the durable half of the pricing config.
   *
   * Failures are LOGGED, not swallowed: a silent `.catch(() => {})` here hid a
   * real defect for weeks — the settings service refused every patch (no field
   * was volatile), so confirmed matches and custom prices vanished on restart
   * with nothing in any log to say why.
   */
  const persist = (patch) => {
    // `logSink` returns a **function** `(message, level?)`, not a logger object.
    // Calling `.warn` on it threw `TypeError: … warn is not a function`, which is
    // how a "settings service unavailable" branch turned into a crashed host.
    const log = logSink(ctx);
    let settings;
    try {
      settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined;
    } catch {
      settings = undefined;
    }
    if (!settings || typeof settings.update !== 'function') {
      log('[usage] settings service unavailable: this session keeps pricing in memory only');
      return patch;
    }
    Promise.resolve()
      .then(() => settings.update('usage', patch))
      .catch((error) => {
        log('[usage] could not persist pricing config: ' + (error && error.message ? error.message : String(error)));
      });
    return patch;
  };

  const handlers = new Map();
  handlers.set('query', (args) => {
    // 「缓存加载也是加载」：全量统计由第一次查询拉起，所以面板打开的这一刻就是
    // 统计开始的那一刻（暖缓存 ~0.8 s、冷缓存 ~12 s 的骨架与进度条都看得见）。
    // 幂等：只有第一次真正启动，后续查询只是读状态。
    startBackfillOnDemand(ctx, state, { log: logSink(ctx) });
    return query(state, args || {});
  });
  /**
   * The face this plugin registers on the native Remote channel.
   *
   * The browser half cannot enumerate a face that was registered at runtime, and
   * the endpoint names must match what the host registered (a duplicated list
   * drifts). So it asks for them here — over the Fetch fallback — and mounts its
   * own descriptors: the gateway's client side wants a src-json result, while the
   * host contribution carries a strict codec, so the two are not identical.
   */
  handlers.set('contract', () => ({
    package: USAGE_SERVICE,
    names: [...handlers.keys()].filter((name) => name !== 'contract'),
  }));
  handlers.set('prices', (args) => {
    const store = state.prices;
    store.setPrices(args && args.prices);
    if (args && typeof args.currency === 'string') store.setCurrency(args.currency);
    persist({ prices: configPrices(store.prices), currency: store.currency });
    return store.snapshot();
  });
  /**
   * Model-id matching: propose, then commit.
   *
   * Two actions on one endpoint because they are two halves of one decision:
   * `propose` answers "what would each of my models match to?" and writes
   * nothing; `commit` applies the rows the user confirmed. Keeping them apart is
   * what makes "确定才保存" true — opening the dialog cannot change a price.
   */
  handlers.set('pricing', (args) => {
    const action = args && args.action === 'commit' ? 'commit' : 'propose';

    if (action === 'commit') {
      const decisions = Array.isArray(args?.decisions) ? args.decisions : [];
      const customs = Array.isArray(args?.customs) ? args.customs : [];
      const applied = {};
      const typed = {};
      const rejected = [];
      for (const decision of decisions) {
        const verdict = checkDecision(decision);
        if (verdict.ok) applied[verdict.key] = verdict.target;
        else rejected.push({ key: verdict.key, why: verdict.why });
      }
      // 自定义：三档手填单价，写进 `prices`（用户覆盖），不写 matchMap。
      const perUsd = currencyOf(args?.currency, state.prices.currency).perUsd;
      for (const entry of customs) {
        const verdict = checkCustom(entry, perUsd);
        if (verdict.ok) typed[verdict.key] = verdict.rate;
        else rejected.push({ key: verdict.key, why: verdict.why });
      }
      // Clearing is expressed by listing the key with an empty target, and an
      // empty change set is a no-op rather than a wipe.
      const cleared = Array.isArray(args?.cleared) ? args.cleared.filter((k) => typeof k === 'string' && k !== '') : [];
      if (Object.keys(applied).length > 0 || cleared.length > 0 || Object.keys(typed).length > 0) {
        const next = { ...state.matchMap };
        for (const key of cleared) delete next[key];
        Object.assign(next, applied);
        state.matchMap = next;
        // One key, one answer — whichever the user just gave wins:
        //  · a hand-typed price replaces the confirmed match (the ladder checks
        //    `prices` first, so leaving it would silently outrank the match);
        //  · a confirmed table target drops a stale hand-typed price;
        //  · clearing drops both.
        if (Object.keys(typed).length > 0) state.prices.setPrices(typed);
        for (const key of [...Object.keys(applied), ...cleared, ...Object.keys(typed)]) {
          delete state.matchMap[key];
          delete state.prices.prices[key];
        }
        Object.assign(state.matchMap, applied);
        if (Object.keys(typed).length > 0) Object.assign(state.prices.prices, typed);
        persist({ matchMap: { ...state.matchMap }, prices: configPrices(state.prices.prices) });
      }
      return {
        ok: true,
        applied: Object.keys(applied).length,
        custom: Object.keys(typed).length,
        cleared: cleared.length,
        rejected,
        matchMap: { ...state.matchMap },
        prices: configPrices(state.prices.prices),
      };
    }

    const models = Array.isArray(args?.models) ? args.models : [];
    const atMs = Date.now();
    const rows = models.map((entry) => {
      const model = typeof entry === 'string' ? entry : String(entry?.model ?? '');
      const provider = typeof entry === 'string' ? '' : String(entry?.provider ?? '');
      const key = typeof entry?.key === 'string' ? entry.key : (provider === '' ? model : provider + '/' + model);
      // `priceRow` owns the wire shape for both this endpoint and `query`, so the
      // dialog can never classify a model differently from the bill it shows.
      return { key, provider, model, ...priceRow(priceStore.lookup({ model, provider }), atMs) };
    });
    return {
      table: {
        source: 'opencode Zen + DeepSeek',
        capturedAt: referenceTable().capturedAt,
        unit: referenceTable().unit,
        // Three groups, not one flat list: the reference ids come from DeepSeek,
        // from Zen, or from the user's own price rows, and the dialog shows them
        // apart. `custom` used to be unreachable from the picker entirely.
        groups: referenceGroups(),
      },
      rows,
      matchMap: { ...state.matchMap },
    };
  });
  // The chosen client→host channel travels with every dashboard response.
  state.channel = registerRPC(ctx, handlers);

  // 全量回填**不在激活时跑**：它按需触发（见 `startBackfillOnDemand`），由第一次
  // 查询拉起。缓存加载（暖 0.8 s / 冷 12 s）因此发生在用户打开面板的那一刻，
  // 而不是进程启动的头一秒 —— 否则加载态永远看不见。
  // Live sessions every tick; persisted sessions on a slow cadence to keep
  // per-session log reads cheap (unchanged revisions are skipped).
  ctx.interval(() => {
    scanLive(ctx, state);
  }, LIVE_POLL_MS);
  ctx.interval(() => {
    scanPersisted(ctx, state).catch(() => {});
  }, PERSISTED_POLL_MS);
}
