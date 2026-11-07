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
// Since the named PINs the panel picks a PIN („Kinder“) instead of typing one, and
// Layouts › Zugriffsschutz lists every PIN with the views that use it.
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
const STUB_TAB = {
    id: 'tKeep',
    name: 'Gesperrt',
    slug: 'gesperrt',
    pinProtected: true,
    pinLength: 4,
    pinCode: 'pc_kids',
    widgets: [],
};
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
            codes: { pc_kids: { name: 'Kinder', len: 4 }, pc_guest: { name: 'Gäste', len: 6 } },
            nextId: 1,
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
            if (url.endsWith('vault/codes') && method === 'GET')
                return send(200, { codes: window.__fakeVault.codes, views: {} });
            if (url.endsWith('vault/codes')) {
                if (body.pin && String(body.pin).length < 4) return send(400, { error: 'pin too short' });
                const id = body.id ?? `pc_new${window.__fakeVault.nextId++}`;
                const prev = window.__fakeVault.codes[id] ?? {};
                const next = {
                    name: body.name || prev.name || id,
                    len: body.pin ? String(body.pin).length : prev.len,
                };
                window.__fakeVault.codes[id] = next;
                return send(200, { id, ...next });
            }
            if (url.endsWith('vault/codes/delete')) {
                delete window.__fakeVault.codes[body.id];
                return send(200, { id: body.id, removed: true });
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

const select = page.locator('select.aura-pin-code');
const mcp = page.locator('.aura-pin-mcp');
const remove = page.locator('.aura-pin-remove');
const showLock = page.locator('.aura-pin-showlock');
const showMarkers = page.locator('.aura-pin-showmarkers');
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
const options = () => select.first().locator('option').allInnerTexts();

try {
    // ── 1. a tab without a PIN ───────────────────────────────────────────────
    await seed(STUB_TAB);
    await openTabPanel('Frei');
    eq('panel of an unprotected tab shows the PIN choice', await visible(select), true);
    eq('… set to „Kein PIN-Schutz“', await select.first().inputValue(), '');
    eq('… offering the named PINs and a new one', await options(), [
        'Kein PIN-Schutz',
        'Gäste (••••••)',
        'Kinder (••••)',
        '+ Neue PIN anlegen …',
    ]);
    eq('… and no MCP release switch', await visible(mcp), false);
    eq('… and nothing to remove', await visible(remove), false);

    // ── 2. creating a PIN on the spot, nothing saved yet ─────────────────────
    await select.first().selectOption('__new');
    await page.locator('.aura-pin-new-name').fill('Oma');
    await page.locator('.aura-pin-new-digits').fill('12');
    await page.locator('.aura-pin-new-create').click();
    await page.waitForTimeout(200);
    eq('a too-short PIN is refused', await page.locator('.aura-pin-new').isVisible(), true);
    await page.locator('.aura-pin-new-digits').fill('4321');
    await page.locator('.aura-pin-new-create').click();
    await page.waitForTimeout(300);
    eq('the new PIN is assigned to the tab (LINK sentinel + id)', await tabState('tFree'), {
        pin: '__aura_link__',
        pinCode: 'pc_new1',
        widgets: 1,
    });
    eq('… and selected in the choice', await select.first().inputValue(), 'pc_new1');
    eq('the PIN settings show right away (MCP release)', await visible(mcp), true);
    eq('… and the remove button', await visible(remove), true);
    // ── the padlock switch (#692) ────────────────────────────────────────────
    eq('… and the padlock switch', await visible(showLock), true);
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
    // ── markers while locked (#944) ──────────────────────────────────────────
    eq('… and the markers switch', await visible(showMarkers), true);
    eq(
        'it starts off — markers name DPs, so they stay in the vault by default',
        await tabState('tFree').then((t) => t.pinShowMarkers),
        undefined,
    );
    await showMarkers.locator('button').first().click();
    await page.waitForTimeout(200);
    eq('switching it on sets pinShowMarkers', await tabState('tFree').then((t) => t.pinShowMarkers), true);
    await showMarkers.locator('button').first().click();
    await page.waitForTimeout(200);
    eq('switching it off clears it again', await tabState('tFree').then((t) => t.pinShowMarkers), undefined);

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
    eq('remove clears the PIN', await select.first().inputValue(), '');
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
        pinCode: 'pc_kids',
        widgets: 1,
    });
    await openTabPanel('Gesperrt');
    eq('a stored tab shows its named PIN', await select.first().inputValue(), 'pc_kids');
    eq('… without „Kein PIN-Schutz“ (removing is the button)', (await options()).includes('Kein PIN-Schutz'), false);
    eq('… the MCP release is there', await visible(mcp), true);
    eq('… and so is the remove button', await visible(remove), true);
    await select.first().selectOption('pc_guest');
    await page.waitForTimeout(200);
    eq('switching a stored tab to another PIN keeps KEEP', await tabState('tKeep'), {
        pin: '__aura_keep__',
        pinCode: 'pc_guest',
        widgets: 1,
    });
    await select.first().selectOption('pc_kids');

    // ── 4b. a free tab picks the existing PIN ────────────────────────────────
    await openTabPanel('Frei');
    await select.first().selectOption('pc_kids');
    await page.waitForTimeout(200);
    eq('picking a PIN sets the LINK sentinel + id', await tabState('tFree'), {
        pin: '__aura_link__',
        pinCode: 'pc_kids',
        widgets: 1,
    });
    eq('… with the PIN settings shown', await visible(remove), true);
    await select.first().selectOption('');
    await page.waitForTimeout(200);
    eq('„Kein PIN-Schutz“ on an unsaved view clears it again', await tabState('tFree'), { widgets: 1 });

    // ── 4c. Layouts › Zugriffsschutz ─────────────────────────────────────────
    await closePanel();
    await page.evaluate(() => {
        location.hash = '#/admin/layouts?ctx=access';
    });
    await page.locator('[data-testid="access-detail"]').waitFor({ timeout: 10000 });
    const kids = page.locator('[data-testid="access-code-pc_kids"]');
    await kids.waitFor({ timeout: 5000 });
    check('the overview lists the PIN with the views that use it', (await kids.innerText()).includes('Gesperrt'));
    check(
        'an unused PIN says so',
        (await page.locator('[data-testid="access-code-pc_guest"]').innerText()).includes('nicht verwendet'),
    );
    eq('a PIN in use cannot be deleted', await kids.locator('button[title*="verwendet"]').isDisabled(), true);
    await kids.getByRole('button', { name: 'PIN ändern' }).click();
    await kids.locator('input[inputmode="numeric"]').fill('987654');
    await kids.getByRole('button', { name: 'Speichern' }).click();
    await page.waitForTimeout(300);
    check('changing the PIN reports success', (await kids.innerText()).includes('PIN geändert'));
    eq(
        '… and the vault got the new code for that PIN',
        await page.evaluate(() => window.__fakeVault.codes.pc_kids.len),
        6,
    );
    const row = page.locator('[data-testid="access-row-tab:sec1:tFree"]');
    await row.locator('select.aura-pin-code').selectOption('pc_guest');
    await page.waitForTimeout(200);
    eq('the table assigns a PIN to any tab', await tabState('tFree'), {
        pin: '__aura_link__',
        pinCode: 'pc_guest',
        widgets: 1,
    });
    check(
        '… and the PIN list follows at once',
        (await page.locator('[data-testid="access-code-pc_guest"]').innerText()).includes('Frei'),
    );
    await row.locator('.aura-pin-remove').click();
    await page.waitForTimeout(200);
    eq('… and takes it away again', await tabState('tFree'), { widgets: 1 });
    await page.evaluate(() => {
        location.hash = '#/admin/editor';
    });
    await page.waitForTimeout(800);

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
        pinCode: 'pc_kids',
        widgets: 0,
    });
    await openTabPanel('Gesperrt');
    eq('a redacted stub still shows its PIN', await select.first().inputValue(), 'pc_kids');
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
