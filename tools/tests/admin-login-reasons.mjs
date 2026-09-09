#!/usr/bin/env node
// ── What the admin login page says when it cannot let you in (#632) ──────────
// Every refusal printed „Falscher PIN“, including the ones that have nothing to
// do with the PIN:
//   * the security API is not behind this origin. The vite dev server answers
//     unknown paths with index.html and status 200, so `admin/status` looked
//     reachable and „not configured“ — the page offered a first-run setup whose
//     POST then 404'd, and called that a wrong PIN. Nobody could ever get in.
//   * a vault that already has a password (409) — the setup form was a dead end.
//   * the brute-force lockout (429) — the right PIN „was wrong“ too.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/admin-login-reasons.mjs
//
// /api/aura is answered inside the page, so no adapter is needed. Note this runs
// against a DEV build: with no security API, the editor degrades to a local
// no-op login — what must not happen is the dead-end setup form.
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
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, ignoreHTTPSErrors: true });
await ctx.addInitScript(() => {
    localStorage.removeItem('aura-auth');
    // `mode` decides what answers the security API calls:
    //   'html'      — the dev server's index.html, status 200 (the reported case)
    //   'wrong'     — a configured vault refusing the password
    //   'locked'    — the brute-force lockout
    //   'freshVault'— status says „not configured“, setup says 409
    window.__fakeApi = { mode: 'html', calls: [] };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.includes('/api/aura/')) return realFetch(input, init);
        const route = url.slice(url.indexOf('/api/aura/') + '/api/aura/'.length);
        window.__fakeApi.calls.push(route);
        const json = (status, obj) =>
            Promise.resolve(
                new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }),
            );
        const mode = window.__fakeApi.mode;
        if (mode === 'html') {
            // Exactly what vite serves for an unknown path: a 200 and a document.
            return Promise.resolve(
                new Response('<!doctype html><html><body>app</body></html>', {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }),
            );
        }
        if (route === 'admin/status') return json(200, { configured: mode !== 'freshVault' });
        if (route === 'admin/setup') return json(409, { error: 'already configured' });
        if (route === 'admin/login') {
            if (mode === 'locked') return json(429, { error: 'too many attempts', retryAfter: 15 });
            return json(401, { error: 'invalid password' });
        }
        return json(404, { error: 'unknown endpoint' });
    };
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let visit = 0;
const openLogin = async (mode) => {
    await page.goto(`${BASE}/?v=${++visit}#/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((m) => {
        window.__fakeApi.mode = m;
    }, mode);
    // The page asks for the status itself on mount; give it that round trip.
    await page.waitForTimeout(1200);
};
const pinField = () => page.locator('input[name="aura-admin-pin"]');
const confirmField = () => page.locator('input[name="aura-admin-pin-confirm"]');
const submit = async (pin, confirm) => {
    await pinField().fill(pin);
    if (confirm !== undefined && (await confirmField().count())) await confirmField().fill(confirm);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
};
const bodyText = () => page.locator('body').innerText();
const hash = () => page.evaluate(() => location.hash);

try {
    // ── 1. no security API behind this origin ────────────────────────────────
    // The whole reported dead end: a 200 with an HTML body is not an answer from
    // the API, so the page must not offer to set a first PIN.
    await openLogin('html');
    eq('an HTML answer is not read as „not configured“', await confirmField().count(), 0);
    check('… so no first-run setup is offered', !(await bodyText()).includes('Admin einrichten'), await bodyText());
    // The dev editor deliberately opens without a check — but it has to admit it,
    // or a login that takes any PIN looks exactly like broken authentication.
    eq('… the unchecked dev login is announced', await page.locator('.aura-login-dev-hint').count(), 1);
    check(
        '… naming both the cause and the consequence',
        (await page.locator('.aura-login-dev-hint').innerText()).includes('nicht geprüft'),
        await page.locator('.aura-login-dev-hint').innerText(),
    );
    await submit('1234');
    check('… and no attempt is called a wrong PIN', !(await bodyText()).includes('Falscher PIN'), await bodyText());
    eq('… the dev build lets the editor open', (await hash()).includes('/admin/login'), false);

    // ── 2. a configured vault refusing the password ──────────────────────────
    await openLogin('wrong');
    eq('a configured vault asks for one PIN, not two', await confirmField().count(), 0);
    eq('… and a real API shows no dev warning', await page.locator('.aura-login-dev-hint').count(), 0);
    await submit('9999');
    check('a refused password IS a wrong PIN', (await bodyText()).includes('Falscher PIN'), await bodyText());
    eq('… and the page stays put', (await hash()).includes('/admin/login'), true);

    // ── 3. the brute-force lockout ───────────────────────────────────────────
    await openLogin('locked');
    await submit('9999');
    const locked = await bodyText();
    check('a lockout says so', locked.includes('Zu viele Versuche'), locked);
    check('… with the wait from the server', locked.includes('15'), locked);
    check('… and never claims a wrong PIN', !locked.includes('Falscher PIN'), locked);

    // ── 4. status says „not configured“, the vault disagrees ─────────────────
    // The 409 dead end: the form offered a setup the server refused, forever.
    await openLogin('freshVault');
    eq('an unconfigured vault offers the setup form', await confirmField().count(), 1);
    await submit('4321', '4321');
    const exists = await bodyText();
    check('a 409 says a PIN is already set', exists.includes('schon ein Admin-PIN'), exists);
    check('… and not „Falscher PIN“', !exists.includes('Falscher PIN'), exists);
    eq('… the form turns into the login it should have been', await confirmField().count(), 0);
} finally {
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
