// Icons from installed ioBroker icon adapters (#716), in the browser.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/adapter-icons-ui.mjs
//
// The dev server plays three installed icon adapters from
// tools/fixtures/adapter-icons (mono SVG, colour SVG, PNG). Checked: a widget
// draws an `iob:` icon — a mono SVG as a mask in the icon colour, `#original`
// and PNG as an image —, a missing file falls back to the type's icon, and the
// picker lists the installed sets under "Quelle", browses their folders, shows
// the hint, and writes the chosen id back.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';

let pass = 0;
const fails = [];
const check = (ok, label, detail = '') => {
    if (ok) pass++;
    else fails.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

const widget = (id, options, y = 0) => ({
    id,
    type: 'value',
    title: id,
    datapoint: 'demo.temp',
    layout: 'default',
    gridPos: { x: 0, y, w: 8, h: 6 },
    options: { showTitle: true, showIcon: true, ...options },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.mockServerState({ 'demo.temp': { val: 21.5, unit: '°C' } }));
const settle = (ms = 600) => page.waitForTimeout(ms);

// ── 1. Rendering in a widget ──────────────────────────────────────────────────
await page.evaluate(
    ([ws]) => window.__auraShot.showWidgets(ws),
    [
        [
            widget('w-mono', { icon: 'iob:icons-test-mono/garage.svg' }, 0),
            widget('w-orig', { icon: 'iob:icons-test-color/sun.svg#original' }, 6),
            widget('w-png', { icon: 'iob:vis-test-png/Lights/lamp_on.png' }, 12),
            widget('w-gone', { icon: 'iob:vis-test-png/Lights/no-such-file.png' }, 18),
        ],
    ],
);
await settle(1200);
const card = (id) => page.locator(`[data-aura-widget="${id}"]`).first();

const mask = card('w-mono').locator('[data-aura-adapter-icon="mask"]').first();
check((await mask.count()) === 1, 'mono svg renders as a mask');
if (await mask.count()) {
    const st = await mask.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
            mask: cs.maskImage || cs.webkitMaskImage,
            bg: cs.backgroundColor,
            color: cs.color,
            w: el.getBoundingClientRect().width,
        };
    });
    check(
        /adapter-icons\/file\/icons-test-mono\/garage\.svg/.test(st.mask),
        'mask points at the adapter file',
        st.mask,
    );
    check(st.bg === st.color, 'mask is painted in the icon colour', `${st.bg} vs ${st.color}`);
    check(st.w > 4, 'mask has a size', String(st.w));
}

const orig = card('w-orig').locator('img[data-aura-adapter-icon="image"]').first();
check((await orig.count()) === 1, '#original svg renders as an image');
if (await orig.count()) {
    const src = await orig.getAttribute('src');
    check(src === '/adapter-icons/file/icons-test-color/sun.svg', '#original is not part of the url', src);
}

const png = card('w-png').locator('img[data-aura-adapter-icon="image"]').first();
check((await png.count()) === 1, 'png renders as an image');
if (await png.count()) {
    const loaded = await png.evaluate((el) => el.complete && el.naturalWidth > 0);
    check(loaded, 'png loaded from the adapter route');
}

const gone = card('w-gone');
check((await gone.locator('[data-aura-adapter-icon]').count()) === 0, 'missing file leaves no broken image');
check((await gone.locator('svg').count()) > 0, 'missing file falls back to the default icon');

// ── 2. Picker ─────────────────────────────────────────────────────────────────
await page.evaluate(() => window.__auraShot.setEditMode(true));
await settle();
await card('w-mono').hover();
await card('w-mono').locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await settle();
const dlg = page.locator('.aura-widget-edit-modal');
// The widget's own icon field shows the current id; open the picker from it.
// Playwright counts the dialog's fields as hidden while it animates in, so the
// button is clicked through the DOM.
const iconField = dlg.getByText('iob:icons-test-mono/garage.svg');
check((await iconField.count()) >= 1, 'edit dialog shows the adapter icon field');
await iconField.last().evaluate((e) => e.closest('button').click());
await settle(1200);
const picker = page.locator('[data-aura-icon-picker]');
check((await picker.count()) === 1, 'picker opens');

const select = picker.locator('select[data-aura-icon-source]');
const values = await select.locator('option').evaluateAll((os) => os.map((o) => o.value));
check(values.includes('adapter:icons-test-mono'), 'installed sets are offered', values.slice(0, 6).join(','));
check(values.includes('adapter:vis-test-png'), 'png set is offered');
check((await select.inputValue()) === 'adapter:icons-test-mono', 'picker opens on the current icon’s set');
check(
    (await picker
        .locator('[data-icon-id="iob:icons-test-mono/garage.svg"]')
        .evaluate((b) => getComputedStyle(b).backgroundColor)) !==
        (await picker
            .locator('[data-icon-id="iob:icons-test-mono/Rooms/bath.svg"]')
            .evaluate((b) => getComputedStyle(b).backgroundColor)),
    'current icon is highlighted',
);

