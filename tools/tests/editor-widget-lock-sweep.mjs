// Issue #655, the wide half: every widget that can write must be mute in the
// editor. One widget per run, twice — once as the frontend (the click must do
// something, otherwise the second half proves nothing) and once as the editor
// (the same click must do nothing at all).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/editor-widget-lock-sweep.mjs
//
// Writes are captured by the harness and never reach the socket.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ONLY = process.env.ONLY ?? '';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const B = 'demo.lock.bool';
const N = 'demo.lock.num';

// Every type whose card carries a control (.aura-widget-action) plus the two that
// act through the adapter instead of a datapoint.
const CASES = [
    { type: 'switch', datapoint: B, options: {} },
    { type: 'light', datapoint: B, options: {} },
    { type: 'dimmer', datapoint: N, options: {} },
    { type: 'shutter', datapoint: N, options: {} },
    { type: 'slider', datapoint: N, options: {} },
    { type: 'knob', datapoint: N, options: {} },
    { type: 'thermostat', datapoint: N, options: {} },
    { type: 'mediaplayer', datapoint: B, options: { playDp: B, pauseDp: B, stopDp: B, showStop: true } },
    { type: 'aircontrol', datapoint: B, options: { powerDp: B, targetTempDp: N, currentTempDp: N } },
    {
        type: 'chips',
        datapoint: N,
        // The action class sits on the chip ROW here, the chips themselves are
        // the buttons inside it — press those.
        sel: '.aura-widget-action button',
        options: {
            chips: [
                { id: 'a', label: 'A', dp: N, value: 1 },
                { id: 'b', label: 'B', dp: N, value: 2 },
            ],
        },
    },
];


const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const MOCK = { [B]: false, [N]: 20 };

async function render(cfg, editMode) {
    await page.evaluate(
        ([widget, edit, mock]) => {
            window.__auraShot.captureWrites(false);
            window.__auraShot.captureWrites(true);
            window.__auraShot.mockServerState(mock);
            window.__auraShot.mock(mock);
            window.__auraShot.showWidgets([widget], { editMode: edit });
            window.__auraShot.setEditMode(edit);
            window.__auraShot.mock(mock);
        },
        [cfg, editMode, MOCK],
    );
    await page.waitForTimeout(450);
}

/** Press every control on the card the way a hand would. Returns how many were hit. */
async function pressAll(id, sel = '.aura-widget-action') {
    const boxes = await page.evaluate(([wid, s]) => {
        const els = [...document.querySelectorAll(`.aura-widget-${wid} ${s}`)];
        return els
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 2 && r.height > 2)
            .map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
    }, [id, sel]);
    for (const p of boxes) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(120);
    }
    return boxes.length;
}

const writes = () => page.evaluate(() => window.__auraShot.writes().length);

for (const c of CASES) {
    if (ONLY && ONLY !== c.type) continue;
    const id = `w-${c.type}`;
    const cfg = {
        id,
        type: c.type,
        title: c.type,
        datapoint: c.datapoint,
        gridPos: { x: 0, y: 0, w: 10, h: 8 },
        options: c.options,
    };

    await render(cfg, false);
    const hit = await pressAll(id, c.sel);
    const live = await writes();

    await render(cfg, true);
    const hitEdit = await pressAll(id, c.sel);
    const inEditor = await writes();

    if (hit === 0) {
        check(`${c.type}: control found`, false, 'no .aura-widget-action rendered');
        continue;
    }
    if (live === 0) {
        check(`${c.type}: control writes in the frontend`, false, `${hit} control(s) pressed, 0 writes`);
        continue;
    }
    check(
        `${c.type}: silent in the editor`,
        inEditor === 0,
        `frontend ${live} write(s) from ${hit} control(s) → editor ${inEditor} from ${hitEdit}`,
    );
}

// ── Phase B: every remaining type — the card must be deaf ─────────────────
// No write proof here (most of these need a configured device to write at all),
// but the lock is structural: if the body is marked inert and every interactive
// element in it computes pointer-events:none, no click can reach a handler.
const DEAF_TYPES = [
    'value', 'thermostat', 'chart', 'list', 'clock', 'calendar', 'header', 'echart', 'evcc', 'weather',
    'gauge', 'camera', 'autolist', 'image', 'iframe', 'fill', 'trash', 'trashSchedule', 'jsontable',
    'html', 'windowcontact', 'binarysensor', 'stateimage', 'echartsPreset', 'datepicker', 'climate',
    'universal', 'enum', 'carousel', 'timer', 'adapterstatus', 'scriptstatus', 'adapterlogs', 'input',
    'alarm', 'energiebilanz', 'httpRequest', 'button', 'map', 'statusoverview', 'loadtimes', 'mirror',
    'messages', 'menu',
];

const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], .aura-widget-action';

const deafFailures = [];
for (const type of DEAF_TYPES) {
    if (ONLY && ONLY !== type) continue;
    const id = `w-deaf-${type}`;
    await render(
        { id, type, title: type, datapoint: N, gridPos: { x: 0, y: 0, w: 10, h: 8 }, options: {} },
        true,
    );
    const verdict = await page.evaluate(
        ([wid, sel]) => {
            const frame = document.querySelector(`.aura-widget-${wid}`);
            if (!frame) return { rendered: false };
            const body = frame.querySelector('.aura-widget-inert');
            if (!body) return { rendered: true, inert: false };
            const live = [...body.querySelectorAll(sel)].filter(
                (el) => getComputedStyle(el).pointerEvents !== 'none',
            );
            return { rendered: true, inert: true, controls: body.querySelectorAll(sel).length, live: live.length };
        },
        [id, INTERACTIVE],
    );
    if (!verdict.rendered || !verdict.inert || verdict.live > 0) {
        deafFailures.push(`${type}: ${JSON.stringify(verdict)}`);
    }
}
check(
    `every other widget type is deaf in the editor (${DEAF_TYPES.length} types)`,
    deafFailures.length === 0,
    deafFailures.join(' | '),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
