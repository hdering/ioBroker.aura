// Countdown widget (#675) against the dev server: the digits that come out of
// the adapter's status states, the local one-second tick, the commands the
// buttons write (captured, never sent), the foreign-datapoint source, the
// waiting state without an adapter, and the inert editor preview.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/countdown-widget.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
const match = (name, got, re) => check(name, re.test(String(got)), `got ${JSON.stringify(got)}, want ${re}`);

const KEY = (k) => `aura.0.countdowns.${k}`;
const status = (k, s) => ({
    [`${KEY(k)}.state`]: s.state,
    [`${KEY(k)}.endTs`]: s.endTs ?? 0,
    [`${KEY(k)}.remainingMs`]: s.remainingMs ?? 0,
    [`${KEY(k)}.durationMs`]: s.durationMs ?? 0,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const now = Date.now();
const mocks = {
    ...status('run', { state: 'running', endTs: now + 14 * 60_000 + 59_000 + 800, durationMs: 900_000 }),
    ...status('pau', { state: 'paused', remainingMs: 70_000, durationMs: 100_000 }),
    ...status('idl', { state: 'idle', remainingMs: 900_000, durationMs: 900_000 }),
    ...status('end', { state: 'ended', remainingMs: 0, durationMs: 900_000 }),
    'demo.cd.remainingMs': 125_000,
    'demo.cd.remainingS': 125,
    'demo.cd.end': now + 3_700_000,
    'demo.cd.endZero': 0,
};
await page.evaluate((m) => {
    window.__auraShot.mock(m);
    window.__auraShot.mockServerState(m);
    window.__auraShot.captureWrites(true);
}, mocks);

const base = (id, key, options = {}, extra = {}) => ({
    id,
    type: 'countdown',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    ...extra,
    options: {
        stateBaseId: KEY(key),
        durationSec: 900,
        stepSec: 60,
        presets: [300, 900, 3600],
        ...options,
    },
});

const widgets = [
    { ...base('cd-run', 'run'), gridPos: { x: 0, y: 0, w: 8, h: 6 } },
    { ...base('cd-pau', 'pau'), gridPos: { x: 8, y: 0, w: 8, h: 6 } },
    { ...base('cd-idl', 'idl'), gridPos: { x: 16, y: 0, w: 8, h: 6 } },
    { ...base('cd-end', 'end', { endedText: 'Fertig' }), gridPos: { x: 24, y: 0, w: 8, h: 6 } },
    { ...base('cd-hms', 'pau', { format: 'hms' }), gridPos: { x: 32, y: 0, w: 8, h: 6 } },
    { ...base('cd-hm', 'pau', { format: 'hm' }), gridPos: { x: 40, y: 0, w: 8, h: 6 } },
    { ...base('cd-none', 'nothing-here'), gridPos: { x: 48, y: 0, w: 8, h: 6 } },
    {
        ...base('cd-dp-ms', 'x', { source: 'datapoint', dpKind: 'remaining-ms' }, { datapoint: 'demo.cd.remainingMs' }),
        gridPos: { x: 0, y: 6, w: 8, h: 6 },
    },
    {
        ...base('cd-dp-s', 'x', { source: 'datapoint', dpKind: 'remaining-s' }, { datapoint: 'demo.cd.remainingS' }),
        gridPos: { x: 8, y: 6, w: 8, h: 6 },
    },
    {
        ...base('cd-dp-end', 'x', { source: 'datapoint', dpKind: 'end-ts' }, { datapoint: 'demo.cd.end' }),
        gridPos: { x: 16, y: 6, w: 8, h: 6 },
    },
    {
        ...base('cd-dp-zero', 'x', { source: 'datapoint', dpKind: 'end-ts' }, { datapoint: 'demo.cd.endZero' }),
        gridPos: { x: 24, y: 6, w: 8, h: 6 },
    },
    { ...base('cd-dp-nodp', 'x', { source: 'datapoint' }), gridPos: { x: 32, y: 6, w: 8, h: 6 } },
    { ...base('cd-compact', 'run'), layout: 'compact', gridPos: { x: 0, y: 12, w: 12, h: 2 } },
    {
        ...base('cd-nostep', 'idl', { showStep: false, showPresets: false, showProgress: false }),
        gridPos: { x: 12, y: 12, w: 8, h: 6 },
    },
];

await page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
await page.waitForTimeout(900);

const root = (id) => `.aura-widget-${id}`;
const digits = (id) =>
    page.evaluate(
        (sel) => document.querySelector(`${sel} .aura-countdown-digits`)?.textContent?.trim() ?? null,
        root(id),
    );
const state = (id) =>
    page.evaluate(
        (sel) => document.querySelector(`${sel} .aura-countdown`)?.getAttribute('data-state') ?? null,
        root(id),
    );
const has = (id, sub) => page.evaluate((sel) => !!document.querySelector(sel), `${root(id)} ${sub}`);
const disabled = (id, sub) =>
    page.evaluate((sel) => document.querySelector(sel)?.disabled ?? null, `${root(id)} ${sub}`);
const writes = () => page.evaluate(() => window.__auraShot.writes());
const lastCmd = async () => {
    const all = await writes();
    const w = all[all.length - 1];
    return w ? { id: w.id, val: w.val } : null;
};
const clickIn = (id, sub) => page.click(`${root(id)} ${sub}`);
const progressWidth = (id) =>
    page.evaluate((sel) => {
        const bar = document.querySelector(`${sel} .aura-countdown-progress > div`);
        const track = document.querySelector(`${sel} .aura-countdown-progress`);
        if (!bar || !track) return null;
        return Math.round((bar.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100);
    }, root(id));

// ── 0. Mount publishes the config with the "on for N minutes" defaults ───────
{
    const all = await writes();
    const cfgWrite = all.find((w) => w.id === `${KEY('run')}.config`);
    check('mount publishes config for the aura source', !!cfgWrite, all.map((w) => w.id).join(', '));
    const cfg = cfgWrite ? JSON.parse(String(cfgWrite.val)) : {};
    eq('published durationSec', cfg.durationSec, 900);
    eq('valueOnStart defaults to "true"', cfg.valueOnStart, 'true');
    eq('valueOnEnd defaults to "false"', cfg.valueOnEnd, 'false');
    eq('datapoint source publishes nothing', all.some((w) => w.id.startsWith(`${KEY('x')}.`)), false);
}

// ── 1. Running: digits from endTs, ticking once a second ─────────────────────
{
    const d1 = await digits('cd-run');
    match('running shows mm:ss from endTs', d1, /^1[45]:[0-5]\d$/);
    eq('running state attribute', await state('cd-run'), 'running');
    eq(
        'primary button offers pause',
        await page.getAttribute(`${root('cd-run')} .aura-countdown-primary`, 'data-cmd'),
        'pause',
    );
    await page.waitForTimeout(1300);
    const d2 = await digits('cd-run');
    check('digits advance within 1.3 s', d1 !== d2, `${d1} → ${d2}`);
    const w = await progressWidth('cd-run');
    check('progress bar ~ remaining share (≈100 %)', w != null && w >= 95 && w <= 100, `${w}%`);
}

// ── 2. Paused / idle / ended / formats ──────────────────────────────────────
{
    eq('paused shows the frozen remainingMs', await digits('cd-pau'), '01:10');
    eq('paused state attribute', await state('cd-pau'), 'paused');
    eq(
        'paused primary offers resume',
        await page.getAttribute(`${root('cd-pau')} .aura-countdown-primary`, 'data-cmd'),
        'resume',
    );
    eq('paused progress = 70 %', await progressWidth('cd-pau'), 70);
    eq('idle shows the full duration', await digits('cd-idl'), '15:00');
    eq(
        'idle primary offers start',
        await page.getAttribute(`${root('cd-idl')} .aura-countdown-primary`, 'data-cmd'),
        'start',
    );
    eq('idle stop is disabled', await disabled('cd-idl', '.aura-countdown-stop'), true);
    eq('idle progress is full', await progressWidth('cd-idl'), 100);
    eq('ended shows endedText', await digits('cd-end'), 'Fertig');
    eq('ended state attribute', await state('cd-end'), 'ended');
    eq('hms pads the hours', await digits('cd-hms'), '00:01:10');
    eq('hm rounds up to the minute', await digits('cd-hm'), '00:02');
}

// ── 3. No adapter answer: waiting state with the configured duration ───────
{
    eq('unknown shows the configured duration', await digits('cd-none'), '15:00');
    eq('unknown state attribute', await state('cd-none'), 'unknown');
    eq('unknown primary is disabled', await disabled('cd-none', '.aura-countdown-primary'), true);
}

// ── 4. Commands: each button writes exactly one cmd, nothing else ───────────
{
    await page.evaluate(() => window.__auraShot.writes(true));
    await clickIn('cd-run', '.aura-countdown-primary');
    eq('pause writes cmd=pause', await lastCmd(), { id: `${KEY('run')}.cmd`, val: 'pause' });
    await clickIn('cd-run', '.aura-countdown-stop');
    eq('stop writes cmd=stop', await lastCmd(), { id: `${KEY('run')}.cmd`, val: 'stop' });
    await clickIn('cd-run', `.aura-countdown-step[aria-label*="hinzufügen"], .aura-countdown-step[aria-label^="Add"]`);
    eq('+ writes cmd=+60', await lastCmd(), { id: `${KEY('run')}.cmd`, val: '+60' });
    await clickIn('cd-run', `.aura-countdown-step[aria-label*="abziehen"], .aura-countdown-step[aria-label^="Remove"]`);
    eq('− writes cmd=-60', await lastCmd(), { id: `${KEY('run')}.cmd`, val: '-60' });
    await clickIn('cd-run', '.aura-countdown-presets button:first-child');
    eq('preset chip writes cmd==300', await lastCmd(), { id: `${KEY('run')}.cmd`, val: '=300' });
    await clickIn('cd-pau', '.aura-countdown-primary');
    eq('resume writes cmd=resume', await lastCmd(), { id: `${KEY('pau')}.cmd`, val: 'resume' });
    await clickIn('cd-idl', '.aura-countdown-primary');
    eq('start writes cmd=start', await lastCmd(), { id: `${KEY('idl')}.cmd`, val: 'start' });
    const all = await writes();
    eq('seven clicks, seven writes, all to cmd states', all.length, 7);
    check(
        'no write touched anything but .cmd',
        all.every((w) => w.id.endsWith('.cmd')),
        all.map((w) => w.id).join(', '),
    );
}

// ── 5. Duration modal: opens on the digits, applies =N ─────────────────────
{
    await page.evaluate(() => window.__auraShot.writes(true));
    await clickIn('cd-idl', '.aura-countdown-digits button');
    await page.waitForSelector('.aura-countdown-modal', { timeout: 3000 });
    const fields = page.locator('.aura-countdown-modal input[type="number"]');
    eq('modal has h/m/s fields', await fields.count(), 3);
    eq('modal is seeded with the current duration', await fields.nth(1).inputValue(), '15');
    await fields.nth(0).fill('1');
    await fields.nth(1).fill('30');
    await fields.nth(2).fill('0');
    await page.click(
        '.aura-countdown-modal button:has-text("Übernehmen"), .aura-countdown-modal button:has-text("Apply")',
    );
    eq('apply writes cmd==5400', await lastCmd(), { id: `${KEY('idl')}.cmd`, val: '=5400' });
    eq('modal closes after apply', await page.locator('.aura-countdown-modal').count(), 0);
    // Escape cancels without a write
    await clickIn('cd-idl', '.aura-countdown-digits button');
    await page.waitForSelector('.aura-countdown-modal', { timeout: 3000 });
    await page.keyboard.press('Escape');
    eq('escape closes the modal', await page.locator('.aura-countdown-modal').count(), 0);
    eq('cancel writes nothing', (await writes()).length, 1);
}

// ── 6. Foreign datapoint: display only ──────────────────────────────────────
{
    // The datapoint was anchored when the widget mounted, and the sections above
    // took a few seconds — so 125 s reads as whatever is left of them by now.
    const elapsed = Math.ceil((Date.now() - now) / 1000);
    const want = new RegExp(`^0(1:5\\d|2:0\\d)$`);
    const ms1 = await digits('cd-dp-ms');
    match(`remaining-ms datapoint (${elapsed} s after mount)`, ms1, want);
    match('remaining-s datapoint', await digits('cd-dp-s'), want);
    match('end-ts datapoint', await digits('cd-dp-end'), /^01:0[01]:[0-5]\d$/);
    eq('end-ts 0 reads idle', await state('cd-dp-zero'), 'idle');
    eq('end-ts 0 shows 00:00', await digits('cd-dp-zero'), '00:00');
    eq('datapoint source hides the controls', await has('cd-dp-ms', '.aura-countdown-primary'), false);
    eq('datapoint source hides the presets', await has('cd-dp-ms', '.aura-countdown-presets'), false);
    match('missing datapoint says so', await digits('cd-dp-nodp'), /Kein Datenpunkt|No datapoint/);
    await page.waitForTimeout(1200);
    const ms2 = await digits('cd-dp-ms');
    check('foreign remaining time ticks locally', ms1 !== ms2 && ms2 < ms1, `${ms1} → ${ms2}`);
}

// ── 7. Layout switches ──────────────────────────────────────────────────────
{
    eq('compact renders digits', /^1[45]:[0-5]\d$/.test(await digits('cd-compact')), true);
    eq('compact renders the primary button', await has('cd-compact', '.aura-countdown-primary'), true);
    eq('compact has no progress bar', await has('cd-compact', '.aura-countdown-progress'), false);
    eq('showStep=false hides the ± buttons', await has('cd-nostep', '.aura-countdown-step'), false);
    eq('showPresets=false hides the chips', await has('cd-nostep', '.aura-countdown-presets'), false);
    eq('showProgress=false hides the bar', await has('cd-nostep', '.aura-countdown-progress'), false);
}

// ── 8. Editor preview: live values, inert controls ─────────────────────────
{
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(400);
    eq('edit mode keeps the digits', await digits('cd-pau'), '01:10');
    eq('edit mode disables the primary button', await disabled('cd-pau', '.aura-countdown-primary'), true);
    eq('edit mode disables the digits button', await disabled('cd-pau', '.aura-countdown-digits button'), true);
    await page.evaluate(() => window.__auraShot.writes(true));
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
