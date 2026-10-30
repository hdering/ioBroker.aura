// Every widget type behaves in a popup the way it does on a tab.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/popup-parity.mjs [--only=dimmer,switch]
//
// Popups render widgets WITHOUT WidgetFrame: a popup view goes through TabEmbedBody's
// PopupWidgetCell, an embedded widget (`popup-widget`) through WidgetEmbedBody. Whatever
// the frame does on a tab has to be rebuilt there, and every piece that is not is an
// issue of the kind "works on the tab, not in the popup". So each type × layout from the
// widget schema is rendered three times with the same config and the same values:
//
//   T  on a tab          V  in a popup view (same gridPos)          E  embedded
//
// and compared: errors, visible text, title/value/icon typography, CSS environment,
// size, overflow and what a click on the first control writes. No pixel compare: the
// tab grid is fluid, the popup view sizes its columns itself, so the two never have
// the same size to put side by side. Known, intended differences live in EXPECTED with their reason.
// Plan: C:\projects\tools\plans\popup-widget-paritaet-testplan.md
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'node_modules/.cache/popup-parity');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));

const argOnly = process.argv.find((a) => a.startsWith('--only'));
const ONLY = argOnly ? (argOnly.split('=')[1] ?? process.argv[process.argv.indexOf(argOnly) + 1]).split(',') : null;

// ── Fixtures (from tools/schema/measure-widget-metrics.mjs) ─────────────────────
const DP = 'demo.value';
const DP_BOOL = 'demo.switch';
const DP_DIM = 'demo.dim';
const DP_JSON = 'demo.json';
const DP_HIST = 'demo.hist';
const DP_TEXT = 'demo.text';
const TRIGGER = 'demo.parityTrigger';
const HISTORY_INSTANCE = 'history.0';

const MOCK = {
    [DP]: { val: 21.5, unit: '°C' },
    [DP_BOOL]: true,
    [DP_DIM]: { val: 60, unit: '%' },
    [DP_JSON]: JSON.stringify([
        { Name: 'Zeile 1', Wert: 1 },
        { Name: 'Zeile 2', Wert: 2 },
    ]),
    [DP_HIST]: { val: 1500, unit: 'W' },
    [DP_TEXT]: 'Mein Titel',
    'demo.state': 1,
    'demo.time': 1767225600000,
};

const DP_FOR = {
    switch: DP_BOOL,
    dimmer: DP_DIM,
    slider: DP_DIM,
    knob: DP_DIM,
    thermostat: DP_DIM,
    shutter: DP_DIM,
    light: DP_DIM,
    binarysensor: DP_BOOL,
    windowcontact: DP_BOOL,
    stateimage: DP_BOOL,
    jsontable: DP_JSON,
    chart: DP_HIST,
    historytable: DP_HIST,
};

const listEntries = (n) => Array.from({ length: n }, (_, i) => ({ id: DP, name: `Gerät ${i + 1}` }));
// One datapoint per chip: the widgets key their chips by it.
const chipItems = (n) => Array.from({ length: n }, (_, i) => ({ id: `demo.chip${i + 1}`, label: `Chip ${i + 1}` }));

const OPTIONS_FOR = {
    enum: { entries: [{ value: 1, label: 'Eins' }] },
    countdown: { durationSec: 900 },
    list: { entries: listEntries(4) },
    chips: { chips: chipItems(4) },
    carousel: { items: chipItems(4) },
    chart: { historyInstance: HISTORY_INSTANCE, historyRange: '24h', decimals: 1, unit: 'W' },
    historytable: { historyInstance: HISTORY_INSTANCE, historyCount: 4, unit: 'W' },
    echart: {
        echartMode: 'timeseries',
        echartJsonExtra: '{"animation":false}',
        echartSeries: [
            {
                id: 's1',
                name: 'Leistung',
                datapointId: DP_HIST,
                chartType: 'line',
                historyInstance: HISTORY_INSTANCE,
                yAxisIndex: 0,
            },
        ],
    },
    mediaplayer: {
        titleDp: DP_TEXT,
        artistDp: DP_TEXT,
        playStateDp: DP_BOOL,
        volumeDp: DP_DIM,
        playDp: DP_BOOL,
        pauseDp: DP_BOOL,
    },
    energiebilanz: {
        bars: [
            {
                id: 'b1',
                title: 'Bereich 1',
                totalValue: 3000,
                entries: [{ id: 'b1e1', datapointId: DP_HIST, label: 'Haushalt', unit: 'W' }],
            },
        ],
    },
};

