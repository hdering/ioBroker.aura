// What WidgetFrame adds to a widget on a tab also works in a popup.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/popup-frame-features.mjs
//
// Part two of the popup parity plan (C:\projects\tools\plans\popup-widget-paritaet-testplan.md);
// popup-parity.mjs compares the widget bodies, this one the frame around them. Popups
// render widgets without WidgetFrame, so every option the frame reads — own title and
// icon look (#725), header items (#676), the status row on the card (#792), condition
// styles and element rules, style overrides, wrapped titles, the write lock of a
// disabled widget — has to be honoured by the popup cell too. One feature at a time,
// each on a tab (T), in a popup view (V) and embedded (E); V and E must match T.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.value';
const DP_BOOL = 'demo.switch';
const TRIGGER = 'demo.frameTrigger';
const MOCK = { [DP]: { val: 21.5, unit: '°C' }, [DP_BOOL]: true, 'demo.batt': true };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));
const settle = (ms = 450) => page.waitForTimeout(ms);

const CARD = {
    T: '[data-aura-widget="ff-w"] .aura-widget',
    V: '[data-aura-click-popup] [data-aura-popup-widget="ff-w"] > .aura-widget',
    E: '[data-aura-click-popup="popup-widget"] .aura-widget',
};

const READ = (sel) => {
    const card = document.querySelector(sel);
    if (!card) return null;
    const st = (q) => {
        const el = card.querySelector(q);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { color: s.color, size: s.fontSize, weight: s.fontWeight, style: s.fontStyle, ws: s.whiteSpace };
    };
    return {
        title: st('.aura-widget-title'),
        value: st('.aura-widget-value'),
        icon: st('.aura-widget-icon'),
        bg: getComputedStyle(card).backgroundColor,
        text: (card.innerText || '').replace(/\s+/g, ' ').trim(),
        status: !!card.querySelector('[data-aura-status-row]'),
    };
};

async function closePopups() {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate((dp) => {
        window.__auraShot.dpTriggers(false);
        window.__auraShot.mock({ [dp]: false });
    }, TRIGGER);
    await settle(200);
}

async function openPopup(action, views = []) {
    await page.evaluate(
        ([dp, a, vs]) => {
            window.__auraShot.popupViews(vs);
            window.__auraShot.dpTriggers([
                {
                    id: 'pt-ff',
                    name: 'FF',
                    enabled: true,
                    clause: { datapoint: dp, operator: 'true', value: '' },
                    host: {
                        id: 'ff-host',
                        type: 'value',
                        title: 'Host',
                        datapoint: 'demo.value',
                        gridPos: { x: 0, y: 0, w: 1, h: 1 },
                        options: { popupTransparency: 0, popupHideTitle: true, clickAction: a },
                    },
                    resetDp: false,
                },
            ]);
        },
        [TRIGGER, action, views],
    );
    await settle(150);
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), TRIGGER);
    await settle();
}

/** The widget on a tab, in a popup view and embedded: its reading in each. */
async function inAll(widget, after) {
    const out = {};
    const run = async (c) => {
        const r = await page.evaluate(READ, CARD[c]);
        out[c] = after ? { ...r, ...(await after(c)) } : r;
    };
    await closePopups();
    await page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, MOCK);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    await settle(600);
    await run('T');
    await openPopup({ kind: 'popup-view', viewId: 'pv-ff' }, [{ id: 'pv-ff', name: 'FF', widgets: [widget] }]);
    await run('V');
    await closePopups();
    await page.evaluate((m) => window.__auraShot.mock(m), MOCK);
    await openPopup({ kind: 'popup-widget', widgetId: 'ff-w' });
    await run('E');
    await closePopups();
    return out;
}

const value = (options, extra = {}) => ({
    id: 'ff-w',
    type: 'value',
    title: 'Rahmen',
    datapoint: DP,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { icon: 'Thermometer', showIcon: true, ...options },
    ...extra,
});

