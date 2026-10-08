// Statusübersicht in the browser: remembered hints (latch) and row actions.
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-overview-latch-ui.mjs
//
// Covers what the pure tests cannot see:
//   - a LOWBAT back on false stays listed, muted, with "meldet zurzeit nichts"
//   - "Gewechselt" asks first (second tap), then writes ack:<id> to status.battery.cmd
//   - a row action fills {serial} and writes typed values
//   - the widget registers its datapoints (incl. the OPERATING_VOLTAGE neighbour)
//   - a snoozed entry stays listed but leaves the hint chip
//   - row height with buttons equals the row height without
//   - without the new options nothing changes: no buttons, no registration write
// Every write is captured (captureWrites) — nothing reaches a real instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const NS = 'aura.0';
const GOLF = 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT';
const GOLF_V = 'hm-rpc.1.0020DA499B8F41.0.OPERATING_VOLTAGE';
const GRIFF = 'hm-rpc.1.0007DBE98D9753.0.LOW_BAT';
const GRIFF_V = 'hm-rpc.1.0007DBE98D9753.0.OPERATING_VOLTAGE';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const state = (id, name, role, type) => ({
    id,
    value: { _id: id, type: 'state', common: { name, role, type, read: true, write: false }, native: {} },
});
const device = (id, name) => ({ id, value: { _id: id, type: 'device', common: { name }, native: {} } });
const OBJECTS = {
    state: [
        state(GOLF, 'Garage Oeffner Golf LOW_BAT', 'indicator.lowbat', 'boolean'),
        state(GOLF_V, 'Garage Oeffner Golf Spannung', 'value.voltage', 'number'),
        state(GRIFF, 'Drehgriff rechts LOW_BAT', 'indicator.lowbat', 'boolean'),
        state(GRIFF_V, 'Drehgriff rechts Spannung', 'value.voltage', 'number'),
    ],
    device: [
        device('hm-rpc.1.0020DA499B8F41', 'Garage Oeffner Golf'),
        device('hm-rpc.1.0007DBE98D9753', 'Wohnzimmer Drehgriffkontakt rechts'),
    ],
    enum: [
        {
            id: 'enum.rooms.garage',
            value: {
                _id: 'enum.rooms.garage',
                type: 'enum',
                common: { name: 'Garage', members: ['hm-rpc.1.0020DA499B8F41'] },
            },
        },
    ],
};
const DAY = 86400000;
const now = Date.now();
const LIST = [
    { id: GOLF, name: 'Garage Oeffner Golf', since: now - 3 * DAY, count: 3, active: false, ackedAt: null },
    { id: GRIFF, name: 'Drehgriff', since: now - DAY, count: 1, active: true, ackedAt: null },
];

const browser = await chromium.launch();
const pageErrors = [];

/** Fresh context per scenario: the datapoint cache is module-level (5 min TTL). */
async function open(options, list = LIST, layout = 'compact', width = 900, cols = 8) {
    const ctx = await browser.newContext({ viewport: { width, height: 700 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate(
        ([objects, serverState]) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mockObjectView(objects);
            s.mockServerState(serverState);
            s.mock(serverState);
        },
        [
            OBJECTS,
            {
                [GOLF]: false,
                [GOLF_V]: 1.2,
                [GRIFF]: true,
                [GRIFF_V]: 2.4,
                [`${NS}.status.battery.list`]: JSON.stringify(list),
                [`${NS}.status.battery.sources`]: '{}',
            },
        ],
    );
    await page.evaluate(
        ([opts, lay, w]) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-latch',
                    type: 'statusoverview',
                    title: 'Batterien',
                    datapoint: '',
                    layout: lay,
                    gridPos: { x: 0, y: 0, w, h: 12 },
                    options: {
                        catWindow: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                        batteryTypeEnabled: false,
                        ...opts,
                    },
                },
            ]),
        [options, layout, cols],
    );
    await page.waitForTimeout(1500);
    return { ctx, page };
}

const rows = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item div.flex.items-center.gap-2.py-1')].map((r) => ({
            text: r.textContent,
            latch: r.getAttribute('data-latch'),
            h: Math.round(r.getBoundingClientRect().height),
            buttons: [...r.querySelectorAll('button.aura-status-action')].map((b) => b.textContent),
        })),
    );
