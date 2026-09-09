#!/usr/bin/env node
// ── Admin-PIN change in Einstellungen (#632) ─────────────────────────────────
// „Neuer PIN in beide Felder, PIN speichern → Falscher PIN“, every time.
//
// The form never asks for the old PIN, so „wrong PIN“ could not be the reason:
// the admin session is an 8 h server token, the editor gate is a flag in
// localStorage. A tab left open (or reopened the next morning) still looked
// logged in while every admin call answered 401 — and the change form printed
// that as „Falscher PIN“.
//
// Checked here: the change works on a live session (and keeps the fresh token the
// server hands back), an expired one says so and lands on the login page, an
// unreachable adapter is its own message, and the password manager can no longer
// prefill the „new PIN“ field (the yellow field in the report).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/admin-pin-change.mjs
//
// /api/aura is answered by a fake admin API inside the page, so the whole round
// trip runs without an adapter.
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
await ctx.addInitScript(() => {
    localStorage.setItem(
        'aura-auth',
        JSON.stringify({
            state: { token: 'livetoken', tokenExp: Date.now() + 3600_000, sessionActive: true },
            version: 0,
        }),
    );
    // Fake security API. `state` decides what the server thinks of the token.
    window.__fakeAdmin = { state: 'ok', calls: [], password: null, freshToken: 'freshtoken' };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.includes('/api/aura/')) return realFetch(input, init);
        const method = init?.method ?? 'GET';
        window.__fakeAdmin.calls.push(`${method} ${url.slice(url.indexOf('/api/aura/'))}`);
        const send = (status, obj) =>
            Promise.resolve(
                new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }),
            );
        const state = window.__fakeAdmin.state;
        if (state === 'down') return Promise.resolve(new Response('', { status: 404 }));
        const body = init?.body ? JSON.parse(init.body) : {};
        if (url.endsWith('admin/status')) return send(200, { configured: true });
        if (url.endsWith('admin/session')) {
            if (state !== 'ok') return send(401, { error: 'unauthorized' });
            return send(200, { ok: true, exp: Date.now() + 8 * 3600_000 });
        }
        if (url.endsWith('admin/change')) {
            if (state !== 'ok') return send(401, { error: 'unauthorized' });
            const pw = String(body.newPassword ?? '');
            if (pw.length < 4) return send(400, { error: 'password too short' });
            window.__fakeAdmin.password = pw;
            return send(200, { ok: true, token: window.__fakeAdmin.freshToken, exp: Date.now() + 8 * 3600_000 });
        }
        if (url.endsWith('/vault')) return send(200, { sections: {} });
        return send(404, { error: 'unknown endpoint' });
    };
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const newPin = page.locator('.aura-admin-pin-new');
const confirm = page.locator('.aura-admin-pin-confirm');
const save = page.locator('.aura-admin-pin-save');
const msg = page.locator('.aura-admin-pin-msg');

let visit = 0;
const openSettings = async (adminState) => {
    // A distinct query per visit: a URL that differs only in the hash would be a
    // hash navigation, and the init script (which seeds the session) never runs.
    await page.goto(`${BASE}/?shot=1&v=${++visit}#/admin/settings`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => {
        window.__fakeAdmin.state = s;
    }, adminState);
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 40000 });
    await page.waitForTimeout(600);
};
const submit = async (pin, confirmPin = pin) => {
    await newPin.fill(pin);
    await confirm.fill(confirmPin);
    await save.click();
    await page.waitForTimeout(400);
};
const message = () =>
    msg
        .first()
        .innerText()
        .catch(() => '');
const authState = () => page.evaluate(() => JSON.parse(localStorage.getItem('aura-auth') ?? '{}').state ?? {});
const onLoginPage = () => page.evaluate(() => location.hash.includes('/admin/login'));

try {
    // ── 1. the form on a live session ────────────────────────────────────────
    await openSettings('ok');
    eq('the PIN card is on the settings page', await newPin.count(), 1);
    eq('the new-PIN field refuses the password manager', await newPin.getAttribute('autocomplete'), 'new-password');
    eq('… and so does the confirmation', await confirm.getAttribute('autocomplete'), 'new-password');

    // ── 2. local checks first — no request, no server answer ─────────────────
    await page.evaluate(() => {
        window.__fakeAdmin.calls.length = 0;
    });
    await submit('123');
    check('a PIN under 4 characters is refused locally', (await message()).includes('Mindestens 4'), await message());
    await submit('1234', '4321');
    check('two different PINs are refused locally', (await message()).includes('nicht überein'), await message());
    eq(
        'neither reached the server',
        await page.evaluate(() => window.__fakeAdmin.calls.filter((c) => c.includes('change'))),
        [],
    );

    // ── 3. the happy path ────────────────────────────────────────────────────
    await submit('9182');
    check('a valid new PIN reports success', (await message()).includes('erfolgreich'), await message());
    eq('the server got the new PIN', await page.evaluate(() => window.__fakeAdmin.password), '9182');
    eq('the fields are cleared afterwards', [await newPin.inputValue(), await confirm.inputValue()], ['', '']);
    // The change hands back a fresh token — keeping it is what stops the next
    // admin call from running into the expiry of the session just replaced.
    eq('the fresh session token is kept', (await authState()).token, 'freshtoken');
    eq('… still logged in', (await authState()).sessionActive, true);

    // ── 4. an expired session: the reported symptom ──────────────────────────
    // The change request itself is refused. Before the fix this printed
    // „Falscher PIN“ although no old PIN was ever asked for.
    await openSettings('ok');
    await page.evaluate(() => {
        window.__fakeAdmin.state = 'expired';
    });
    await submit('5566');
    // The session is dropped the moment the server refuses it, so the answer to
    // the click is the login page — what must never come back is the old lie.
    const expiredMsg = await message();
    check('an expired session never claims a wrong PIN', !expiredMsg.includes('Falscher PIN'), expiredMsg);
    eq('the refused change wrote no PIN', await page.evaluate(() => window.__fakeAdmin.password), null);
    eq('the dead session is dropped', (await authState()).sessionActive, false);
    await page.waitForTimeout(400);
    eq('… and the editor asks for the password again', await onLoginPage(), true);
    check(
        'the login page explains why',
        (await page.locator('body').innerText()).includes('Sitzung abgelaufen'),
        await page.locator('body').innerText(),
    );

    // ── 5. the session probe catches it before anything is typed ─────────────
    // The real fix: the editor asks the server on mount instead of trusting the
    // flag in localStorage, so the expired session never gets that far.
    await openSettings('expired');
    await page.waitForTimeout(700);
    eq('an expired session lands on the login page on its own', await onLoginPage(), true);
    eq('the token is gone', (await authState()).token, null);

    // ── 6. an unreachable adapter is not an expired session ─────────────────
    await openSettings('ok');
    await page.evaluate(() => {
        window.__fakeAdmin.state = 'down';
    });
    await submit('7788');
    check('an unreachable adapter says that', (await message()).includes('nicht erreichbar'), await message());
    eq('… and the session survives it', (await authState()).sessionActive, true);
    eq('… so the editor stays open', await onLoginPage(), false);
} finally {
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
