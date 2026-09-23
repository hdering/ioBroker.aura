// Admin → Design: every control a layout overrides carries the orange override
// bar ([data-overridden]) — not just the counter on the group's tab. The section
// menu used to show "2" on its tab while none of its fields were marked.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/design-override-marks.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const tab = (id, name) => ({ id, name, slug: id, widgets: [] });
const LAYOUTS = [
    {
        id: 'lay',
        name: 'Tablet',
        slug: 'tablet',
        sections: [{ id: 'sec', name: 'Home', slug: 'home', tabs: [tab('t1', 'Start')], activeTabId: 't1' }],
        activeSectionId: 'sec',
        settings: {
            // Header: 3 own values
            showHeader: true,
            headerTitle: 'Eigener Titel',
            headerItems: [],
            // Section menu: 6 own values, all visible (enabled + sidebar)
            layoutDrawerEnabled: true,
            layoutDrawerTitle: 'Bereiche',
            layoutDrawerPlacement: 'sidebar',
            layoutDrawerWidth: 300,
            layoutDrawerFontSize: 18,
            layoutDrawerItems: [],
            // Section band, set on the layout
            tabBar: { height: 50, background: '#ff0000' },
            themeId: 'amoled',
            fontScale: 1.2,
            idleReturnEnabled: true,
            idleReturnDelay: 60,
        },
    },
];

// Expected marked controls per group (tab bar: one per overridden field).
const EXPECT = { menu: 6, header: 3, tabbar: 2, theme: 1, typo: 1, nav: 2 };

let failed = 0;
const check = (ok, label, detail = '') => {
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function seed() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((LAYOUTS) => {
        window.__auraShot.mock({});
        window.__auraShot.seed({ layouts: LAYOUTS, activeLayoutId: 'lay' });
    }, LAYOUTS);
}

// Seed once up front: an admin page opened on a layout that does not exist yet
// normalizes ?ctx= back to Global.
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await seed();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

for (const [group, want] of Object.entries(EXPECT)) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/admin/design?ctx=lay&tab=${group}`, { waitUntil: 'networkidle' });
    await seed();
    await page.waitForTimeout(700);
    const badge = page.getByTestId(`design-tab-own-${group}`);
    const n = (await badge.count()) ? Number(await badge.innerText()) : 0;
    const marked = await page.locator('[data-overridden="true"]').count();
    check(n > 0, `${group}: tab shows an own-value counter`, String(n));
    check(marked === want, `${group}: ${want} controls carry the override bar`, String(marked));
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
