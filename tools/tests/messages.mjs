// Verifies the message toast layer (issue #429) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/messages.mjs
//
// Uses the screenshot harness (__auraShot), so messages are pushed straight into
// the store and no datapoint is ever written. Checked: rendering per severity,
// the nine screen positions, the countdown auto-close, requireAck defeating both
// auto-close and the close button, the per-position stack limit with priority
// pre-emption, replace-by-id, the target filter, and the reload restore.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
/** A normalized message, as the adapter would have produced it. */
function msg(overrides = {}) {
    seq += 1;
    return {
        id: `t${seq}`,
        ts: Date.now() + seq,
        severity: 'info',
        read: false,
        durationSec: 0,
        requireAck: false,
        position: 'top-right',
        priority: 0,
        persist: true,
        title: `Msg ${seq}`,
        text: `Body ${seq}`,
        ...overrides,
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.messages(true));

const settle = () => page.waitForTimeout(300);

/** Push messages after clearing whatever the previous case left behind. */
async function show(messages, scope) {
    await page.evaluate(
        ([list, sc]) => {
            window.__auraShot.messagesReset();
            window.__auraShot.messageIngest(list, sc ?? undefined);
        },
        [messages, scope ?? null],
    );
    await settle();
}

const toasts = () => page.locator('[data-aura-toasts] [role="status"], [data-aura-toasts] [role="alert"]');
const visibleText = async (text) =>
    page
        .locator(`[data-aura-toasts] >> text=${text}`)
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);

// ── 1. Nothing on screen without messages ────────────────────────────────────
await show([]);
check('no toast container while the queue is empty', (await page.locator('[data-aura-toasts]').count()) === 0);

// ── 2. A message renders with title and body ─────────────────────────────────
await show([msg({ title: 'Waschmaschine', text: 'Programm fertig' })]);
check('title is rendered', await visibleText('Waschmaschine'));
check('body is rendered', await visibleText('Programm fertig'));

// ── 3. An error is announced assertively ─────────────────────────────────────
await show([msg({ severity: 'error', title: 'Heizung' })]);
check(
    'an error toast uses role=alert, other severities role=status',
    (await page.locator('[data-aura-toasts] [role="alert"]').count()) === 1,
);
await show([msg({ severity: 'warning' })]);
check('a warning is role=status', (await page.locator('[data-aura-toasts] [role="status"]').count()) === 1);

// ── 4. Every position gets its own container ──────────────────────────────────
const POSITIONS = [
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center',
    'center-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
];
await show(POSITIONS.map((position) => msg({ position })));
const containers = await page.locator('[data-aura-toasts]').count();
check(`all nine positions render their own stack (got ${containers})`, containers === 9);
for (const position of ['top-left', 'center', 'bottom-right']) {
    const box = await page.locator(`[data-aura-toasts="${position}"]`).boundingBox();
    const vp = page.viewportSize();
    const okX = position.endsWith('left')
        ? box.x < 40
        : position.endsWith('right')
          ? box.x + box.width > vp.width - 40
          : true;
    const okY = position.startsWith('top')
        ? box.y < 40
        : position.startsWith('bottom')
          ? box.y + box.height > vp.height - 40
          : true;
    check(`${position} is anchored to its corner`, okX && okY);
}

// ── 5. Auto-close after durationSec, with a countdown bar ────────────────────
await show([msg({ durationSec: 1, title: 'Kurz' })]);
check(
    'a toast with a duration shows the countdown bar',
    (await page.locator('[data-aura-toasts] div div').count()) > 0,
);
check('still visible right after arriving', await visibleText('Kurz'));
await page.waitForTimeout(1600);
check('auto-closes once the duration elapsed', !(await visibleText('Kurz')));

// ── 6. durationSec 0 stays put ───────────────────────────────────────────────
await show([msg({ durationSec: 0, title: 'Bleibt' })]);
await page.waitForTimeout(1200);
check('durationSec 0 keeps the toast open', await visibleText('Bleibt'));

// ── 7. The close button removes it ───────────────────────────────────────────
await page.locator('[data-aura-toasts] button').first().click();
await settle();
check('the close button removes the toast', !(await visibleText('Bleibt')));

// ── 8. requireAck: no auto-close, no close button ────────────────────────────
await show([msg({ requireAck: true, durationSec: 0, title: 'Muss bestaetigt werden' })]);
const ackButtons = await page.locator('[data-aura-toasts] button').count();
check('requireAck offers exactly one button (the confirmation)', ackButtons === 1);
await page.waitForTimeout(1200);
check('requireAck never auto-closes', await visibleText('Muss bestaetigt werden'));