const chipText = (page) =>
    page.evaluate(() => document.querySelector('.react-grid-item span.rounded-full')?.textContent ?? '');
const writes = (page) => page.evaluate(() => window.__auraShot.writes());

// ── 1. baseline: no new options → exactly the old behaviour ───────────────────
{
    const { ctx, page } = await open({});
    const r = await rows(page);
    check(
        'baseline: only the live LOWBAT is listed',
        r.length === 1 && r[0].text.includes('Drehgriff'),
        JSON.stringify(r),
    );
    check(
        'baseline: no buttons',
        r.every((x) => x.buttons.length === 0),
    );
    const w = await writes(page);
    check('baseline: no registration write', !w.some((x) => x.id.includes('.status.')), JSON.stringify(w));
    await ctx.close();
}

// ── 2. latch on ───────────────────────────────────────────────────────────────
const ACTION = {
    label: 'Notiz',
    targetDp: '0_userdata.0.Batterien.Befehl',
    value: 'gewechselt:{serial}',
    categories: ['battery'],
};
{
    const { ctx, page } = await open({ latchBattery: true, rowActions: [ACTION] });
    let r = await rows(page);
    const golf = r.find((x) => x.text.includes('Golf'));
    const griff = r.find((x) => !x.text.includes('Golf'));
    check('quiet LOWBAT stays listed', !!golf, JSON.stringify(r));
    check('… muted', golf?.latch === 'muted', golf?.latch);
    check('… says so', !!golf?.text.includes('meldet zurzeit nichts, bleibt gemerkt'), golf?.text);
    check('… with count', !!golf?.text.includes('3× gemeldet'), golf?.text);
    check('… with since', /seit \d\d\.\d\d\./.test(golf?.text ?? ''), golf?.text);
    check('active entry', griff?.latch === 'active', griff?.latch);
    check(
        'buttons',
        JSON.stringify(golf?.buttons) === JSON.stringify(['Gewechselt', 'Später', 'Notiz']),
        JSON.stringify(golf?.buttons),
    );
    check('chip counts both', (await chipText(page)).includes('2 Hinweise'), await chipText(page));

    const reg = (await writes(page)).filter((x) => x.id === `${NS}.status.register`);
    const payload = reg.length ? JSON.parse(reg.at(-1).val) : null;
    check('registration written once', reg.length === 1, `${reg.length}×`);
    check('registration names the source and category', payload?.source === 'w-latch' && payload?.cat === 'battery');
    const golfWatch = payload?.watch?.find((w) => w.id === GOLF);
    check(
        'registration carries the voltage neighbour',
        golfWatch?.levelId === GOLF_V && golfWatch?.levelUnit === 'V',
        JSON.stringify(golfWatch),
    );
    check('registration uses the device name', golfWatch?.name === 'Garage Oeffner Golf', golfWatch?.name);

    // Gewechselt: first tap only arms.
    await page.evaluate(() => window.__auraShot.writes(true));
    const golfRow = page.locator('.react-grid-item div.flex.items-center.gap-2.py-1', { hasText: 'Golf' });
    await golfRow.locator('button', { hasText: 'Gewechselt' }).click();
    check('first tap writes nothing', (await writes(page)).length === 0);
    check('first tap arms', (await golfRow.locator('button.aura-status-action').first().textContent()) === 'Wirklich?');
    await golfRow.locator('button', { hasText: 'Wirklich?' }).click();
    let w = await writes(page);
    check(
        'second tap writes ack',
        w.length === 1 && w[0].id === `${NS}.status.battery.cmd` && w[0].val === `ack:${GOLF}`,
        JSON.stringify(w),
    );
    check('… without a popup', (await page.locator('[role="dialog"]').count()) === 0);

    // Armed button falls back after 3 s.
    await golfRow.locator('button', { hasText: 'Gewechselt' }).click();
    await page.waitForTimeout(3300);
    check(
        'armed button resets',
        (await golfRow.locator('button.aura-status-action').first().textContent()) === 'Gewechselt',
    );

    // Später: no confirm.
    await page.evaluate(() => window.__auraShot.writes(true));
    await golfRow.locator('button', { hasText: 'Später' }).click();
    w = await writes(page);
    check('Später writes snooze', w.length === 1 && w[0].val === `snooze:${GOLF}`, JSON.stringify(w));

    // Row action with placeholder.
    await page.evaluate(() => window.__auraShot.writes(true));
    await golfRow.locator('button', { hasText: 'Notiz' }).click();
    w = await writes(page);
    check(
        'row action fills {serial}',
        w.length === 1 && w[0].id === '0_userdata.0.Batterien.Befehl' && w[0].val === 'gewechselt:0020DA499B8F41',
        JSON.stringify(w),
    );

    // The adapter answers: Golf snoozed, Griff closed.
    await page.evaluate(
        ([id, list]) => window.__auraShot.mock({ [id]: list }),
        [
            `${NS}.status.battery.list`,
            JSON.stringify([
                { ...LIST[0], snoozedUntil: now + 2 * DAY },
                { ...LIST[1], ackedAt: now, closedBy: 'ack' },
            ]),
        ],
    );
    await page.waitForTimeout(400);
    r = await rows(page);
    check(
        'closed entry disappears although LOWBAT is still true',
        r.length === 1 && r[0].text.includes('Golf'),
        JSON.stringify(r.map((x) => x.text)),
    );
    check('snoozed entry shows until when', !!r[0]?.text.includes('zurückgestellt bis'), r[0]?.text);
    check('snoozed entry has no Später button', !r[0]?.buttons.includes('Später'), JSON.stringify(r[0]?.buttons));
    check('snoozed entry leaves the chip', (await chipText(page)).includes('OK'), await chipText(page));
    await ctx.close();
}

