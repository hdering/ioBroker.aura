// ─────────────────────────────────────────────────────────────────────────────
// Datumswähler — the picker must be openable in EVERY browser (issue #544)
// ─────────────────────────────────────────────────────────────────────────────
// A native <input type="time"> gets a clock button from Chromium and nothing at
// all from Firefox, so the very same widget offered a dropdown in one browser
// and looked like a dead typing field in the other. The widgets therefore draw
// their own button (DateTimeInput) and open the picker via showPicker().
//
// This test runs the SAME assertions against several engines — that split is the
// whole point, so a Chromium-only run would prove nothing.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/datepicker-picker.mjs
//   AURA_ENGINES=chromium node tools/tests/datepicker-picker.mjs   (narrow it)
//
// Firefox needs its Playwright build once:  npx playwright install firefox
//
// Everything runs against injected demo state with screenshotMode on, so no
// ioBroker object or state is ever touched.
import { chromium, firefox, webkit } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ENGINES = (process.env.AURA_ENGINES ?? 'chromium,firefox').split(',').map((s) => s.trim());
const LAUNCHERS = { chromium, firefox, webkit };

const BTN = 'button[aria-label="Auswahl öffnen"]';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── widget configs ───────────────────────────────────────────────────────────
function datepicker(options, layout = 'compact') {
    return {
        id: 'w-dp',
        type: 'datepicker',
        title: 'runterfahren',
        datapoint: 'demo.time',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 3 },
        options: { showTitle: true, showCurrentValue: false, ...options },
    };
}

/** The export attached to issue #544 — time-only, pattern HH:mm. */
const ISSUE_OPTS = {
    inputFormat: 'picker',
    inputPattern: 'HH:mm',
    showIcon: true,
    transparent: true,
    outputFormat: 'time_hhmm',
    timeOnly: true,
    showTime: true,
};

/** Same datepicker, but as a cell of a custom-layout widget (CustomGridView). */
function customCellWidget(cell) {
    return {
        id: 'w-cell',
        type: 'button',
        title: 'Zelle',
        datapoint: 'demo.time',
        layout: 'custom',
        gridPos: { x: 0, y: 0, w: 12, h: 4 },
        options: {
            customGrid: {
                cols: 1,
                rows: 1,
                cells: [{ type: 'datepicker', dpId: 'demo.time', ...cell }],
            },
        },
    };
}

// ── page helpers ─────────────────────────────────────────────────────────────

/** Renders one widget and reports every input plus the picker buttons next to it. */
const DOM = () => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.type !== 'range');
    return {
        inputs: inputs.map((i) => ({
            type: i.type,
            value: i.value,
            width: Math.round(i.getBoundingClientRect().width),
        })),
        buttons: document.querySelectorAll('button[aria-label="Auswahl öffnen"]').length,
        /** Whether the button sits inside the same wrapper as a native field. */
        wrapped: [...document.querySelectorAll('button[aria-label="Auswahl öffnen"]')].every(
            (b) => !!b.parentElement?.querySelector('input'),
        ),
    };
};

/**
 * Does this engine open a picker for `kind` at all? showPicker() needs a user
 * gesture, so it has to be provoked with a real click on a throwaway field —
 * and `:open` is the only thing that tells a working picker from a no-op.
 */
async function enginePicks(page, kind) {
    await page.evaluate((k) => {
        document.querySelectorAll('.pick-probe').forEach((e) => e.remove());
        const el = document.createElement('input');
        el.type = k;
        el.className = 'pick-probe';
        el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;font-size:14px';
        document.body.appendChild(el);
        el.addEventListener('click', () => el.showPicker(), { once: true });
    }, kind);
    await page.locator('input.pick-probe').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => document.querySelector('.pick-probe')?.matches(':open') ?? false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('.pick-probe').forEach((e) => e.remove()));
    await page.waitForTimeout(200);
    return open;
}

