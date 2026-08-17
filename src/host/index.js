/**
 * usage — Token usage statistics host half (entry module).
 *
 * Wires the submodules (fold / scan / query / settings / aggregate / rpc /
 * client-source) into the cordis plugin lifecycle. Strategy notes:
 *  - DSH already persists every loop model call's token usage durably in each
 *    session log as `assistant/message` events carrying `usage` (TokenUsage)
 *    and `message.source.{provider,model}`. We fold those events instead of
 *    tapping `llm/stream` (unreachable from an agent-scoped dynamic plugin).
 *  - Live sessions are scanned from the in-memory store every poll tick;
 *    persisted sessions are backfilled at startup and re-scanned incrementally
 *    on a slower cadence (watermark per session).
 *  - Aggregation, cost (user-configurable price table) and model list are
 *    served to the Client via the RPC bridge (rpc.js).
 *
 * The same entry doubles as the cordis.yml host plugin module (exports name /
 * inject / apply) and as the `code.host` function body for a dynamic plugin.
 */
export const name = 'usage-host';
export const inject = ['timer'];

import { DEFAULT_PRICES, DEFAULT_CURRENCY, createPriceStore, initSettings } from './settings.js';
import { createState } from './state.js';
import { createUsageIndex } from './aggregate.js';
import { scanLive, scanPersisted, runBackfill } from './scan.js';
import { query } from './query.js';
import { registerRPC } from './rpc.js';
import { getClientSource } from './client-source.js';

const LIVE_POLL_MS = 2000;
const PERSISTED_POLL_MS = 30000;

export function apply(ctx) {
  const priceStore = createPriceStore(DEFAULT_PRICES, DEFAULT_CURRENCY);
  initSettings(ctx, priceStore);
  const state = createState(priceStore);
  state.index = createUsageIndex(state);

  const handlers = new Map();
  handlers.set('query', (args) => query(state, args || {}));
  handlers.set('prices', (args) => {
    const store = state.prices;
    store.setPrices(args && args.prices);
    if (args && typeof args.currency === 'string') store.setCurrency(args.currency);
    return store.snapshot();
  });
  handlers.set('client-source', () => getClientSource(ctx));
  registerRPC(ctx, handlers);

  // Full history scan once at startup.
  runBackfill(ctx, state);
  // Live sessions every tick; persisted sessions on a slow cadence to keep
  // per-session JSONL re-parsing cheap.
  ctx.interval(() => {
    scanLive(ctx, state);
  }, LIVE_POLL_MS);
  ctx.interval(() => {
    scanPersisted(ctx, state).catch(() => {});
  }, PERSISTED_POLL_MS);
}