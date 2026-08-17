/**
 * RPC registration.
 *
 * Dynamic-plugin runs expose `harness` directly; static (bundle) installs
 * expose the generic Connection RPC bridge (the browser half calls
 * connection.rpc.call('/usage', endpoint, args)). Support both from one file.
 *
 * P0-3: the official Typert gateway path (@deepseek-ai/dsh-api-gateway host
 * service, ctx key `typertGateway`) is wired here when the detected gateway
 * exposes a registration surface, keeping these paths as fallbacks.
 */

export function registerRPC(ctx, handlers) {
  const dynamicHarness = (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') ? harness : null;
  if (dynamicHarness !== null) {
    for (const [endpoint, fn] of handlers) {
      dynamicHarness.handle('usage/' + endpoint, fn);
    }
    return;
  }
  // P0-3 official Typert gateway path.
  //
  // Target API: @deepseek-ai/dsh-api-gateway host service, exposed on the host
  // Read the gateway only via `ctx.get('typertGateway')` — cordis ctx is a
  // property). The installed v0.1.0-rc.7 `TypertGateway` interface exposes
  // only invoke() (see the package's lib/types/types.d.ts); the documented
  // contribution path (@Remote/@RemoteScope + TypertRemoteService or
  // bindTypertRemote from @deepseek-ai/dsh-typert-protocol) needs a runtime
  // dependency this plugin must not add, so we only claim endpoints through a
  // registration surface that already exists on the detected object:
  // `typert.register(channel, endpoints)`, a forward-compatible contribution
  // hook for host compositions that expose the gateway with registration.
  //
  // Precondition for this path to activate: the resolved typert gateway is
  // non-null AND `typert.register` is a function. Endpoint functions receive
  // (args) and return the raw value; the gateway/connection side owns the
  // RPC envelope. Otherwise we fall back silently to the connection bridge
  // below. All guards are typeof-based: nothing is imported, zero deps.
  // cordis ctx is a strict proxy: direct property access to an un-injected
  // service throws — always use ctx.get (returns undefined when absent).
  const typert = typeof ctx.get === 'function' ? ctx.get('typertGateway') : undefined;
  if (typert && typeof typert.register === 'function') {
    const endpoints = {};
    for (const [endpoint, fn] of handlers) {
      endpoints[endpoint] = fn;
    }
    typert.register('usage', endpoints);
    return;
  }

  // Static (bundle) installs: the `connection` service is provided
  // asynchronously by the client-connection plugin, so wait for it before
  // registering the /usage channel (the official api-gateway pattern).
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection;
    if (connection === undefined || connection.rpc === undefined) return;
    connection.rpc.handle('/usage', async (endpoint, args) => {
      const fn = handlers.get(endpoint);
      if (fn === undefined) {
        return { ok: false, error: { code: 'bad-request', message: `unknown endpoint: ${endpoint}`, details: { issues: [] } } };
      }
      try {
        return { ok: true, value: await fn(args) };
      } catch (error) {
        return { ok: false, error: { code: 'internal', message: String((error && error.message) || error), details: {} } };
      }
    }, { authority: 'loopback' });
  });
}