// ── 3. row height: a wide row keeps one line, a narrow one wraps the buttons ──
{
    const a = await open({}, LIST, 'compact', 1400, 24);
    const plain = (await rows(a.page))[0]?.h;
    await a.ctx.close();
    const b = await open({ latchBattery: true, rowActions: [ACTION] }, LIST, 'compact', 1400, 24);
    const withButtons = (await rows(b.page)).map((x) => x.h);
    await b.ctx.close();
    check(
        'wide widget: row height unchanged by buttons',
        withButtons.every((h) => h === plain),
        `${plain} vs ${withButtons}`,
    );

    // Narrow (the 900 px viewport gives the widget ~216 px): the buttons move to a
    // line of their own and the device name keeps its room.
    const c = await open({ latchBattery: true, rowActions: [ACTION] });
    const narrow = await c.page.evaluate(() => {
        const r = document.querySelector('.react-grid-item div.flex.items-center.gap-2.py-1');
        const name = r?.children[1]?.getBoundingClientRect();
        const btns = r?.querySelector('button.aura-status-action')?.getBoundingClientRect();
        return { nameW: Math.round(name?.width ?? 0), nameTop: name?.top ?? 0, btnTop: btns?.top ?? 0 };
    });
    await c.ctx.close();
    check('narrow widget: device name keeps ≥ 100 px', narrow.nameW >= 100, JSON.stringify(narrow));
    check('narrow widget: buttons on the next line', narrow.btnTop > narrow.nameTop + 8, JSON.stringify(narrow));
}

// ── 4. default layout and the "seit" option ───────────────────────────────────
{
    const { ctx, page } = await open({ sinceCategories: ['battery'] }, LIST, 'default');
    const r = await rows(page);
    check('sinceCategories battery shows "seit"', /· (seit \d+ (min|h|d)|gerade)/.test(r[0]?.text ?? ''), r[0]?.text);
    await ctx.close();
}

