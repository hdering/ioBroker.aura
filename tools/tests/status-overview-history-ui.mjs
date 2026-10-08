// Statusübersicht, layout "history" (Zuletzt gewechselt), in the browser.
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-overview-history-ui.mjs
//   AURA_SHOT_DIR=docs/widgets/assets/statusuebersicht … → also writes the doc screenshots
//
// The rows come from aura.0.status.battery.history (the adapter writes it; here it is
// mocked). Covers:
//   - name (namePattern), room, relative date with the absolute one in the tooltip,
//     reason chip, weak span, lifetime only with an earlier change
//   - maxRows + "+N weitere", maxAgeDays, excludeIdPatterns, other categories off
//   - showReason/showDuration/showLifetime off
//   - "Wieder öffnen" asks first, then writes reopen:<id>@<closedAt> to battery.cmd
//   - the empty state, and no registration write (this instance never latches)
//   - every row has the same height (aura_measure counts on it)
// Every write is captured (captureWrites) — nothing reaches a real instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.AURA_SHOT_DIR;
const NS = 'aura.0';
const DAY = 86400000;
const now = Date.now();

const KAMERA = 'eusec.0.T8113N1234.battery';
const GOLF = 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT';
const GRIFF = 'hm-rpc.1.0007DBE98D9753.0.LOW_BAT';
const HISTORY = [
    {
        id: GOLF,
        name: 'Garage Oeffner Golf',
        room: 'Garage',
        since: now - 3 * DAY - 21 * DAY,
        closedAt: now - 3 * DAY,
        reason: 'auto',
        levelBefore: 1.1,
        levelAfter: 1.5,
        unit: 'V',
        count: 2,
        prevClosedAt: now - 3 * DAY - 426 * DAY,
    },
    {
        id: KAMERA,
        name: 'Kamera Garage',
        since: now - 10 * DAY - 167 * DAY,
        closedAt: now - 10 * DAY,
        reason: 'ack',
        count: 1,
        imported: true,
    },
    {
        id: GRIFF,
        name: 'Wohnzimmer Drehgriffkontakt rechts',
        room: 'Wohnzimmer',
        since: now - 40 * DAY - 2 * DAY,
        closedAt: now - 40 * DAY,
        reason: 'ack',
        count: 1,
    },
    {
        id: GOLF,
        name: 'Garage Oeffner Golf',
        room: 'Garage',
        since: now - 429 * DAY - 9 * DAY,
        closedAt: now - 429 * DAY,
        reason: 'ack',
        count: 1,
    },
];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const pageErrors = [];

/** Fresh context per scenario. */
async function open(options, history = HISTORY, { width = 900, cols = 8, unreach } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate(
        ([serverState]) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mockObjectView({ state: [], channel: [], device: [], enum: [], instance: [] });
            s.mockServerState(serverState);
            s.mock(serverState);
        },
        [
            {
                [`${NS}.status.battery.history`]: JSON.stringify(history),
                [`${NS}.status.unreach.history`]: JSON.stringify(unreach ?? []),
                [`${NS}.status.alarm.history`]: '[]',
            },
        ],
    );
    await page.evaluate(
        ([opts, w]) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-hist',
                    type: 'statusoverview',
                    title: 'Zuletzt gewechselt',
                    datapoint: '',
                    layout: 'history',
                    gridPos: { x: 0, y: 0, w, h: 12 },
                    options: { catWindow: false, catLight: false, catUnreach: false, catAlarm: false, ...opts },
                },
            ]),
        [options, cols],
    );
    await page.waitForTimeout(1200);
    return { ctx, page };
}

const rows = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item .aura-status-history-row')].map((r) => {
            const lines = r.querySelectorAll(':scope > div > div');
            return {
                name: lines[0]?.querySelector('span')?.textContent ?? '',
                ago: lines[0]?.querySelectorAll('span')[1]?.textContent ?? '',
                sub: lines[1]?.textContent ?? '',
                reason: r.getAttribute('data-reason'),
                chip: r.querySelector('.aura-status-history-reason')?.textContent ?? null,
                tip: r.getAttribute('title') ?? '',
                h: Math.round(r.getBoundingClientRect().height),
                button: r.querySelector('button.aura-status-action')?.getAttribute('aria-label') ?? null,
            };
        }),
    );
const text = (page) => page.evaluate(() => document.querySelector('.react-grid-item')?.textContent ?? '');
const writes = (page) => page.evaluate(() => window.__auraShot.writes());

