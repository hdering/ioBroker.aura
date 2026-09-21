#!/usr/bin/env node
// ── PIN panel of the admin editor ────────────────────────────────────────────
// Three things it got wrong:
//   1. „Über MCP bearbeitbar“ appeared only for a view the vault already knew, so
//      after typing a PIN it stayed hidden until the next save + reload.
//   2. A PIN that WAS set could not be taken back — a server-side PIN shows an
//      empty input, so „Feld leeren entfernt den Schutz“ named a gesture that
//      does not exist.
//   3. Right after saving a new PIN the panel lost every PIN setting: it keyed off
//      the KEEP sentinel, which exists only once the editor has pulled the
//      protected content out of the vault. The redacted stub the adapter serves
//      counts now too.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/pin-editor-ui.mjs
//
// The layout is seeded through the screenshot harness (`?shot=1`, screenshotMode →
// nothing is persisted to the instance) and /api/aura is answered by a fake vault
// inside the page, so the whole round trip runs without an adapter.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const widget = (id) => ({
    id,
    type: 'info',
    title: id,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});
const KEPT_WIDGET = widget('wKeep');

// tFree → no PIN · tKeep → protected: the adapter serves a redacted stub and
// keeps the widgets in the vault.
const STUB_TAB = { id: 'tKeep', name: 'Gesperrt', slug: 'gesperrt', pinProtected: true, pinLength: 4, widgets: [] };
const layoutWith = (keepTab) => ({
    id: 'l-pinedit',
    name: 'PinEdit',
    slug: 'pinedit',
    activeSectionId: 'sec1',
    sections: [
        {
            id: 'sec1',
            name: 'Bereich',
            slug: 'bereich',
            activeTabId: 'tFree',
            tabs: [{ id: 'tFree', name: 'Frei', slug: 'frei', widgets: [widget('wFree')] }, keepTab],
        },
    ],
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
await ctx.addInitScript(
    ({ keptWidget }) => {
        localStorage.setItem(
            'aura-auth',
            JSON.stringify({ state: { token: 'faketoken', sessionActive: true }, version: 0 }),
        );
        // Fake security API — a vault holding the protected tab's widgets.
        window.__fakeVault = {
            readFails: false,
            calls: [],
            sections: {
                'tab:sec1:tKeep': {
                    scope: 'tab',
                    name: 'Gesperrt',
                    pinRelock: 'leave',
                    mcpWrite: false,
                    content: { widgets: [keptWidget] },
                },
            },
        };
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!url.includes('/api/aura/')) return realFetch(input, init);
            const method = init?.method ?? 'GET';
            window.__fakeVault.calls.push(`${method} ${url}`);
            const send = (status, obj) =>
                Promise.resolve(
                    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }),
                );
            const body = init?.body ? JSON.parse(init.body) : {};
            const entry = window.__fakeVault.sections[body.key];
            if (url.endsWith('admin/status')) return send(200, { configured: true });
            if (url.endsWith('/vault')) {
                if (window.__fakeVault.readFails) return send(500, { error: 'nope' });
                return send(200, { sections: window.__fakeVault.sections });
            }
            if (url.endsWith('vault/mcp')) {
                if (!entry) return send(404, { error: 'unknown key' });
                entry.mcpWrite = !!body.enabled;
                return send(200, { key: body.key, mcpWrite: entry.mcpWrite });
            }
            if (url.endsWith('vault/remove')) {
                if (!entry) return send(200, { key: body.key, removed: false });
                delete window.__fakeVault.sections[body.key];
                return send(200, {
                    key: body.key,
                    removed: true,
                    restored: true,
                    scope: entry.scope,
                    content: entry.content,
                });
            }
            return send(404, { error: 'unknown endpoint' });
        };
    },
    { keptWidget: KEPT_WIDGET },
);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 40000 });

const input = page.locator('.aura-pin-input');
const mcp = page.locator('.aura-pin-mcp');
const remove = page.locator('.aura-pin-remove');
const showLock = page.locator('.aura-pin-showlock');
const visible = async (loc) =>
    loc
        .first()
        .isVisible()
        .catch(() => false);
const seed = async (keepTab) => {
    await page.evaluate((l) => window.__auraShot.seed({ layouts: [l] }), layoutWith(keepTab));
    await page.waitForTimeout(700);
};
const closePanel = async () => {
    await page.locator('body').click({ position: { x: 3, y: 3 } });
    await page.waitForTimeout(150);
};
/** Open the settings panel of one tab (the gear next to its name in the tab list). */
const openTabPanel = async (name) => {
    await closePanel();
    const row = page.locator('.aura-tab-manage-row', { hasText: name }).first();
    await row.locator('button:has(svg.lucide-settings)').first().click();
    await page.waitForTimeout(250);
};
const tabState = (id) => page.evaluate((t) => window.__auraShot.tabPin('sec1', t), id);
const pinBlockText = () => input.first().evaluate((el) => el.parentElement.innerText);