// ── 9. Action buttons appear alongside the confirmation ──────────────────────
await show([
    msg({
        requireAck: true,
        title: 'Trockner',
        actions: [
            { label: 'Starten', dp: 'demo.dryer', value: 'true', close: true },
            { label: 'Spaeter', dp: 'demo.dryer', value: 'false', close: true },
        ],
    }),
]);
check(
    'two actions plus the confirmation render three buttons',
    (await page.locator('[data-aura-toasts] button').count()) === 3,
);
check('action labels are shown', (await visibleText('Starten')) && (await visibleText('Spaeter')));

// ── 10. Stack limit per position ─────────────────────────────────────────────
await page.evaluate(() => window.__auraShot.messagesMaxVisible(2));
await show([1, 2, 3, 4].map((n) => msg({ title: `Stapel ${n}` })));
check('a full position shows only maxVisible toasts', (await toasts().count()) === 2);

// ── 11. Priority pre-empts, requireAck outranks everything ──────────────────
await show([
    msg({ title: 'Niedrig', priority: 0 }),
    msg({ title: 'Mittel', priority: 50 }),
    msg({ title: 'Hoch', priority: 90 }),
]);
check(
    'the two highest priorities win the slots',
    (await visibleText('Hoch')) && (await visibleText('Mittel')) && !(await visibleText('Niedrig')),
);
await show([
    msg({ title: 'Prio100', priority: 100 }),
    msg({ title: 'Prio90', priority: 90 }),
    msg({ title: 'MussWeg', priority: 0, requireAck: true }),
]);
check(
    'a requireAck message keeps its slot regardless of priority',
    (await visibleText('MussWeg')) && (await visibleText('Prio100')) && !(await visibleText('Prio90')),
);
await page.evaluate(() => window.__auraShot.messagesMaxVisible(3));

// ── 12. Same id replaces instead of stacking ────────────────────────────────
await show([msg({ id: 'wm', title: 'Waescht' })]);
await page.evaluate(
    (m) => window.__auraShot.messageIngest([m]),
    msg({ id: 'wm', title: 'Fertig', ts: Date.now() + 9999 }),
);
await settle();
check('a repeated id stays a single toast', (await toasts().count()) === 1);
check('and shows the newer content', (await visibleText('Fertig')) && !(await visibleText('Waescht')));

// ── 13. Target filter ───────────────────────────────────────────────────────
const scope = { clientId: 'tablet-1', layoutId: 'l1', layoutSlug: 'haus', tabId: 't1', tabSlug: 'kueche' };
await show([msg({ title: 'FuerHaus', target: { layout: 'haus' } })], scope);
check('a matching layout target is shown', await visibleText('FuerHaus'));

await show([msg({ title: 'FuerGarten', target: { layout: 'garten' } })], scope);
check('a foreign layout target is suppressed', (await page.locator('[data-aura-toasts]').count()) === 0);

await show([msg({ title: 'FuerTablet', target: { clients: ['tablet-1'] } })], scope);
check('a matching client target is shown', await visibleText('FuerTablet'));

await show([msg({ title: 'FuerAnderes', target: { clients: ['tablet-9'] } })], scope);
check('a foreign client target is suppressed', (await page.locator('[data-aura-toasts]').count()) === 0);

await show([msg({ title: 'PerTabSlug', target: { tab: 'kueche' } })], scope);
check('a tab target matches on the slug', await visibleText('PerTabSlug'));

// ── 14. A message already closed elsewhere never appears ────────────────────
await show([msg({ title: 'SchonWeg', dismissed: true })]);
check('a dismissed message is not shown', (await page.locator('[data-aura-toasts]').count()) === 0);

// ── 15. The same id at the same timestamp is not replayed ──────────────────
// This is what stops a page reload (or the history catch-up racing the live
// broadcast) from re-opening everything the user already dealt with.
await page.evaluate(() => window.__auraShot.messagesReset());
const once = msg({ id: 'once', title: 'NurEinmal' });
await page.evaluate((m) => window.__auraShot.messageIngest([m]), once);
await settle();
await page.locator('[data-aura-toasts] button').first().click();
await settle();
await page.evaluate((m) => window.__auraShot.messageIngest([m]), once);
await settle();
check(
    'a closed message is not re-shown at the same timestamp',
    (await page.locator('[data-aura-toasts]').count()) === 0,
);

// ── 16. …but a fresh send on that id shows again ────────────────────────────
// The reusable-id workflow: the same notice fires later and must be seen again.
await page.evaluate((m) => window.__auraShot.messageIngest([m]), {
    ...once,
    ts: Date.now() + 50000,
    title: 'WiederDa',
});
await settle();
check('the same id with a newer timestamp is shown again', await visibleText('WiederDa'));