// ── 5. options panel: latch toggle and the row-action editor write the options ──
{
    const { ctx, page } = await open({});
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-latch'));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    // The Merkliste is its own section: after "Anzeige", right above "Zeilen-Aktionen".
    const card = page.locator('.aura-status-merkliste');
    await card.waitFor({ timeout: 10000 });
    const order = await page.evaluate(() => {
        const t = (txt) =>
            [...document.querySelectorAll('span')].find((e) => e.textContent === txt)?.getBoundingClientRect().top ??
            -1;
        const c = document.querySelector('.aura-status-merkliste')?.getBoundingClientRect().top ?? -1;
        const a = document.querySelector('.aura-status-row-actions')?.getBoundingClientRect().top ?? -1;
        return { display: t('Anzeige'), card: c, actions: a };
    });
    check(
        'Merkliste between "Anzeige" and "Zeilen-Aktionen"',
        order.display > 0 && order.display < order.card && order.card < order.actions,
        JSON.stringify(order),
    );
    // Collapsed like "Einschränkung" and "Anzeige"; the summary says what is on.
    const summary = card.locator('summary');
    check('Merkliste starts collapsed', !(await card.evaluate((d) => d.open)));
    check('summary says "aus"', (await summary.textContent()).includes('aus'), await summary.textContent());
    await summary.click();
    check('Merkliste settings hidden while off', (await card.locator('input[type=number]').count()) === 0);
    await card.locator('[data-latch-toggle="battery"] label > div').click();
    check('latch toggle writes latchBattery', (await opts())?.latchBattery === true, JSON.stringify(await opts()));
    check(
        'summary names what is on',
        (await summary.textContent()).includes('an: Batterien'),
        await summary.textContent(),
    );
    // The test widget has reachability and alarms switched off: their toggles must not be usable.
    const blocked = await card.evaluate((d) =>
        ['unreach', 'alarm'].map((c) => getComputedStyle(d.querySelector(`[data-latch-toggle="${c}"]`)).pointerEvents),
    );
    check(
        'toggles of switched-off categories are blocked',
        blocked.every((v) => v === 'none'),
        JSON.stringify(blocked),
    );
    check(
        'shared latch settings appear',
        (await page.locator('label:text-is("Nachkontrolle nach Schließen (Tage)")').count()) === 1,
    );
    // Zeilen-Aktionen: collapsed like the other sections, the summary counts the buttons.
    const actSec = page.locator('.aura-status-row-actions');
    const actSummary = actSec.locator('summary');
    check('Zeilen-Aktionen start collapsed', !(await actSec.evaluate((d) => d.open)));
    check('summary says "keine"', (await actSummary.textContent()).includes('keine'), await actSummary.textContent());
    const actOrder = await page.evaluate(() => {
        const sec = document.querySelector('.aura-status-row-actions')?.getBoundingClientRect().top ?? -1;
        const click = [...document.querySelectorAll('label')].find((l) => l.textContent === 'Klick auf Zeile');
        return { sec, click: click?.getBoundingClientRect().top ?? -1 };
    });
    check(
        'Zeilen-Aktionen right above "Klick auf Zeile"',
        actOrder.sec > 0 && actOrder.sec < actOrder.click,
        JSON.stringify(actOrder),
    );
    await actSummary.click();
    await actSec.locator('button:has-text("Knöpfe bearbeiten")').click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('button:has-text("Knopf hinzufügen")').click();
    await dlg.locator('input[aria-label="Beschriftung"]').fill('Gewechselt');
    await dlg.locator('input[aria-label="Ziel-Datenpunkt"]').fill('0_userdata.0.Batterien.Befehl');
    await dlg.locator('input[aria-label="Wert"]').fill('gewechselt:{serial}');
    await dlg.locator('button:text-is("Batterien")').click();
    await dlg.locator('label:has-text("Rückfrage") input[type=checkbox]').check();
    const ra = (await opts())?.rowActions;
    check(
        'editor writes the row action',
        JSON.stringify(ra) ===
            JSON.stringify([
                {
                    label: 'Gewechselt',
                    targetDp: '0_userdata.0.Batterien.Befehl',
                    value: 'gewechselt:{serial}',
                    categories: ['battery'],
                    confirm: true,
                },
            ]),
        JSON.stringify(ra),
    );

    // Presets: "Licht aus" adds a working button, a second click is blocked.
    const preset = dlg.locator('[data-row-action-presets] button:has-text("Licht aus")');
    await preset.click();
    const ra2 = (await opts())?.rowActions;
    check(
        'preset "Licht aus" adds its button',
        JSON.stringify(ra2?.at(-1)) ===
            JSON.stringify({ label: 'Aus', targetDp: '{id}', value: 'false', categories: ['light'] }),
        JSON.stringify(ra2),
    );
    check('preset cannot be added twice', await preset.isDisabled());
    await dlg.locator('[data-row-action-presets] button:has-text("Fenster: Erinnern")').click();
    check(
        'example target asks to be adjusted',
        (await dlg.locator('[data-row-action]').last().locator('text=Beispiel aus der Vorlage').count()) === 1,
    );
    await page.keyboard.press('Escape');
    check(
        'summary counts the buttons',
        (await actSummary.textContent()).includes('3 Knöpfe'),
        await actSummary.textContent(),
    );
    await ctx.close();
}

