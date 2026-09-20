// Undo sweep over every admin page: change each control once, expect one history
// step, press Ctrl+Z, expect the value and the save bar back where they were.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/admin-undo-sweep.mjs
//
// Runs in the real admin (dev login fallback, config seeded via localStorage) and
// reads the history through the DEV hook window.__auraEditHistory. Controls are
// found generically — checkboxes, the Toggle button, role=switch, selects, number /
// text / range / color inputs, CodeMirror editors — inside <main> only, so the save
// bar, the nav and open modals are left alone. Buttons that do things (delete,
// reset, restore) are never clicked.
//
// Verdicts per control:
//   ok           one step recorded, Ctrl+Z restored the value and the dirty state
//   FAIL dirty   the save bar armed but no step was recorded — an edit the history
//                cannot take back (the class of bug behind "Meldungen: undo, aber
//                Speichern bleibt aktiv")
//   FAIL undo    a step was recorded, but undo left the value or the dirty state wrong
//   info         nothing recorded and nothing armed — a per-device preference or an
//                immediate datapoint write, both outside the save bar by design
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const MAX_PER_PAGE = Number(process.env.SWEEP_MAX ?? 80);
const ONLY = process.env.SWEEP_ONLY; // substring filter on the route

const PAGES = [
    '#/admin',
    '#/admin/widgets',
    '#/admin/layouts',
    '#/admin/design?tab=values',
    '#/admin/design?tab=sync',
    '#/admin/design?tab=mythemes',
    '#/admin/design?tab=behavior',
    '#/admin/design?tab=icons',
    '#/admin/design?tab=theme',
    '#/admin/design?tab=typo',
    '#/admin/design?tab=grid',
    '#/admin/design?tab=guidelines',
    '#/admin/design?tab=tabbar',
    '#/admin/design?tab=nav',
    '#/admin/design?tab=header',
    '#/admin/design?tab=menu',
    '#/admin/css-js',
    '#/admin/popups',
    '#/admin/messages',
    '#/admin/batteries',
    '#/admin/settings',
    // The editor's widget config panel: open widget w1's "Bearbeiten" modal and
    // sweep the controls inside it, tab by tab.
    {
        route: '#/admin/editor',
        root: '.aura-widget-edit-modal',
        prepare: async (page) => {
            const w = page.locator('.aura-widget-w1').first();
            await w.hover();
            await w.locator('button[title="Widget-Optionen"]').first().click({ timeout: 4000 });
            await page.locator('button:has-text("Bearbeiten")').last().click({ timeout: 4000 });
            await page.locator('.aura-widget-edit-modal').first().waitFor({ timeout: 5000 });
            await page.waitForTimeout(400);
        },
    },
].filter((p) => !ONLY || (typeof p === 'string' ? p : p.route).includes(ONLY));

const widget = (id, type, x, extra = {}) => ({
    id,
    type,
    title: `W ${id}`,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 6 },
    options: { showTitle: true },
    ...extra,
});
const layouts = [
    {
        id: 'layout-default',
        name: 'Standard',
        slug: 'default',
        activeSectionId: 'sec',
        sections: [
            {
                id: 'sec',
                name: 'Bereich',
                slug: 'bereich',
                activeTabId: 'tab1',
                tabs: [
                    {
                        id: 'tab1',
                        name: 'Eins',
                        slug: 'eins',
                        widgets: [widget('w1', 'value', 0), widget('w2', 'switch', 12)],
                    },
                    { id: 'tab2', name: 'Zwei', slug: 'zwei', widgets: [widget('w3', 'value', 0)] },
                ],
            },
        ],
    },
];
const persisted = JSON.stringify({ state: { layouts, activeLayoutId: 'layout-default', editMode: false }, version: 0 });

