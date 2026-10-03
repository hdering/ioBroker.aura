// Saving a PIN-protected view must not close the open widget dialog (#740).
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (oder AURA_BASE setzen)
//   AURA_BASE=http://localhost:5199 node tools/tests/pin-save-echo.mjs
//
// The adapter answers a save with a redacted config.dashboard: the protected view
// becomes a stub without widgets. The test feeds such a copy through the real sync
// path (useConfigSync's applyOneState + rehydrateAll) while „Widget bearbeiten“ is
// open, and expects the editor to keep the view's content — same widget node, dialog
// still open, PIN kept as the keep-marker. Control: a view the editor holds without
// a PIN takes the stub as is, and the dialog closes — the mechanism behind the bug.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const KEEP_PIN = '__aura_keep__';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const widget = (id, x) => ({
    id,
    type: 'value',
    title: `W ${id}`,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 6 },
    options: { showTitle: true },
});

/** scope: 'section' | 'tab' | 'none' — where the editor holds a PIN. */
function seed(scope) {
    const tab = { id: 'tab1', name: 'Eins', slug: 'eins', widgets: [widget('w1', 0), widget('w2', 12)] };
    if (scope === 'tab') tab.pin = KEEP_PIN;
    const section = { id: 'sec', name: 'Bereich', slug: 'bereich', activeTabId: 'tab1', tabs: [tab] };
    if (scope === 'section') section.pin = KEEP_PIN;
    const layouts = [
        { id: 'layout-default', name: 'Standard', slug: 'default', activeSectionId: 'sec', sections: [section] },
    ];
    return JSON.stringify({ state: { layouts, activeLayoutId: 'layout-default', editMode: false }, version: 0 });
}

const browser = await chromium.launch();

async function run(scope, stubScope) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
    await ctx.addInitScript((p) => {
        if (!localStorage.getItem('aura-dashboard')) localStorage.setItem('aura-dashboard', p);
    }, seed(scope));
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/#/admin/login`);
    const pin = page.locator('input[type="password"]').first();
    await pin.waitFor({ timeout: 30000 });
    await pin.fill('1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/#/admin/editor`);
    const w = page.locator('.aura-widget-w1').first();
    await w.waitFor({ timeout: 20000 });
    await w.hover();
    await w.locator('button[title="Widget-Optionen"]').first().click();
    await page.locator('button:has-text("Bearbeiten")').last().click();
    await page.locator('.aura-widget-edit-modal').first().waitFor({ timeout: 5000 });
    await page.evaluate(() => {
        document.querySelector('.aura-widget-edit-modal').dataset.mark = '1';
        window.__w1 = document.querySelector('.aura-widget-w1');
    });

    // The adapter's answer: the protected view redacted to a stub.
    const applied = await page.evaluate(async (stubScope) => {
        const sync = await import('/src-vis/hooks/useConfigSync.ts');
        const carry = await import('/src-vis/utils/protectedCarryOver.ts');
        let refresh = 0;
        const off = carry.onVaultRefreshRequest(() => refresh++);
        const loader = await import('/src-vis/utils/configLoader.ts');
        const parsed = JSON.parse(localStorage.getItem('aura-dashboard'));
        const sec = parsed.state.layouts[0].sections[0];
        if (stubScope === 'section') {
            for (const k of ['pin', 'badges', 'badgeAggregate']) delete sec[k];
            sec.pinProtected = true;
            sec.pinLength = 4;
            sec.tabs = sec.tabs.map((t) => ({ id: t.id, name: t.name, slug: t.slug, widgets: [] }));
        } else {
            const t = sec.tabs[0];
            sec.tabs[0] = { id: t.id, name: t.name, slug: t.slug, widgets: [], pinProtected: true, pinLength: 4 };
        }
        const ok = sync.applyOneState('aura-dashboard', JSON.stringify(parsed), false);
        if (ok) loader.rehydrateAll(true);
        off();
        return refresh;
    }, stubScope);
    await page.waitForTimeout(800);

    const after = await page.evaluate(async () => {
        const { useDashboardStore } = await import('/src-vis/store/dashboardStore.ts');
        const sec = useDashboardStore.getState().layouts[0].sections[0];
        return {
            modal: document.querySelector('.aura-widget-edit-modal')?.dataset.mark ?? null,
            sameNode: window.__w1 === document.querySelector('.aura-widget-w1'),
            widgets: sec.tabs[0].widgets.map((x) => x.id),
            secPin: sec.pin ?? null,
            tabPin: sec.tabs[0].pin ?? null,
            stub: !!(sec.pinProtected || sec.tabs[0].pinProtected),
        };
    });
    await ctx.close();
    return { applied, after, pageErrors };
}

console.log('section PIN, redacted echo');
{
    const { applied, after, pageErrors } = await run('section', 'section');
    check('Tresor wird nachgelesen', applied === 1, String(applied));
    check('Dialog bleibt offen', after.modal === '1', JSON.stringify(after));
    check('Widget nicht neu gemountet', after.sameNode);
    check('Inhalt behalten', after.widgets.join() === 'w1,w2', after.widgets.join());
    check('Kein Platzhalter im Editor', !after.stub);
    check('PIN als Keep-Marker', after.secPin === KEEP_PIN, after.secPin);
    check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
}

console.log('tab PIN, redacted echo');
{
    const { applied, after, pageErrors } = await run('tab', 'tab');
    check('Tresor wird nachgelesen', applied === 1, String(applied));
    check('Dialog bleibt offen', after.modal === '1', JSON.stringify(after));
    check('Widget nicht neu gemountet', after.sameNode);
    check('Inhalt behalten', after.widgets.join() === 'w1,w2', after.widgets.join());
    check('PIN als Keep-Marker', after.tabPin === KEEP_PIN, after.tabPin);
    check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
}

console.log('Kontrolle: Editor hält keinen PIN, Platzhalter kommt durch');
{
    const { applied, after } = await run('none', 'section');
    check('kein Nachlesen angestoßen', applied === 0, String(applied));
    check('Platzhalter übernommen', after.stub && after.widgets.length === 0, JSON.stringify(after));
    check('Dialog geht mit zu (ohne Fix der Normalfall)', after.modal === null, JSON.stringify(after));
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