// ── 16a. HTML in the title and the body ─────────────────────────────────────
await show([
    msg({
        title: 'Heizung <b>Bad</b>',
        text: '<table><tr><th>Raum</th><th>Temp</th></tr><tr><td>Bad</td><td>21 °C</td></tr></table>',
    }),
]);
check('the title renders its markup', (await page.locator('[data-aura-toasts] b', { hasText: 'Bad' }).count()) === 1);
check('a table in the body renders as a table', (await page.locator('[data-aura-toasts] table td').count()) === 2);
check(
    'the table is styled, not left as a run-on line',
    await page.evaluate(() => {
        const td = document.querySelector('[data-aura-toasts] td');
        return td ? getComputedStyle(td).borderBottomWidth !== '0px' : false;
    }),
);

// Scripts and handlers must not survive the sanitiser.
await show([msg({ title: 'X<script>window.__pwned = 1</script>', text: '<img src=x onerror="window.__pwned=1">' })]);
check('script tags are stripped', (await page.locator('[data-aura-toasts] script').count()) === 0);
check(
    'inline event handlers are stripped',
    await page.evaluate(() => {
        const img = document.querySelector('[data-aura-toasts] img');
        return window.__pwned === undefined && (!img || !img.getAttribute('onerror'));
    }),
);

// `html` still wins over `text`, so existing payloads keep working.
await show([msg({ title: 'T', text: 'nur text', html: '<i>aus html</i>' })]);
check('html still overrides text', (await visibleText('aus html')) && !(await visibleText('nur text')));

// ── 16c. Appearance and text alignment ──────────────────────────────────────
const cardStyle = () =>
    page.evaluate(() => {
        const card = document.querySelector('[data-aura-toasts] [role="status"], [data-aura-toasts] [role="alert"]');
        if (!card) return null;
        const cs = getComputedStyle(card);
        return {
            background: cs.backgroundColor,
            borderLeft: cs.borderLeftWidth,
            borderTop: cs.borderTopWidth,
            textAlign: cs.textAlign,
        };
    });

await show([msg({ title: 'Balken' })]);
let style = await cardStyle();
check('the default look is the leading-edge bar', style.borderLeft === '3px' && style.borderTop === '1px');

await show([msg({ title: 'Gefuellt', severity: 'error', appearance: 'filled' })]);
style = await cardStyle();
check(
    `filled paints the whole card in the severity colour (got ${style.background})`,
    style.background === 'rgb(239, 68, 68)',
);
check(
    'and the text flips to white so it stays readable',
    await page.evaluate(() => {
        const el = document.querySelector('[data-aura-toasts] .aura-msg-html');
        return el ? getComputedStyle(el).color === 'rgb(255, 255, 255)' : false;
    }),
);

await show([msg({ title: 'Rahmen', appearance: 'outline' })]);
style = await cardStyle();
check(
    `outline draws the colour all the way around (${JSON.stringify(style)})`,
    style.borderTop === '2px' && style.borderLeft === '2px',
);

await show([msg({ title: 'Ohne', appearance: 'plain' })]);
style = await cardStyle();
check(
    `plain drops the accent entirely (${JSON.stringify(style)})`,
    style.borderLeft === '1px' && style.borderTop === '1px',
);

// An explicit colour replaces the severity colour without changing the severity.
await show([msg({ title: 'Eigen', severity: 'info', appearance: 'filled', color: '#123456' })]);
style = await cardStyle();
check(`an explicit colour wins over the severity (got ${style.background})`, style.background === 'rgb(18, 52, 86)');

// background wins over what the appearance would paint, and still flips the text.
await show([msg({ title: 'BG', appearance: 'bar', background: '#004400' })]);
style = await cardStyle();
check(`background overrides the appearance fill (got ${style.background})`, style.background === 'rgb(0, 68, 0)');

await show([msg({ title: 'Farbe', appearance: 'filled', textColor: '#ffff00' })]);
check(
    'an explicit text colour beats the automatic white',
    await page.evaluate(() => {
        const el = document.querySelector('[data-aura-toasts] .aura-msg-html');
        return el ? getComputedStyle(el).color === 'rgb(255, 255, 0)' : false;
    }),
);

for (const align of ['left', 'center', 'right']) {
    await show([msg({ title: `Ausrichtung ${align}`, align })]);
    style = await cardStyle();
    check(`align ${align} reaches the card`, style.textAlign === align);
}

// The button row is flex, so textAlign alone would not move it.
await show([msg({ title: 'Buttons', align: 'right', requireAck: true })]);
check(
    'the button row follows the alignment too',
    await page.evaluate(() => {
        const row = document.querySelector('[data-aura-toasts] .flex-wrap');
        return row ? getComputedStyle(row).justifyContent === 'flex-end' : false;
    }),
);