// ── in-page helpers ──────────────────────────────────────────────────────────
const FIND_CONTROLS = (rootSel) => {
    const main = document.querySelector(rootSel);
    if (!main) return [];
    const inModal = rootSel !== 'main';
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const labelOf = (el) => {
        const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const lab = el.closest('label');
        if (lab && clean(lab.innerText)) return clean(lab.innerText);
        if (el.id) {
            const l = main.querySelector(`label[for="${el.id}"]`);
            if (l && clean(l.innerText)) return clean(l.innerText);
        }
        const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder');
        if (aria) return clean(aria);
        // ToggleRow / field rows: the nearest row with a text node
        let node = el.parentElement;
        for (let i = 0; i < 4 && node && node !== main; i++) {
            const p = node.querySelector('p, label, span');
            if (p && clean(p.innerText)) return clean(p.innerText);
            node = node.parentElement;
        }
        return el.name || el.tagName.toLowerCase();
    };
    const out = [];
    const push = (el, kind) => {
        if (!visible(el) || el.disabled || el.readOnly) return;
        if (el.closest('[data-edit-history], [data-history-panel]')) return;
        if (!inModal && el.closest('.aura-config-modal, [role="dialog"]')) return;
        out.push({ kind, label: labelOf(el), sel: null });
        el.setAttribute('data-sweep', String(out.length - 1));
    };
    main.querySelectorAll('input[type="checkbox"]').forEach((el) => push(el, 'checkbox'));
    main.querySelectorAll('button.w-9.h-5.rounded-full, [role="switch"]').forEach((el) => push(el, 'toggle'));
    main.querySelectorAll('select').forEach((el) => push(el, 'select'));
    main.querySelectorAll('input[type="number"]').forEach((el) => push(el, 'number'));
    main.querySelectorAll('input[type="range"]').forEach((el) => push(el, 'range'));
    main.querySelectorAll('input[type="color"]').forEach((el) => push(el, 'color'));
    main.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach((el) => push(el, 'text'));
    main.querySelectorAll('.cm-content').forEach((el) => push(el, 'code'));
    return out;
};

const READ_VALUE = (i) => {
    const el = document.querySelector(`[data-sweep="${i}"]`);
    if (!el) return '<gone>';
    if (el.classList.contains('cm-content')) return el.innerText;
    if (el.type === 'checkbox') return String(el.checked);
    if (el.tagName === 'BUTTON') return el.getAttribute('aria-checked') ?? el.style.background ?? el.className;
    return String(el.value);
};

// ── run ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, ignoreHTTPSErrors: true });
await ctx.addInitScript((p) => {
    try {
        if (!localStorage.getItem('aura-dashboard')) localStorage.setItem('aura-dashboard', p);
    } catch {
        /* ignore */
    }
}, persisted);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/#/admin/login`, { waitUntil: 'domcontentloaded' });
const pin = page.locator('input[type="password"]').first();
await pin.waitFor({ timeout: 30000 });
await pin.fill('1234');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.waitForFunction(() => !!window.__auraEditHistory, { timeout: 20000 });

const counts = () => page.evaluate(() => window.__auraEditHistory.counts());
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
async function discardIfDirty() {
    if (!(await counts()).dirty) return;
    const btn = page.locator('button:has-text("Verwerfen")').first();
    if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(300);
    }
}

const results = [];
const report = (route, label, kind, verdict, note = '') => {
    results.push({ route, label, kind, verdict, note });
    const flag = verdict.startsWith('FAIL') ? 'FAIL' : verdict === 'ok' ? ' ok ' : 'info';
    console.log(`  ${flag}  ${kind.padEnd(8)} ${label.padEnd(42).slice(0, 42)} ${verdict}${note ? ` — ${note}` : ''}`);
};

