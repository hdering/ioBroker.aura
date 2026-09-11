// Auto-return at runtime (issue #638): does the kiosk actually stay on the page
// somebody is looking at, and does the pause chip write what it promises?
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/idle-return-ui.mjs
//
// The unit test next door (tools/tests/idle-return.mjs) pins the precedence rules;
// this one runs the real timer in a real browser, because that is where the two
// regressions actually lived: the timer draws its inputs from four places, and
// scrolling a long page did not count as activity at all.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DELAY = 2; // seconds — the timer has no lower bound, the admin field does
const SNOOZE_DP = 'aura.0.idleReturn.snoozeMinutes';
const DELAY_DP = 'aura.0.idleReturn.delay';

let run = 0;
/** A fresh page per case — a hash-only navigation would keep the previous store. */
const kioskUrl = () => `${BASE}/?shot=1&run=${++run}#/view/kiosk/tab/cams`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const layout = (camsExempt = false) => ({
    id: 'l-kiosk',
    name: 'Kiosk',
    slug: 'kiosk',
    activeSectionId: 's-main',
    defaultSectionId: 's-main',
    sections: [
        {
            id: 's-main',
            name: 'Main',
            slug: 'main',
            activeTabId: 't-home',
            defaultTabId: 't-home',
            tabs: [
                { id: 't-home', name: 'Home', slug: 'home', widgets: [] },
                { id: 't-cams', name: 'Kameras', slug: 'cams', widgets: [], idleReturnExempt: camsExempt },
            ],
        },
    ],
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Seed the two-tab kiosk, park it on the camera tab and let the timer run. */
async function parkOnCams({ exempt = false, dps = {}, delay = DELAY } = {}) {
    await page.evaluate(
        ([lay, dps, delay]) => {
            window.__auraShot.mockServerState(dps);
            window.__auraShot.mock(dps);
            window.__auraShot.seed({ layouts: [lay], activeLayoutId: lay.id });
            window.__auraShot.setFrontend({ idleReturnEnabled: true, idleReturnDelay: delay, showHeader: true });
        },
        [layout(exempt), dps, delay],
    );
    await page.goto(kioskUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    // Let the live subscriptions deliver their real values FIRST. Subscribing to a
    // datapoint makes the server push its current value, which would otherwise land
    // right on top of the mock a moment later and quietly undo it.
    await page.waitForTimeout(700);
    // The route reload rebuilt the stores — re-seed, then leave the page alone:
    // any pointer event here would reset the very timer under test.
    await page.evaluate(
        ([lay, dps, delay]) => {
            window.__auraShot.mockServerState(dps);
            window.__auraShot.mock(dps);
            window.__auraShot.seed({ layouts: [lay], activeLayoutId: lay.id });
            window.__auraShot.setFrontend({ idleReturnEnabled: true, idleReturnDelay: delay, showHeader: true });
        },
        [layout(exempt), dps, delay],
    );
    await page.waitForTimeout(delay * 1000 + 1200);
    return page.url();
}

// ── 1. The plain case: the kiosk comes home ──────────────────────────────────
{
    const url = await parkOnCams();
    check('an idle kiosk returns to the default tab', url.includes('/tab/home'), url);
}

// ── 2. A running pause keeps it where it is ──────────────────────────────────
{
    const url = await parkOnCams({ dps: { [SNOOZE_DP]: 30 } });
    check('a snooze datapoint keeps the current tab', url.includes('/tab/cams'), url);
}

// ── 3. delay = 0 switches the timer off for this device ──────────────────────
{
    const url = await parkOnCams({ dps: { [DELAY_DP]: 0 } });
    check('a delay of 0 switches auto-return off', url.includes('/tab/cams'), url);
}

// ── 4. A tab may opt out on its own ──────────────────────────────────────────
{
    const url = await parkOnCams({ exempt: true });
    check('an exempt tab is never left', url.includes('/tab/cams'), url);
}

// ── 5. Scrolling counts as activity (it did not — that is the report) ────────
{
    await page.evaluate(
        ([lay]) => {
            window.__auraShot.mockServerState({});
            window.__auraShot.mock({});
            window.__auraShot.seed({ layouts: [lay], activeLayoutId: lay.id });
            window.__auraShot.setFrontend({ idleReturnEnabled: true, idleReturnDelay: 3, showHeader: true });
        },
        [layout()],
    );
    await page.goto(kioskUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.evaluate(
        ([lay]) => {
            window.__auraShot.seed({ layouts: [lay], activeLayoutId: lay.id });
            window.__auraShot.setFrontend({ idleReturnEnabled: true, idleReturnDelay: 3, showHeader: true });
        },
        [layout()],
    );
    // Scroll inside the dashboard container every second — the event never reaches
    // the window by bubbling, so only the capture-phase listener sees it.
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
            const el = document.querySelector('.aura-scroll') ?? document.scrollingElement;
            el?.dispatchEvent(new Event('scroll', { bubbles: false }));
        });
        await page.waitForTimeout(1000);
    }
    check('scrolling keeps the timer at bay', page.url().includes('/tab/cams'), page.url());
}

// ── 6. The pause chip ────────────────────────────────────────────────────────
{
    await page.evaluate(() => {
        window.__auraShot.mockServerState({});
        // Explicitly back to "no pause": the earlier steps injected values into the
        // state cache, and a same-document hash navigation never cleared them.
        window.__auraShot.mock({ 'aura.0.idleReturn.snoozeMinutes': 0 });
        window.__auraShot.setFrontend({
            showHeader: true,
            idleReturnEnabled: true,
            idleReturnDelay: 600,
            headerItems: [{ id: 'ir', type: 'idleReturn', position: 'right', idleReturnMinutes: 20 }],
        });
        window.__auraShot.writes(true);
    });
    await page.waitForTimeout(400);

    const chip = page.locator('header button', { hasText: 'Pause' }).first();
    check('the chip renders in the header', (await chip.count()) > 0);

    await chip.click();
    await page.waitForTimeout(300);
    const write = await page.evaluate(() => window.__auraShot.lastWrite);
    check(
        'a tap writes the configured pause to the per-client datapoint',
        !!write && /\.clients\..+\.idleReturn\.snoozeMinutes$/.test(write.id) && Number(write.val) === 20,
        JSON.stringify(write),
    );

    // With a pause running the chip counts down and offers the way back. 45, not
    // a smaller number: the chip's own write already left 20 minutes on the client
    // datapoint, and the effective pause is the longer of the two scopes.
    await page.evaluate(() => {
        window.__auraShot.mock({ 'aura.0.idleReturn.snoozeMinutes': 45 });
    });
    await page.waitForTimeout(300);
    const label = await page.locator('header button').filter({ hasText: 'min' }).first().textContent();
    check('the chip shows the remaining minutes', /45/.test(label ?? ''), label ?? '(none)');

    await page.locator('header button').filter({ hasText: 'min' }).first().click();
    await page.waitForTimeout(300);
    const resume = await page.evaluate(() => window.__auraShot.lastWrite);
    check(
        'a second tap ends the pause',
        !!resume && /\.idleReturn\.snoozeMinutes$/.test(resume.id) && Number(resume.val) === 0,
        JSON.stringify(resume),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
