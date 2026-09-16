// Verifies the safe-area handling of the frontend shell (#662).
//
//   node tools/tests/safe-area.mjs        (npm run test:safe-area)
//
// Background: iOS 26/27 paint a blurred glass band over the top edge of an
// installed web app. The band cannot be switched off from the page — but it
// blurs whatever is underneath, so the cure is to have nothing but ONE flat
// colour there. Aura therefore asks for `viewport-fit=cover`, hands the safe
// area back as padding on `.aura-page`, and paints the freed strips itself
// (`.aura-page::before/::after`).
//
// Two properties matter and both are checked here:
//   * On a screen without insets NOTHING changes — the strips are 0px high, so
//     desktop, kiosk and Android keep the layout they had.
//   * When an inset exists, the content moves out of it and the strip carries
//     the colour of the chrome bordering it (tab bar / header).
//
// `env(safe-area-inset-*)` cannot be faked in a desktop browser, so the test
// drives the same knobs a user's custom CSS would: `--aura-safe-top` and
// `--aura-safe-top-bg`. That is exactly the escape hatch documented for people
// whose device reports a wrong inset, so it is worth guarding on its own.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5397;
const BASE = `http://localhost:${VITE_PORT}`;
// Nothing listens there: vite's proxy fails fast, the app boots offline.
const OFFLINE_TARGET = 'http://127.0.0.1:9';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function startVite(target) {
    // Spawn vite's bin with this node rather than through npx: Node on Windows
    // refuses to spawn a .cmd shim without a shell (EINVAL).
    const bin = path.resolve('node_modules/vite/bin/vite.js');
    const child = spawn(process.execPath, [bin, '--port', String(VITE_PORT), '--strictPort'], {
        env: { ...process.env, AURA_IOBROKER_URL: target },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 60000;
        const poll = setInterval(() => {
            if (/ready in/.test(log)) {
                clearInterval(poll);
                resolve({
                    stop: () =>
                        new Promise((done) => {
                            child.once('exit', done);
                            child.kill();
                            setTimeout(done, 3000);
                        }),
                });
            } else if (child.exitCode !== null || Date.now() > deadline) {
                clearInterval(poll);
                reject(new Error(`vite did not start:\n${log}`));
            }
        }, 250);
    });
}

/** Strip + padding as the browser computes them right now. */
const READ_SAFE_AREA = () => {
    const page = document.querySelector('.aura-page');
    if (!page) return { missing: true };
    const cs = getComputedStyle(page);
    const before = getComputedStyle(page, '::before');
    const after = getComputedStyle(page, '::after');
    // Whatever chrome borders the top edge — the strip has to continue it.
    const bar = document.querySelector('.aura-tabs-top, .aura-header');
    return {
        padTop: cs.paddingTop,
        padBottom: cs.paddingBottom,
        padLeft: cs.paddingLeft,
        padRight: cs.paddingRight,
        beforeHeight: before.height,
        beforeBg: before.backgroundColor,
        beforePosition: before.position,
        afterHeight: after.height,
        afterBg: after.backgroundColor,
        barTag: bar ? bar.className : null,
        barBg: bar ? getComputedStyle(bar).backgroundColor : null,
        barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    };
};

let vite;
const browser = await chromium.launch();
try {
    vite = await startVite(OFFLINE_TARGET);
    console.log(`dev server ${BASE} -> ${OFFLINE_TARGET} (offline boot)`);

    const ctx = await browser.newContext({ viewport: { width: 420, height: 780 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.aura-page', { timeout: 20000 });
    await page.waitForTimeout(800); // ThemeProvider effect + first paint

    // ── The document has to ask for the safe area at all ─────────────────────
    const metas = await page.evaluate(() => ({
        viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '',
        themeColor: document.getElementById('aura-theme-color')?.getAttribute('content') ?? '',
        navBg: getComputedStyle(document.documentElement).getPropertyValue('--nav-bg').trim(),
        surface: getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim(),
    }));
    check('viewport asks for viewport-fit=cover', /viewport-fit\s*=\s*cover/.test(metas.viewport), metas.viewport);
    check('theme-color meta carries a literal colour', /^(#|rgb|hsl|oklch|lab|lch|color\()/i.test(metas.themeColor), metas.themeColor);
    check(
        'theme-color follows the nav colour of the theme',
        metas.themeColor === (metas.navBg || metas.surface),
        `${metas.themeColor} vs ${metas.navBg || metas.surface}`,
    );

    // ── No inset: the shell must be exactly what it was before ───────────────
    const plain = await page.evaluate(READ_SAFE_AREA);
    check('shell found', plain.missing !== true);
    check(
        'without an inset nothing is padded away',
        plain.padTop === '0px' && plain.padBottom === '0px' && plain.padLeft === '0px' && plain.padRight === '0px',
        `${plain.padTop}/${plain.padRight}/${plain.padBottom}/${plain.padLeft}`,
    );
    check(
        'without an inset the strips are invisible',
        plain.beforeHeight === '0px' && plain.afterHeight === '0px',
        `top ${plain.beforeHeight}, bottom ${plain.afterHeight}`,
    );
    check('strips are pinned to the viewport', plain.beforePosition === 'fixed', plain.beforePosition);

    // ── With an inset: content steps aside, the strip takes the bar colour ───
    const INSET = 28;
    await page.addStyleTag({
        content: `.aura-page { --aura-safe-top: ${INSET}px; --aura-safe-bottom: ${INSET}px; }`,
    });
    await page.waitForTimeout(150);
    const inset = await page.evaluate(READ_SAFE_AREA);
    check(
        'an inset is handed back as padding',
        inset.padTop === `${INSET}px` && inset.padBottom === `${INSET}px`,
        `${inset.padTop} / ${inset.padBottom}`,
    );
    check(
        'the strips fill exactly the inset',
        inset.beforeHeight === `${INSET}px` && inset.afterHeight === `${INSET}px`,
        `top ${inset.beforeHeight}, bottom ${inset.afterHeight}`,
    );
    check(
        'the strip is opaque — a blurred transparency is what started this',
        /^rgb\(/.test(inset.beforeBg) && !/rgba\([^)]*,\s*0(\.\d+)?\)$/.test(inset.beforeBg),
        inset.beforeBg,
    );
    check(
        'the top strip continues the chrome below it',
        Boolean(inset.barBg) && inset.beforeBg === inset.barBg,
        `${inset.beforeBg} vs ${inset.barBg} (${inset.barTag})`,
    );
    check(
        'that chrome itself sits below the inset',
        inset.barTop != null && inset.barTop >= INSET,
        `top edge at ${inset.barTop}px`,
    );

    // ── The documented escape hatches ────────────────────────────────────────
    await page.addStyleTag({ content: '.aura-page { --aura-safe-top-bg: rgb(1, 2, 3); }' });
    await page.waitForTimeout(150);
    const tinted = await page.evaluate(READ_SAFE_AREA);
    check('custom CSS can recolour the strip', tinted.beforeBg === 'rgb(1, 2, 3)', tinted.beforeBg);

    await page.addStyleTag({ content: '.aura-page { --aura-safe-top: 0px; --aura-safe-bottom: 0px; }' });
    await page.waitForTimeout(150);
    const off = await page.evaluate(READ_SAFE_AREA);
    check(
        'custom CSS can switch the whole thing off',
        off.padTop === '0px' && off.beforeHeight === '0px' && off.afterHeight === '0px',
        `${off.padTop} / ${off.beforeHeight} / ${off.afterHeight}`,
    );

    await ctx.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
