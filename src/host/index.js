/**
 * usage — Token usage statistics host half (entry module).
 *
 * Wires the submodules (fold / scan / query / settings / aggregate / rpc /
 * client-source) into the cordis plugin lifecycle. Strategy notes:
 *  - DSH persists every loop model call's token usage in each session log as
 *    an `assistant/message` (or `assistant/attempt`) settlement carrying
 *    `usage`; this plugin folds those events with the same replacement /
 *    retry semantics as the official `tokenUsage` projection instead of
 *    tapping `llm/stream` (unreachable from an agent-scoped dynamic plugin).
 *  - Live sessions are scanned from the in-memory store every poll tick;
 *    persisted sessions are backfilled at startup and re-scanned incrementally
 *    (watermark + revision per session).
 *  - Aggregation, cost (user-configurable price table) and model list are
 *    served through src/host/rpc.js.
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

import { DEFAULT_PRICES, DEFAULT_CURRENCY, createPriceStore, mergePrices } from './settings.js';
import { createState } from './state.js';
import { createUsageIndex } from './aggregate.js';
import { scanLive, scanPersisted, runBackfill } from './scan.js';
import { query } from './query.js';
import { registerRPC } from './rpc.js';
import { getClientSource } from './client-source.js';

export const name = 'usage-host';
export const inject = ['timer'];

/** Durable price table + currency, materialized as the plugin's config form. */
export const Config = Schema.object({
  currency: Schema.string().default(DEFAULT_CURRENCY),
  prices: Schema.dict(Schema.object({
    inputPerM: Schema.number().default(0),
    outputPerM: Schema.number().default(0),
    cacheReadPerM: Schema.number().default(0),
    cacheWritePerM: Schema.number().default(0),
  })).default(DEFAULT_PRICES),
});

const LIVE_POLL_MS = 2000;
const PERSISTED_POLL_MS = 30000;

export function apply(ctx, config) {
  const resolved = config && typeof config === 'object' ? config : {};
  const priceStore = createPriceStore(
    mergePrices(resolved.prices),
    resolved.currency || DEFAULT_CURRENCY,
  );
  const state = createState(priceStore);
  state.index = createUsageIndex(state);

  const handlers = new Map();
  handlers.set('query', (args) => query(state, args || {}));
  handlers.set('prices', (args) => {
    const store = state.prices;
    store.setPrices(args && args.prices);
    if (args && typeof args.currency === 'string') store.setCurrency(args.currency);
    // Secondary durability for hosts where the client cannot reach its config
    // form: write the same values through the official SettingsForms API.
    // The entry id is the bundle patch row id (`usage`).
    try {
      const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined;
      if (settings && typeof settings.update === 'function') {
        settings.update('usage', { prices: Object.assign({}, store.prices), currency: store.currency })
          .catch(() => {});
      }
    } catch {
      // settings is optional; the in-memory store still answers this session.
    }
    return store.snapshot();
  });
  handlers.set('client-source', () => getClientSource(ctx));
  registerRPC(ctx, handlers);

  // Full history scan once at startup.
  runBackfill(ctx, state);
  // Live sessions every tick; persisted sessions on a slow cadence to keep
  // per-session log reads cheap (unchanged revisions are skipped).
  ctx.interval(() => {
    scanLive(ctx, state);
  }, LIVE_POLL_MS);
  ctx.interval(() => {
    scanPersisted(ctx, state).catch(() => {});
  }, PERSISTED_POLL_MS);
}