// Types whose content is foreign or time-driven: only render + overflow are compared.
const FOREIGN = new Set(['iframe', 'camera', 'html', 'map', 'slideshow', 'feed', 'evcc', 'echartsPreset']);
// Text that changes by itself between the three renders.
const LIVE_TEXT = new Set([
    'historytable',
    'clock',
    'countdown',
    'timer',
    'datepicker',
    'calendar',
    'loadtimes',
    'adapterlogs',
]);

/**
 * Differences that are intended, by `type` or `type:layout` and check id.
 * E has no grid size of its own (at least 500 px box), so its size is never compared;
 * V only when it is off by more than SIZE_TOL (the tab grid is fluid).
 */
const BIGGER_BOX = 'E zeigt das Widget größer (längere Seite mind. 500 px), die Schrift skaliert mit der Box';
const EXPECTED = {
    'enum:circle': { P3: BIGGER_BOX },
    'shutter:circle': { P3: BIGGER_BOX },
    'thermostat:circle': { P3: BIGGER_BOX },
    weather: { P3: BIGGER_BOX },
    map: { P6: 'Leaflet-Kacheln liegen über den Rand hinaus und werden vom Kartencontainer beschnitten' },
    'fill:wave': { P6: 'der Wellenpfad ist breiter als die Box und wird per clipPath beschnitten' },
    // In the larger box the first control is the button column, a click in its centre hits the gap.
    'shutter:default': { P8: 'Testaufbau: erstes Bedienelement in E ist die Tastenspalte, nicht ein Knopf' },
    // On the tab the widget stamps its stateBaseId only after the first render, so the
    // harness click publishes nothing there; embedded, the stamped id publishes (twice:
    // the tab and the popup instance both report the new state).
    timer: { P8: 'Testaufbau: im Tab fehlt beim ersten Klick noch die stateBaseId' },
    // Pre-existing, not a frame issue: TabEmbedBody sizes its grid with one gap more on
    // each side than the designed width (naturalMinWidth), so narrow cells come out wider.
    button: { P5: 'Popup-Raster rechnet die Breite mit einem Abstand mehr (naturalMinWidth); vorbestehend' },
};
const SIZE_TOL = 0.1;
const expected = (type, layout, check) => EXPECTED[`${type}:${layout}`]?.[check] ?? EXPECTED[type]?.[check] ?? null;

// ── Harness ─────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`);
});
page.on('response', (resp) => {
    // The socket retries against the dead proxy target of an offline dev server.
    if (resp.status() >= 400 && !resp.url().includes('/socket.io/'))
        errors.push(`http ${resp.status()} ${resp.url().replace(BASE, '')}`);
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() => {
    window.__auraShot.enableHistory(true);
    window.__auraShot.captureWrites(true);
});

const settle = (ms = 500) => page.waitForTimeout(ms);

const resetValues = () =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, MOCK);

/** Card element selector per context. */
const CARD = {
    T: (id) => `[data-aura-widget="${id}"] .aura-widget`,
    V: (id) => `[data-aura-click-popup] [data-aura-popup-widget="${id}"] > .aura-widget`,
    E: () => `[data-aura-click-popup="popup-widget"] .aura-widget`,
};