async function show(page, widgets, editMode = false) {
    await page.evaluate(
        ([list, edit]) => {
            window.__auraShot.mock({ 'demo.time': '23:00', 'demo.date': '15.01.2025' });
            window.__auraShot.showWidgets(list, { editMode: edit });
        },
        [Array.isArray(widgets) ? widgets : [widgets], editMode],
    );
    await page.waitForTimeout(450);
    return page.evaluate(DOM);
}

// ── run one engine ───────────────────────────────────────────────────────────
async function runEngine(engineName) {
    const launcher = LAUNCHERS[engineName];
    if (!launcher) {
        check(`${engineName}: known engine`, false, 'use chromium | firefox | webkit');
        return;
    }
    let browser;
    try {
        browser = await launcher.launch();
    } catch (e) {
        check(
            `${engineName}: browser available`,
            false,
            `not installed — run "npx playwright install ${engineName}" (${String(e).split('\n')[0]})`,
        );
        return;
    }
    console.log(`\n── ${engineName} ─────────────────────────────────────────────`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    await page.evaluate(() =>
        localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
    );

    // Which native field types this engine actually implements — Firefox has no
    // `month` field, and a button in front of a plain text box would be a lie.
    const supports = await page.evaluate(() =>
        Object.fromEntries(
            ['date', 'time', 'datetime-local', 'month'].map((t) => {
                const el = document.createElement('input');
                el.type = t;
                return [t, el.type === t];
            }),
        ),
    );
    console.log(`  native field types: ${JSON.stringify(supports)}`);

    // ── 0. What the engine paints on its own ────────────────────────────────
    // Whether the engine lets the widget remove its own picker button. Where it
    // does not (Gecko), the widget must stay out of the fields the engine already
    // equips — two buttons in one field would be worse than the reported bug.
    const canHideNative = await page.evaluate(() => CSS.supports('selector(::-webkit-calendar-picker-indicator)'));
    console.log(`  can hide the engine's own picker button: ${canHideNative}`);

    // The second half of #544: Gecko implements the `time` FIELD but has no time
    // PICKER, so a button that only calls showPicker() would stay dead there.
    const nativeTime = await enginePicks(page, 'time');
    console.log(`  engine opens a native time picker: ${nativeTime}`);

    // getComputedStyle on ::-webkit-calendar-picker-indicator reports the host
    // input's values in Chromium, so it proves nothing — measure instead: an
    // engine that paints a picker button reserves room for it, and the
    // .aura-dt-input rule has to take that room back.
    const probe = await page.evaluate(() => {
        const mk = (cls) => {
            const el = document.createElement('input');
            el.type = 'time';
            el.className = cls;
            el.style.cssText = 'position:absolute;left:-9999px;font-size:12px;padding:5px 8px;border:1px solid #000';
            document.body.appendChild(el);
            const w = el.getBoundingClientRect().width;
            el.remove();
            return Math.round(w);
        };
        return { plain: mk(''), hidden: mk('aura-dt-input') };
    });
    if (engineName === 'firefox') {
        // The reason this whole fix exists: no native affordance to begin with.
        check(
            `${engineName}: paints no native picker button`,
            probe.plain === probe.hidden,
            `plain=${probe.plain} hidden=${probe.hidden}`,
        );
    } else {
        check(
            `${engineName}: .aura-dt-input removes the native picker button`,
            probe.plain - probe.hidden > 4,
            `plain=${probe.plain} hidden=${probe.hidden}`,
        );
    }

    // ── 1. The reported case, in every layout and in BOTH views ─────────────
    for (const layout of ['default', 'card', 'compact', 'minimal']) {
        for (const editMode of [false, true]) {
            const view = editMode ? 'editor' : 'frontend';
            const dom = await show(page, datepicker(ISSUE_OPTS, layout), editMode);
            const time = dom.inputs.filter((i) => i.type === 'time');
            check(
                `${engineName}/${layout}/${view}: renders the time field`,
                time.length === 1,
                JSON.stringify(dom.inputs),
            );
            check(
                `${engineName}/${layout}/${view}: has a picker button`,
                dom.buttons === 1 && dom.wrapped,
                `buttons=${dom.buttons} wrapped=${dom.wrapped}`,
            );
            // (That ours replaces the native button rather than adding to it is
            //  covered once per engine by the probe measurement above.)
        }
    }

    // ── 2. The button actually leads to a picker ────────────────────────────
    // Not "showPicker was called" — that call is a silent no-op in Gecko, which
    // is the second half of #544. `:open` says whether a native panel really
    // came up; where it did not, our own hour/minute list has to.
    await show(page, datepicker(ISSUE_OPTS));
    await page.locator(BTN).first().click();
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => {
        const el = document.querySelector('input[type="time"]');
        return {
            nativeOpen: CSS.supports('selector(:open)') ? el.matches(':open') : null,
            ownList: !!document.querySelector('[aria-label="Stunde"]'),
        };
    });
    check(
        `${engineName}: the button opens a picker`,
        state.nativeOpen === true || state.ownList,
        JSON.stringify(state),
    );
    check(`${engineName}: never both pickers at once`, !(state.nativeOpen && state.ownList), JSON.stringify(state));
    check(
        `${engineName}: ${nativeTime ? 'uses the engine picker' : 'falls back to our own list'}`,
        state.nativeOpen === nativeTime && state.ownList === !nativeTime,
        JSON.stringify(state),
    );

    if (state.ownList) {
        // ── 2b. Picking from our list writes the value and closes it ────────
        await page.locator('[aria-label="Stunde"] button').filter({ hasText: /^07$/ }).click();
        await page.waitForTimeout(200);
        await page.locator('[aria-label="Minute"] button').filter({ hasText: /^45$/ }).click();
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => ({
            value: document.querySelector('input[type="time"]')?.value,
            stillOpen: !!document.querySelector('[aria-label="Stunde"]'),
        }));
        check(`${engineName}: picking from our list sets the time`, after.value === '07:45', JSON.stringify(after));
        check(`${engineName}: our list closes after the minute`, !after.stillOpen, JSON.stringify(after));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // ── 3. The field stays a working input ──────────────────────────────────
    await page.locator('input[type="time"]').first().fill('06:15');
    await page.waitForTimeout(150);
    const typed = await page.evaluate(() => document.querySelector('input[type="time"]')?.value);
    check(`${engineName}: time field still accepts input`, typed === '06:15', `value=${typed}`);

    // ── 4. Date and date+time variants ──────────────────────────────────────
    // A date field already carries a calendar button in every engine — ours only
    // takes its place where the native one can actually be removed.
    const wantDateBtn = canHideNative ? 1 : 0;
    const dateOnly = await show(page, datepicker({ ...ISSUE_OPTS, timeOnly: false, showTime: false }));
    check(
        `${engineName}: date-only field renders${wantDateBtn ? ' with' : ' without'} our button`,
        dateOnly.inputs.length === 1 && dateOnly.inputs[0].type === 'date' && dateOnly.buttons === wantDateBtn,
        JSON.stringify(dateOnly),
    );
    const dateTime = await show(page, datepicker({ ...ISSUE_OPTS, timeOnly: false, showTime: true }));
    check(
        `${engineName}: date+time renders two fields, ${wantDateBtn + 1} of our buttons`,
        dateTime.inputs.length === 2 && dateTime.buttons === wantDateBtn + 1,
        JSON.stringify(dateTime),
    );

    // ── 5. Custom pattern: month picker where the engine has one, never a
    //       button in front of a field that cannot open anything ─────────────
    const month = await show(
        page,
        datepicker({ ...ISSUE_OPTS, timeOnly: false, showTime: false, inputFormat: 'custom', inputPattern: 'MM.yyyy' }),
    );
    check(
        `${engineName}: MM.yyyy uses the month field where supported`,
        month.inputs[0]?.type === (supports.month ? 'month' : 'text'),
        JSON.stringify(month.inputs),
    );
    check(
        `${engineName}: MM.yyyy button only where a picker exists`,
        month.buttons === (supports.month && canHideNative ? 1 : 0),
        `buttons=${month.buttons} supported=${supports.month}`,
    );

    // A pattern no native field covers stays free text — but not a dead one: the
    // widget draws its own parts list, one column per token the pattern names.
    // The output format has to carry the same parts, or the value read back from
    // the DP could not fill the field again (a year through `time_hhmm` is gone).
    const custom = (pattern) => ({
        ...ISSUE_OPTS,
        timeOnly: false,
        showTime: false,
        inputFormat: 'custom',
        inputPattern: pattern,
        outputFormat: 'custom',
        outputPattern: pattern,
    });
    const free = await show(page, datepicker(custom('yyyy')));
    check(
        `${engineName}: yyyy is a free-text field with our button`,
        free.inputs[0]?.type === 'text' && free.buttons === 1 && free.wrapped,
        JSON.stringify(free),
    );
    await page.locator(BTN).first().click();
    await page.waitForTimeout(300);
    const yearList = await page.evaluate(() => ({
        cols: [...document.querySelectorAll('[aria-label="Jahr"]')].length,
        other: ['Monat', 'Tag', 'Stunde', 'Minute', 'Sekunde'].filter(
            (l) => !!document.querySelector(`[aria-label="${l}"]`),
        ),
        sel: document.querySelector('[aria-label="Jahr"] [data-sel="1"]')?.textContent,
    }));
    check(
        `${engineName}: yyyy opens a year list and nothing else`,
        yearList.cols === 1 && yearList.other.length === 0,
        JSON.stringify(yearList),
    );
    const pickedYear = String(new Date().getFullYear() + 1);
    await page
        .locator('[aria-label="Jahr"] button')
        .filter({ hasText: new RegExp(`^${pickedYear}$`) })
        .click();
    await page.waitForTimeout(300);
    const afterYear = await page.evaluate(() => ({
        value: document.querySelector('input[type="text"]')?.value,
        stillOpen: !!document.querySelector('[aria-label="Jahr"]'),
    }));
    check(
        `${engineName}: picking a year fills the field`,
        afterYear.value === pickedYear,
        JSON.stringify({ ...afterYear, want: pickedYear }),
    );
    check(`${engineName}: the year list closes after the only column`, !afterYear.stillOpen, JSON.stringify(afterYear));

    // Several tokens: one column each, in the pattern's order, and only the last closes.
    const parts = await show(page, datepicker(custom('dd.MM')));
    check(
        `${engineName}: dd.MM stays free text with our button`,
        parts.inputs[0]?.type === 'text' && parts.buttons === 1,
        JSON.stringify(parts),
    );
    await page.locator(BTN).first().click();
    await page.waitForTimeout(300);
    await page.locator('[aria-label="Tag"] button').filter({ hasText: /^07$/ }).click();
    await page.waitForTimeout(200);
    const midway = await page.evaluate(() => ({
        value: document.querySelector('input[type="text"]')?.value,
        stillOpen: !!document.querySelector('[aria-label="Monat"]'),
    }));
    check(
        `${engineName}: the first column writes but keeps the list open`,
        midway.value?.startsWith('07.') && midway.stillOpen,
        JSON.stringify(midway),
    );
    await page.locator('[aria-label="Monat"] button').filter({ hasText: /^03$/ }).click();
    await page.waitForTimeout(300);
    const afterParts = await page.evaluate(() => ({
        value: document.querySelector('input[type="text"]')?.value,
        stillOpen: !!document.querySelector('[aria-label="Monat"]'),
    }));
    check(
        `${engineName}: both columns land in the field`,
        afterParts.value === '07.03' && !afterParts.stillOpen,
        JSON.stringify(afterParts),
    );

    // ── 6. Same treatment inside a custom-layout cell ───────────────────────
    const cell = await show(page, customCellWidget({ timeOnly: true, dateFormat: 'time_hhmm' }));
    check(
        `${engineName}: custom-layout cell has the picker button`,
        cell.inputs.some((i) => i.type === 'time') && cell.buttons === 1 && cell.wrapped,
        JSON.stringify(cell),
    );

    check(`${engineName}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    await browser.close();
}

for (const engine of ENGINES) await runEngine(engine);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
process.exit(failed.length ? 1 : 0);
