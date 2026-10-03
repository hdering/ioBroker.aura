// Gerätekarte (#743): a group whose children are shared by every copy of the card
// and resolve {{dp}}/{{parent}} against the card's own datapoint.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/devicecard.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DEF = 'def-card-743';
const CARDS = ['a', 'b', 'c'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

// Device a hides its second child via a condition, b and c show it.
const mock = {};
CARDS.forEach((c, i) => {
    mock[`test.dev.${c}.1.STATE`] = { val: true };
    mock[`test.dev.${c}.1.TEMP`] = { val: 21 + i, unit: '°C' };
    mock[`test.dev.${c}.1.HIDE`] = { val: c === 'a' };
});
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

const card = (c, i) => ({
    id: `w-card-${c}`,
    type: 'devicecard',
    title: 'Gerät {{parent}}',
    datapoint: `test.dev.${c}.1.STATE`,
    gridPos: { x: i * 10, y: 0, w: 10, h: 10 },
    options: { defId: DEF },
});
const children = [
    {
        id: 'child-temp',
        type: 'value',
        title: 'Temp',
        datapoint: '{{parent}}.TEMP',
        gridPos: { x: 0, y: 0, w: 10, h: 3 },
        options: { decimals: 0 },
    },
    {
        id: 'child-hide',
        type: 'value',
        title: 'Versteckt',
        datapoint: '{{parent}}.TEMP',
        gridPos: { x: 0, y: 3, w: 10, h: 3 },
        options: {
            decimals: 0,
            conditions: [
                {
                    id: 'c-hide',
                    logic: 'AND',
                    clauses: [{ datapoint: '{{parent}}.HIDE', operator: 'true', value: '' }],
                    style: {},
                    hideWidget: true,
                    reflow: true,
                },
            ],
        },
    },
    {
        id: 'child-below',
        type: 'value',
        title: 'Unten',
        datapoint: '{{dp}}',
        gridPos: { x: 0, y: 6, w: 10, h: 3 },
        options: {},
    },
];

async function show(editMode) {
    await page.evaluate(
        ([cards, kids, def, edit]) => {
            window.__auraShot.groupDefs({ [def]: kids });
            window.__auraShot.showWidgets(cards, { editMode: edit });
        },
        [CARDS.map(card), children, DEF, editMode],
    );
    await page.waitForTimeout(1200);
}

const inCard = (c, childId) =>
    page.evaluate(
        ([cid, chid]) => {
            const host = document.querySelector(`[data-aura-widget="w-card-${cid}"]`);
            if (!host) return null;
            const hr = host.getBoundingClientRect();
            const el = host.querySelector(`.aura-widget-${chid}`);
            if (!el) return { found: false, text: host.innerText };
            const r = el.getBoundingClientRect();
            return {
                found: true,
                text: el.innerText,
                inside: r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1 && r.width > 0,
                top: Math.round(r.top - hr.top),
                cardText: host.innerText,
            };
        },
        [c, childId],
    );

// ── frontend ─────────────────────────────────────────────────────────────────
await show(false);
for (const [i, c] of CARDS.entries()) {
    const t = await inCard(c, 'child-temp');
    check(`card ${c}: {{parent}} resolves to its own device`, !!t?.text?.includes(String(21 + i)), t?.text);
    const others = [21, 22, 23].filter((v) => v !== 21 + i).some((v) => t?.text?.includes(String(v)));
    check(`card ${c}: no other device's value`, !others, t?.text);
    check(`card ${c}: title resolves {{parent}}`, !!t?.cardText?.includes(`Gerät test.dev.${c}.1`), t?.cardText);
}
const hideA = await inCard('a', 'child-hide');
const hideB = await inCard('b', 'child-hide');
check('card a: condition hides the child', !hideA?.inside, JSON.stringify(hideA));
check('card b: the same child stays visible (runtime ids apart)', !!hideB?.inside, JSON.stringify(hideB));
const belowA = await inCard('a', 'child-below');
const belowB = await inCard('b', 'child-below');
check('card a: the child below moves up (reflow)', belowA?.top < belowB?.top, `${belowA?.top} vs ${belowB?.top}`);
check('{{dp}} is the card datapoint itself', !!belowB?.text, belowB?.text);
await page.screenshot({ path: 'node_modules/.cache/devicecard-frontend.png' });

// ── editor: the panel keeps the placeholder, an edit reaches every card ──────
await show(true);
const childA = page.locator('[data-aura-widget="w-card-a"] .aura-widget-child-temp');
await childA.hover();
await childA.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
const dlg = page.locator('.aura-widget-edit-modal');
const values = await dlg.locator('input').evaluateAll((els) => els.map((e) => e.value));
check('editor: the child panel shows the placeholder', values.includes('{{parent}}.TEMP'), values.join(' | '));
check('editor: no resolved datapoint in the panel', !values.some((v) => v.startsWith('test.dev.')), values.join(' | '));
const idx = values.indexOf('Temp');
check('editor: title field found', idx >= 0);
if (idx >= 0) {
    await dlg.locator('input').nth(idx).fill('Temperatur');
    await page.waitForTimeout(500);
}
const stored = await page.evaluate((d) => window.__auraShot.groupDefChildren(d), DEF);
const st = stored?.find((w) => w.id === 'child-temp');
check('editor: the edit is stored in the shared def', st?.title === 'Temperatur', st?.title);
check('editor: the stored datapoint keeps its placeholder', st?.datapoint === '{{parent}}.TEMP', st?.datapoint);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const tB = await inCard('b', 'child-temp');
check('editor: the edit shows in the other cards', !!tB?.text?.includes('Temperatur'), tB?.text);
const badge = await page.locator('[data-aura-widget="w-card-b"] [data-aura-devicecard-badge]').innerText();
check('editor: badge names the other cards sharing the layout', badge.includes('mit 2 weiteren'), badge);

// ── detach ───────────────────────────────────────────────────────────────────
// The card's own edit chrome — not one of its children's, which sit inside the same frame.
await page.locator('[data-aura-widget="w-card-b"]').hover({ position: { x: 20, y: 10 } });
const cardChrome = await page.evaluateHandle(() => {
    const frame = document.querySelector('.aura-widget-w-card-b');
    const chrome = [...frame.querySelectorAll('.aura-edit-chrome')].find((c) => c.closest('.aura-widget') === frame);
    return chrome?.querySelector('button[title="Widget-Optionen"]');
});
await cardChrome.asElement().click({ force: true });
await page.locator('button:text-is("Bearbeiten")').first().click();
await page.waitForTimeout(600);
const share = await page.locator('[data-aura-devicecard-share]').innerText();
check('config: shows how many other cards share the layout', share.includes('2'), share);
const tokens = await page.locator('[data-aura-devicecard-tokens]').innerText();
check('config: token preview resolves {{parent}}', tokens.includes('test.dev.b.1'), tokens.replace(/\s+/g, ' '));
await page.locator('[data-aura-devicecard-detach]').click();
await page.locator('[data-aura-devicecard-detach-ok]').click();
await page.waitForTimeout(500);
const optsB = await page.evaluate(() => window.__auraShot.widgetOptions('w-card-b'));
const optsA = await page.evaluate(() => window.__auraShot.widgetOptions('w-card-a'));
check('detach: card b gets a def of its own', !!optsB?.defId && optsB.defId !== DEF, String(optsB?.defId));
check('detach: card a keeps the shared def', optsA?.defId === DEF, String(optsA?.defId));
const ownKids = await page.evaluate((d) => window.__auraShot.groupDefChildren(d), optsB?.defId);
check(
    'detach: the copy carries the children with their placeholders',
    ownKids?.length === 3 && ownKids.every((w) => w.datapoint.includes('{{')),
    JSON.stringify(ownKids?.map((w) => w.datapoint)),
);
check(
    'detach: the copied children have fresh ids',
    ownKids?.every((w) => !children.some((c) => c.id === w.id)),
    JSON.stringify(ownKids?.map((w) => w.id)),
);
await page.screenshot({ path: 'node_modules/.cache/devicecard-editor.png' });

// ── copy: same layout, i.e. the same def ───────────────────────────────────
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-aura-widget]')].map((e) => e.getAttribute('data-aura-widget')),
);
await page.locator('[data-aura-widget="w-card-a"]').hover({ position: { x: 20, y: 10 } });
const chromeA = await page.evaluateHandle(() => {
    const frame = document.querySelector('.aura-widget-w-card-a');
    const chrome = [...frame.querySelectorAll('.aura-edit-chrome')].find((c) => c.closest('.aura-widget') === frame);
    return chrome?.querySelector('button[title="Widget-Optionen"]');
});
await chromeA.asElement().click({ force: true });
await page.locator('button:text-is("Kopieren")').first().click();
await page.waitForTimeout(800);
const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-aura-widget]')].map((e) => e.getAttribute('data-aura-widget')),
);
const copyId = after.find((id) => !before.includes(id));
const copyOpts = copyId ? await page.evaluate((id) => window.__auraShot.widgetOptions(id), copyId) : null;
check('copy: a new card appears', !!copyId, after.join(', '));
check('copy: it shares the layout (same defId)', copyOpts?.defId === DEF, String(copyOpts?.defId));

// ── linked sets are told apart by colour (editor only) ─────────────────────
await page.mouse.move(1390, 990);
await page.waitForTimeout(300);
const linkColor = (id) =>
    page.evaluate(
        (wid) =>
            document
                .querySelector(`[data-aura-widget="${wid}"] [data-aura-devicecard-link]`)
                ?.getAttribute('data-aura-devicecard-link') ?? null,
        id,
    );
const colA = await linkColor('w-card-a');
const colCopy = copyId ? await linkColor(copyId) : null;
const colC = await linkColor('w-card-c');
const colB = await linkColor('w-card-b');
check(
    'colour: cards of one layout share a frame colour',
    !!colA && colA === colCopy && colA === colC,
    `${colA} / ${colCopy} / ${colC}`,
);
check('colour: a detached card on its own has no link frame', colB === null, String(colB));
await page.screenshot({ path: 'node_modules/.cache/devicecard-linked.png' });
await page.evaluate(() => window.__auraShot.setEditMode(false));
await page.waitForTimeout(400);
check('colour: no link frame in the live dashboard', (await page.locator('[data-aura-devicecard-link]').count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