// ── 6. preset "Licht aus" in a light row: writes false to the row's own datapoint ──
{
    const LAMP = 'hue.0.Wohnzimmer_Stehlampe.on';
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 700 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate((LAMP) => {
        const s = window.__auraShot;
        s.captureWrites(true);
        s.mockObjectView({
            state: [
                {
                    id: LAMP,
                    value: { type: 'state', common: { name: 'Stehlampe', role: 'switch.light', type: 'boolean' } },
                },
            ],
        });
        s.mockServerState({ [LAMP]: true });
        s.mock({ [LAMP]: true });
        s.showWidgets([
            {
                id: 'w-light',
                type: 'statusoverview',
                title: 'Licht',
                datapoint: '',
                layout: 'compact',
                gridPos: { x: 0, y: 0, w: 24, h: 8 },
                options: {
                    catWindow: false,
                    catBattery: false,
                    catUnreach: false,
                    catAlarm: false,
                    rowActions: [{ label: 'Aus', targetDp: '{id}', value: 'false', categories: ['light'] }],
                },
            },
        ]);
    }, LAMP);
    await page.waitForTimeout(1500);
    const lampRow = page.locator('.react-grid-item div.flex.items-center.gap-2.py-1', { hasText: 'Stehlampe' });
    await lampRow.locator('button', { hasText: 'Aus' }).click();
    const w = await page.evaluate(() => window.__auraShot.writes());
    check(
        'light row "Aus" writes false to its own datapoint',
        w.length === 1 && w[0].id === LAMP && w[0].val === false,
        JSON.stringify(w),
    );
    await ctx.close();
}

