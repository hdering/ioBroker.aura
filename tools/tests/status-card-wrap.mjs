// Statusübersicht, card layout: long values never run past the tile. By default they end
// in "…" on one line; with cardTextWrap they wrap, even inside one long word.
//
//   AURA_BASE=http://127.0.0.1:5231 node tools/tests/status-card-wrap.mjs
//
// The harness data has no long text value, so the test writes one into the rendered
// tiles - what is checked is the CSS of the tile, not the value formatting.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const LONG_VALUE = 'Fenster_Wohnzimmer_links_gekippt_seit_heute_morgen_um_sieben';
const LONG_NAME = 'shelly/1/SHWT-1_08F9E0444075_1/sensor/battery';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

let n = 0;
async function show(options) {
    n += 1;
    await page.evaluate(
        ([w]) => window.__auraShot.showWidgets([w]),
        [
            {
                id: `w-card-wrap-${n}`,
                type: 'statusoverview',
                title: 'Status',
                datapoint: '',
                layout: 'card',
                gridPos: { x: 0, y: 0, w: 3, h: 12 },
                options: { valueFilter: 'all', cardMinWidth: 96, ...options },
            },
        ],
    );
    // Adapter discovery is offline here - wait for real tiles, not a fixed delay.
    await page.waitForSelector('.aura-status-tile', { timeout: 30000 });
    return page.evaluate(
        ([value, name]) => {
            const tile = document.querySelector('.aura-status-tile');
            tile.querySelector('.aura-status-tile-value').textContent = value;
            tile.querySelector('.aura-status-tile-name').textContent = name;
            const t = tile.getBoundingClientRect();
            const grid = tile.parentElement.getBoundingClientRect();
            const v = tile.querySelector('.aura-status-tile-value');
            const nm = tile.querySelector('.aura-status-tile-name').getBoundingClientRect();
            return {
                tileRight: t.right,
                gridRight: grid.right,
                valueRight: v.getBoundingClientRect().right,
                valueHeight: v.getBoundingClientRect().height,
                valueClipped: v.scrollWidth > v.clientWidth + 1,
                nameRight: nm.right,
                tileWidth: t.width,
                // overflow: hidden on a grid item once squashed every tile to a sliver.
                squashed: [...document.querySelectorAll('.aura-status-tile')].some(
                    (el) => el.scrollHeight > el.clientHeight + 1,
                ),
                lineHeight: parseFloat(getComputedStyle(v).fontSize),
            };
        },
        [LONG_VALUE, LONG_NAME],
    );
}

// ── default: one line, "…" ──
const off = await show({});
check('tile stays inside the card', off.tileRight <= off.gridRight + 1, `${off.tileRight} vs ${off.gridRight}`);
check('value stays inside the tile', off.valueRight <= off.tileRight + 1, `${off.valueRight} vs ${off.tileRight}`);
check('value is cut to one line', off.valueClipped && off.valueHeight < off.lineHeight * 1.6, JSON.stringify(off));
check('tiles keep their full height', !off.squashed);
check('long name wraps inside the tile', off.nameRight <= off.tileRight + 1, `${off.nameRight} vs ${off.tileRight}`);

// ── cardTextWrap: several lines, still inside ──
const on = await show({ cardTextWrap: true });
check('wrap: tile stays inside the card', on.tileRight <= on.gridRight + 1, `${on.tileRight} vs ${on.gridRight}`);
check('wrap: value stays inside the tile', on.valueRight <= on.tileRight + 1, `${on.valueRight} vs ${on.tileRight}`);
check('wrap: value takes several lines', !on.valueClipped && on.valueHeight > on.lineHeight * 1.6, JSON.stringify(on));
check('wrap: tiles keep their full height', !on.squashed);
check('wrap: tile keeps its width', Math.abs(on.tileWidth - off.tileWidth) < 2, `${on.tileWidth} vs ${off.tileWidth}`);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