// ── 1. the rows ───────────────────────────────────────────────────────────────
{
    const { ctx, page } = await open({ latchBattery: true, latchAutoClose: true }, HISTORY, { cols: 12 });
    const r = await rows(page);
    check('four rows, newest first', r.length === 4 && r[0].name === 'Garage Oeffner Golf', JSON.stringify(r));
    const [golf, kamera, griff, golfOld] = r;
    check('relative date', golf?.ago === 'vor 3 Tagen', golf?.ago);
    check(
        'older relative dates',
        griff?.ago === 'vor 6 Wochen' && golfOld?.ago === 'vor 1 Jahr',
        `${griff?.ago} / ${golfOld?.ago}`,
    );
    check(
        'absolute date in the tooltip',
        /Gewechselt am \d\d\.\d\d\.\d{4}, \d\d:\d\d/.test(golf?.tip ?? ''),
        golf?.tip,
    );
    check('room on line 2', !!golf?.sub.includes('Garage'), golf?.sub);
    check('auto reason chip', golf?.reason === 'auto' && golf?.chip === 'automatisch', golf?.chip);
    check('button reason chip', kamera?.reason === 'ack' && kamera?.chip === 'per Knopf', kamera?.chip);
    check('weak span', !!golf?.sub.includes('3 Wochen schwach'), golf?.sub);
    check('lifetime with an earlier change', !!golf?.sub.includes('hielt 14 Monate'), golf?.sub);
    check(
        'no lifetime on a first change',
        !kamera?.sub.includes('hielt') && !griff?.sub.includes('hielt'),
        kamera?.sub,
    );
    check('levels', !!golf?.sub.includes('1,1 V → 1,5 V'), golf?.sub);
    check('imported is said in the tooltip', !!kamera?.tip.includes('alten Batterie-Verlauf'), kamera?.tip);
    check(
        'reopen button on every row',
        r.every((x) => x.button === 'Wieder öffnen'),
        JSON.stringify(r.map((x) => x.button)),
    );
    // The first row has no rule above it: one pixel less, every other row the same.
    check(
        'every row the same height',
        new Set(r.slice(1).map((x) => x.h)).size === 1 && r[0].h === r[1].h - 1,
        JSON.stringify(r.map((x) => x.h)),
    );
    check('count chip', (await text(page)).includes('4 Wechsel'));

    const w0 = await writes(page);
    check(
        'no registration from the history layout',
        !w0.some((w) => w.id === `${NS}.status.register`),
        JSON.stringify(w0),
    );

    // Wieder öffnen: the first tap arms, the second writes.
    await page.evaluate(() => window.__auraShot.writes(true));
    const btn = page.locator('.react-grid-item .aura-status-history-row').nth(1).locator('button.aura-status-action');
    await btn.click();
    check('first tap writes nothing', (await writes(page)).length === 0);
    check('first tap asks', (await btn.textContent()) === 'Wirklich?', await btn.textContent());
    await btn.click();
    const w = await writes(page);
    check(
        'second tap writes reopen:<id>@<closedAt>',
        w.length === 1 &&
            w[0].id === `${NS}.status.battery.cmd` &&
            w[0].val === `reopen:${KAMERA}@${HISTORY[1].closedAt}`,
        JSON.stringify(w),
    );

    if (SHOTS) {
        const shot = (name) =>
            page
                .locator('.react-grid-item')
                .first()
                .screenshot({ path: `${SHOTS}/${name}.png` });
        await page.mouse.move(890, 790);
        await page.waitForTimeout(3300); // the armed button falls back
        await shot('layout-history');
        await page.evaluate(() => window.__auraShot.setTheme('dark'));
        await page.waitForTimeout(300);
        await shot('layout-history-dark');
    }

    // The adapter answers: the change is gone from the history.
    await page.evaluate(
        ([id, h]) => window.__auraShot.mock({ [id]: h }),
        [`${NS}.status.battery.history`, JSON.stringify(HISTORY.filter((_, i) => i !== 1))],
    );
    await page.waitForTimeout(400);
    check('row gone once the adapter answers', (await rows(page)).length === 3);
    await ctx.close();
}

// ── 2. cap, age, scope ────────────────────────────────────────────────────────
{
    const { ctx, page } = await open({ maxRows: 2 });
    const r = await rows(page);
    check('maxRows caps', r.length === 2, String(r.length));
    check('"+2 weitere"', (await text(page)).includes('+2 weitere'), await text(page));
    await ctx.close();
}
{
    const { ctx, page } = await open({ maxAgeDays: 30 });
    check('maxAgeDays', (await rows(page)).length === 2);
    await ctx.close();
}
{
    const { ctx, page } = await open({ maxAgeDays: 1 });
    check(
        'maxAgeDays with nothing left',
        (await text(page)).includes('Keine Wechsel in den letzten 1 Tagen'),
        await text(page),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open({ excludeIdPatterns: 'eusec' });
    const r = await rows(page);
    check(
        'excludeIdPatterns',
        r.length === 3 && !r.some((x) => x.name === 'Kamera Garage'),
        JSON.stringify(r.map((x) => x.name)),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open({ filterRooms: 'Garage' });
    const r = await rows(page);
    check('filterRooms (room of the entry, datapoint unknown)', r.length === 2, JSON.stringify(r.map((x) => x.name)));
    await ctx.close();
}
{
    const { ctx, page } = await open({ namePattern: '<Raum>: <Name>' });
    const r = await rows(page);
    check('namePattern', r[0]?.name === 'Garage: Garage Oeffner Golf', r[0]?.name);
    await ctx.close();
}
{
    const { ctx, page } = await open({ showReason: false, showDuration: false, showLifetime: false, showRoom: false });
    const r = await rows(page);
    check(
        'showReason false',
        r.every((x) => x.chip === null),
    );
    check('showDuration/showLifetime false', !r[0]?.sub.includes('schwach') && !r[0]?.sub.includes('hielt'), r[0]?.sub);
    await ctx.close();
}
{
    const unreach = [{ id: 'zigbee.0.abc.available', name: 'Steckdose', closedAt: now - DAY, reason: 'ack', count: 1 }];
    const { ctx, page } = await open({ catUnreach: true }, HISTORY, { unreach });
    const r = await rows(page);
    check(
        'a second category joins the list by date',
        r.length === 5 && r[0].name === 'Steckdose',
        JSON.stringify(r.map((x) => x.name)),
    );
    await ctx.close();
}

// ── 3. empty ──────────────────────────────────────────────────────────────────
{
    const { ctx, page } = await open({}, []);
    check('empty state', (await text(page)).includes('Noch keine Wechsel erfasst'), await text(page));
    await ctx.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
