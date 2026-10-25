// The real browser backend of the speech output (issue #834) in Chromium:
// autoplay refused → `blocked`, the announcement waits, a tap plays it; with
// autoplay allowed (Fully Kiosk setting / --autoplay-policy flag) it plays at once.
//
//   node tools/tests/speech-browser.mjs
//
// No dev server: utils/speechPlayer.ts is bundled into a blank page served by a
// tiny local HTTP server, together with a generated 0.3 s WAV.
//
// The page queues the announcement on its own and reports in document.title:
// Playwright's page.evaluate counts as a user gesture, so a single evaluate
// before the tap would already unlock sound and the refusal could never be seen.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';

const { outputFiles } = await build({
    stdin: {
        contents: `import { SpeechQueue, browserSpeechBackend } from './src-vis/utils/speechPlayer.ts';
const log = [];
const show = (e) => { log.push(e); document.title = log.join(); };
const q = new SpeechQueue(browserSpeechBackend(), { onResult: show, onBlocked: (b) => show('blocked:' + b) });
// Like SpeechOutput: any tap retries, synchronously inside the gesture.
window.addEventListener('pointerdown', () => q.unlock(), true);
q.enqueue({ req: { file: '/gong.wav' }, volume: 50, url: '/gong.wav', queuedAt: Date.now() });`,
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'warning',
});
const js = outputFiles[0].text;

/** 0.3 s of a 440 Hz tone, 8 kHz mono 8-bit. */
function wav() {
    const n = 2400;
    const buf = Buffer.alloc(44 + n);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + n, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(8000, 24);
    buf.writeUInt32LE(8000, 28);
    buf.writeUInt16LE(1, 32);
    buf.writeUInt16LE(8, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(n, 40);
    for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / 8000));
    return buf;
}
const sound = wav();

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/gong.wav')) {
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(sound);
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
        `<!doctype html><html><head><title></title></head><body style="height:100vh"><script>${js}</script></body></html>`,
    );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** Poll the title without page.evaluate (which would count as a gesture). */
async function titleAfter(page, until, ms = 5000) {
    const end = Date.now() + ms;
    let t = await page.title();
    while (!until(t) && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 100));
        t = await page.title();
    }
    return t;
}

async function open(policy) {
    const browser = await chromium.launch({ args: [`--autoplay-policy=${policy}`] });
    const page = await browser.newPage();
    await page.goto(base);
    return { browser, page };
}

// ── Autoplay refused (what a plain Chrome does) ──────────────────────────────
{
    const { browser, page } = await open('document-user-activation-required');
    const before = await titleAfter(page, (t) => t.length > 0);
    await new Promise((r) => setTimeout(r, 500));
    check('without a gesture the file is blocked, not lost', (await page.title()) === 'blocked,blocked:true', before);
    await page.mouse.click(50, 50);
    const after = await titleAfter(page, (t) => t.includes('played'));
    check('after a tap it plays', after === 'blocked,blocked:true,blocked:false,played', after);
    await browser.close();
}

// ── Autoplay allowed (Fully Kiosk / Chrome flag) ─────────────────────────────
{
    const { browser, page } = await open('no-user-gesture-required');
    const log = await titleAfter(page, (t) => t.includes('played') || t.includes('blocked') || t.includes('error'));
    check('with autoplay allowed it plays straight away', log === 'played', log);
    await browser.close();
}

server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
