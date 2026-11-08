// Verifies the Menü widget's own header (issue #949) in a real browser against the
// dev server.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5174
//   node tools/tests/menu-header.mjs
//
// The menu had no title/icon header at all, although the header dialog offered both.
// It now draws one — but OFF unless switched on, so menus placed before (which carry
// the default title "Menü" and no showTitle) do not suddenly grow a header row.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WID = 'menu-header-test';
const SEL = `.aura-widget-${WID}`;

const layout = (options) => ({
    id: 'lay-test',
    name: 'Zuhause',
    slug: 'zuhause',
    activeSectionId: 'sec-wohnen',
    sections: [
        {
            id: 'sec-wohnen',
            name: 'Wohnen',
            slug: 'wohnen',
            activeTabId: 'tab-start',
            tabs: [
                {
                    id: 'tab-start',
                    name: 'Start',
                    slug: 'start',
                    widgets: [
                        {
                            id: WID,
                            type: 'menu',
                            title: 'Navigation',
                            datapoint: '',
                            gridPos: { x: 0, y: 0, w: 14, h: 6 },
                            options,
                        },
                    ],
                },
                { id: 'tab-licht', name: 'Licht', slug: 'licht', widgets: [] },
            ],
        },
    ],
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function open(options) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/view/zuhause/s/wohnen/tab/start`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    const ls = [layout(options)];
    await page.evaluate((l) => window.__auraShot.seed({ layouts: l, activeLayoutId: l[0].id }), ls);
    await page.waitForSelector(`${SEL} .aura-widget-row`, { timeout: 10000 });
    await page.waitForTimeout(300);
}

const titleText = () =>
    page.$$eval(`${SEL} .aura-widget-title`, (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));
const iconCount = () => page.$$eval(`${SEL} .aura-widget-icon`, (els) => els.length);

for (const menuMode of ['tab', 'overview']) {
    await open({ menuMode });
    let t = await titleText();
    check(`[${menuMode}] no header by default (old menus stay unchanged)`, t.length === 0, t.join(','));
    check(`[${menuMode}] no header icon by default`, (await iconCount()) === 0);

    await open({ menuMode, showTitle: true });
    t = await titleText();
    check(`[${menuMode}] showTitle: the widget title is shown`, JSON.stringify(t) === '["Navigation"]', t.join(','));
    check(`[${menuMode}] showTitle alone: no icon`, (await iconCount()) === 0);

    await open({ menuMode, showTitle: true, showIcon: true });
    check(`[${menuMode}] showIcon: the header icon is shown`, (await iconCount()) === 1);
    const entries = await page.$$eval(`${SEL} button`, (els) => els.length);
    check(`[${menuMode}] the entries are still there`, entries >= 2, String(entries));
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