for (const entry of PAGES) {
    const { route, root = 'main', prepare, tabs } = typeof entry === 'string' ? { route: entry } : entry;
    console.log(`\n── ${route}`);
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await discardIfDirty();
    if (prepare) {
        try {
            await prepare(page);
        } catch (e) {
            console.log(`  could not prepare: ${String(e.message).split('\n')[0].slice(0, 80)}`);
            continue;
        }
    }
    // One pass per tab of the panel (or a single pass when there are none).
    const tabCount = tabs ? await page.locator(tabs).count() : 0;
    for (let tabIdx = 0; tabIdx < Math.max(1, tabCount); tabIdx++) {
        if (tabs && tabCount > 0) {
            const tab = page.locator(tabs).nth(tabIdx);
            console.log(`  · tab ${await tab.innerText().catch(() => tabIdx)}`);
            await tab.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
        }
        const controls = await page.evaluate(FIND_CONTROLS, root);
        if (controls.length === 0) {
            console.log('  (no controls)');
            continue;
        }
        let n = 0;
        for (let i = 0; i < controls.length && n < MAX_PER_PAGE; i++) {
            const c = controls[i];
            const loc = page.locator(`[data-sweep="${i}"]`);
            if (!(await loc.count()) || !(await loc.isVisible().catch(() => false))) continue;
            n++;
            const before = await counts();
            const valueBefore = await page.evaluate(READ_VALUE, i);
            try {
                if (c.kind === 'checkbox' || c.kind === 'toggle') await loc.click({ timeout: 2000 });
                else if (c.kind === 'select') {
                    const opts = await loc.evaluate((el) =>
                        [...el.options].filter((o) => !o.disabled).map((o) => o.value),
                    );
                    if (opts.length < 2) {
                        report(route, c.label, c.kind, 'info', 'single option');
                        continue;
                    }
                    const idx = (opts.indexOf(valueBefore) + 1) % opts.length;
                    await loc.selectOption(opts[idx], { timeout: 2000 });
                } else if (c.kind === 'number') {
                    const { min, max, step } = await loc.evaluate((el) => ({
                        min: el.min,
                        max: el.max,
                        step: el.step,
                    }));
                    const cur = Number(valueBefore) || 0;
                    const st = Number(step) || 1;
                    let next = cur + st;
                    if (max !== '' && next > Number(max)) next = cur - st;
                    if (min !== '' && next < Number(min)) next = Number(min);
                    if (next === cur) {
                        report(route, c.label, c.kind, 'info', 'no room to change');
                        continue;
                    }
                    await loc.fill(String(next), { timeout: 2000 });
                } else if (c.kind === 'range') {
                    await loc.focus();
                    await page.keyboard.press('ArrowRight');
                } else if (c.kind === 'color') {
                    await loc.fill(valueBefore === '#123456' ? '#654321' : '#123456', { timeout: 2000 });
                } else if (c.kind === 'text') {
                    const type = await loc.evaluate((el) => el.type);
                    if (type === 'password' || type === 'file') {
                        report(route, c.label, c.kind, 'info', `skipped ${type}`);
                        continue;
                    }
                    await loc.fill(`${valueBefore}x`, { timeout: 2000 });
                } else if (c.kind === 'code') {
                    await loc.click({ timeout: 2000 });
                    await page.keyboard.press('End');
                    await page.keyboard.type('x');
                }
            } catch (e) {
                report(
                    route,
                    c.label,
                    c.kind,
                    'info',
                    `could not interact: ${String(e.message).split('\n')[0].slice(0, 60)}`,
                );
                continue;
            }
            await page.waitForTimeout(950); // past the 800 ms coalescing window
            const after = await counts();
            const valueAfter = await page.evaluate(READ_VALUE, i);
            if (valueAfter === valueBefore && after.undo === before.undo) {
                report(route, c.label, c.kind, 'info', 'value did not change');
                await discardIfDirty();
                continue;
            }
            const recorded = after.undo === before.undo + 1;
            if (!recorded) {
                if (after.dirty && !before.dirty) {
                    report(route, c.label, c.kind, 'FAIL dirty', `steps ${before.undo}→${after.undo}`);
                    await discardIfDirty();
                } else if (after.undo > before.undo + 1) {
                    report(route, c.label, c.kind, 'FAIL undo', `${after.undo - before.undo} steps for one edit`);
                    for (let k = 0; k < after.undo - before.undo; k++)
                        await page.evaluate(() => window.__auraEditHistory.undo());
                    await page.waitForTimeout(200);
                } else {
                    report(route, c.label, c.kind, 'info', 'not under the save bar');
                }
                continue;
            }
            await blur();
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(350);
            const undone = await counts();
            const valueUndone = await page.evaluate(READ_VALUE, i);
            const problems = [];
            if (undone.undo !== before.undo) problems.push(`steps ${undone.undo}≠${before.undo}`);
            if (undone.dirty !== before.dirty) problems.push(`dirty ${undone.dirty}≠${before.dirty}`);
            if (valueUndone !== valueBefore)
                problems.push(`value "${String(valueUndone).slice(0, 25)}"≠"${String(valueBefore).slice(0, 25)}"`);
            if (problems.length) {
                report(route, c.label, c.kind, 'FAIL undo', problems.join(', '));
                await discardIfDirty();
            } else report(route, c.label, c.kind, 'ok');
        }
    }
}
await browser.close();

const fails = results.filter((r) => r.verdict.startsWith('FAIL'));
const oks = results.filter((r) => r.verdict === 'ok');
console.log(`\n${oks.length} ok, ${fails.length} FAIL, ${results.length - oks.length - fails.length} info`);
if (pageErrors.length) console.log(`page errors:\n  ${[...new Set(pageErrors)].slice(0, 5).join('\n  ')}`);
if (fails.length) process.exit(1);
