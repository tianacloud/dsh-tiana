/**
 * Address selection for the local template preview.
 *
 * The preview listens on loopback plus every private or otherwise reserved
 * address of the machine's real network interfaces (RFC 1918, CGNAT such as
 * Tailscale's 100.64/10, IPv6 unique-local). Public addresses, link-local
 * addresses and container/VM bridge interfaces (docker0, br-*, veth*, ...)
 * are skipped, so the preview is reachable over the LAN or Tailnet that also
 * reaches the DSH Web server, without being exposed on the public internet or
 * to containers. Access is still gated by the per-preview token.
 */
import { networkInterfaces } from 'node:os';

const LOOPBACK = '127.0.0.1';
const BRIDGE_INTERFACE = /^(docker|br-|veth|virbr|cni|flannel|cali|cilium|podman|nerdctl|lxcbr|lxdbr|weave|kube|vboxnet|vmnet|bridge|vEthernet)/i;
const MAX_PORT_ATTEMPTS = 5;

function reservedIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 127
    || a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

function reservedIPv6(address) {
  const lower = address.toLowerCase();
  return lower === '::1' || /^f[cd][0-9a-f]{2}:/.test(lower);
}

/**
 * @param {Record<string, Array<{address: string}>|undefined>} [interfaces] - `os.networkInterfaces()` shape.
 * @returns {string[]} addresses to listen on; loopback first, never empty.
 */
export function previewBindAddresses(interfaces = networkInterfaces()) {
  const addresses = new Set([LOOPBACK]);
  for (const [name, entries] of Object.entries(interfaces)) {
    if (BRIDGE_INTERFACE.test(name)) continue;
    for (const entry of entries ?? []) {
      const address = typeof entry?.address === 'string' ? entry.address : '';
      if (address === '') continue;
      if (address.includes(':') ? reservedIPv6(address) : reservedIPv4(address)) addresses.add(address);
    }
  }
  return [...addresses];
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeAll(servers) {
  for (const server of servers) {
    try {
      server.close();
    } catch {
      // Already closed.
    }
  }
}

/**
 * Start one server per bind address, all on the same port. Loopback binds
 * first with an OS-chosen port; every other address then reuses that port. A
 * port already taken on one address restarts the whole attempt; an address
 * that cannot be bound at all (for example one that just went away) is skipped.
 * @param {() => import('node:http').Server} makeServer - creates an unbound server.
 * @param {string[]} [addresses] - bind addresses; defaults to {@link previewBindAddresses}.
 * @returns {Promise<{servers: import('node:http').Server[], port: number}>} listening servers.
 */
export async function listenOnReservedAddresses(makeServer, addresses = previewBindAddresses()) {
  for (let attempt = 1; ; attempt += 1) {
    const servers = [];
    try {
      const primary = makeServer();
      servers.push(primary);
      await listen(primary, LOOPBACK, 0);
      const { port } = primary.address();
      for (const host of addresses) {
        if (host === LOOPBACK) continue;
        const server = makeServer();
        try {
          await listen(server, host, port);
          servers.push(server);
        } catch (error) {
          if (error?.code === 'EADDRINUSE') throw error;
        }
      }
      return { servers, port };
    } catch (error) {
      closeAll(servers);
      if (error?.code !== 'EADDRINUSE' || attempt >= MAX_PORT_ATTEMPTS) throw error;
    }
  }
}