/** Everything compared, read off one card. */
const MEASURE = (sel) => {
    const card = document.querySelector(sel);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const style = (q) => {
        const el = card.querySelector(q);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { fontSize: s.fontSize, color: s.color, fontWeight: s.fontWeight, lineHeight: s.lineHeight };
    };
    // Children that stick out of the card or get cut off by it.
    let outside = 0;
    const samples = [];
    for (const el of card.querySelectorAll('*')) {
        const er = el.getBoundingClientRect();
        if (er.width === 0 || er.height === 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        // Inside a scroller its own overflow is fine.
        let scroller = false;
        for (let n = el.parentElement; n && n !== card; n = n.parentElement) {
            const o = getComputedStyle(n).overflowY;
            if (o === 'auto' || o === 'scroll') {
                scroller = true;
                break;
            }
        }
        if (scroller) continue;
        if (er.left < r.left - 1 || er.top < r.top - 1 || er.right > r.right + 1 || er.bottom > r.bottom + 1) {
            outside++;
            if (samples.length < 3)
                samples.push(
                    `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className)
                        .split(' ')
                        .slice(0, 2)
                        .join(
                            '.',
                        )} ${Math.round(er.width)}x${Math.round(er.height)}@${Math.round(er.left - r.left)},${Math.round(er.top - r.top)}`,
                );
        }
    }
    const firstChild = card.firstElementChild;
    const probe = card.querySelector('.aura-widget-title, .aura-widget-value, span, p, div') ?? card;
    return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (card.innerText || '').replace(/\s+/g, ' ').trim(),
        title: style('.aura-widget-title'),
        value: style('.aura-widget-value'),
        icon: style('.aura-widget-icon'),
        fontScale: getComputedStyle(probe).getPropertyValue('--font-scale').trim(),
        pad: cs.paddingTop,
        padVar: getComputedStyle(firstChild ?? card)
            .getPropertyValue('--aura-widget-pad')
            .trim(),
        classes: ['aura-widget', 'aura-widget-type-'].filter((c) =>
            [...card.classList].some((k) => (c.endsWith('-') ? k.startsWith(c) : k === c)),
        ),
        controls: card.querySelectorAll('button, input, select, [role="slider"], [role="switch"], .aura-widget-action')
            .length,
        graphics: card.querySelectorAll('svg, canvas, img').length,
        empty: !(card.innerText || '').trim() && !card.querySelector('svg, canvas, img, video, iframe'),
        outside,
        outsideSamples: samples,
        clipped: [...card.querySelectorAll('*')].filter((el) => {
            const s = getComputedStyle(el);
            return (
                (s.overflowY === 'hidden' || s.overflow === 'hidden') &&
                el.scrollHeight > el.clientHeight + 2 &&
                el.clientHeight > 0
            );
        }).length,
        auto: card.parentElement?.getAttribute('data-aura-auto-box') === '1',
    };
};

/** The first control a user would tap, as a point; null when there is none. */
const CONTROL = (sel) => {
    const card = document.querySelector(sel);
    if (!card) return null;
    const el = card.querySelector(
        'button:not([disabled]), [role="switch"], input[type="checkbox"], .aura-widget-action:not(input)',
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, what: el.tagName.toLowerCase() };
};

async function closePopups() {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate((dp) => {
        window.__auraShot.dpTriggers(false);
        window.__auraShot.mock({ [dp]: false });
    }, TRIGGER);
    await settle(250);
}

async function openPopup(host, views = []) {
    await page.evaluate(
        ([dp, h, vs]) => {
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.popupViews(vs);
            window.__auraShot.dpTriggers([
                {
                    id: 'pt-parity',
                    name: 'Parity',
                    enabled: true,
                    clause: { datapoint: dp, operator: 'true', value: '' },
                    host: h,
                    resetDp: false,
                },
            ]);
        },
        [TRIGGER, host, views],
    );
    await settle(200);
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), TRIGGER);
    await settle();
}

/** The popup chrome of both popups: no translucency, so pixels compare. */
const POPUP_LOOK = { popupTransparency: 0, popupHideTitle: true };

/** Charts fit their canvas to the box a moment after it opens; two equal readings come too early. */
const LATE_LAYOUT = new Set(['echart', 'chart', 'echartsPreset', 'energiebilanz']);

async function measure(ctxId, id, type) {
    if (LATE_LAYOUT.has(type)) await settle(1200);
    const sel = CARD[ctxId](id);
    // Charts and lazy widgets settle over a few frames: two identical readings.
    let prev = '';
    let m = null;
    for (let i = 0; i < 12; i++) {
        m = await page.evaluate(MEASURE, sel);
        const key = JSON.stringify(m);
        if (m && key === prev) break;
        prev = key;
        await settle(150);
    }
    return m;
}

