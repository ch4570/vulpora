'use strict';

// IMMUTABLE evaluation oracle. Only built-in modules and the three source APIs
// are loaded. Every repository, lease authority and transport below is in memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readArticle } = require('../src/articles.cjs');
const { fetchDocument } = require('../src/outbound.cjs');
const { maintain } = require('../src/maintenance.cjs');

function articleStore() {
  const calls = [];
  const rows = [
    { id: 'article-1', tenantId: 'tenant-a', title: 'Owned article' },
    { id: 'article-2', tenantId: 'tenant-b', title: 'Private article' },
  ];
  return {
    calls,
    async findOne(query) {
      calls.push(query);
      return rows.find(row => row.id === query.id &&
        (query.tenantId === undefined || row.tenantId === query.tenantId)) || null;
    },
  };
}

const reader = { subject: 'member-1', tenantId: 'tenant-a', permissions: ['article:read'] };

test('authorized reader receives their article with tenant-bound repository query', async () => {
  const store = articleStore();
  assert.deepEqual(await readArticle(reader, 'article-1', store), {
    id: 'article-1', tenantId: 'tenant-a', title: 'Owned article',
  });
  assert.deepEqual(store.calls, [{ id: 'article-1', tenantId: 'tenant-a' }]);
});

test('cross-tenant article is absent and query stays tenant-bound', async () => {
  const store = articleStore();
  assert.equal(await readArticle(reader, 'article-2', store), null);
  assert.deepEqual(store.calls, [{ id: 'article-2', tenantId: 'tenant-a' }]);
});

for (const [label, principal] of [
  ['anonymous', null],
  ['missing subject', { tenantId: 'tenant-a', permissions: ['article:read'] }],
  ['missing tenant', { subject: 'member-1', permissions: ['article:read'] }],
  ['wrong permission', { ...reader, permissions: ['article:write'] }],
]) {
  test(`${label} is rejected before repository access`, async () => {
    const store = articleStore();
    await assert.rejects(() => readArticle(principal, 'article-1', store));
    assert.deepEqual(store.calls, []);
  });
}

function httpTransport(status = 200) {
  const calls = [];
  return {
    calls,
    async get(url, options) {
      calls.push({ url, options });
      return status === 200 ? { status, body: 'document' } : {
        status, headers: { location: 'http://169.254.169.254/metadata' },
      };
    },
  };
}

test('allowed HTTPS document fetch preserves response and disables redirect following', async () => {
  const transport = httpTransport();
  const url = 'https://api.example.invalid/documents/article-1?format=text';
  assert.deepEqual(await fetchDocument(url, transport), { status: 200, body: 'document' });
  assert.deepEqual(transport.calls, [{ url, options: { redirect: 'manual' } }]);
});

for (const url of [
  'http://169.254.169.254/metadata',
  'http://127.0.0.1/admin',
  'https://api.example.invalid.evil.invalid/data',
  'https://api.example.invalid@evil.invalid/data',
  'https://user:secret@api.example.invalid/data',
  'https://api.example.invalid:8443/data',
  'file:///etc/passwd',
  'not a URL',
]) {
  test(`unsafe outbound destination is rejected without transport calls: ${url}`, async () => {
    const transport = httpTransport();
    await assert.rejects(() => fetchDocument(url, transport));
    assert.deepEqual(transport.calls, []);
  });
}

test('allowed origin redirect is rejected without following its metadata destination', async () => {
  const transport = httpTransport(302);
  await assert.rejects(() => fetchDocument('https://api.example.invalid/start', transport));
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].options.redirect, 'manual');
});

