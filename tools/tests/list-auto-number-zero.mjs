// ─────────────────────────────────────────────────────────────────────────────
// Liste — display "Auto" keeps a number datapoint at 0/1 a number (forum post 1361833)
// ─────────────────────────────────────────────────────────────────────────────
// "Auto" drew every 0/1 value as a switch, reading only the value: a consumption
// counter (common.type number, role state) at 0 became a toggle, at 0.1 a number.
// The object's type now decides — number stays a value, unless its role is a
// switch/button; a datapoint without object keeps the old value-based guess.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-auto-number-zero.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const OBJECTS = {
    'demo.pellets.kg': { type: 'state', common: { type: 'number', role: 'state' } },
    'demo.pump.on': { type: 'state', common: { type: 'number', role: 'switch' } },
};

let seq = 0;
/** One list widget on one datapoint at `value`; `toggle` = no number printed in the row (a control instead). */
async function probe(type, dp, value) {
    const id = `w-${type}-${++seq}`;
    const widget = {
        id,
        type,
        title: 'Liste',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 24, h: 6 },
        options: { entries: [{ id: dp, label: 'Wert' }] },
    };
    await page.evaluate(
        ([w, dp, v, objs]) => {
            const a = window.__auraShot;
            a.mockObject(objs);
            a.mock({ [dp]: v });
            a.mockServerState({ [dp]: v });
            a.showWidgets([w]);
        },
        [widget, dp, value, OBJECTS],
    );
    await page.waitForTimeout(500);
    await page.evaluate(([dp, v]) => window.__auraShot.mock({ [dp]: v }), [dp, value]);
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => document.querySelector('.aura-widget')?.innerText ?? '');
    return { toggle: !/Wert\s+\d/.test(text), text };
}

for (const type of ['list', 'autolist']) {
    const zero = await probe(type, 'demo.pellets.kg', 0);
    check(`${type}: number DP at 0 shows the value`, !zero.toggle, JSON.stringify(zero));
    const one = await probe(type, 'demo.pellets.kg', 1);
    check(`${type}: number DP at 1 shows the value`, !one.toggle, JSON.stringify(one));
    const sw = await probe(type, 'demo.pump.on', 0);
    check(`${type}: number DP with role switch stays a toggle`, sw.toggle, JSON.stringify(sw));
    const bare = await probe(type, 'demo.noobject.x', 0);
    check(`${type}: DP without object keeps the old guess (toggle)`, bare.toggle, JSON.stringify(bare));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