// ── 16d. Size, transparency and the rest of the payload ─────────────────────
const cardBox = () =>
    page.evaluate(() => {
        const card = document.querySelector('[data-aura-toasts] [role="status"], [data-aura-toasts] [role="alert"]');
        if (!card) return null;
        const box = card.getBoundingClientRect();
        const scroller = card.querySelector('.overflow-auto');
        return {
            w: Math.round(box.width),
            h: Math.round(box.height),
            opacity: getComputedStyle(card).opacity,
            images: card.querySelectorAll('img').length,
            buttons: card.querySelectorAll('button').length,
            scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight + 2 : false,
        };
    });

await show([msg({ title: 'Standard', text: 'kurz' })]);
const defaultBox = await cardBox();
check(`the default card is ${defaultBox.w}px wide`, defaultBox.w === 340);

await show([msg({ title: 'Breit', text: 'kurz', width: 600 })]);
let box = await cardBox();
check(`width reaches the card (got ${box.w})`, box.w === 600);

await show([msg({ title: 'Schmal', text: 'kurz', width: 200 })]);
box = await cardBox();
check(`a narrow width applies too (got ${box.w})`, box.w === 200);

// height is a height, not a ceiling: a short message has to grow into it.
await show([msg({ title: 'Hoch', text: 'kurz', height: 300 })]);
box = await cardBox();
check(`height grows a short card (got ${box.h})`, box.h === 300);

await show([msg({ title: 'Durchsichtig', text: 'kurz', transparency: 50 })]);
box = await cardBox();
check(`transparency reaches the card (got ${box.opacity})`, box.opacity === '0.5');

await show([msg({ title: 'Alles', text: 'kurz', width: 500, height: 250, transparency: 30 })]);
box = await cardBox();
check(
    `width, height and transparency combine (got ${box.w}x${box.h} @ ${box.opacity})`,
    box.w === 500 && box.h === 250 && box.opacity === '0.7',
);

// A message longer than its card must scroll rather than be clipped away.
const manyLines = Array.from({ length: 40 }, (_, i) => `Zeile ${i}`).join('<br>');
await show([msg({ title: 'Lang', text: manyLines, height: 120 })]);
box = await cardBox();
check('a message taller than its card scrolls instead of being cut off', box.h === 120 && box.scrollable);

await show([msg({ title: 'Bild', text: 'x', image: '/favicon.svg' })]);
box = await cardBox();
check('an image is rendered', box.images === 1);

// An unknown view must fall back to the text, not leave an empty card.
await show([msg({ title: 'Fehlt', text: 'Rueckfalltext', view: 'gibt-es-nicht' })]);
check('an unknown popup view falls back to the text', await visibleText('Rueckfalltext'));

// ── 16e. The send time on the card ──────────────────────────────────────────
// Whether to show it is decided by the adapter (payload over admin default), so
// the card only has to print what it was handed — and print nothing otherwise.
const timeLine = () =>
    page.evaluate(() => {
        const el = document.querySelector('[data-aura-toasts] [data-aura-msg-time]');
        return el ? el.textContent.trim() : null;
    });

await show([msg({ title: 'OhneZeit', text: 'x' })]);
check('no timestamp unless the message carries showTime', (await timeLine()) === null);

const stamp = new Date(2026, 7, 17, 14, 7, 0).getTime();
await show([msg({ title: 'MitZeit', text: 'x', ts: stamp, showTime: true, timeFormat: 'time' })]);
let printed = await timeLine();
check(`the time format prints the clock alone (got ${printed})`, printed === '14:07');

await show([msg({ title: 'MitDatum', text: 'x', ts: stamp, showTime: true, timeFormat: 'datetime' })]);
printed = await timeLine();
check(`datetime prints date and clock (got ${printed})`, /^17\.08\.\d{2,4}, 14:07$/.test(printed ?? ''));

await show([msg({ title: 'OhneFormat', text: 'x', ts: stamp, showTime: true })]);
printed = await timeLine();
check(`a message without a format falls back to the clock (got ${printed})`, printed === '14:07');

// ── 16b. A view without a toast layer must not consume messages ─────────────
// The admin area keeps a runtime lease for its history list. Before this gate it
// swallowed arriving messages there: out of scope counts as handled, so the
// dashboard would never have shown them.
await page.evaluate(() => {
    window.__auraShot.messagesReset();
    // Same state as a route that reads the archive but renders no overlay.
    window.__auraShot.messagesDisplayActive(false);
});
await page.evaluate((m) => window.__auraShot.messageIngest([m]), msg({ id: 'no-surface', title: 'Unsichtbar' }));
await settle();
check('no toast without a display surface', (await page.locator('[data-aura-toasts]').count()) === 0);
const seenWithoutSurface = await page.evaluate(() => window.__auraShot.messagesSeen());
check('and the message is not marked as handled', !('no-surface' in seenWithoutSurface));
await page.evaluate(() => window.__auraShot.messagesDisplayActive(true));

