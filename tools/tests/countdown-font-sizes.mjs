// Verifies the per-element font sizes of the Countdown widget (issue #812).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/countdown-font-sizes.mjs
//
// The preset chips and the status text in the title row take their own px size. Checked
// here: without options both stay at the built-in 10 px (and 4/8 px chip padding), with
// options each picks up its own value and the chip padding grows along, and both still
// follow the frontend font scale like the text-[10px] they replaced.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders one countdown and reads the chip / status font sizes, optionally at a font scale. */
async function render(caseKey, fontOptions, fontScale = 1) {
    const widget = {
        id: `w-countdown-font-${caseKey}`,
        type: 'countdown',
        title: 'Countdown',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 4, h: 8 },
        options: {
            // A fixed key keeps the widget from writing a fresh stateBaseId on mount.
            stateBaseId: `aura.0.countdowns.font-${caseKey}`,
            durationSec: 900,
            presets: [300, 900, 3600],
            ...fontOptions,
        },
    };
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    await page.waitForSelector('.aura-countdown-preset', { timeout: 15000 });
    return page.evaluate((scale) => {
        const chip = document.querySelector('.aura-countdown-preset');
        const scaleRoot = chip.closest('[data-aura-scale]');
        if (scaleRoot) scaleRoot.style.setProperty('--font-scale', String(scale));
        const state = document.querySelector('.aura-countdown-state');
        const cs = getComputedStyle(chip);
        return {
            chip: parseFloat(cs.fontSize),
            padY: parseFloat(cs.paddingTop),
            padX: parseFloat(cs.paddingLeft),
            state: state ? parseFloat(getComputedStyle(state).fontSize) : null,
        };
    }, fontScale);
}

// ── 1. No options: the built-in sizes stay ───────────────────────────────────
const def = await render('def', {});
check('default chip text 10 px', def.chip === 10, `${def.chip}`);
check('default chip padding 4/8 px', def.padY === 4 && def.padX === 8, `${def.padY}/${def.padX}`);
check('default status text 10 px', def.state === 10, `${def.state}`);

// ── 2. Each element takes its own size ───────────────────────────────────────
const big = await render('big', { presetFontSize: 18, stateFontSize: 14 });
check('chip text follows presetFontSize', big.chip === 18, `${big.chip}`);
check('chip padding grows along', big.padY === 7 && big.padX === 14, `${big.padY}/${big.padX}`);
check('status text follows stateFontSize', big.state === 14, `${big.state}`);

// ── 3. The frontend font scale still applies ─────────────────────────────────
const scaled = await render('scaled', { presetFontSize: 16 }, 1.5);
check('chip text follows the font scale', scaled.chip === 24, `${scaled.chip}`);
check('status text follows the font scale', scaled.state === 15, `${scaled.state}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
