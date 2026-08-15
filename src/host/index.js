/**
 * usage — Token usage statistics host half.
 *
 * Strategy (dynamic-plugin safe):
 *  - DSH already persists every loop model call's token usage durably in each
 *    session log as `assistant/message` events carrying `usage` (TokenUsage) and
 *    `message.source.{provider,model}`. We fold those events into an in-memory
 *    index instead of tapping `llm/stream` (unreachable from an agent-scoped
 *    dynamic plugin) and instead of writing our own files.
 *  - Live sessions are scanned from the in-memory store every poll tick;
 *    persisted sessions are backfilled at startup and re-scanned incrementally
 *    on a slower cadence (watermark per session, `seq >= fromSeq`).
 *  - Aggregation, cost (own user-configurable price table — the runtime has no
 *    pricing concept) and model list are served to the Client via harness RPC.
 *
 * The same file doubles as the cordis.yml host plugin module (exports name /
 * inject / apply) and as the `code.host` function body for a dynamic plugin.
 */

export const name = 'usage-host';
export const inject = ['timer'];

export function apply(ctx) {
  // ---------------------------------------------------------------- constants
  const RPC_QUERY = 'usage/query';
  const RPC_PRICES = 'usage/prices';
  const DEFAULT_CURRENCY = '¥';
  const DEFAULT_PRICES = {
    'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
    'deepseek-v3': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
    'deepseek-v3.1': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
    'deepseek-v4': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
    'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.56, cacheReadPerM: 0.04, cacheWritePerM: 0.14 },
    'deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
    'deepseek-r1': { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0.55 },
  };
  const LIVE_POLL_MS = 2000;
  const PERSISTED_POLL_MS = 30000;

  // ------------------------------------------------------------------- state
  /** Folded usage records, one per assistant/message with usage. */
  const records = [];
  /** sessionId -> last folded event seq. */
  const watermarks = new Map();
  /** User-overridable price table (model -> ModelPrice). */
  const prices = Object.assign({}, DEFAULT_PRICES);
  let currency = DEFAULT_CURRENCY;
  const backfill = { status: 'idle', total: 0, done: 0 };

  // -------------------------------------------------------------------- fold
  function foldEvent(sessionId, e) {
    if (!e || e.type !== 'assistant/message' || !e.data || !e.data.usage) return;
    const source = (e.data.message && e.data.message.source) || {};
    const u = e.data.usage;
    records.push({
      time: e.time,
      session: sessionId,
      provider: source.provider || '',
      model: source.model || '',
      inputTokens: u.inputTokens || 0,
      outputTokens: u.outputTokens || 0,
      cacheReadTokens: u.cacheReadTokens || 0,
      cacheWriteTokens: u.cacheWriteTokens || 0,
      reasoningTokens: u.reasoningTokens || 0,
      totalTokens: (u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0),
    });
  }

  /** Fold events with seq > watermark for one session; returns new watermark. */
  function foldNew(sessionId, events, wm) {
    let max = wm;
    for (const e of events) {
      if (e && typeof e.seq === 'number' && e.seq > wm) {
        foldEvent(sessionId, e);
        if (e.seq > max) max = e.seq;
      }
    }
    return max;
  }

  // ------------------------------------------------------------------ scans
  /** Scan live in-memory sessions (cheap, every tick). */
  function scanLive() {
    const sessions = ctx.get('sessions');
    if (sessions === undefined) return;
    for (const s of sessions.list()) {
      if (!s || !s.id) continue;
      const wm = watermarks.get(s.id) ?? -1;
      const next = foldNew(s.id, s.events || [], wm);
      if (next > wm) watermarks.set(s.id, next);
    }
  }

  /** Incremental scan of persisted sessions (slow cadence). */
  async function scanPersisted() {
    const sp = ctx.get('sessionPersistence');
    if (sp === undefined) return;
    const headers = await sp.list();
    if (!Array.isArray(headers)) return;
    backfill.total = headers.length;
    for (const h of headers) {
      if (!h || !h.id) continue;
      const wm = watermarks.get(h.id) ?? -1;
      try {
        const page = await sp.readFrom(h.id, wm + 1);
        const events = (page && page.events) || [];
        const next = foldNew(h.id, events, wm);
        if (next > wm) watermarks.set(h.id, next);
      } catch (error) {
        // A session may be gone or mid-rewrite; skip and retry next pass.
      }
      if (backfill.status === 'running') backfill.done += 1;
    }
  }

  /** Full history scan, once at startup. */
  async function runBackfill() {
    const sp = ctx.get('sessionPersistence');
    if (sp === undefined) {
      backfill.status = 'done';
      return;
    }
    backfill.status = 'running';
    backfill.done = 0;
    try {
      await scanPersisted();
      backfill.status = 'done';
    } catch (error) {
      backfill.status = 'done';
    }
  }

  // ------------------------------------------------------------------- cost
  /** Look up a price by `provider/model` composite first, then bare model. */
  function priceOf(r) {
    const composite = r.provider ? r.provider + '/' + r.model : '';
    return prices[composite] || prices[r.model];
  }

  function costOf(r) {
    const p = priceOf(r);
    if (!p) return 0;
    return (
      r.inputTokens * p.inputPerM +
      r.outputTokens * p.outputPerM +
      r.cacheReadTokens * (p.cacheReadPerM || 0) +
      r.cacheWriteTokens * (p.cacheWritePerM || 0)
    ) / 1e6;
  }

  // ------------------------------------------------------------------ query
  function dayKey(t) {
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const DAY_MS = 86400000;

  /** Ordinal day number (local calendar day -> UTC-day index), for step alignment. */
  function dayIndex(t) {
    const d = new Date(t);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }

  /** Bucket key for one instant under a granularity (day buckets may span stepDays). */
  function bucketKeyFor(t, g, stepDays) {
    const pad = (n) => String(n).padStart(2, '0');
    if (g === 'day') {
      const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
      const d = new Date(block * DAY_MS); // UTC midnight; UTC components == local calendar day
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const d = new Date(t);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hm = pad(d.getHours()) + ':' + (g === 'hour' ? '00' : pad(d.getMinutes()));
    return date + ' ' + hm;
  }

  function stepMs(g) {
    return g === 'day' ? DAY_MS : g === 'hour' ? 3600000 : 60000;
  }

  /** Floor an instant to its granularity boundary. */
  function alignFloor(t, g) {
    const d = new Date(t);
    if (g === 'day') { d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (g === 'hour') { d.setMinutes(0, 0, 0); return d.getTime(); }
    d.setSeconds(0, 0);
    return d.getTime();
  }

  /** Floor an instant to its stepDays block start (UTC midnight of the block). */
  function alignBlock(t, stepDays) {
    const block = Math.floor(dayIndex(t) / stepDays) * stepDays;
    return block * DAY_MS;
  }

  /**
   * Bucket key under a day granularity with a range-anchored step grid:
   * blocks start at the range's first day, so a custom range reads naturally
   * (e.g. 90 days -> 18 x 5-day buckets starting on the range's first day).
   */
  function stepDayKey(r, dayStart, stepDays) {
    const k = Math.floor((alignFloor(r.time, 'day') - dayStart) / (stepDays * DAY_MS));
    return dayKey(dayStart + k * stepDays * DAY_MS);
  }

  const MAX_BUCKETS = 2000;

  function emptyBucket(key) {
    return {
      key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      cost: 0,
    };
  }

  function addToBucket(b, r, cost) {
    b.calls += 1;
    b.inputTokens += r.inputTokens;
    b.outputTokens += r.outputTokens;
    b.cacheReadTokens += r.cacheReadTokens;
    b.cacheWriteTokens += r.cacheWriteTokens;
    b.totalTokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    b.cost += cost;
    return b;
  }

  function query(args) {
    const from = typeof args.from === 'number' ? args.from : -Infinity;
    const to = typeof args.to === 'number' ? args.to : Infinity;
    const granularity = args.granularity === 'minute' || args.granularity === 'hour' ? args.granularity : 'day';
    const stepDays = granularity === 'day' && Number.isInteger(args.stepDays) && args.stepDays > 0 ? args.stepDays : 1;
    // Zero-filled step series require a finite range.
    const fill = Boolean(args.fill) && Number.isFinite(from) && Number.isFinite(to);
    const modelSet = Array.isArray(args.models) && args.models.length > 0
      ? new Set(args.models)
      : null;
    /** Match either a bare model id or a `provider/model` composite key. */
    const modelMatches = (r) => {
      if (!modelSet) return true;
      if (modelSet.has(r.model)) return true;
      return Boolean(r.provider) && modelSet.has(r.provider + '/' + r.model);
    };

    const dailyMap = new Map();
    const modelMap = new Map();
    const total = emptyBucket('total');
    const seenModels = new Map(); // model -> {provider, model} (first provider wins)
    let unpricedCalls = 0;
    // Range-anchored day-step grid: blocks start at the range's first day.
    const dayAnchor = Number.isFinite(from) ? alignFloor(from, 'day') : null;
    const useStepGrid = granularity === 'day' && stepDays > 1 && dayAnchor !== null;

    for (const r of records) {
      if (r.time < from || r.time > to) continue;
      if (!modelMatches(r)) continue;
      const cost = costOf(r);
      if (cost === 0 && r.totalTokens > 0) unpricedCalls += 1;
      if (!seenModels.has(r.model)) seenModels.set(r.model, { provider: r.provider, model: r.model });

      const dk = useStepGrid ? stepDayKey(r, dayAnchor, stepDays) : bucketKeyFor(r.time, granularity, stepDays);
      let db = dailyMap.get(dk);
      if (db === undefined) {
        db = emptyBucket(dk);
        dailyMap.set(dk, db);
      }
      addToBucket(db, r, cost);

      let mb = modelMap.get(r.model);
      if (mb === undefined) {
        mb = emptyBucket(r.model);
        modelMap.set(r.model, mb);
      }
      addToBucket(mb, r, cost);

      addToBucket(total, r, cost);
    }

    let daily;
    if (fill) {
      let start;
      let step;
      let end;
      if (granularity === 'day') {
        step = stepDays * DAY_MS;
        start = dayAnchor !== null ? dayAnchor : alignFloor(from, 'day');
        end = alignFloor(to, 'day') + step;
      } else {
        step = stepMs(granularity);
        start = alignFloor(from, granularity);
        end = alignFloor(to, granularity) + step;
      }
      const count = Math.round((end - start) / step);
      if (count <= MAX_BUCKETS) {
        daily = [];
        for (let i = 0; i < count; i++) {
          const t = start + i * step;
          const k = useStepGrid ? dayKey(t) : bucketKeyFor(t, granularity, stepDays);
          daily.push(dailyMap.get(k) || emptyBucket(k));
        }
      } else {
        // Degenerate: too many steps; fall back to present-only buckets.
        daily = [...dailyMap.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      }
    } else {
      daily = [...dailyMap.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }
    const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
    const models = [...seenModels.values()];

    // GitHub-style yearly heatmap: every calendar day of the current year up to
    // today, zero-filled.
    let heatmap = null;
    if (args.heatmap) {
      const now = Date.now();
      const year = new Date(now).getFullYear();
      const hmMap = new Map();
      const yearStart = new Date(year, 0, 1).getTime();
      for (const r of records) {
        if (r.time < yearStart || r.time > now) continue;
        if (!modelMatches(r)) continue;
        const dk = dayKey(r.time);
        let b = hmMap.get(dk);
        if (b === undefined) {
          b = emptyBucket(dk);
          hmMap.set(dk, b);
        }
        addToBucket(b, r, costOf(r));
      }
      heatmap = [];
      const todayStart = alignFloor(now, 'day');
      for (let d = new Date(year, 0, 1); d.getTime() <= todayStart; d.setDate(d.getDate() + 1)) {
        const k = dayKey(d.getTime());
        heatmap.push(hmMap.get(k) || emptyBucket(k));
      }
    }

    return {
      daily,
      byModel,
      total,
      models,
      unpricedCalls,
      ...heatmap === null ? {} : { heatmap },
      backfill: { status: backfill.status, total: backfill.total, done: backfill.done },
    };
  }

  // ------------------------------------------------------------------- RPC
  // Static (bundle) installs expose the generic Connection RPC bridge (the
  // browser half calls `connection.rpc.call('/usage', endpoint, args)`);
  // dynamic-plugin runs expose `harness` directly. Support both from one file.
  const usageHandlers = new Map();
  function usageHandle(method, fn) {
    const name = String(method);
    usageHandlers.set(name.indexOf('/') === -1 ? name : name.slice(name.indexOf('/') + 1), fn);
  }

  usageHandle(RPC_QUERY, (args) => query(args || {}));

  usageHandle(RPC_PRICES, (args) => {
    const incoming = (args && args.prices) || null;
    if (incoming && typeof incoming === 'object') {
      for (const [model, p] of Object.entries(incoming)) {
        if (p && typeof p === 'object') {
          prices[model] = {
            inputPerM: Number(p.inputPerM) || 0,
            outputPerM: Number(p.outputPerM) || 0,
            cacheReadPerM: Number(p.cacheReadPerM) || 0,
            cacheWritePerM: Number(p.cacheWritePerM) || 0,
          };
        }
      }
    }
    if (args && typeof args.currency === 'string') currency = args.currency;
    return { prices: Object.assign({}, prices), currency };
  });

  // ------------------------------------------------- client source loader
  // The full dashboard UI lives in src/client/index.js (single source of
  // truth). A dynamic plugin cannot import files, so the host reads the file
  // and serves it to the browser half, which evaluates it with new Function.
  const CLIENT_SOURCE_CANDIDATES = [
    '/Users/ruanbw/projects/usage/src/client/index.js',
    '/Users/ruanbw/projects/usage/lib/client/index.js',
  ];
  usageHandle('usage/client-source', async () => {
    const fs = ctx.get('fs');
    if (fs === undefined) return { ok: false, error: 'fs service unavailable' };
    for (const p of CLIENT_SOURCE_CANDIDATES) {
      try {
        const target = await fs.resolve(p);
        const body = await fs.readText(target);
        if (typeof body === 'string' && body.length > 0) return { ok: true, body };
      } catch (error) {
        // try the next candidate
      }
    }
    return { ok: false, error: 'client source not found (tried: ' + CLIENT_SOURCE_CANDIDATES.join(', ') + ')' };
  });

  const dynamicHarness = (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') ? harness : null;
  if (dynamicHarness !== null) {
    for (const [endpoint, fn] of usageHandlers) {
      dynamicHarness.handle('usage/' + endpoint, fn);
    }
  } else {
    // Static (bundle) installs: the `connection` service is provided
    // asynchronously by the client-connection plugin, so wait for it before
    // registering the /usage channel (the official api-gateway pattern).
    ctx.inject(['connection'], (connectionCtx) => {
      const connection = connectionCtx.connection;
      if (connection === undefined || connection.rpc === undefined) return;
      connection.rpc.handle('/usage', (endpoint, args) => {
        const fn = usageHandlers.get(endpoint);
        if (fn === undefined) return { ok: false, error: `unknown endpoint: ${endpoint}` };
        return fn(args);
      }, { authority: 'loopback' });
    });
  }

  // ---------------------------------------------------------------- startup
  runBackfill();
  // Live sessions every tick; persisted sessions on a slow cadence to keep
  // per-session JSONL re-parsing cheap.
  ctx.interval(() => {
    scanLive();
  }, LIVE_POLL_MS);
  ctx.interval(() => {
    scanPersisted().catch(() => {});
  }, PERSISTED_POLL_MS);
}