// ── 17. The Meldungen widget lists the archive ──────────────────────────────
const now = Date.now();
const archive = [
    msg({ id: 'a-err', ts: now - 60_000, severity: 'error', title: 'Heizung', text: 'Kein Kontakt' }),
    msg({ id: 'a-warn', ts: now - 3_600_000, severity: 'warning', title: 'Waschmaschine', text: 'Fertig' }),
    { ...msg({ id: 'a-ok', ts: now - 7_200_000, severity: 'success', title: 'Backup' }), read: true },
    { ...msg({ id: 'a-info', ts: now - 90_000_000, severity: 'info', title: 'Sonnenuntergang' }), read: true },
];

// A fresh widget id per case: the severity pills are live UI state that survives
// an options change on purpose, so reusing one id would carry the previous case's
// filter over into the next.
let widgetSeq = 0;
async function showWidget(options = {}, layout = 'default') {
    widgetSeq += 1;
    await page.evaluate(
        ([list, opts, lay, id]) => {
            window.__auraShot.messagesReset();
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'messages',
                    title: 'Meldungen',
                    datapoint: '',
                    layout: lay,
                    gridPos: { x: 0, y: 0, w: 16, h: 14 },
                    options: opts,
                },
            ]);
            window.__auraShot.messagesHistory(list);
        },
        [archive, options, layout, `w-msg-${widgetSeq}`],
    );
    await settle();
    return page.locator('[data-aura-messages="list"]').first();
}

let widget = await showWidget({ groupByDay: true });
let body = await widget.innerText();
check(
    'the widget lists every archived message',
    ['Heizung', 'Waschmaschine', 'Backup', 'Sonnenuntergang'].every((s) => body.includes(s)),
);
check('day grouping inserts a date separator', /\d{2}\.\d{2}\./.test(body));
check('relative timestamps are shown', body.includes('vor '));

// A compact row must show readable text, never the raw markup.
widget = await showWidget({});
await page.evaluate(
    (m) => window.__auraShot.messagesHistory([m]),
    msg({ id: 'a-html', title: 'Heizung <b>Bad</b>', text: '<table><tr><td>21 °C</td></tr></table>' }),
);
await settle();
body = await widget.innerText();
check('the list row strips markup from the title', body.includes('Heizung Bad') && !body.includes('<b>'));
check('and from the body', body.includes('21 °C') && !body.includes('<table'));

// Cell boundaries must survive as spaces, or a table collapses into one word.
await page.evaluate(
    (m) => window.__auraShot.messagesHistory([m]),
    msg({ id: 'a-cells', title: 'Tab', text: '<table><tr><th>Raum</th><th>Temperatur</th></tr></table>' }),
);
await settle();
body = await widget.innerText();
check('table cells stay separate words in the list', body.includes('Raum Temperatur'));

// A `[[dp]]` token reads live wherever the message is displayed (issue #605) — a
// row condition writes `[[{{parent}}.NAME]]` into the draft and the archive keeps
// the resolved ID, not the value, so the compact rows have to read it too.
await page.evaluate(
    (v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    },
    { 'demo.melder.NAME': 'Flur', 'demo.melder.STATE': true },
);
await page.evaluate(
    (m) => window.__auraShot.messagesHistory([m]),
    msg({ id: 'a-token', title: 'Bewegung [[demo.melder.NAME]]', text: 'Status [[demo.melder.STATE]]' }),
);
await page.waitForTimeout(700);
body = await widget.innerText();
check('the list row resolves a [[dp]] token in the title', body.includes('Bewegung Flur'));
check('and one in the body', body.includes('Status AN'));
check('no raw token leaks into the row', !body.includes('[['));

// Restore the shared archive — the checks below filter against all four entries.
widget = await showWidget({});

// Severity pills filter the list down.
await page.locator('[data-aura-messages="list"] button', { hasText: 'Warnung' }).first().click();
await settle();
body = await widget.innerText();
check('switching a severity pill off hides that severity', !body.includes('Waschmaschine') && body.includes('Heizung'));

// Only-unread hides confirmed entries.
widget = await showWidget({ unreadOnly: true });
body = await widget.innerText();
check(
    'unreadOnly hides confirmed messages',
    body.includes('Heizung') && body.includes('Waschmaschine') && !body.includes('Backup'),
);

// A time window drops everything older.
widget = await showWidget({ hours: 2 });
body = await widget.innerText();
check('the time window drops older entries', body.includes('Heizung') && !body.includes('Sonnenuntergang'));

