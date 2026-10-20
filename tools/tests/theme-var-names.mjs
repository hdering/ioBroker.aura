// Theme editor shows the CSS variable behind each colour, and the section drawer
// stays legible on glass themes — issue #814.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/theme-var-names.mjs
//
// The glass themes paint --app-surface almost transparent. The overlay drawer used
// it as its only ground, so the tabs and widgets behind it showed straight through
// the entries. The drawer now lays the page background underneath and the
// navigation colour on top — the same token the section and tab bars use.
//
// Runs offline, never touches an instance.
/* global document, getComputedStyle */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const dashboard = JSON.stringify({
    state: {
        layouts: [
            {
                id: 'layout-default',
                name: 'Tablet',
                slug: 'default',
                sections: ['Standard', 'History'].map((n, i) => ({
                    id: `section-${i}`,
                    name: n,
                    slug: n.toLowerCase(),
                    tabs: [{ id: `tab-${i}`, name: 'Dashboard', slug: 'dashboard', widgets: [] }],
                    activeTabId: `tab-${i}`,
                })),
                activeSectionId: 'section-0',
            },
        ],
        activeLayoutId: 'layout-default',
        editMode: false,
    },
    version: 0,
});

const config = (placement) =>
    JSON.stringify({
        state: { frontend: { layoutDrawerEnabled: true, layoutDrawerPlacement: placement, layoutDrawerItems: [] } },
        version: 0,
    });

const browser = await chromium.launch();
const pageErrors = [];

async function openPage(placement, customVars = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
        return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const theme = JSON.stringify({ state: { themeId: 'frosted-glass', customVars }, version: 0 });
    await page.addInitScript(
        ([dash, cfg, th]) => {
            localStorage.setItem('aura-dashboard', dash);
            localStorage.setItem('aura-config', cfg);
            localStorage.setItem('aura-theme', th);
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
        },
        [dashboard, config(placement), theme],
    );
    return { ctx, page };
}

// Background of the drawer as the eye sees it: the aside itself plus its ground layer.
const drawerGround = (page) =>
    page.evaluate(() => {
        const aside = [...document.querySelectorAll('aside')].find((a) => a.className.includes('z-[1001]'));
        if (!aside) {
            return null;
        }
        const layer = aside.querySelector(':scope > [aria-hidden]');
        const cs = getComputedStyle(aside);
        return {
            asideImage: cs.backgroundImage,
            asideColor: cs.backgroundColor,
            layer: layer ? getComputedStyle(layer).backgroundColor : null,
        };
    });

// ── Overlay drawer on Frosted Glass ──────────────────────────────────────────
{
    const { ctx, page } = await openPage('floating');
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    const trigger = page
        .locator('button[aria-label]')
        .filter({ has: page.locator('svg.lucide-menu') })
        .first();
    await trigger.waitFor({ state: 'visible', timeout: 30000 });
    await page.mouse.move(20, 20);
    await trigger.click();
    await page.getByText('History', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    const g = await drawerGround(page);
    check('drawer found', !!g);
    check(
        'drawer has the page gradient as a closed ground',
        !!g && g.asideImage.startsWith('linear-gradient'),
        g?.asideImage.slice(0, 50),
    );
    check('navigation colour lies on top', !!g && /rgba\(255, 255, 255, 0\.06\)/.test(g.layer ?? ''), g?.layer ?? '');
    await page.screenshot({ path: 'node_modules/.cache/theme-var-names-drawer.png' });
    await ctx.close();
}

// ── --nav-bg reaches the overlay drawer ──────────────────────────────────────
{
    const { ctx, page } = await openPage('floating', { '--nav-bg': '#ff0000' });
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    const trigger = page
        .locator('button')
        .filter({ has: page.locator('svg.lucide-menu') })
        .first();
    await trigger.waitFor({ state: 'visible', timeout: 30000 });
    await page.mouse.move(20, 20);
    await trigger.click();
    await page.getByText('History', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const g = await drawerGround(page);
    check('Navigation → background colours the overlay drawer', g?.layer === 'rgb(255, 0, 0)', g?.layer ?? '');
    await ctx.close();
}

// ── --nav-bg reaches the docked sidebar ──────────────────────────────────────
{
    const { ctx, page } = await openPage('sidebar', { '--nav-bg': '#00ff00' });
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.getByText('History', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const bg = await page.evaluate(() => {
        const el = [...document.querySelectorAll('aside')].find((a) => a.textContent.includes('History'));
        return el ? getComputedStyle(el).backgroundColor : null;
    });
    check('Navigation → background colours the docked sidebar', bg === 'rgb(0, 255, 0)', bg ?? '');
    await ctx.close();
}

// ── Variable names in the theme editor ───────────────────────────────────────
{
    const { ctx, page } = await openPage('floating');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
    await page.goto(`${BASE}/#/admin/design?ctx=global&tab=theme`, { waitUntil: 'domcontentloaded' });
    const names = page.locator('[data-aura-theme-var-name]');
    await names.first().waitFor({ state: 'visible', timeout: 30000 });
    const all = await names.evaluateAll((els) => els.map((e) => e.textContent));
    check(
        'every labelled row names its variable',
        all.includes('--app-surface') && all.includes('--nav-bg'),
        `${all.length} names`,
    );
    const inputs = await page.locator('[data-aura-theme-var]').count();
    check('one name per field', all.length === inputs, `${all.length} names / ${inputs} fields`);
    // Long names wrap inside the label column instead of pushing into the swatch.
    const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('[data-aura-theme-var-name]')].some((b) => {
            const col = b.parentElement.getBoundingClientRect();
            return b.getBoundingClientRect().right > col.right + 0.5;
        }),
    );
    check('names stay inside the label column', !overflow);
    await page.locator('[data-aura-theme-var-name="--app-surface"]').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    check('click copies var(--app-surface)', clip === 'var(--app-surface)', String(clip));
    await page.locator('[data-aura-theme-vars]').screenshot({ path: 'node_modules/.cache/theme-var-names-editor.png' });
    await ctx.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