const hint = picker.locator('[data-aura-icon-hint]');
check((await hint.count()) === 1, 'adapter source shows the hint');
check(/icons-test-mono/.test((await hint.textContent()) ?? ''), 'hint names the adapter');

// Folders in the sidebar
await picker.locator('button:has-text("Lights (2)")').click();
await settle();
const lightIds = await picker
    .locator('[data-icon-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-icon-id')));
check(
    JSON.stringify(lightIds) ===
        JSON.stringify(['iob:icons-test-mono/Lights/bulb_off.svg', 'iob:icons-test-mono/Lights/bulb_on.svg']),
    'folder filter',
    JSON.stringify(lightIds),
);

// PNG set: raster hint, no colour switch
await select.selectOption('adapter:vis-test-png');
await settle(800);
check((await picker.locator('[data-aura-icon-original]').count()) === 0, 'png set has no colour switch');
check(/PNG/.test((await hint.textContent()) ?? ''), 'png set explains the fixed colours');

// Colour set defaults to original colours
await select.selectOption('adapter:icons-test-color');
await settle(800);
const origBox = picker.locator('[data-aura-icon-original]');
check((await origBox.count()) === 1 && (await origBox.isChecked()), 'colour set keeps its colours by default');
const colourIds = await picker
    .locator('[data-icon-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-icon-id')));
check(
    colourIds.every((id) => id.endsWith('#original')),
    'colour set ids carry #original',
    colourIds.join(','),
);

// Search across all sources finds adapter files by name
await select.selectOption('all');
await picker.locator('input[placeholder]').first().fill('bulb');
await settle(1500);
const found = await picker
    .locator('[data-icon-id^="iob:"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-icon-id')));
check(
    found.includes('iob:icons-test-mono/Lights/bulb_on.svg'),
    'search across sources finds adapter files',
    found.join(','),
);

// Iconify set: browsable, or an explanation — never a silent empty grid
const iconifyValue = values.find((v) => v === 'iconify:mdi');
if (iconifyValue) {
    await picker.locator('input[placeholder]').first().fill('');
    await select.selectOption(iconifyValue);
    await settle(3000);
    const tiles = await picker.locator('[data-icon-id^="mdi:"]').count();
    const text = (await picker.textContent()) ?? '';
    check(tiles > 0 || /nicht erreichbar/.test(text), 'iconify set shows icons or says why not', `${tiles} tiles`);
} else {
    // No catalogue (offline test machine): the group is left out instead of listing empty sets.
    check(!values.some((v) => v.startsWith('iconify:')), 'no catalogue, no iconify sets');
}

// Offline only: Iconify ids the adapter has not cached disappear, adapter files stay
await select.selectOption('all');
await picker.locator('input[placeholder]').first().fill('');
const offline = picker.locator('[data-aura-icon-offline]');
check((await offline.count()) === 1, 'offline filter offered');
const cached = await page.evaluate(() =>
    fetch('/icons/status?all=1')
        .then((r) => r.json())
        .then((d) => d.ids),
);
check(Array.isArray(cached), 'status route lists cached ids');
await offline.check();
await settle(1000);
const offIds = await picker
    .locator('[data-icon-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-icon-id')));
const cachedSet = new Set(cached || []);
check(
    offIds.every((id) => id.startsWith('iob:') || cachedSet.has(id)),
    'offline filter keeps only cached icons',
    `${offIds.length} shown`,
);
await picker.locator('input[placeholder]').first().fill('bulb');
await settle(1200);
check(
    (await picker.locator('[data-icon-id="iob:icons-test-mono/Lights/bulb_on.svg"]').count()) === 1,
    'adapter files count as offline',
);
await offline.uncheck();
await settle(1200);

// Dragging the title bar moves the dialog
const bar = picker.locator('[data-aura-icon-picker-drag]');
const before = await picker.boundingBox();
const bb = await bar.boundingBox();
await page.mouse.move(bb.x + 40, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + 40 - 150, bb.y + bb.height / 2 + 60, { steps: 6 });
await page.mouse.up();
const after = await picker.boundingBox();
check(
    Math.abs(after.x - before.x + 150) < 3 && Math.abs(after.y - before.y - 60) < 3,
    'title bar drags the dialog',
    JSON.stringify({ before, after }),
);
const stillOpen = (await picker.count()) === 1;
check(stillOpen, 'dragging does not close the picker');

// Pick one → written back as the widget's icon
await picker.locator('[data-icon-id="iob:icons-test-mono/Lights/bulb_on.svg"]').click();
await settle();
const opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-mono'));
check(opts?.icon === 'iob:icons-test-mono/Lights/bulb_on.svg', 'chosen id written to the widget', String(opts?.icon));

check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

await browser.close();
console.log(`\nadapter-icons-ui: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
