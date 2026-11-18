// Adapter status: font size and button size options (#971), in the browser.
//
//   npx vite --port 5197 --strictPort --host 127.0.0.1    (proxy to a live ioBroker — rows come from getObjectView)
//   AURA_BASE=http://localhost:5197 node tools/tests/adapterstatus-sizes.mjs
//
// Checked: without options the row text is 12 px and the restart icon 14 px with 4 px
// padding (old look); fontSize scales row, status label and filter pills; buttonSize
// scales the restart icon and its touch target. Screenshots go to AURA_SHOT_DIR.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5197';
const SHOT_DIR = process.env.AURA_SHOT_DIR;

let pass = 0;
const fails = [];
const check = (ok, label, detail = '') => {
    if (ok) pass++;
    else fails.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const widget = (id, options, x) => ({
    id,
    type: 'adapterstatus',
    title: id,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 14 },
    options: { allowRestart: true, ...options },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(
    ([ws]) => window.__auraShot.showWidgets(ws),
    [[widget('as-default', {}, 0), widget('as-big', { fontSize: 18, buttonSize: 28 }, 12)]],
);
const card = (id) => page.locator(`[data-aura-widget="${id}"]`).first();
await card('as-default')
    .locator('button[title="Neustart"], button[title="Adapter ist deaktiviert"]')
    .first()
    .waitFor({ timeout: 20000 });
await card('as-big')
    .locator('button[title="Neustart"], button[title="Adapter ist deaktiviert"]')
    .first()
    .waitFor({ timeout: 20000 });
await page.waitForTimeout(500);

const measure = (id) =>
    card(id).evaluate((root) => {
        const btn = root.querySelector('button[title="Neustart"], button[title="Adapter ist deaktiviert"]');
        const row = btn.parentElement;
        const name = row.querySelector('.font-medium.truncate');
        const status = [...row.querySelectorAll('span.font-medium')].pop();
        const pill = [...root.querySelectorAll('button.rounded-full')][0];
        const svg = btn.querySelector('svg').getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        return {
            name: parseFloat(getComputedStyle(name).fontSize),
            status: parseFloat(getComputedStyle(status).fontSize),
            pill: pill ? parseFloat(getComputedStyle(pill).fontSize) : null,
            icon: Math.round(svg.width),
            btn: Math.round(b.width),
        };
    });

const d = await measure('as-default');
const b = await measure('as-big');
console.log('default', JSON.stringify(d));
console.log('big    ', JSON.stringify(b));
check(d.name === 12, 'default row text 12 px', String(d.name));
check(Math.abs(d.status - 10) < 0.1, 'default status label ~10 px', String(d.status));
check(d.icon === 14 && d.btn === 22, 'default restart icon 14 px in a 22 px button', `${d.icon}/${d.btn}`);
check(b.name === 18, 'fontSize 18 -> row text 18 px', String(b.name));
check(Math.abs(b.status - 15) < 0.1, 'status label follows at 0.833em', String(b.status));
check(b.pill !== null && Math.abs(b.pill - 15) < 0.1, 'filter pills follow', String(b.pill));
check(b.icon === 28 && b.btn === 44, 'buttonSize 28 -> 28 px icon in a 44 px button', `${b.icon}/${b.btn}`);
check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/adapterstatus-sizes.png` });

await browser.close();
console.log(`\n${pass} ok, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
