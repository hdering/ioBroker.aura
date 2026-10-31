// TCP proxy that behaves like a mobile link: every byte pays the round-trip latency and
// the bandwidth of its direction. Chrome's own throttling (CDP emulateNetworkConditions)
// is no use for the socket: it does not delay WebSocket frames, and large frames stall
// until the socket drops — so load-object-db.mjs measures through this instead.
//
//   node tools/tests/net-throttle-proxy.mjs --target 192.168.188.140:8082 --port 9443
//   AURA_IOBROKER_URL=https://127.0.0.1:9443 npx vite …   (TLS passes through untouched)
//
// Starts unthrottled; the profile is switched at runtime on the control port (port + 1):
//   GET http://127.0.0.1:9444/profile?name=slow-4g   (lan | fast-4g | slow-4g)
// so a test can let the app start at full speed and throttle only what it measures —
// like switching DevTools to "Slow 4G" after the page has loaded.
//
// Bandwidth is shared by all connections, as on a real link.
import http from 'node:http';
import net from 'node:net';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
};
// Chrome DevTools presets.
const PROFILES = {
    lan: null,
    'fast-4g': { rttMs: 165, downBps: 9_000_000, upBps: 1_500_000 },
    'slow-4g': { rttMs: 562.5, downBps: 1_600_000, upBps: 750_000 },
};
let profileName = arg('profile', 'lan');
if (!(profileName in PROFILES)) throw new Error(`unknown profile, use one of ${Object.keys(PROFILES).join(', ')}`);
const [host, port] = arg('target', '192.168.188.140:8082').split(':');
const listenPort = Number(arg('port', 9443));

// Wire time per direction, shared by all connections.
const wire = { up: 0, down: 0 };

/**
 * One direction of one connection. Chunks queue for the shared wire, then travel half
 * the RTT; delivery stays in order even when the profile changes mid-stream (TLS would
 * break on a reordered byte).
 */
function pipe(dir, sink) {
    // One timer per pipe draining an ordered queue: separate setTimeouts can fire out of
    // order (fractional delays land in different timer lists), and one swapped TLS
    // record kills the connection.
    const queue = [];
    let timer = null;
    const drain = () => {
        timer = null;
        const now = performance.now();
        while (queue.length && queue[0].at <= now) {
            const { chunk, after } = queue.shift();
            if (chunk.length && sink.writable) sink.write(chunk);
            after?.();
        }
        if (queue.length) timer = setTimeout(drain, Math.max(0, queue[0].at - now));
    };
    return (chunk, after) => {
        const p = PROFILES[profileName];
        const now = performance.now();
        let at = now;
        if (p) {
            const start = Math.max(now, wire[dir]);
            wire[dir] = start + (chunk.length * 8 * 1000) / (dir === 'up' ? p.upBps : p.downBps);
            at = wire[dir] + p.rttMs / 2;
        }
        if (queue.length) at = Math.max(at, queue[queue.length - 1].at);
        queue.push({ at, chunk, after });
        if (!timer) timer = setTimeout(drain, Math.max(0, queue[0].at - now));
    };
}

// --verbose: one line per second with traffic — shows what queues on the link.
const tally = { up: 0, down: 0 };
if (process.argv.includes('--verbose')) {
    setInterval(() => {
        if (tally.up || tally.down) {
            console.log(
                `${new Date().toISOString().slice(11, 19)} ${profileName} up ${(tally.up / 1024).toFixed(0)} kB  down ${(tally.down / 1024).toFixed(0)} kB`,
            );
        }
        tally.up = tally.down = 0;
    }, 1000);
}

net.createServer({ allowHalfOpen: true }, (client) => {
    const server = net.connect({ port: Number(port), host, allowHalfOpen: true });
    const up = pipe('up', server);
    const down = pipe('down', client);
    client.on('data', (c) => {
        tally.up += c.length;
        up(c);
    });
    server.on('data', (c) => {
        tally.down += c.length;
        down(c);
    });
    // A closing side reaches the other one through the same queue, after its last bytes.
    client.on('end', () => up(Buffer.alloc(0), () => server.end()));
    server.on('end', () => down(Buffer.alloc(0), () => client.end()));
    const kill = () => {
        client.destroy();
        server.destroy();
    };
    client.on('error', kill);
    server.on('error', kill);
}).listen(listenPort, '127.0.0.1', () =>
    console.log(`throttle ${profileName} 127.0.0.1:${listenPort} → ${host}:${port}, control :${listenPort + 1}`),
);

http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').searchParams.get('name');
    if (name && name in PROFILES) profileName = name;
    res.writeHead(name && name in PROFILES ? 200 : 400, { 'Content-Type': 'text/plain' });
    res.end(profileName);
}).listen(listenPort + 1, '127.0.0.1');