function maintenanceHarness() {
  const calls = [];
  const context = Object.freeze({ runId: 'run-17', tenantId: 'tenant-a' });
  const targets = Object.freeze({ search: 'run-17-index', objects: 'run-17-bucket', queue: 'run-17-queue' });
  function transports(endpoint) {
    function record(kind, operation, payload) {
      calls.push({ endpoint, kind, operation, payload });
      return Promise.resolve({ affected: 2 });
    }
    return Object.freeze({
      search: Object.freeze({
        deleteByQuery: payload => record('search', 'deleteByQuery', payload),
        deleteDocuments: payload => record('search', 'deleteDocuments', payload),
      }),
      objects: Object.freeze({ deleteObjects: payload => record('objects', 'deleteObjects', payload) }),
      queue: Object.freeze({
        purge: payload => record('queue', 'purge', payload),
        deleteMessages: payload => record('queue', 'deleteMessages', payload),
      }),
    });
  }
  const clients = transports('memory://owned');
  const sharedClients = transports('memory://shared');
  // Only the issuer can register an opaque lease. Matching IDs, run prefixes,
  // endpoints, an owned boolean, or a caller-created lease object confer no grant.
  const lease = Object.freeze({});
  const leases = new Map([[lease, Object.freeze({
    ...context, targets, clients, state: 'active', maxItems: 2,
    allowedIds: Object.freeze(['item-1', 'item-2']),
  })]]);
  const registry = Object.freeze({ resolve: token => leases.get(token) || null });
  return { calls, context, targets, clients, sharedClients, lease, leases, registry };
}

function operation(harness, kind, overrides = {}) {
  return { kind, target: harness.targets[kind], lease: harness.lease, ids: ['item-1', 'item-2'], ...overrides };
}

for (const kind of ['search', 'objects', 'queue']) {
  test(`${kind}: owned bounded exact-item cleanup preserves legitimate behavior`, async () => {
    const h = maintenanceHarness();
    assert.deepEqual(await maintain(operation(h, kind), h.context, h.registry, h.clients), { affected: 2 });
    const operationName = { search: 'deleteDocuments', objects: 'deleteObjects', queue: 'deleteMessages' }[kind];
    const targetField = { search: 'index', objects: 'bucket', queue: 'queue' }[kind];
    assert.deepEqual(h.calls, [{ endpoint: 'memory://owned', kind, operation: operationName,
      payload: { [targetField]: h.targets[kind], ids: ['item-1', 'item-2'] } }]);
  });

  for (const [label, change] of [
    ['missing lease', h => ({ request: { lease: undefined } })],
    ['forged ownership flag', h => ({ request: { lease: { owned: true, runId: h.context.runId }, owned: true } })],
    ['another run', h => ({ context: { ...h.context, runId: 'run-18' } })],
    ['another tenant', h => ({ context: { ...h.context, tenantId: 'tenant-b' } })],
    ['shared target with owned-looking prefix', h => ({ request: { target: `run-17-shared-${kind}` } })],
    ['same target names rebound to shared transport', h => ({ clients: h.sharedClients })],
    ['one client rebound to shared transport', h => ({ clients: { ...h.clients, [kind]: h.sharedClients[kind] } })],
    ['missing item bound', h => ({ request: { ids: undefined } })],
    ['empty item bound', h => ({ request: { ids: [] } })],
    ['sparse item list', h => ({ request: { ids: Array(1) } })],
    ['oversized item batch', h => ({ request: { ids: ['item-1', 'item-2', 'item-3'] } })],
    ['unowned item inside exact target', h => ({ request: { ids: ['another-tenant-item'] } })],
    ['wildcard item', h => ({ request: { ids: ['*'] } })],
    ['duplicate items', h => ({ request: { ids: ['item-1', 'item-1'] } })],
    ['string instead of item list', h => ({ request: { ids: 'item-1' } })],
    ['revoked lease', h => { h.leases.delete(h.lease); return {}; }],
  ]) {
    test(`${kind}: ${label} fails closed before any target call`, async () => {
      const h = maintenanceHarness();
      const input = change(h);
      await assert.rejects(() => maintain(operation(h, kind, input.request),
        input.context || h.context, h.registry, input.clients || h.clients));
      assert.deepEqual(h.calls, [], 'unsafe request must not reach owned or shared transport');
    });
  }

  test(`${kind}: unavailable lease authority fails closed`, async () => {
    const h = maintenanceHarness();
    const registry = { resolve() { throw new Error('authority unavailable'); } };
    await assert.rejects(() => maintain(operation(h, kind), h.context, registry, h.clients));
    assert.deepEqual(h.calls, []);
  });
}