async function clickFirstControl(ctxId, id) {
    const pt = await page.evaluate(CONTROL, CARD[ctxId](id));
    if (!pt) return null;
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.mouse.click(pt.x, pt.y);
    await settle(300);
    const w = await page.evaluate(() => window.__auraShot.writes());
    // A click that opened a popup of its own: close it before going on.
    return { what: pt.what, writes: w.map((x) => `${x.id}=${JSON.stringify(x.val)}`) };
}

// ── Run ─────────────────────────────────────────────────────────────────────────
const combos = [];
for (const [type, def] of Object.entries(schema.widgets)) {
    if (ONLY && !ONLY.includes(type)) continue;
    const layouts = def.layouts?.length ? def.layouts.filter((l) => l !== 'custom') : ['default'];
    for (const layout of layouts) combos.push({ type, layout, def });
}

const findings = [];
const report = [];
const add = (type, layout, check, ctxId, detail) => {
    const why = expected(type, layout, check);
    findings.push({ type, layout, check, ctx: ctxId, detail, expected: why });
};

let n = 0;
for (const { type, layout, def } of combos) {
    n++;
    const size = def.defaultSize ?? { w: 8, h: 6 };
    const base = {
        type,
        title: 'Parität',
        datapoint: DP_FOR[type] ?? (def.addMode === 'free' ? '' : DP),
        layout,
        gridPos: { x: 0, y: 0, w: size.w, h: size.h },
        options: { ...(OPTIONS_FOR[type] ?? {}) },
    };
    const cfg = (id, extra = {}) => ({ ...base, id, options: { ...base.options, ...extra } });
    const res = { type, layout };
    errors = [];

    // T — on a tab.
    await closePopups();
    await resetValues();
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg('pp-T'));
    await settle(600);
    res.T = await measure('T', 'pp-T', type);
    const errT = errors.splice(0);

    // V — the same widget in a popup view.
    await resetValues();
    await openPopup(
        {
            id: 'pp-host',
            type: 'value',
            title: 'Host',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options: { ...POPUP_LOOK, clickAction: { kind: 'popup-view', viewId: 'pv-parity' } },
        },
        [{ id: 'pv-parity', name: 'Parity', widgets: [cfg('pp-V')] }],
    );
    res.V = await measure('V', 'pp-V', type);
    const errV = errors.splice(0);
    await closePopups();

    // E — the tab widget embedded as the popup body (click action "show widget").
    let TAB_ID = 'pp-T';
    await resetValues();
    await openPopup({
        id: 'pp-host',
        type: 'value',
        title: 'Host',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options: { ...POPUP_LOOK, clickAction: { kind: 'popup-widget', widgetId: TAB_ID } },
    });
    res.E = await measure('E', undefined, type);
    const errE = errors.splice(0);
    await closePopups();

    // P8 — what the first control writes, per context (each on a fresh render).
    if (!FOREIGN.has(type)) {
        await resetValues();
        await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg('pp-T'));
        await settle(500);
        res.clickT = await clickFirstControl('T', 'pp-T');
        await closePopups();
        await resetValues();
        await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg('pp-T2'));
        await openPopup(
            {
                id: 'pp-host',
                type: 'value',
                title: 'Host',
                datapoint: DP,
                gridPos: { x: 0, y: 0, w: 1, h: 1 },
                options: { ...POPUP_LOOK, clickAction: { kind: 'popup-view', viewId: 'pv-parity' } },
            },
            [{ id: 'pv-parity', name: 'Parity', widgets: [cfg('pp-V')] }],
        );
        res.clickV = await clickFirstControl('V', 'pp-V');
        await closePopups();
        await resetValues();
        TAB_ID = 'pp-T2';
        await openPopup({
            id: 'pp-host',
            type: 'value',
            title: 'Host',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options: { ...POPUP_LOOK, clickAction: { kind: 'popup-widget', widgetId: TAB_ID } },
        });
        res.clickE = await clickFirstControl('E');
        await closePopups();
    }
    errors = [];

    // ── Compare ────────────────────────────────────────────────────────────────
    const { T, V, E } = res;
    if (!T) add(type, layout, 'P1', 'T', 'Tab rendert nichts (Testaufbau?)');
    for (const [c, m, errs] of [
        ['V', V, errV],
        ['E', E, errE],
    ]) {
        const own = errs.filter((e) => !errT.includes(e));
        if (own.length) add(type, layout, 'P1', c, own.slice(0, 3).join(' | '));
        if (!m) add(type, layout, 'P1', c, 'Karte nicht gefunden');
        else if (m.empty && T && !T.empty) add(type, layout, 'P1', c, 'leer, im Tab nicht');
    }
    if (T) {
        for (const [c, m] of [
            ['V', V],
            ['E', E],
        ]) {
            if (!m) continue;
            if (!FOREIGN.has(type) && !LIVE_TEXT.has(type) && m.text !== T.text)
                add(type, layout, 'P2', c, `T="${T.text.slice(0, 80)}" ${c}="${m.text.slice(0, 80)}"`);
            for (const part of ['title', 'value', 'icon']) {
                const a = T[part];
                const b = m[part];
                if (!a && !b) continue;
                if (!a || !b) {
                    add(type, layout, 'P3', c, `${part}: T ${a ? 'da' : 'fehlt'}, ${c} ${b ? 'da' : 'fehlt'}`);
                    continue;
                }
                const diff = Object.keys(a).filter((k) => a[k] !== b[k]);
                if (diff.length)
                    add(type, layout, 'P3', c, `${part}: ${diff.map((k) => `${k} ${a[k]} → ${b[k]}`).join(', ')}`);
            }
            if (m.fontScale !== T.fontScale) add(type, layout, 'P4', c, `--font-scale ${T.fontScale} → ${m.fontScale}`);
            if (c === 'V' && m.pad !== T.pad) add(type, layout, 'P4', c, `padding ${T.pad} → ${m.pad}`);
            if (c === 'V' && m.padVar !== T.padVar)
                add(type, layout, 'P4', c, `--aura-widget-pad ${T.padVar} → ${m.padVar}`);
            const missing = T.classes.filter((k) => !m.classes.includes(k));
            if (missing.length) add(type, layout, 'P4', c, `CSS-Klassen fehlen: ${missing.join(', ')}`);
            if (m.controls !== T.controls) add(type, layout, 'P2', c, `Bedienelemente ${T.controls} → ${m.controls}`);
            if (m.outside > T.outside)
                add(type, layout, 'P6', c, `ragt heraus: ${T.outside} → ${m.outside} ${m.outsideSamples.join('; ')}`);
            if (m.clipped > T.clipped) add(type, layout, 'P6', c, `abgeschnitten: ${T.clipped} → ${m.clipped}`);
        }
        const off = (a, b) => Math.abs(a - b) > SIZE_TOL * b;
        if (V && !V.auto && (off(V.w, T.w) || off(V.h, T.h)))
            add(type, layout, 'P5', 'V', `Größe ${T.w}x${T.h} → ${V.w}x${V.h}`);
        if (res.clickT) {
            for (const c of ['V', 'E']) {
                const k = res[`click${c}`];
                const a = res.clickT.writes.join(',');
                const b = k ? k.writes.join(',') : '(kein Bedienelement)';
                if (a !== b) add(type, layout, 'P8', c, `Klick schreibt T [${a}] ${c} [${b}]`);
            }
        }
    }
    report.push(res);
    const own = findings.filter((f) => f.type === type && f.layout === layout && !f.expected);
    console.log(
        `[${n}/${combos.length}] ${type}:${layout} ${own.length ? `${own.length} Abweichung(en): ${[...new Set(own.map((f) => f.check))].join(' ')}` : 'ok'}`,
    );
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ findings, report }, null, 2));

const open = findings.filter((f) => !f.expected);
console.log(
    `\n${combos.length} Kombinationen, ${open.length} offene Abweichungen (${findings.length - open.length} erwartet)`,
);
const byCheck = {};
for (const f of open) (byCheck[f.check] ??= []).push(f);
for (const [check, list] of Object.entries(byCheck).sort()) {
    console.log(`\n${check} (${list.length})`);
    for (const f of list.slice(0, 60)) console.log(`  ${f.type}:${f.layout} [${f.ctx}] ${f.detail}`);
}
console.log(`\nBericht: ${path.join(OUT, 'report.json')}`);
process.exit(open.length ? 1 : 0);
