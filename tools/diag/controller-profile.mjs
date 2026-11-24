// Waits until js-controller stops answering (an update, a web restart ...) and then
// records what its main thread does: a 30 s CPU profile over the inspector. The
// profile shows the function that blocks - or "(garbage collector)" when the heap is full.
//
//   node controller-profile.mjs [--threshold 3000] [--seconds 30] [--now]
//
// Opens the Node inspector of the controller (SIGUSR1, 127.0.0.1:9229 only) and leaves it
// open until the controller restarts. Writes /root/controller-<time>.cpuprofile (open it in
// Chrome DevTools > Performance, or send it) plus a short summary on the console.
import net from 'node:net';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > 0 ? process.argv[i + 1] : d;
};
const THRESHOLD = Number(arg('threshold', 3000));
const SECONDS = Number(arg('seconds', 30));
const NOW = process.argv.includes('--now');
const ts = () => new Date().toTimeString().slice(0, 8);

const pid = execSync("pgrep -f '^iobroker.js-controller' | head -1").toString().trim();
if (!pid) throw new Error('js-controller not found');
const cfg = JSON.parse(readFileSync('/opt/iobroker/iobroker-data/iobroker.json', 'utf8'));
console.log(`${ts()} js-controller pid ${pid}, watching states port ${cfg.states.port} (threshold ${THRESHOLD} ms)`);

// Same probe as update-watch.sh: a lower-case `get` of a missing key, no log noise.
async function waitForBlock() {
    const s = net.connect(cfg.states.port, '127.0.0.1');
    let pending = 0;
    s.on('data', () => (pending = 0));
    await new Promise((r) => s.once('connect', r));
    return new Promise((resolve) => {
        const key = 'io.aura-controller-profile';
        const iv = setInterval(() => {
            if (pending && Date.now() - pending > THRESHOLD) {
                clearInterval(iv);
                s.destroy();
                resolve(Date.now() - pending);
            } else if (!pending) {
                pending = Date.now();
                s.write(`*2\r\n$3\r\nget\r\n$${key.length}\r\n${key}\r\n`);
            }
        }, 250);
    });
}

if (!NOW) console.log(`${ts()} blocked for ${await waitForBlock()} ms - attaching`);
// Which processes talk to the DB servers right now, with the bytes queued per connection:
// a large Recv-Q on the controller's side = requests it has not read yet, from that process.
const sockets = () => {
    try {
        return execSync(
            `ss -tnpH state established '( sport = :${cfg.states.port} or sport = :${cfg.objects.port} or dport = :${cfg.states.port} or dport = :${cfg.objects.port} )'`,
        ).toString();
    } catch (e) {
        return `ss failed: ${e.message}`;
    }
};
const sockFile = `/root/controller-${ts().replace(/:/g, '')}.sockets.txt`;
writeFileSync(sockFile, `${ts()} at attach\n${sockets()}`);
process.kill(Number(pid), 'SIGUSR1');
let list;
for (let i = 0; i < 40 && !list; i++) {
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
ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) waiting.get(d.id)(d);
};
const send = (method, params = {}) =>
    new Promise((r) => {
        waiting.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
    });
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 1000 });
await send('Profiler.start');
console.log(`${ts()} profiling ${SECONDS} s ...`);
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const { result } = await send('Profiler.stop');
const file = `/root/controller-${ts().replace(/:/g, '')}.cpuprofile`;
writeFileSync(file, JSON.stringify(result.profile));
writeFileSync(sockFile, `${readFileSync(sockFile, 'utf8')}\n${ts()} after the profile\n${sockets()}`);

// Summary: self time per function, and the stacks that hold most samples.
const p = result.profile;
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const count = new Map();
for (const s of p.samples) count.set(s, (count.get(s) || 0) + 1);
const total = p.samples.length;
const self = new Map();
for (const [nid, c] of count) {
    const f = byId.get(nid).callFrame;
    const k = `${f.functionName || '(anonymous)'} ${f.url.replace(/^.*node_modules\//, '')}:${f.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + c);
}
console.log(`\n${ts()} ${total} samples - self time:`);
for (const [k, c] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${((c / total) * 100).toFixed(1).padStart(5)} %  ${k}`);
const stack = (nid) => {
    const out = [];
    for (let n = nid; n !== undefined; n = parent.get(n)) {
        const f = byId.get(n).callFrame;
        if (f.functionName === '(root)') break;
        out.push(`${f.functionName || '(anonymous)'} ${f.url.replace(/^.*node_modules\//, '')}:${f.lineNumber + 1}`);
    }
    return out;
};
console.log('\nheaviest stacks:');
for (const [nid, c] of [...count].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    console.log(`  ${((c / total) * 100).toFixed(1)} %`);
    for (const line of stack(nid).slice(0, 14)) console.log(`      ${line}`);
}
console.log(`\nprofile: ${file}\nconnections: ${sockFile}`);
ws.close();
process.exit(0);
