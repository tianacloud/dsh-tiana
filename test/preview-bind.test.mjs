import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { listenOnReservedAddresses, previewBindAddresses } from '../preview-bind.js';

const v4 = (address) => ({ address, family: 'IPv4', internal: false });
const v6 = (address) => ({ address, family: 'IPv6', internal: false });

test('previewBindAddresses keeps reserved addresses and drops bridges, public and link-local', () => {
  const addresses = previewBindAddresses({
    lo: [v4('127.0.0.1'), v6('::1')],
    enp3s0: [v4('192.168.1.52'), v6('fe80::1'), v6('2001:db8::1')],
    wlp4s0: [v4('10.1.2.3'), v4('172.16.5.5'), v4('172.32.0.1'), v4('8.8.8.8')],
    tailscale0: [v4('100.98.45.17'), v4('100.128.0.1'), v6('fd7a:115c::1')],
    docker0: [v4('172.17.0.1')],
    'br-9be32b40e696': [v4('172.21.0.1')],
    veth123: [v4('192.168.99.1')],
  });
  assert.equal(addresses[0], '127.0.0.1');
  assert.deepEqual(new Set(addresses), new Set([
    '127.0.0.1', '::1', '192.168.1.52', '10.1.2.3', '172.16.5.5', '100.98.45.17', 'fd7a:115c::1',
  ]));
});

test('previewBindAddresses always returns loopback', () => {
  assert.deepEqual(previewBindAddresses({}), ['127.0.0.1']);
});

test('listenOnReservedAddresses binds every address on one port and skips unbindable ones', async () => {
  const { servers, port } = await listenOnReservedAddresses(() => createServer(), ['127.0.0.1', '127.0.0.2', '203.0.113.9']);
  try {
    assert.equal(servers.length, 2);
    assert.ok(servers.every((server) => server.address().port === port));
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
});
