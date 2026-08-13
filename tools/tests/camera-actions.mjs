// Verifies the camera widget's action slots (toggle / button) — the write half of
// the "Zeilen" block that used to be read-only info rows.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/camera-actions.mjs
//   SHOT_DIR=<dir> node tools/tests/camera-actions.mjs   → also writes PNGs
//
// Uses the screenshot harness (__auraShot) so displayed values live in the
// in-memory cache only. A control click really does emit a setState, so the test
// intercepts the websocket: setState frames are recorded and then DROPPED, never
// reaching the instance behind the dev proxy. That keeps it hermetic (no orphan
// demo.cam.* states) and repeatable — the observable contract is the frame itself:
// control clicked → setState with this value.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOT_DIR = process.env.SHOT_DIR ?? '';
const ID = 'w-cam';
const SEL = `.aura-widget-${ID}`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const MOCK = {
    'demo.cam.battery': 78,
    'demo.cam.audio': true,
    'demo.cam.armed': false,
    'demo.cam.light': 0,
};

const ROWS = [
    { type: 'battery', datapoint: 'demo.cam.battery', label: 'Akku' },
    { type: 'toggle', datapoint: 'demo.cam.audio', label: 'Audio', icon: 'lucide:volume-2' },
    { type: 'toggle', datapoint: 'demo.cam.armed', label: 'Scharf', trueLabel: 'AN', falseLabel: 'AUS' },
    { type: 'toggle', datapoint: 'demo.cam.light', label: 'Licht', onValue: '1', offValue: '0' },
    {
        type: 'button',
        datapoint: 'demo.cam.siren',
        label: 'Sirene',
        icon: 'lucide:siren',
        pulseLabel: 'Alarm',
        pulseReset: true,
    },
    { type: 'button', datapoint: 'demo.cam.reboot', label: 'Reboot', confirm: true, pulseLabel: 'Neustart' },
];

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Record outgoing setState frames and drop them before they reach the instance.
await page.addInitScript(() => {
    window.__wsSent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
        let text = '';
        try {
            text = String(data);
        } catch {
            /* binary frame */
        }
        if (text.includes('"setState"')) {
            window.__wsSent.push(text);
            return;
        }
        return orig.apply(this, arguments);
    };
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(400);

async function show(options, layout = 'default', editMode = false) {
    await page.evaluate(
        ([cfg, values, edit]) => {
            window.__auraShot.mock(values);
            window.__auraShot.showWidgets([cfg], { editMode: edit });
            window.__auraShot.mock(values);
        },
        [
            {
                id: ID,
                type: 'camera',
                title: 'Einfahrt',
                datapoint: '',
                layout,
                gridPos: { x: 0, y: 0, w: 12, h: 12 },
                options,
            },
            MOCK,
            editMode,
        ],
    );
    await settle();
}

/** setState frames sent for one datapoint, in order. */
const writesFor = (id) =>
    page.evaluate((dp) => window.__wsSent.filter((f) => f.includes('setState') && f.includes(dp)), id);
const shot = async (file) => {
    if (SHOT_DIR)
        await page
            .locator(SEL)
            .first()
            .screenshot({ path: `${SHOT_DIR}/${file}.png` });
};

// ── 1. Default layout — rows below the stream ────────────────────────────────
await show({ videoRatio: 35, infoItems: ROWS });
await shot('default-rows');

const toggles = page.locator(`${SEL} button.rounded-full`);
check('three toggles render', (await toggles.count()) === 3, `count=${await toggles.count()}`);
check('labelled toggle shows its state text', /\bAN\b|\bAUS\b/.test(await page.locator(SEL).innerText()));

// A switch's knob sits right when on — assert against what is rendered, not
// against the seeded value (a real subscription may deliver something else).
const isOn = async (loc) => ((await loc.locator('span').first().getAttribute('style')) ?? '').includes('100%');

// Plain bool toggle → writes the inverse of the state it shows.
const audioOn = await isOn(toggles.nth(0));
await toggles.nth(0).click();
await settle();
const audio = await writesFor('demo.cam.audio');
check(
    'toggle writes the inverse bool',
    audio.length === 1 && new RegExp(`"val":${!audioOn}`).test(audio[0]),
    audio[0] ?? 'no frame',
);

// Custom on/off values (1/0) → writes the number, never a bool.
const lightOn = await isOn(toggles.nth(2));
await toggles.nth(2).click();
await settle();
const light = await writesFor('demo.cam.light');
check(
    'toggle honours custom on/off values',
    light.length === 1 && new RegExp(`"val":${lightOn ? 0 : 1}[,}]`).test(light[0]),
    light[0] ?? 'no frame',
);

// Momentary button with reset → true now, false after the delay.
await page.getByRole('button', { name: 'Alarm' }).first().click();
await page.waitForTimeout(900);
const siren = await writesFor('demo.cam.siren');
check(
    'button pulses and resets',
    siren.length === 2 && /true/.test(siren[0]) && /false/.test(siren[1]),
    `${siren.length} frames`,
);

// ── 2. Confirmation guard ────────────────────────────────────────────────────
await page.getByRole('button', { name: 'Neustart' }).first().click();
await settle();
check('confirm holds the write back', (await writesFor('demo.cam.reboot')).length === 0);
await shot('default-confirm');
await page.getByRole('button', { name: 'Ja' }).first().click();
await settle();
check('confirming releases the write', (await writesFor('demo.cam.reboot')).length === 1);

// ── 3. Custom grid — action tiles ────────────────────────────────────────────
await show(
    {
        cameraTemplate: 'stream-topleft',
        customSlots: [
            { type: 'battery', datapoint: 'demo.cam.battery', label: 'Akku' },
            { type: 'toggle', datapoint: 'demo.cam.armed', label: 'Scharf', trueLabel: 'AN', falseLabel: 'AUS' },
            { type: 'toggle', datapoint: 'demo.cam.tile', label: 'Audio', icon: 'lucide:volume-2' },
            { type: 'button', datapoint: 'demo.cam.tilebtn', label: 'Sirene', pulseLabel: 'Alarm' },
            { type: 'text', value: 'Eufy', label: 'Modell' },
        ],
    },
    'custom',
);
await shot('custom-tiles');
check('grid tile renders its control', (await page.locator(`${SEL} button.rounded-full`).count()) === 2);
await page.locator(`${SEL} button.rounded-full`).nth(1).click();
await settle();
check('grid tile toggle writes', (await writesFor('demo.cam.tile')).length === 1);

// ── 4. stream-full overlay chips stay clickable ──────────────────────────────
await show(
    {
        cameraTemplate: 'stream-full',
        customSlots: [
            { type: 'battery', datapoint: 'demo.cam.battery', label: 'Akku' },
            { type: 'toggle', datapoint: 'demo.cam.overlay', label: 'Audio', icon: 'lucide:volume-2' },
            { type: 'button', datapoint: 'demo.cam.overlaybtn', pulseLabel: 'Alarm' },
        ],
    },
    'custom',
);
await shot('overlay-chips');
await page.locator(`${SEL} button.rounded-full`).first().click();
await settle();
check('overlay chip takes the click', (await writesFor('demo.cam.overlay')).length === 1);

// ── 5. The editor never writes ───────────────────────────────────────────────
// editMode only reaches the widgets on the editor route, so switch pages for this.
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await show(
    { videoRatio: 35, infoItems: [{ type: 'toggle', datapoint: 'demo.cam.editmode', label: 'Audio' }] },
    'default',
    true,
);
await page.waitForTimeout(600);
const editToggle = page.locator(`${SEL} button.rounded-full`).first();
check('editor renders the control', (await editToggle.count()) === 1, `count=${await editToggle.count()}`);
await shot('edit-mode');
await editToggle.click({ force: true });
await settle();
check('edit mode stays inert', (await writesFor('demo.cam.editmode')).length === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
