// End-to-end check of client ids against a live adapter (#844).
//
//   AURA_BASE=http://localhost:5247 node tools/tests/client-id-e2e.mjs
//
// Every browser context is one device. All contexts share a screen size that is
// random per run, so they are identical twins to the fingerprint — and no earlier
// run (or other test) owns their fingerprint id yet. Needs a dev server proxying
// to the TEST instance; the clients it creates are deleted at the end.
/* global document */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const NS = 'aura.0';
const run = Math.random().toString(36).slice(2, 7);
const screen = { width: 1000 + Math.floor(Math.random() * 900), height: 700 + Math.floor(Math.random() * 300) };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const created = new Set();

const browser = await chromium.launch();

async function device() {
    const context = await browser.newContext({ screen, viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();
    return { context, page };
}

// The live module instances, not fresh copies: a bare import() of the source path
// would build a second store / socket next to the app's.
async function api(page, name) {
    return page.evaluateHandle(async (n) => {
        const url = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .find((u) => u.includes(`/${n}.ts`));
        return import(url);
    }, name);
}

async function open(dev, search = '') {
    await dev.page.goto(`${BASE}/${search}#/`, { waitUntil: 'domcontentloaded' });
    await dev.page.waitForFunction(
        () => performance.getEntriesByType('resource').some((e) => e.name.includes('/connectionStore.ts')),
        null,
        { timeout: 30000 },
    );
}

const clientId = (dev) =>
    dev.page.evaluate(async () => {
        const url = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .find((u) => u.includes('/connectionStore.ts'));
        const s = (await import(url)).useConnectionStore.getState();
        return { id: s.clientId, pinned: s.clientIdPinned, token: s.deviceToken };
    });

async function state(dev, id) {
    const mod = await api(dev.page, 'useIoBroker');
    return dev.page.evaluate(async ([m, sid]) => (await m.getStateDirect(sid))?.val ?? null, [mod, id]);
}

// Wait until the device has settled: its id is pinned, stops moving past the 5 s
// owner recheck, and the adapter has the tree and an owner token for it.
async function settle(dev, label) {
    let last = '';
    let stableSince = 0;
    const until = Date.now() + 60000;
    while (Date.now() < until) {
        const c = await clientId(dev);
        if (c.id !== last) {
            last = c.id;
            stableSince = Date.now();
        }
        if (c.pinned && Date.now() - stableSince > 7000) {
            const name = await state(dev, `${NS}.clients.${c.id}.info.name`);
            const owner = await state(dev, `${NS}.clients.${c.id}.info.deviceToken`);
            if (name && owner) {
                created.add(c.id);
                return c;
            }
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`${label}: client id did not settle (last ${last})`);
}

// Leave the app first: a live page could write its store back on the way out. The
// static JSON is same-origin, so its localStorage is the app's, but no app runs on it.
async function wipeStorage(dev, { cookies = false } = {}) {
    await dev.page.goto(`${BASE}/ai/aura-recipes.json`);
    await dev.page.evaluate(() => localStorage.clear());
    if (cookies) {
        await dev.context.clearCookies();
    }
    const left = await dev.page.evaluate(() => localStorage.length + document.cookie.length);
    if (!cookies) {
        check('the device cookie outlives the storage wipe', left > 0);
    }
}

try {
    // ── 1. Twins: the second device moves off the shared fingerprint id ──────────
    const flur = await device();
    await open(flur);
    const a = await settle(flur, 'flur');
    check('the first twin keeps a fingerprint id', /^[0-9a-f]{16}$/.test(a.id));
    eq(
        'the adapter stores the first twin as owner',
        await state(flur, `${NS}.clients.${a.id}.info.deviceToken`),
        a.token,
    );

    const wz = await device();
    await open(wz);
    const b = await settle(wz, 'wohnzimmer');
    check('the second twin gets its own id', b.id !== a.id, `both on ${a.id}`);
    eq('…owned by its own token', await state(wz, `${NS}.clients.${b.id}.info.deviceToken`), b.token);

    // ── 2. Reloads keep both ids ──────────────────────────────────────────────
    await open(flur);
    eq('twin 1 keeps its id on reload', (await settle(flur, 'flur reload')).id, a.id);
    await open(wz);
    eq('twin 2 keeps its id on reload', (await settle(wz, 'wz reload')).id, b.id);

    // ── 3. Fully "delete web storage": localStorage gone, cookie left ──────────
    await wipeStorage(flur);
    await open(flur);
    const a2 = await settle(flur, 'flur wiped');
    eq('twin 1 survives a wiped web storage', a2.id, a.id);
    eq('…with its old token', a2.token, a.token);

    await wipeStorage(wz);
    await open(wz);
    eq('twin 2 survives a wiped web storage', (await settle(wz, 'wz wiped')).id, b.id);

    // Several wipe/reload rounds, alternating, like a few days of kiosk restarts.
    for (let round = 1; round <= 3; round++) {
        for (const [dev, want, label] of [
            [wz, b.id, 'twin 2'],
            [flur, a.id, 'twin 1'],
        ]) {
            await wipeStorage(dev);
            await open(dev);
            eq(`${label} stable after wipe round ${round}`, (await settle(dev, `${label} r${round}`)).id, want);
        }
    }

    // ── 3b. Twins that start at the same moment (power back after an outage) ────
    {
        const screen2 = { width: screen.width + 1, height: screen.height };
        const make = async () => {
            const context = await browser.newContext({ screen: screen2, viewport: { width: 1200, height: 800 } });
            return { context, page: await context.newPage() };
        };
        const [x, y] = await Promise.all([make(), make()]);
        await Promise.all([open(x), open(y)]);
        // Both find no owner at first; the rechecks after the report split the loser.
        const started = Date.now();
        let apart = false;
        while (!apart && Date.now() - started < 90000) {
            await new Promise((r) => setTimeout(r, 1000));
            apart = (await clientId(x)).id !== (await clientId(y)).id;
        }
        const [cx, cy] = await Promise.all([settle(x, 'twin x'), settle(y, 'twin y')]);
        check('twins started together end up on different ids', cx.id !== cy.id, `both on ${cx.id}`);
        console.log(`  info  twins started together split after ${Math.round((Date.now() - started) / 1000)} s`);
        await Promise.all([open(x), open(y)]);
        const [rx, ry] = await Promise.all([settle(x, 'twin x reload'), settle(y, 'twin y reload')]);
        check('…and keep them after a joint reload', rx.id === cx.id && ry.id === cy.id, `${rx.id}/${ry.id}`);
        await x.context.close();
        await y.context.close();
    }

    // ── 4. ?client= on a PC: applies while in the URL, then the PC is itself again
    const pc = await device();
    await open(pc);
    const own = await settle(pc, 'pc');
    const speaking = `e2e-wz-${run}`;
    await open(pc, `?client=${speaking}`);
    eq('the URL id applies', (await settle(pc, 'pc url')).id, speaking);
    await open(pc);
    const back = await settle(pc, 'pc back');
    eq('without the URL the PC has its own id again', back.id, own.id);
    check(
        'the URL id was never stored',
        !(await pc.page.evaluate(() => localStorage.getItem('aura-connection') + document.cookie)).includes(speaking),
    );

    // ── 5. Kiosk with ?client=: stable through wipes, never split ──────────────
    const kiosk = await device();
    const kioskId = `e2e-flur-${run}`;
    for (let round = 0; round < 3; round++) {
        await open(kiosk, `?client=${kioskId}`);
        eq(`kiosk keeps its URL id (round ${round})`, (await settle(kiosk, 'kiosk')).id, kioskId);
        await wipeStorage(kiosk, { cookies: true });
    }

    // ── 5b. A PC that still carries a tablet's id from the old sticky ?client= ───
    // Giving it its own fixed id in the admin must not delete the tablet's tree.
    {
        const tabletId = `e2e-tab-${run}`;
        const tablet = await device();
        await open(tablet, `?client=${tabletId}`);
        await settle(tablet, 'tablet');

        const moveOwnId = async (dev, from, to) => {
            await dev.page.goto(`${BASE}/ai/aura-recipes.json`);
            await dev.page.evaluate(
                ([id]) => {
                    if (id) {
                        const raw = JSON.parse(localStorage.getItem('aura-connection') ?? '{"state":{},"version":0}');
                        raw.state = { ...raw.state, clientId: id, clientIdPinned: true };
                        localStorage.setItem('aura-connection', JSON.stringify(raw));
                    }
                    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
                },
                [from],
            );
            await dev.page.goto(`${BASE}/#/admin/settings`, { waitUntil: 'domcontentloaded' });
            const row = dev.page.locator('div.px-3.py-2\\.5', { hasText: `ID: ${from}` });
            await row.waitFor({ timeout: 30000 });
            await row.locator('button').nth(1).click();
            const idInput = dev.page.locator('input[placeholder="z.B. wohnzimmer-tablet"]');
            await idInput.fill(to);
            await idInput.press('Enter');
            await new Promise((r) => setTimeout(r, 4000));
            created.add(to);
        };

        const legacyPc = await device();
        await open(legacyPc);
        const pcOwn = await settle(legacyPc, 'legacy pc');
        const pcFixed = `e2e-pc-${run}`;
        await moveOwnId(legacyPc, tabletId, pcFixed);
        check(
            'the tablet tree survives the PC moving off its id',
            !!(await state(tablet, `${NS}.clients.${tabletId}.info.name`)),
        );
        check('the PC got its new fixed id', !!(await state(tablet, `${NS}.clients.${pcFixed}.info.name`)));

        // The PC's own (owned) id → moving off it removes the old tree, as before.
        const pcFixed2 = `e2e-pc2-${run}`;
        await moveOwnId(legacyPc, pcFixed, pcFixed2);
        check(
            'moving off an own id still removes the old tree',
            !(await state(tablet, `${NS}.clients.${pcFixed}.info.name`)),
        );
        created.add(pcOwn.id);
    }

    // ── 6. Both storage and cookie wiped: a known limit, reported, not asserted ──
    await wipeStorage(flur, { cookies: true });
    await open(flur);
    const lost = await settle(flur, 'flur amnesia');
    console.log(
        `  info  twin 1 with storage AND cookies wiped → ${lost.id === a.id ? 'kept its id' : `new id ${lost.id} (twin cannot be told apart)`}`,
    );
} finally {
    // Clean up every client this run created on the test instance.
    try {
        const dev = await device();
        await open(dev);
        const mod = await api(dev.page, 'useIoBroker');
        await settle(dev, 'cleanup');
        const ids = [...created, (await clientId(dev)).id];
        for (const id of ids) {
            await dev.page.evaluate(([m, v]) => m.setStateDirectAsync('aura.0.clients.deleteRequest', v), [mod, id]);
            await new Promise((r) => setTimeout(r, 800));
        }
        console.log(`  info  removed ${ids.length} test clients`);
    } catch (e) {
        console.log(`  warn  cleanup failed: ${e.message}; created: ${[...created].join(', ')}`);
    }
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