try {
    // ── 1. a tab without a PIN ───────────────────────────────────────────────
    await seed(STUB_TAB);
    await openTabPanel('Frei');
    eq('panel of an unprotected tab shows the PIN field', await visible(input), true);
    eq('… and no MCP release switch', await visible(mcp), false);
    eq('… and nothing to remove', await visible(remove), false);

    // ── 2. typing a PIN, nothing saved yet ───────────────────────────────────
    await input.first().fill('4321');
    await page.waitForTimeout(200);
    eq('typing a PIN shows the MCP release right away', await visible(mcp), true);
    eq('… and the remove button', await visible(remove), true);
    // ── the padlock switch (#692) ────────────────────────────────────────────
    eq('typing a PIN also offers the padlock switch', await visible(showLock), true);
    eq(
        'it starts on — a locked entry shows its padlock by default',
        await tabState('tFree').then((t) => t.pinHideLock),
        undefined,
    );
    await showLock.locator('button').first().click();
    await page.waitForTimeout(200);
    eq('switching it off sets pinHideLock', await tabState('tFree').then((t) => t.pinHideLock), true);
    await showLock.locator('button').first().click();
    await page.waitForTimeout(200);
    eq('switching it back on clears the flag again', await tabState('tFree').then((t) => t.pinHideLock), undefined);

    check(
        'the MCP hint text is the one the panel promises',
        (await mcp.first().innerText()).includes('Über MCP bearbeitbar'),
        await mcp.first().innerText(),
    );

    // The vault cannot take a release for a view it does not know yet.
    await mcp.locator('button').first().click();
    await page.waitForTimeout(300);
    check(
        'a release flipped before the first save is parked, not refused',
        (await mcp.first().innerText()).includes('Speichern'),
        await mcp.first().innerText(),
    );
    eq(
        'the parked release is remembered for the view',
        await page.evaluate(() => Object.keys(window.__auraShot.mcpPending?.() ?? {})),
        ['tab:sec1:tFree'],
    );

    // ── 3. taking that PIN back is a local clear (no vault entry) ────────────
    await remove.first().click();
    await page.waitForTimeout(250);
    eq('remove clears the PIN', await input.first().inputValue(), '');
    eq('… hides the MCP release', await visible(mcp), false);
    eq('… and its own button', await visible(remove), false);
    eq('… and the padlock switch', await visible(showLock), false);
    eq(
        '… and drops the parked release with it',
        await page.evaluate(() => Object.keys(window.__auraShot.mcpPending?.() ?? {})),
        [],
    );
    eq('… while the tab keeps its widgets', await tabState('tFree'), { widgets: 1 });

    // ── 4. a protected tab whose content the editor pulled from the vault ────
    eq('the vault content is merged onto the stub', await tabState('tKeep'), {
        pin: '__aura_keep__',
        widgets: 1,
    });
    await openTabPanel('Gesperrt');
    eq('a server-side PIN shows an empty field (the code never comes back)', await input.first().inputValue(), '');
    eq('… the MCP release is there', await visible(mcp), true);
    eq('… and so is the remove button', await visible(remove), true);

    // ── 5. the same panel on a bare stub — the state right after a save ──────
    // The editor has NOT pulled the content (the vault read fails here), so `pin`
    // is undefined and only `pinProtected` says the view is locked. That is what
    // used to render an empty panel.
    await closePanel();
    await page.evaluate(() => {
        window.__fakeVault.readFails = true;
    });
    await seed(STUB_TAB);
    eq('the stub stays a stub while the vault read fails', await tabState('tKeep'), {
        pinProtected: true,
        widgets: 0,
    });
    await openTabPanel('Gesperrt');
    eq('a redacted stub still shows the PIN as set', await visible(input), true);
    check('… with the server-side hint', (await pinBlockText()).includes('Serverseitig'), await pinBlockText());
    eq('… the MCP release', await visible(mcp), true);
    eq('… and the remove button', await visible(remove), true);

    // ── 6. removing it works from that state too ─────────────────────────────
    // The adapter restores the content and forgets the entry; the answer carries
    // the payload, so the editor ends up with the widgets it never had.
    await remove.first().click();
    await page.waitForTimeout(500);
    eq('the removal reached the vault', await page.evaluate(() => Object.keys(window.__fakeVault.sections)), []);
    eq('the restored content lands in the editor, unprotected', await tabState('tKeep'), { widgets: 1 });
    eq('… and the panel offers a fresh PIN again', await visible(remove), false);
} finally {
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