// maxEntries caps the list.
widget = await showWidget({ maxEntries: 1 });
body = await widget.innerText();
check('maxEntries caps the list', body.includes('Heizung') && !body.includes('Waschmaschine'));

// Clicking a row opens the detail view.
widget = await showWidget();
await page.locator('[data-aura-messages="list"] >> text=Waschmaschine').first().click();
await settle();
const detail = await page.locator('[style*="10000"]').first().innerText();
check('a row click opens the detail view', detail.includes('Waschmaschine') && detail.includes('Schweregrad'));
check('the detail view shows the confirmation state', detail.includes('Ungelesen'));

// The count layout reduces to unread/total.
await page.locator('[style*="10000"] button').first().click();
await settle();
await showWidget({}, 'count');
const countText = (await page.locator('[data-aura-messages="count"]').first().innerText()).replace(/\s+/g, ' ');
check(
    `the count layout shows unread over total (got "${countText}")`,
    /\b2\b/.test(countText) && /\b4\b/.test(countText),
);

// ── 18. The "send a message" condition effect ──────────────────────────────
// Same edge rules as "reload widget": priming stays silent, the rising edge
// fires once, and holding the condition true does not re-fire.
const COND_DP = 'demo.notifyTrigger';
const notifyDraft = {
    id: 'cond-test',
    severity: 'warning',
    title: 'Fenster offen',
    text: 'Bitte schliessen',
    html: '',
    image: '',
    icon: '',
    view: '',
    dp: '',
    position: 'bottom-left',
    durationSec: '20',
    requireAck: false,
    priority: '',
    width: '',
    height: '',
    transparency: '',
    ackDp: '',
    ackValue: '',
    persist: true,
    actions: [],
    targetClients: '',
    targetLayout: '',
    targetTab: '',
};

const sentMessages = () => page.evaluate(() => window.__auraShot.sentMessages());
const setDp = async (value) => {
    await page.evaluate(([dp, v]) => window.__auraShot.mock({ [dp]: v }), [COND_DP, value]);
    await settle();
};

