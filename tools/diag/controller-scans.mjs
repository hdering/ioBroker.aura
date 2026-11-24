// Records every SCAN/KEYS the objects DB of js-controller answers - pattern, time and the
// client connection - without pausing it: a conditional breakpoint whose condition only
// notes the call and returns false. With the jsonl DB every such call walks ALL object ids.
//
//   node controller-scans.mjs [--seconds 240]
//
// Opens the Node inspector of the controller (SIGUSR1, 127.0.0.1:9229 only; stays open until
// the controller restarts). Prints the patterns by count and per client process, and writes
// /root/controller-scans-<time>.json.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const i = process.argv.indexOf('--seconds');
const SECONDS = i > 0 ? Number(process.argv[i + 1]) : 240;
const ts = () => new Date().toTimeString().slice(0, 8);
const pid = execSync("pgrep -f '^iobroker.js-controller' | head -1").toString().trim();
process.kill(Number(pid), 'SIGUSR1');
let list;
for (let n = 0; n < 40 && !list; n++) {
    await new Promise((r) => setTimeout(r, 250));
    list = await fetch('http://127.0.0.1:9229/json/list').then(
        (r) => r.json(),
        () => null,
    );
}
if (!list?.length) throw new Error('inspector did not open on 127.0.0.1:9229');
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
let id = 0;
const waiting = new Map();
const scripts = [];
ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Debugger.scriptParsed') scripts.push(d.params);
    if (d.id && waiting.has(d.id)) waiting.get(d.id)(d);
};
const send = (method, params = {}) =>
    new Promise((r) => {
        waiting.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
    });
await send('Debugger.enable');
await new Promise((r) => setTimeout(r, 1500));
const script = scripts.find((s) => /db-objects-jsonl\/.*objectsInMemServerRedis\.js$/.test(s.url));
if (!script) throw new Error('objectsInMemServerRedis.js not loaded');
const src = (await send('Debugger.getScriptSource', { scriptId: script.scriptId })).result.scriptSource;
const lines = src.split('\n');
const line = lines.findIndex((l) => /^\s+_handleScanOrKeys\(handler, pattern/.test(l)) + 1; // first statement
if (line <= 0) throw new Error('_handleScanOrKeys not found');
const condition =
    '((globalThis.__auraScans ??= []).length < 20000 && globalThis.__auraScans.push({ t: Date.now(), p: String(pattern), c: String(handler.socketId || ""), scan: !!isScan })), false';
const bp = await send('Debugger.setBreakpoint', {
    location: { scriptId: script.scriptId, lineNumber: line },
    condition,
});
if (bp.error) throw new Error(JSON.stringify(bp.error));
console.log(`${ts()} recording SCAN/KEYS for ${SECONDS} s (controller pid ${pid}) ...`);
await new Promise((r) => setTimeout(r, SECONDS * 1000));
await send('Debugger.removeBreakpoint', { breakpointId: bp.result.breakpointId });
const got = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(globalThis.__auraScans || []); ',
    returnByValue: true,
});
await send('Runtime.evaluate', { expression: 'delete globalThis.__auraScans' });
await send('Debugger.disable');
ws.close();
const scans = JSON.parse(got.result.result.value);

// client connection "127.0.0.1:port" -> process name, from the open sockets
const procOf = {};
try {
    for (const l of execSync('ss -tnpH state established').toString().split('\n')) {
        const m = l.match(/\s(\S+:\d+)\s+(\S+:\d+)\s+users:\(\("([^"]+)",pid=(\d+)/);
        if (m) procOf[m[1]] = `${m[3]} (${m[4]})`;
    }
} catch {
    /* no ss */
}
const file = `/root/controller-scans-${ts().replace(/:/g, '')}.json`;
writeFileSync(file, JSON.stringify(scans));
const tally = (key) => {
    const m = new Map();
    for (const s of scans) m.set(key(s), (m.get(key(s)) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
};
console.log(`\n${scans.length} SCAN/KEYS calls`);
console.log('\nby pattern:');
for (const [k, n] of tally((s) => s.p).slice(0, 20)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\nby client:');
// socketId looks like "host.x-Server Objects 127.0.0.1:43834" - the client's end of the connection
const clientOf = (c) => {
    const ep = (c.match(/(\d+\.\d+\.\d+\.\d+:\d+)\s*$/) || [])[1];
    return (ep && procOf[ep]) || c;
};
for (const [k, n] of tally((s) => clientOf(s.c)).slice(0, 15)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\nper 10 s:');
for (const [k, n] of tally((s) => new Date(Math.floor(s.t / 10000) * 10000).toTimeString().slice(0, 8)).sort())
    console.log(`  ${k}  ${n}`);
console.log(`\n${file}`);
process.exit(0);
