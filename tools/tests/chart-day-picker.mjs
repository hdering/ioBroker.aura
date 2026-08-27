// Verifies the date field of the advanced chart's day navigation (issue #594).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/chart-day-picker.mjs
//
// The chart could only be walked to a day one ◀ at a time. A date now jumps straight there:
// `dayOffset` stays the single source of truth, so the picked date is only turned into its
// distance from today. Checked here: the trigger exists, a picked date moves the window to that
// exact day, the field cannot reach into the future, and ◀ still steps on from where it landed.
//
// The native picker itself is the browser's and cannot be driven headlessly — the date field it
// writes into is, which is the same path a real pick takes.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
};
/** The label the widget renders for a day — same locale and fields as the button. */
const labelFor = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.power': 1500 });
    window.__auraShot.mockServerState({ 'demo.power': 1500 });
    window.__auraShot.enableHistory(true);
    window.__auraShot.showWidgets([
        {
            id: 'w-echart-daynav',
            type: 'echart',
            title: 'Leistung',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            options: {
                echartMode: 'timeseries',
                echartDayNav: true,
                echartShowCurrent: false,
                echartSeries: [
                    {
                        id: 's1',
                        name: 'Leistung',
                        datapointId: 'demo.power',
                        chartType: 'line',
                        color: '#3b82f6',
                        historyInstance: 'history.0',
                        historyRange: '24h',
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    ]);
});

const field = page.locator('.react-grid-item input[type="date"]');
const trigger = page.locator('.react-grid-item button[title="Datum wählen"]');
await field.waitFor({ state: 'attached', timeout: 15000 });

check('the day navigation carries a date trigger', (await trigger.count()) === 1);
check('and a date field behind it', (await field.count()) === 1);

// The field has to stay RENDERED — showPicker() throws on a display:none input.
const rendered = await field.evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
});
check('the field is collapsed, not hidden away', rendered);

check(
    'no future day can be picked',
    (await field.getAttribute('max')) === iso(new Date()),
    await field.getAttribute('max'),
);

/** Write a date the way the browser's picker does, and let React see it. */
const pick = async (value) => {
    await field.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForTimeout(400);
};

// ── A date three days back lands on exactly that day ─────────────────────────
{
    const target = daysAgo(3);
    await pick(iso(target));
    check(
        'a picked date moves the window to that day',
        (await trigger.innerText()).includes(labelFor(target)),
        await trigger.innerText(),
    );
    check('and the field holds it', (await field.inputValue()) === iso(target), await field.inputValue());
}

// ── ◀ carries on from the picked day rather than from today ──────────────────
{
    const target = daysAgo(4);
    await page.locator('.react-grid-item button[title="Einen Tag zurück"]').click();
    await page.waitForTimeout(400);
    check(
        '◀ steps on from the picked day',
        (await trigger.innerText()).includes(labelFor(target)),
        await trigger.innerText(),
    );
}

// ── "Heute" returns, and the field follows it ────────────────────────────────
{
    await page.locator('.react-grid-item button[title="Zum aktuellen Tag"]').click();
    await page.waitForTimeout(400);
    check('Heute returns to today', (await field.inputValue()) === iso(new Date()), await field.inputValue());
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