/** One feature: `pick` reads the property under test, which has to differ from the plain widget. */
async function feature(name, widget, pick, after) {
    console.log(`\n${name}`);
    const r = await inAll(widget, after);
    const t = pick(r.T);
    check(`T zeigt es (Testaufbau)`, t !== undefined && t !== null && t !== false, JSON.stringify(t));
    for (const c of ['V', 'E']) {
        const v = r[c] ? pick(r[c]) : '(keine Karte)';
        check(
            `${c} wie T`,
            JSON.stringify(v) === JSON.stringify(t),
            `T ${JSON.stringify(t)} ${c} ${JSON.stringify(v)}`,
        );
    }
}

const plain = await inAll(value({}));
const differs = (key, sub) => (r) => {
    const v = sub ? r[key]?.[sub] : r[key];
    const p = sub ? plain.T[key]?.[sub] : plain.T[key];
    return v !== p ? v : null;
};

// R4 — own title / icon look (#725).
await feature('R4a eigene Titelfarbe', value({ titleColor: '#ff0000' }), differs('title', 'color'));
await feature('R4b eigene Titelgröße', value({ titleSize: 22 }), differs('title', 'size'));
await feature('R4c eigene Icon-Farbe', value({ iconColor: '#00aa00' }), differs('icon', 'color'));
await feature('R4d Titel mit [[dp]]', value({}, { title: 'Temp [[demo.value]]' }), (r) =>
    r.text.includes('21.5') && !r.text.includes('[[') ? 'aufgelöst' : r.text,
);

// R2 — header items (#676).
await feature(
    'R2 Kopf-Element (Text)',
    value({ headerItems: [{ id: 'h1', source: 'text', slot: 'r1-right', text: 'KOPFWERT' }] }),
    (r) => r.text.includes('KOPFWERT') || null,
);

// R1 — the status row the frame mounts on the card (#792): gauge is one of those types.
await feature(
    'R1 Statuszeile auf der Karte (gauge, Batterie)',
    {
        id: 'ff-w',
        type: 'gauge',
        title: 'Rahmen',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 8, h: 8 },
        options: { batteryDp: 'demo.batt' },
    },
    (r) => r.status || null,
);

// R3 — conditions: whole-card style and element rules.
const always = [{ datapoint: '', operator: '>', value: '0' }];
await feature(
    'R3a Bedingung: Hintergrund',
    value({ conditions: [{ id: 'c1', logic: 'AND', clauses: always, style: { bg: '#334455' } }] }),
    differs('bg'),
);
await feature(
    'R3b Bedingung: fett',
    value({ conditions: [{ id: 'c1', logic: 'AND', clauses: always, style: { bold: true } }] }),
    differs('title', 'weight'),
);
await feature(
    'R3c Bedingung: Wertfarbe (Element)',
    value({
        conditions: [{ id: 'c1', logic: 'AND', clauses: always, style: {}, elements: { value: { color: '#ff00ff' } } }],
    }),
    differs('value', 'color'),
);
await feature(
    'R3d Bedingung sperrt: Klick schreibt nichts',
    {
        id: 'ff-w',
        type: 'switch',
        title: 'Rahmen',
        datapoint: DP_BOOL,
        gridPos: { x: 0, y: 0, w: 8, h: 4 },
        options: {
            conditions: [{ id: 'c1', logic: 'AND', clauses: always, style: {}, disableWidget: true }],
        },
    },
    (r) => (r.writes === 0 ? 'gesperrt' : `${r.writes} Schreibzugriff(e)`),
    async (c) => {
        const pt = await page.evaluate((sel) => {
            const el = document.querySelector(`${sel} button, ${sel} [role="switch"]`);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        }, CARD[c]);
        if (!pt) return { writes: -1 };
        await page.evaluate(() => window.__auraShot.writes(true));
        await page.mouse.click(pt.x, pt.y);
        await settle(250);
        return { writes: (await page.evaluate(() => window.__auraShot.writes())).length };
    },
);

// Style override (Darstellung → Karte).
await feature('R8 Stil-Überschreibung: Hintergrund', value({ styleOverride: { bg: '#225522' } }), differs('bg'));

// Wrapped title (textLines).
await feature(
    'R9 Titel umbrechen (textLines)',
    value({ textLines: 2 }, { title: 'Ein sehr langer Titel der in der Karte umbrechen muss' }),
    differs('title', 'ws'),
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
