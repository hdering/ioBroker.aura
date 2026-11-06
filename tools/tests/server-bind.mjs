// Where Aura's own server listens (native.bind, lib/serverBind.js): the address
// handed to server.listen, when it only answers on this machine, what stands in
// the way then, how the MCP client reaches it and whom js-controller 8 names as
// holding the port.
//
//   node tools/tests/server-bind.mjs
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { listenAddress, isLoopbackOnly, loopbackProblems, mcpBaseOptions, portHolders, usedResourceCheck } = require(
    join(process.cwd(), 'lib/serverBind.js'),
);

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) {
        failed++;
    }
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// ── 1. The listen address ────────────────────────────────────────────────────
eq('empty: every interface', listenAddress(''), undefined);
eq('missing: every interface', listenAddress(undefined), undefined);
eq('not a string: every interface', listenAddress(8095), undefined);
eq('0.0.0.0: every interface', listenAddress('0.0.0.0'), undefined);
eq(':: : every interface', listenAddress('::'), undefined);
eq('127.0.0.1 kept', listenAddress('127.0.0.1'), '127.0.0.1');
eq('blanks trimmed', listenAddress(' 192.168.1.5 '), '192.168.1.5');

// ── 2. Only this machine ─────────────────────────────────────────────────────
eq('127.0.0.1 is loopback', isLoopbackOnly('127.0.0.1'), true);
eq('127.1.2.3 is loopback', isLoopbackOnly('127.1.2.3'), true);
eq('::1 is loopback', isLoopbackOnly('::1'), true);
eq('localhost is loopback', isLoopbackOnly('localhost'), true);
eq('a LAN address is not', isLoopbackOnly('192.168.1.5'), false);
eq('every interface is not', isLoopbackOnly(''), false);
eq('127.x without four parts is not', isLoopbackOnly('127.0.0'), false);

// ── 3. What stands in the way ────────────────────────────────────────────────
eq('all interfaces: nothing', loopbackProblems({ bind: '', webInstance: '' }), []);
eq(
    'loopback with web instance on the same host: nothing',
    loopbackProblems({ bind: '127.0.0.1', webInstance: 'web.0', webHost: 'a', auraHost: 'a' }),
    [],
);
eq(
    'loopback with web instance, host unknown: nothing',
    loopbackProblems({ bind: '127.0.0.1', webInstance: 'web.0' }),
    [],
);
{
    const p = loopbackProblems({ bind: '127.0.0.1', webInstance: '' });
    eq('loopback without web instance: one problem', p.length, 1);
    eq('…naming the setting', p[0].includes('Also reachable via web instance'), true);
}
{
    const p = loopbackProblems({ bind: '127.0.0.1', webInstance: 'web.1', webHost: 'b', auraHost: 'a' });
    eq('loopback with web instance on another host: one problem', p.length, 1);
    eq('…naming both hosts', p[0].includes('"b"') && p[0].includes('"a"'), true);
}

// ── 4. MCP client base ───────────────────────────────────────────────────────
eq('all interfaces: own port', mcpBaseOptions({ port: 8095, https: false, bind: '', web: { port: 8082 } }), {
    port: 8095,
    https: false,
});
eq(
    'loopback: web port below /aura',
    mcpBaseOptions({ port: 8095, https: false, bind: '127.0.0.1', web: { port: 8443, secure: true } }),
    { port: 8443, https: true, pathPrefix: '/aura' },
);
eq(
    'loopback without web instance: own port (only works locally, but nothing better)',
    mcpBaseOptions({ port: 8095, https: true, bind: '127.0.0.1', web: null }),
    { port: 8095, https: true },
);
eq(
    'a base URL wins',
    mcpBaseOptions({ customUrl: 'https://aura.example.org', port: 8095, bind: '127.0.0.1', web: { port: 8082 } }),
    { customUrl: 'https://aura.example.org', port: 8095 },
);

// ── 5. Who holds the port (js-controller 8 checkUsedResource) ───────────────
eq('no answer: nobody', portHolders(undefined, 'aura.0'), []);
eq(
    'running instances, once each, without itself',
    portHolders(
        [
            { type: 'tcpPort', data: { port: 8095 }, instance: 'web.1', isBlocked: true },
            { type: 'tcpPort', data: { port: 8095, bind: '0.0.0.0' }, instance: 'web.1', isBlocked: true },
            { type: 'tcpPort', data: { port: 8095 }, instance: 'aura.0', isBlocked: true },
            { type: 'tcpPort', data: { port: 8095 }, instance: 'mqtt.0', isBlocked: false },
            null,
            { type: 'tcpPort', data: { port: 8095 } },
        ],
        'aura.0',
    ),
    ['web.1'],
);

// ── 6. The API itself: only with js-controller 8 ─────────────────────────────
eq('older controller (no supportsFeature): none', usedResourceCheck({}), null);
eq(
    'feature not supported: none',
    usedResourceCheck({ supportsFeature: () => false, checkUsedResource: async () => [] }),
    null,
);
{
    const calls = [];
    const adapter = {
        namespace: 'aura.0',
        supportsFeature: (f) => f === 'CONTROLLER_USED_RESOURCES',
        async checkUsedResource(type, data) {
            calls.push([this.namespace, type, data]);
            return [];
        },
    };
    await usedResourceCheck(adapter)('tcpPort', { port: 8095, bind: '127.0.0.1' });
    eq('js-controller 8: asks with the adapter as this', calls, [
        ['aura.0', 'tcpPort', { port: 8095, bind: '127.0.0.1' }],
    ]);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