// ── 7. layout "twoline": dot, name, muted second line, touch buttons ─────────
const rows2 = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item .aura-status-row-2l')].map((r) => {
            const lines = r.children[1]?.children ?? [];
            return {
                name: lines[0]?.textContent ?? '',
                sub: lines[1]?.textContent ?? '',
                latch: r.getAttribute('data-latch'),
                opacity: getComputedStyle(r).opacity,
                bg: getComputedStyle(r).backgroundColor,
                borderTop: getComputedStyle(r).borderTopWidth,
                nameSize: parseFloat(getComputedStyle(lines[0]).fontSize),
                buttons: [...r.querySelectorAll('button.aura-status-action')].map((b) => ({
                    text: b.textContent,
                    h: Math.round(b.getBoundingClientRect().height),
                })),
            };
        }),
    );
{
    const SHOTS = process.env.AURA_SHOT_DIR;
    const list = [{ ...LIST[0], minLevel: 1.2, unit: 'V' }, LIST[1]];
    const { ctx, page } = await open({ latchBattery: true, rowActions: [ACTION] }, list, 'twoline', 1400, 16);
    let r = await rows2(page);
    const golf = r.find((x) => x.name.includes('Golf'));
    const griff = r.find((x) => !x.name.includes('Golf'));
    check('twoline: both entries as two-line rows', r.length === 2, JSON.stringify(r));
    check('twoline: no old one-line rows', (await rows(page)).length === 0);
    check(
        'twoline: no category heading with one category',
        !(await page.locator('.react-grid-item span.uppercase').count()),
    );
    check('twoline: name 16 px', golf?.nameSize === 16, String(golf?.nameSize));
    check('twoline: reading with level', !!golf?.sub.startsWith('Batterie schwach (1,2 V)'), golf?.sub);
    check('twoline: room on line 2', !!golf?.sub.includes('Garage'), golf?.sub);
    check('twoline: "gemeldet seit"', /gemeldet seit \d\d\.\d\d\./.test(golf?.sub ?? ''), golf?.sub);
    check('twoline: count', !!golf?.sub.includes('3× gemeldet'), golf?.sub);
    check('twoline: quiet hint', !!golf?.sub.includes('meldet zurzeit nichts, bleibt aber gemerkt'), golf?.sub);
    check('twoline: quiet row not dimmed', golf?.opacity === '1', golf?.opacity);
    check(
        'twoline: no tinted background',
        r.every((x) => x.bg === 'rgba(0, 0, 0, 0)'),
        JSON.stringify(r.map((x) => x.bg)),
    );
    check('twoline: rule between rows only', r[0].borderTop === '0px' && r[1].borderTop === '1px');
    check(
        'twoline: buttons action, snooze, close',
        JSON.stringify(golf?.buttons.map((b) => b.text)) === JSON.stringify(['Notiz', '2 Tage später', 'Gewechselt']),
        JSON.stringify(golf?.buttons),
    );
    check('twoline: buttons ≥ 32 px high', !!golf?.buttons.every((b) => b.h >= 32), JSON.stringify(golf?.buttons));
    check('twoline: live entry says "Batterie schwach"', !!griff?.sub.startsWith('Batterie schwach'), griff?.sub);
    if (SHOTS) {
        const shot = (name) =>
            page
                .locator('.react-grid-item')
                .first()
                .screenshot({ path: `${SHOTS}/${name}.png` });
        await shot('twoline-light');
        await page.evaluate(() => window.__auraShot.setTheme('dark'));
        await page.waitForTimeout(300);
        await shot('twoline-dark');
        await page.evaluate(() => window.__auraShot.setTheme('light'));
    }

    // Gewechselt: two taps, the first one only arms (4 s).
    await page.evaluate(() => window.__auraShot.writes(true));
    const golfRow = page.locator('.react-grid-item .aura-status-row-2l', { hasText: 'Golf' });
    const ack = golfRow.locator('button.aura-status-action').last();
    await ack.click();
    check('twoline: first tap writes nothing', (await writes(page)).length === 0);
    check('twoline: first tap asks', (await ack.textContent()) === 'Wirklich gewechselt?', await ack.textContent());
    await page.waitForTimeout(3300);
    check('twoline: still armed after 3.3 s', (await ack.textContent()) === 'Wirklich gewechselt?');
    await page.waitForTimeout(1000);
    check(
        'twoline: armed button resets after 4 s',
        (await ack.textContent()) === 'Gewechselt',
        await ack.textContent(),
    );
    await ack.click();
    await ack.click();
    const w = await writes(page);
    check(
        'twoline: second tap writes ack',
        w.length === 1 && w[0].id === `${NS}.status.battery.cmd` && w[0].val === `ack:${GOLF}`,
        JSON.stringify(w),
    );
    check('twoline: busy while the adapter answers', (await ack.textContent()) === '…' && (await ack.isDisabled()));

    // The adapter answers: Golf snoozed.
    await page.evaluate(
        ([id, l]) => window.__auraShot.mock({ [id]: l }),
        [`${NS}.status.battery.list`, JSON.stringify([{ ...list[0], snoozedUntil: now + 2 * DAY }, list[1]])],
    );
    await page.waitForTimeout(400);
    r = await rows2(page);
    const snoozed = r.find((x) => x.name.includes('Golf'));
    check(
        'twoline: snoozed shows until when',
        /zurückgestellt bis \d\d\.\d\d\./.test(snoozed?.sub ?? ''),
        snoozed?.sub,
    );
    check(
        'twoline: snoozed has no "später" button',
        !snoozed?.buttons.some((b) => b.text.includes('später')),
        JSON.stringify(snoozed?.buttons),
    );
    await ctx.close();
}
{
    // All clear: green, bold, battery wording.
    const ctx = await open({ latchBattery: true }, [], 'twoline');
    await ctx.page.evaluate(([id]) => window.__auraShot.mock({ [id]: false }), [GRIFF]);
    await ctx.page.waitForTimeout(400);
    const txt = await ctx.page.locator('.react-grid-item p.font-semibold').last().textContent();
    check('twoline: all clear says "Alle Batterien in Ordnung"', txt === 'Alle Batterien in Ordnung', txt);
    await ctx.ctx.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
