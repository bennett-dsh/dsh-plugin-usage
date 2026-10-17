/**
 * Regression coverage for src/host/rpc.js — the transport seam that issue #1
 * reported as silently missing (HTTP 405 on `/usage/*` under DSH 0.2.x).
 *
 * The legacy `/usage` prefix channel mounts through `owner.webServer`, and the
 * owner is the *reading* fiber, so a plugin that only injects `timer` makes
 * `connection.rpc.handle()` throw inside `effect()`. The shared-channel Fetch
 * registry never reads `webServer`, so it must be the preferred transport.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  USAGE_API_PREFIX,
  USAGE_RPC_CHANNEL,
  createFetchRoute,
  dispatch,
  errorResult,
  fetchRoutePath,
  registerRPC,
} from '../src/host/rpc.js';

const HANDLERS = new Map([
  ['query', async (args) => ({ echo: args, kind: 'query' })],
  ['prices', async () => ({ currency: 'CNY' })],
]);

/** Build a fake Connection worth registering against, recording what it saw. */
function fakeConnection(overrides = {}) {
  const routes = [];
  const channels = [];
  return {
    routes,
    channels,
    value: {
      fetch: {
        register(route) {
          routes.push(route);
          return async () => {};
        },
      },
      rpc: {
        handle(channel, handler) {
          channels.push({ channel, handler });
          return async () => {};
        },
      },
      ...overrides,
    },
  };
}

/** Fake host context: `inject` runs the callback immediately, like a live fiber. */
function fakeCtx(connection, { typert } = {}) {
  const seen = {};
  return {
    seen,
    get(name) {
      return name === 'typertGateway' ? typert : undefined;
    },
    inject(deps, callback) {
      seen.deps = deps;
      seen.connectionCtx = { connection };
      callback(seen.connectionCtx);
    },
  };
}

/** Capture console.warn while a block runs. */
async function captureWarnings(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test('fetchRoutePath keeps every route below Connection\'s /api mount', () => {
  assert.equal(fetchRoutePath('query'), USAGE_API_PREFIX + '/query');
  assert.equal(fetchRoutePath('query'), '/api/usage/query');
  // connection.fetch.register() rejects any route outside /api.
  assert.match(fetchRoutePath('client-source'), /^\/api\/usage\/[A-Za-z0-9_$.-]+$/);
});

test('registerRPC mounts one POST Fetch route per endpoint (0.2.x transport)', async () => {
  const connection = fakeConnection();
  const ctx = fakeCtx(connection.value);

  await captureWarnings(() => registerRPC(ctx, HANDLERS));

  assert.deepEqual(ctx.seen.deps, ['connection']);
  assert.deepEqual(connection.routes.map((route) => route.path), [
    '/api/usage/query',
    '/api/usage/prices',
  ]);
  for (const route of connection.routes) {
    assert.deepEqual(route.methods, ['POST']);
    assert.equal(route.requestBody, 'buffered');
    assert.equal(typeof route.fetch, 'function');
  }
});

test('registerRPC still tries the legacy /usage channel for older hosts', async () => {
  const connection = fakeConnection();
  await captureWarnings(() => registerRPC(fakeCtx(connection.value), HANDLERS));
  assert.deepEqual(connection.channels.map((entry) => entry.channel), [USAGE_RPC_CHANNEL]);
});

test('registerRPC survives a throwing legacy registration when Fetch routes mounted', async () => {
  // Reproduces DSH 0.2.x: registering the prefix channel throws inside effect()
  // because the reading fiber owns no webServer.
  const connection = fakeConnection({
    rpc: {
      handle() {
        throw new Error('cannot get property "webServer" without inject');
      },
    },
  });
  const warnings = await captureWarnings(async () => {
    registerRPC(fakeCtx(connection.value), HANDLERS);
  });

  assert.equal(connection.routes.length, 2);
  // A mounted Fetch registry already carries the channel: stay quiet.
  assert.deepEqual(warnings, []);
});

test('registerRPC warns when no transport could be mounted at all', async () => {
  const connection = fakeConnection({
    fetch: undefined,
    rpc: {
      handle() {
        throw new Error('cannot get property "webServer" without inject');
      },
    },
  });
  const warnings = await captureWarnings(async () => {
    registerRPC(fakeCtx(connection.value), HANDLERS);
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /failed to mount \/usage RPC channel/);
});

test('fetch route decodes JSON args and returns the RPC result envelope', async () => {
  const route = createFetchRoute(HANDLERS, 'query');
  const response = await route(new Request('http://dsh.internal/api/usage/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: '2026-01-01' }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    value: { echo: { from: '2026-01-01' }, kind: 'query' },
  });
});

test('fetch route tolerates an empty body (args = null)', async () => {
  const route = createFetchRoute(HANDLERS, 'prices');
  const response = await route(new Request('http://dsh.internal/api/usage/prices', { method: 'POST' }));
  assert.deepEqual(await response.json(), { ok: true, value: { currency: 'CNY' } });
});

test('fetch route rejects a malformed JSON body with 400', async () => {
  const route = createFetchRoute(HANDLERS, 'query');
  const response = await route(new Request('http://dsh.internal/api/usage/query', {
    method: 'POST',
    body: '{not json',
  }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'bad-request');
});

test('dispatch converts unknown endpoints and thrown handlers into results', async () => {
  const throwing = new Map([['boom', () => { throw new Error('handler exploded'); }]]);

  assert.deepEqual(await dispatch(HANDLERS, 'nope', null), errorResult('unknown endpoint: nope', 'bad-request'));

  const body = await dispatch(throwing, 'boom', null);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'internal');
  assert.equal(body.error.message, 'handler exploded');
});

test('a dynamic-plugin run keeps using harness.handle', async () => {
  const calls = [];
  globalThis.harness = { handle: (endpoint, fn) => calls.push({ endpoint, fn }) };
  try {
    const connection = fakeConnection();
    registerRPC(fakeCtx(connection.value), HANDLERS);
    assert.deepEqual(calls.map((call) => call.endpoint), ['usage/query', 'usage/prices']);
    assert.deepEqual(connection.routes, []);
  } finally {
    delete globalThis.harness;
  }
});

test('a Typert gateway exposes the channel without touching Connection', async () => {
  const registered = [];
  const typert = { register: (channel, endpoints) => registered.push({ channel, endpoints }) };
  const connection = fakeConnection();

  registerRPC(fakeCtx(connection.value, { typert }), HANDLERS);

  assert.equal(registered.length, 1);
  assert.equal(registered[0].channel, 'usage');
  assert.deepEqual(Object.keys(registered[0].endpoints), ['query', 'prices']);
  assert.deepEqual(connection.routes, []);
});