await page.evaluate(
    ([dp, draftValue]) => {
        window.__auraShot.conditionNotify(false);
        window.__auraShot.mock({ [dp]: true });
        window.__auraShot.showWidgets([
            {
                id: 'w-cond',
                type: 'value',
                title: 'Test',
                datapoint: dp,
                gridPos: { x: 0, y: 0, w: 6, h: 4 },
                options: {
                    conditions: [
                        {
                            id: 'c1',
                            logic: 'AND',
                            clauses: [{ datapoint: dp, operator: 'true', value: '' }],
                            style: {},
                            notify: draftValue,
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.conditionNotify(true);
    },
    [COND_DP, notifyDraft],
);
await settle();
check('no message while priming on an already-true datapoint', (await sentMessages()).length === 0);

await setDp(false);
await setDp(true);
const fired = await sentMessages();
check('the rising edge sends exactly one message', fired.length === 1);
check(
    'the payload carries the configured fields',
    fired[0]?.title === 'Fenster offen' && fired[0]?.severity === 'warning' && fired[0]?.durationSec === 20,
);
check(
    'unset builder fields are left out of the payload',
    fired[0] !== undefined && !('width' in fired[0]) && !('target' in fired[0]) && !('requireAck' in fired[0]),
);

await setDp(true);
check('holding the condition true does not re-fire', (await sentMessages()).length === 1);

// ── 18b. One message per triggering list entry (issue #605) ────────────────
// A `{list:any}` rule speaks about the whole list, but the message has to name
// the entry that fired — so the rule fans out: one message per row, with
// `{{parent}}` & co. resolved against that row's datapoint.
const ROWS = ['demo.melder.Flur.MOTION', 'demo.melder.Bad.MOTION', 'demo.melder.Keller.MOTION'];
const rowDraft = {
    ...notifyDraft,
    id: 'melder',
    title: 'Bewegung [[{{parent}}.NAME]]',
    text: '{{name}} von {{dp}}',
};

// The list widget and the condition hook both re-read their datapoints through
// getState on mount, so the injected values need a server side too — otherwise a
// remount pulls the real (empty) instance value back over the mock.
const rowState = {};
const setRows = async (patch) => {
    Object.assign(rowState, patch);
    await page.evaluate((p) => {
        window.__auraShot.mockServerState(p);
        window.__auraShot.mock(p);
    }, rowState);
    await settle();
};

// The first entry starts out true: priming must stay silent for it too.
await setRows({ [ROWS[0]]: true, [ROWS[1]]: false, [ROWS[2]]: false });
await page.evaluate(
    ([rows, draftValue]) => {
        window.__auraShot.conditionNotify(false);
        window.__auraShot.messagesReset();
        window.__auraShot.showWidgets([
            {
                id: 'w-cond-list',
                type: 'list',
                title: 'Melder',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    entries: rows.map((id, i) => ({ id, name: `Melder ${i}` })),
                    conditions: [
                        {
                            id: 'c-row',
                            logic: 'AND',
                            clauses: [{ datapoint: '{list:any}', operator: 'true', value: '' }],
                            style: {},
                            notify: draftValue,
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.conditionNotify(true);
    },
    [ROWS, rowDraft],
);
await settle();
check('per row: no message while priming on an already-true entry', (await sentMessages()).length === 0);

await setRows({ [ROWS[1]]: true });
const rowFired = await sentMessages();
check('per row: one entry going true sends exactly one message', rowFired.length === 1);
check(
    `per row: {{parent}} resolves to the triggering entry (got "${rowFired[0]?.title}")`,
    rowFired[0]?.title === 'Bewegung [[demo.melder.Bad.NAME]]',
);
check(
    `per row: {{name}} and {{dp}} resolve too (got "${rowFired[0]?.text}")`,
    rowFired[0]?.text === `MOTION von ${ROWS[1]}`,
);
check(`per row: the message id carries the entry (got "${rowFired[0]?.id}")`, rowFired[0]?.id === `melder:${ROWS[1]}`);

await setRows({ [ROWS[2]]: true });
const bothFired = await sentMessages();
check('per row: a second entry sends its own message', bothFired.length === 2);
check(
    'per row: the two messages do not share an id',
    bothFired[0]?.id !== bothFired[1]?.id && bothFired[1]?.id === `melder:${ROWS[2]}`,
);

await setRows({ [ROWS[1]]: true, [ROWS[2]]: true });
check('per row: holding the entries true does not re-fire', (await sentMessages()).length === 2);

await setRows({ [ROWS[1]]: false });
check('per row: an entry going false is silent', (await sentMessages()).length === 2);
await setRows({ [ROWS[1]]: true });
const again = await sentMessages();
check('per row: the same entry fires again on its next rising edge', again.length === 3);
check('per row: …under the same id, so the archive updates that entry', again[2]?.id === `melder:${ROWS[1]}`);

// A rule about the list as a whole keeps naming no row — one message, unchanged.
await setRows({ [ROWS[0]]: false, [ROWS[1]]: false, [ROWS[2]]: false });
await page.evaluate(
    ([rows, draftValue]) => {
        window.__auraShot.conditionNotify(false);
        window.__auraShot.messagesReset();
        window.__auraShot.showWidgets([
            {
                id: 'w-cond-all',
                type: 'list',
                title: 'Melder',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    entries: rows.map((id, i) => ({ id, name: `Melder ${i}` })),
                    conditions: [
                        {
                            id: 'c-all',
                            logic: 'AND',
                            clauses: [{ datapoint: '{list:all}', operator: 'true', value: '' }],
                            style: {},
                            notify: { ...draftValue, id: 'alle', title: 'Alle: {{name}}', text: '' },
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.conditionNotify(true);
    },
    [ROWS, rowDraft],
);
await settle();
await setRows({ [ROWS[0]]: true, [ROWS[1]]: true, [ROWS[2]]: true });
const listWide = await sentMessages();
check('a list-wide rule still sends a single message', listWide.length === 1);
check(
    `…with the id and text left alone (got "${listWide[0]?.id}" / "${listWide[0]?.title}")`,
    listWide[0]?.id === 'alle' && listWide[0]?.title === 'Alle: {{name}}',
);

// ── 18c. A message from a ROW condition (issue #605) ────────────────────────
// The second place a message can come from: "Datenpunkte verwalten → Bedingungen"
// (list-wide) and the per-entry conditions. Those rules are evaluated per row, so
// the row that matches is the row the message is about — no list token involved.
const rowRuleDraft = {
    ...notifyDraft,
    id: 'zeile',
    title: 'Bewegung [[{{parent}}.NAME]]',
    text: '{{name}}',
};

await setRows({ [ROWS[0]]: false, [ROWS[1]]: false, [ROWS[2]]: false });
await page.evaluate(
    ([rows, draftValue]) => {
        window.__auraShot.conditionNotify(false);
        window.__auraShot.messagesReset();
        window.__auraShot.showWidgets([
            {
                id: 'w-row-cond',
                type: 'list',
                title: 'Melder',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    entries: rows.map((id, i) => ({ id, name: `Melder ${i}` })),
                    rowConditions: [
                        {
                            id: 'rc1',
                            logic: 'AND',
                            clauses: [{ datapoint: '{dp}', operator: 'true', value: '' }],
                            color: '#ef4444',
                            notify: draftValue,
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.conditionNotify(true);
    },
    [ROWS, rowRuleDraft],
);
await settle();
check('row rule: nothing is sent while the rows are loading', (await sentMessages()).length === 0);

await setRows({ [ROWS[1]]: true });
const rowRuleFired = await sentMessages();
check('row rule: the row that starts matching sends one message', rowRuleFired.length === 1);
check(
    `row rule: the message is about that row (got "${rowRuleFired[0]?.title}" / "${rowRuleFired[0]?.text}")`,
    rowRuleFired[0]?.title === 'Bewegung [[demo.melder.Bad.NAME]]' && rowRuleFired[0]?.text === 'MOTION',
);
check(`row rule: the id carries the row (got "${rowRuleFired[0]?.id}")`, rowRuleFired[0]?.id === `zeile:${ROWS[1]}`);

await setRows({ [ROWS[2]]: true });
check('row rule: a second row sends its own message', (await sentMessages()).length === 2);
await setRows({ [ROWS[2]]: true });
check('row rule: an unchanged row does not re-fire', (await sentMessages()).length === 2);
await setRows({ [ROWS[1]]: false });
check('row rule: leaving the match is silent', (await sentMessages()).length === 2);
await setRows({ [ROWS[1]]: true });
check('row rule: and re-entering it fires again', (await sentMessages()).length === 3);

// A rule the user did not put a message on must stay a pure paint job.
await setRows({ [ROWS[0]]: false, [ROWS[1]]: false, [ROWS[2]]: false });
await page.evaluate(
    ([rows]) => {
        // conditionNotify(true) is what clears the recorded payloads — messagesReset
        // only empties the store.
        window.__auraShot.conditionNotify(false);
        window.__auraShot.messagesReset();
        window.__auraShot.showWidgets([
            {
                id: 'w-row-plain',
                type: 'list',
                title: 'Melder',
                gridPos: { x: 0, y: 0, w: 6, h: 6 },
                options: {
                    entries: rows.map((id, i) => ({ id, name: `Melder ${i}` })),
                    rowConditions: [
                        {
                            id: 'rc-plain',
                            logic: 'AND',
                            clauses: [{ datapoint: '{dp}', operator: 'true', value: '' }],
                            color: '#ef4444',
                        },
                    ],
                },
            },
        ]);
        window.__auraShot.conditionNotify(true);
    },
    [ROWS],
);
await settle();
await setRows({ [ROWS[1]]: true });
check('a row rule without a message sends nothing', (await sentMessages()).length === 0);
await page.evaluate(() => window.__auraShot.mockServerState(false));

// ── 19. Unanswered messages survive a reload ────────────────────────────────
// A tablet that reloads itself every few hours (or after losing the connection)
// used to drop every open toast. The archive decides now: unanswered, and a
// severity the admin marked as surviving, means the message comes back.
const reload = async (history, severities = ['error']) => {
    await page.evaluate(
        ([list, sev]) => {
            window.__auraShot.messagesReset();
            window.__auraShot.messagesRestoreSeverities(sev);
            // Seed the cache too, so the live datapoint cannot overwrite the
            // archive under test on an instance that holds real messages.
            window.__auraShot.messagesHistory(list);
            window.__auraShot.messagesDeliverHistory(list, true);
        },
        [history, severities],
    );
    await settle();
};

const openError = msg({ id: 'e-open', severity: 'error', title: 'HeizungAus' });

await reload([openError]);
check('an unanswered error is restored after a reload', await visibleText('HeizungAus'));

await page.locator('[data-aura-toasts] button').first().click();
await settle();
check('the close button takes it off screen', (await toasts().count()) === 0);
await page.evaluate((list) => window.__auraShot.messagesDeliverHistory(list, false), [openError]);
await settle();
check('a closed message does not pop back up in the same session', (await toasts().count()) === 0);

await reload([{ ...openError, dismissed: true }]);
check('a message closed on any client stays away after a reload', (await toasts().count()) === 0);

await reload([{ ...openError, read: true }]);
check('a confirmed message stays away after a reload', (await toasts().count()) === 0);

const openInfo = msg({ id: 'i-open', severity: 'info', title: 'InfoOffen' });
await reload([openInfo]);
check('a severity the admin did not select is not restored', (await toasts().count()) === 0);

await reload([openInfo], ['info', 'error']);
check('…and is restored once it is selected', await visibleText('InfoOffen'));

await reload([msg({ id: 'a-open', severity: 'info', requireAck: true, title: 'MussBestaetigt' })]);
check('a message demanding confirmation is always restored', await visibleText('MussBestaetigt'));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
