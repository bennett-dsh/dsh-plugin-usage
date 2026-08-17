/**
 * RPC registration.
 *
 * Dynamic-plugin runs expose `harness` directly; static (bundle) installs
 * expose the generic Connection RPC bridge (the browser half calls
 * connection.rpc.call('/usage', endpoint, args)). Support both from one file.
 *
 * P0-3: the official Typert gateway path (ctx.typertGateway / api-remotes
 * contract) is added here when available, keeping these as fallbacks.
 */

export function registerRPC(ctx, handlers) {
  const dynamicHarness = (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') ? harness : null;
  if (dynamicHarness !== null) {
    for (const [endpoint, fn] of handlers) {
      dynamicHarness.handle('usage/' + endpoint, fn);
    }
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
