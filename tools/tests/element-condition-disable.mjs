// Verifies the element-level condition effect "deaktivieren" (issue #889) against the dev server.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5219    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5219 node tools/tests/element-condition-disable.mjs
//
// A list row, a row's value and a custom-grid cell can be locked by a rule: greyed out, and a
// click on the control writes nothing. Without the lock the same click writes. Values come from
// __auraShot.mock, writes are captured (captureWrites) — no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5219';
const LOCK = 'aura-selftest.0.elDisable.lock';
const SW_A = 'aura-selftest.0.elDisable.a';
const SW_B = 'aura-selftest.0.elDisable.b';
const SW_C = 'aura-selftest.0.elDisable.c';
const SW_CELL = 'aura-selftest.0.elDisable.cell';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const lockRule = (extra) => ({
    id: `r-${Math.random().toString(36).slice(2, 7)}`,
    logic: 'AND',
    clauses: [{ datapoint: LOCK, operator: 'true', value: '' }],
    disable: true,
    ...extra,
});

// A fresh mount per lock state — useDatapoint only follows live changes while connected.
const mount = async (lock, widget) => {
    const vals = { [LOCK]: lock, [SW_A]: false, [SW_B]: false, [SW_C]: false, [SW_CELL]: false };
    await page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    }, vals);
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), {
        ...widget,
        id: `${widget.id}-${Math.random().toString(36).slice(2, 7)}`,
    });
    await page.waitForTimeout(800);
};

/** Click like a finger at the centre of `sel` (the n-th match), return the captured writes. */
const clickAt = async (handle) => {
    await page.evaluate(() => window.__auraShot.writes(true));
    const box = await handle.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await page.mouse.move(2, 2);
    return page.evaluate(() => window.__auraShot.writes());
};

/** The control of the list row labelled `label`: the first button above the label's text. */
const rowInfo = (label) =>
    page.evaluateHandle((lbl) => {
        const leaf = [...document.querySelectorAll('.aura-widget *')].find(
            (n) => n.children.length === 0 && n.textContent?.trim() === lbl,
        );
        let row = leaf;
        while (row && !row.querySelector('button')) row = row.parentElement;
        return row;
    }, label);

const list = {
    id: 'w-eldis-list',
    type: 'list',
    title: 'Liste',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 12, h: 10 },
    options: {
        entries: [
            { id: SW_A, label: 'Zeile A', displayType: 'switch', conditions: [lockRule({ target: 'row' })] },
            { id: SW_B, label: 'Zeile B', displayType: 'switch', conditions: [lockRule({ target: 'value' })] },
            { id: SW_C, label: 'Zeile C', displayType: 'switch' },
        ],
    },
};

// ── 1. list rows, lock on ────────────────────────────────────────────────────
await mount(true, list);
{
    const a = await rowInfo('Zeile A');
    const aLocked = await a.evaluate((r) => !!r?.closest('.aura-cond-el-disabled'));
    check('row rule locks the whole row', aLocked);
    const aWrites = await clickAt(await a.evaluateHandle((r) => r.querySelector('button')));
    check('click on a locked row writes nothing', !aWrites.some((w) => w.id === SW_A), JSON.stringify(aWrites));

    const b = await rowInfo('Zeile B');
    const bState = await b.evaluate((r) => ({
        rowLocked: !!r.closest('.aura-cond-el-disabled:not(.aura-cond-el-disabled-contents)'),
        valueLocked: !!r.querySelector('.aura-cond-el-disabled-contents.aura-cond-el-disabled button'),
        filter: getComputedStyle(r.querySelector('.aura-cond-el-disabled-contents > *')).filter,
    }));
    check('value rule locks the value only', bState.valueLocked && !bState.rowLocked, JSON.stringify(bState));
    check('locked value is greyed', bState.filter.includes('grayscale'), bState.filter);
    const bWrites = await clickAt(await b.evaluateHandle((r) => r.querySelector('button')));
    check('click on a locked value writes nothing', !bWrites.some((w) => w.id === SW_B), JSON.stringify(bWrites));

    const c = await rowInfo('Zeile C');
    const cWrites = await clickAt(await c.evaluateHandle((r) => r.querySelector('button')));
    check('row without a rule still writes', cWrites.some((w) => w.id === SW_C), JSON.stringify(cWrites));

    const keyWrites = await (async () => {
        await page.evaluate(() => window.__auraShot.writes(true));
        await a.evaluate((r) => r.querySelector('button').focus());
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        return page.evaluate(() => window.__auraShot.writes());
    })();
    check('keyboard on a locked row writes nothing', !keyWrites.some((w) => w.id === SW_A), JSON.stringify(keyWrites));
}

