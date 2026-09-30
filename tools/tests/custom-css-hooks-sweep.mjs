// Custom CSS reaches every widget's title, symbol and header items — across every
// widget type and layout.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/custom-css-hooks-sweep.mjs
//
// A user writes `.aura-widget-title { color: red; }` into the custom CSS — no
// !important. That only works when no widget sets the colour inline on the element
// itself (an inline style beats every stylesheet rule), and when the title really
// carries the class. Checked here with plain rules for title, symbol, header items
// and the six header slots; `--only type,type` narrows the run.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
// No header of their own: the mirror renders its source, the menu is navigation.
const SKIP = new Set(['mirror', 'menu']);

const TITLE = 'rgb(255, 0, 0)';
const ICON = 'rgb(0, 0, 255)';
const ITEM = 'rgb(0, 128, 0)';
const SLOT = 'rgb(255, 0, 255)';
const GROUP_BG = 'rgb(1, 2, 3)';
const GROUP_FG = 'rgb(4, 5, 6)';
const CSS = `
.aura-widget-title { color: ${TITLE}; }
.aura-widget-icon { color: ${ICON}; }
.aura-header-item { color: ${ITEM}; }
.aura-header-slot-r2-left { outline-color: ${SLOT}; }
.aura-group-header { background-color: ${GROUP_BG}; color: ${GROUP_FG}; }
`;
const SLOTS = ['r1-left', 'r1-center', 'r1-right', 'r2-left', 'r2-center', 'r2-right'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (!ok) console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((css) => {
    const el = document.createElement('style');
    el.id = 'probe-css';
    el.textContent = css;
    document.head.appendChild(el);
}, CSS);
await page.waitForTimeout(700);

const ITEMS = SLOTS.map((slot) => ({ id: `hi-${slot}`, source: 'text', text: `HI-${slot}`, slot }));

let seq = 0;
const untitled = [];
for (const [type, meta] of Object.entries(schema.widgets)) {
    if (SKIP.has(type) || (ONLY && !ONLY.has(type))) continue;
    for (const layout of meta.layouts?.length ? meta.layouts : ['default']) {
        const id = `cc-${++seq}`;
        await page.evaluate(
            ([w]) => window.__auraShot.showWidgets([w]),
            [
                {
                    id,
                    type,
                    title: 'Probe',
                    datapoint: '',
                    layout,
                    gridPos: { x: 0, y: 0, w: 16, h: 12 },
                    options: { headerItems: ITEMS, showIcon: true, showTitle: true },
                },
            ],
        );
        await page
            .waitForSelector(`[data-aura-widget="${id}"] [data-header-item]`, { timeout: 3000 })
            .catch(() => undefined);
        await page.waitForTimeout(150);
        const res = await page.evaluate((wid) => {
            const card = document.querySelector(`[data-aura-widget="${wid}"]`);
            if (!card) return null;
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
            };
            const titles = [...card.querySelectorAll('.aura-widget-title')].filter(visible);
            // "Probe" drawn somewhere without the class: a title custom CSS cannot reach.
            const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
            const unmarked = [];
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent.includes('Probe')) continue;
                const el = n.parentElement;
                // A button's caption falls back to the title (button, httpRequest) — a
                // label, not the widget's title.
                if (el && visible(el) && !el.closest('.aura-widget-title, button, .aura-widget-action'))
                    unmarked.push(el.tagName);
            }
            const icons = [...card.querySelectorAll('.aura-widget-icon')].filter(visible).map((el) => {
                // The painted colour is the svg's: its own `color`, and a stroke/fill
                // attribute that is currentColor (lucide's color prop writes a fixed one).
                const svgs = el.tagName.toLowerCase() === 'svg' ? [el] : [...el.querySelectorAll('svg')];
                const bad = svgs
                    .map((s) => {
                        const c = getComputedStyle(s).color;
                        const stroke = s.getAttribute('stroke');
                        const fixed = stroke && stroke !== 'currentColor' && stroke !== 'none' ? stroke : null;
                        return fixed ? `stroke=${fixed}` : c;
                    })
                    .filter(Boolean);
                return { color: getComputedStyle(el).color, svgs: bad, tag: el.tagName };
            });
            const items = [...card.querySelectorAll('.aura-header-item')]
                .filter(visible)
                .map((el) => getComputedStyle(el).color);
            const slots = [...card.querySelectorAll('[data-header-slot]')].map((el) => ({
                slot: el.getAttribute('data-header-slot'),
                cls: el.className,
            }));
            // The group's head alone (#726): background and text colour from custom CSS.
            const gh = card.querySelector('.aura-group-header');
            const group = gh ? { bg: getComputedStyle(gh).backgroundColor, fg: getComputedStyle(gh).color } : null;
            return { titles: titles.map((el) => getComputedStyle(el).color), unmarked, icons, items, slots, group };
        }, id);
        const label = `${type}/${layout}`;
        if (!res) {
            check(`${label}: card rendered`, false);
            continue;
        }
        // Layouts without a title (minimal tiles, the map, a custom grid without a title
        // cell) are listed, not failed — "every title carries the class" catches a title
        // that is drawn but unmarked.
        if (res.titles.length === 0) untitled.push(label);
        res.titles.forEach((c, i) => check(`${label}: title ${i} takes the CSS colour`, c === TITLE, c));
        // button/custom: the title is the button caption in the value cell — a label.
        if (label !== 'button/custom')
            check(`${label}: every title carries the class`, res.unmarked.length === 0, res.unmarked.join(','));
        res.icons.forEach((ic, i) => {
            check(`${label}: icon ${i} takes the CSS colour`, ic.color === ICON, ic.color);
            ic.svgs.forEach((c, j) => check(`${label}: icon ${i} svg ${j} paints it`, c === ICON, c));
        });
        if (type === 'group') {
            check(`${label}: group header carries its class`, !!res.group);
            if (res.group) {
                check(`${label}: group header takes the CSS background`, res.group.bg === GROUP_BG, res.group.bg);
                check(`${label}: group header takes the CSS colour`, res.group.fg === GROUP_FG, res.group.fg);
            }
        }
        res.items.forEach((c, i) => check(`${label}: header item ${i} takes the CSS colour`, c === ITEM, c));
        for (const s of res.slots) {
            check(`${label}: slot ${s.slot} has its class`, s.cls.includes(`aura-header-slot-${s.slot}`), s.cls);
        }
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();

console.log(`
without a title (${untitled.length}): ${untitled.join(', ')}`);
const failed = results.filter((r) => !r.ok);
console.log(`\ncustom-css-hooks-sweep: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
