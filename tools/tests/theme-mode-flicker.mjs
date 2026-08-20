// Verifies that a reload no longer flashes the wrong theme before the
// datapoint-driven dark/light mode (config.themeMode.frontend) arrives.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/theme-mode-flicker.mjs
//
// The DP only reaches the frontend once the socket is connected and the initial
// getState pass has run — several hundred ms after the first paint. Until the fix
// the app painted whatever theme localStorage / the remote config carried, so a
// tablet reloading at night showed the daytime theme and visibly flipped to dark
// a moment later. main.tsx now seeds the mode from a per-device cache before
// React mounts.
//
// The run needs an instance whose themeMode.frontend DP is actually set — the
// warm-up load reads it back out of the cache the app itself writes. Without it
// there is nothing to seed and the test skips.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const SETTLE_MS = 8000;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Records every change of what the screen actually shows: the brightness of the
// visible backdrop (boot splash while it is up, <html> afterwards) plus the
// html.dark class. Brightness is the honest measure here — the class only flips
// once React mounts, while the pre-React splash is already painted.
const SAMPLER = `
window.__themeSamples = [];
const t0 = performance.now();
const lum = (c) => {
  const m = String(c).match(/[0-9.]+/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const opaque = (el) => {
  if (!el) return null;
  const c = getComputedStyle(el).backgroundColor;
  const m = String(c).match(/[0-9.]+/g);
  if (!m || (m.length > 3 && Number(m[3]) === 0)) return null; // fully transparent
  return c;
};
const tick = () => {
  const de = document.documentElement;
  const boot = document.getElementById('aura-boot');
  const bootUp = boot && !boot.classList.contains('hidden');
  const visible = bootUp
    ? opaque(boot)
    : opaque(document.querySelector('[data-aura-app="frontend"]')) || opaque(document.body) || opaque(de);
  const l = visible ? lum(visible) : null;
  const dark = de.classList.contains('dark');
  const last = window.__themeSamples[window.__themeSamples.length - 1];
  if (l != null && (!last || last.dark !== dark || Math.abs(last.lum - l) > 0.05)) {
    window.__themeSamples.push({ t: Math.round(performance.now() - t0), lum: Math.round(l * 100) / 100, dark, bg: visible });
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

// Warm-up: let the app connect once so the DP-driven mode lands in the cache.
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(SETTLE_MS);
const dpMode = await page.evaluate(() => localStorage.getItem('aura-theme-mode'));
if (dpMode !== 'dark' && dpMode !== 'light') {
    console.log('skip — this instance has no config.themeMode.frontend value to seed from');
    await browser.close();
    process.exit(0);
}
const stale = dpMode === 'dark' ? 'light' : 'dark';
console.log(`DP mode: ${dpMode} — stale store theme used for the reload: ${stale}`);

/** Reload with a stale theme in the store; `seed` decides whether the cache is present. */
async function measure(seed) {
    await page.evaluate(
        ({ stale, dpMode, seed }) => {
            const obj = JSON.parse(localStorage.getItem('aura-theme'));
            obj.state.themeId = stale; // what localStorage / the remote config carry
            localStorage.setItem('aura-theme', JSON.stringify(obj));
            if (seed) localStorage.setItem('aura-theme-mode', dpMode);
            else localStorage.removeItem('aura-theme-mode');
        },
        { stale, dpMode, seed },
    );
    await page.addInitScript(SAMPLER);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);
    const samples = await page.evaluate(() => window.__themeSamples);
    for (const s of samples)
        console.log(`      ${String(s.t).padStart(5)}ms  lum=${s.lum}  dark=${s.dark}  bg=${s.bg}`);
    return samples;
}

const wantDark = dpMode === 'dark';
/** A painted frame is "wrong" when its backdrop sits on the wrong side of mid grey. */
const wrongFrames = (samples) => samples.filter((s) => s.lum < 0.5 !== wantDark);

console.log('');
console.log('  without the cache (pre-fix behaviour):');
const before = await measure(false);
const wrongBefore = wrongFrames(before);

console.log('');
console.log('  with the cache (fix):');
const after = await measure(true);
const wrongAfter = wrongFrames(after);

check(
    'reload never paints the opposite theme',
    wrongAfter.length === 0,
    `${wrongAfter.length} wrong frame(s): ${JSON.stringify(wrongAfter)}`,
);
check(
    'the cache is what fixes it (control run flickers)',
    wrongBefore.length > 0,
    wrongBefore.length === 0
        ? 'control run was already clean — test proves nothing'
        : `${wrongBefore.length} flash(es)`,
);
check(
    'final theme still follows the datapoint',
    after.at(-1)?.dark === wantDark,
    `last sample: ${JSON.stringify(after.at(-1))}`,
);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