// ── 2. list rows, lock off ───────────────────────────────────────────────────
await mount(false, list);
{
    const a = await rowInfo('Zeile A');
    check('rule not matching: row not locked', !(await a.evaluate((r) => !!r.closest('.aura-cond-el-disabled'))));
    const aWrites = await clickAt(await a.evaluateHandle((r) => r.querySelector('button')));
    check('unlocked row writes again', aWrites.some((w) => w.id === SW_A), JSON.stringify(aWrites));
    const b = await rowInfo('Zeile B');
    const bWrites = await clickAt(await b.evaluateHandle((r) => r.querySelector('button')));
    check('unlocked value writes again', bWrites.some((w) => w.id === SW_B), JSON.stringify(bWrites));
}

// ── 3. custom-grid cell ──────────────────────────────────────────────────────
const grid = {
    id: 'w-eldis-grid',
    type: 'universal',
    title: 'Raster',
    datapoint: '',
    layout: 'custom',
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options: {
        customGrid: {
            cols: 1,
            rows: 1,
            cells: [
                {
                    type: 'switch',
                    dpId: SW_CELL,
                    stateMode: 'boolean',
                    controlMode: 'button',
                    trueText: 'Ein',
                    falseText: 'Aus',
                    conditions: [lockRule()],
                },
            ],
        },
    },
};
for (const lock of [true, false]) {
    await mount(lock, grid);
    const cell = page.locator('.aura-custom-cell-0').first();
    const locked = await cell.evaluate((el) => el.classList.contains('aura-cond-el-disabled'));
    check(`cell ${lock ? 'locked' : 'not locked'} while the rule ${lock ? 'matches' : 'does not match'}`, locked === lock);
    const writes = await clickAt(await cell.locator('button').first().elementHandle());
    const wrote = writes.some((w) => w.id === SW_CELL);
    check(`cell click ${lock ? 'writes nothing' : 'writes'}`, wrote === !lock, JSON.stringify(writes));
}

// ── 4. tab button (widget-style rule with disableWidget) ─────────────────────
const seedTabs = async (lock) => {
    await page.evaluate((v) => window.__auraShot.mock(v), { [LOCK]: lock });
    await page.evaluate(
        ([lockDp]) => {
            const tab = (id, name, extra) => ({ id, name, slug: id, widgets: [], ...extra });
            window.__auraShot.seed({
                layouts: [
                    {
                        id: 'L-eldis',
                        name: 'Tabs',
                        slug: 'tabs',
                        activeSectionId: 'S-eldis',
                        settings: {},
                        sections: [
                            {
                                id: 'S-eldis',
                                name: 'Tabs',
                                slug: 'tabs',
                                activeTabId: 'eins',
                                tabs: [
                                    tab('eins', 'Eins'),
                                    tab('zwei', 'Zwei', {
                                        conditions: [
                                            {
                                                id: 'tc',
                                                logic: 'AND',
                                                clauses: [{ datapoint: lockDp, operator: 'true', value: '' }],
                                                style: {},
                                                disableWidget: true,
                                            },
                                        ],
                                    }),
                                ],
                            },
                        ],
                    },
                ],
            });
        },
        [LOCK],
    );
    // Hash, not goto: a reload would drop the seeded store.
    await page.evaluate(() => (location.hash = '#/tab/eins'));
};
for (const lock of [true, false]) {
    // A fresh page per state: the seed has to be in place before the frontend mounts.
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
    await seedTabs(lock);
    const btn = page.locator('.aura-tab-btn', { hasText: 'Zwei' }).first();
    const found = await btn
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
    if (!found) {
        check(`tab bar renders (lock ${lock})`, false, 'no .aura-tab-btn "Zwei"');
        continue;
    }
    // Again after the mount: the tab hook reads no cache, offline only a live update reaches it.
    await page.evaluate((v) => window.__auraShot.mock(v), { [LOCK]: lock });
    await page.waitForTimeout(500);
    const locked = await btn.evaluate((el) => el.classList.contains('aura-tab-cond-disabled'));
    check(`tab ${lock ? 'locked' : 'not locked'} while the rule ${lock ? 'matches' : 'does not match'}`, locked === lock);
    await btn.click({ force: true });
    await page.waitForTimeout(400);
    const active = await page
        .locator('.aura-tab-btn.aura-tab-active')
        .first()
        .textContent()
        .catch(() => '');
    check(`tab click ${lock ? 'does not switch' : 'switches'}`, active?.includes('Zwei') === !lock, active ?? '');
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nall passed');
process.exit(failed.length ? 1 : 0);
