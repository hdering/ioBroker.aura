// Verifies the message toast layer (issue #429) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/messages.mjs
//
// Uses the screenshot harness (__auraShot), so messages are pushed straight into
// the store and no datapoint is ever written. Checked: rendering per severity,
// the nine screen positions, the countdown auto-close, requireAck defeating both
// auto-close and the close button, the per-position stack limit with priority
// pre-emption, replace-by-id, and the target filter.
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
    const okX =
        position.endsWith('left') ? box.x < 40 : position.endsWith('right') ? box.x + box.width > vp.width - 40 : true;
    const okY = position.startsWith('top')
        ? box.y < 40
        : position.startsWith('bottom')
          ? box.y + box.height > vp.height - 40
          : true;
    check(`${position} is anchored to its corner`, okX && okY);
}

// ── 5. Auto-close after durationSec, with a countdown bar ────────────────────
await show([msg({ durationSec: 1, title: 'Kurz' })]);
check('a toast with a duration shows the countdown bar', (await page.locator('[data-aura-toasts] div div').count()) > 0);
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
check('two actions plus the confirmation render three buttons', (await page.locator('[data-aura-toasts] button').count()) === 3);
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
check('a closed message is not re-shown at the same timestamp', (await page.locator('[data-aura-toasts]').count()) === 0);

// ── 16. …but a fresh send on that id shows again ────────────────────────────
// The reusable-id workflow: the same notice fires later and must be seen again.
await page.evaluate((m) => window.__auraShot.messageIngest([m]), { ...once, ts: Date.now() + 50000, title: 'WiederDa' });
await settle();
check('the same id with a newer timestamp is shown again', await visibleText('WiederDa'));

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
check('the widget lists every archived message', ['Heizung', 'Waschmaschine', 'Backup', 'Sonnenuntergang'].every((s) => body.includes(s)));
check('day grouping inserts a date separator', /\d{2}\.\d{2}\./.test(body));
check('relative timestamps are shown', body.includes('vor '));

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
check(`the count layout shows unread over total (got "${countText}")`, /\b2\b/.test(countText) && /\b4\b/.test(countText));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
