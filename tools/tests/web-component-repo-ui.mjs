// Web components of adapters that are not installed, from the repository: the
// "Neues Widget" dialog lists the short forms of `common.webComponents` that Aura's
// backend reads from the active repositories (`webComponentsRepo`, mocked here) -
// with name, picture and the mark "Adapter fehlt". A known component gets the
// picture of the repository. Placed, the widget names the adapter to install.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-repo-ui.mjs
//
// Nothing is saved: the widget lands in the unsaved layout of this throwaway browser context.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const PLAYER_ICON = 'https://raw.example.test/ioBroker.sonos/master/admin/dm-widgets/player.png';
const FLOW_ICON = 'https://raw.example.test/ioBroker.flow/main/admin/flow.svg';
const REPO = {
    ok: true,
    repos: ['stable'],
    components: [
        {
            adapter: 'sonos',
            version: '4.7.0',
            tag: 'iob-sonos-player',
            name: { en: 'SONOS player', de: 'SONOS-Player' },
            iconUrl: PLAYER_ICON,
            size: { width: 400, height: 240 },
        },
        {
            adapter: 'flow',
            version: '0.3.0',
            tag: 'iob-flow-diagram',
            name: { en: 'Flow diagram', de: 'Fluss-Diagramm' },
            iconUrl: FLOW_ICON,
        },
    ],
};
// a 1x1 PNG for the pictures "on GitHub"
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const iconReads = [];
await page.route('https://raw.example.test/**', (route) => {
    iconReads.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: PNG });
});

// the admin sits behind a PIN - same bypass the documentation screenshots use
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 40000 });
await page.evaluate((repo) => {
    const shot = window.__auraShot;
    // no adapter brings a component: only the known ones and those of the repository
    shot.mockObjectView({ instance: [] });
    shot.mockSendTo({ webComponentsRepo: repo });
}, REPO);

await page.evaluate(() => {
    window.location.hash = '#/admin/editor';
});
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Neues Widget' }).click();
await page.locator('text=Widget manuell hinzufügen').first().waitFor({ state: 'visible', timeout: 15000 });
await page.getByRole('button', { name: 'Web-Komponenten', exact: true }).first().click();

const entry = (label) => page.locator('button', { hasText: label }).first();
await entry('SONOS-Player').waitFor({ timeout: 10000 });
const calls = await page.evaluate(() => window.__auraShot.sendToCalls().filter((c) => c.command === 'webComponentsRepo'));
eq('the backend is asked once, at its own instance', [calls.length, calls[0]?.target], [1, 'aura.0']);

const player = entry('SONOS-Player');
const playerText = await player.innerText();
check('repository: named in the frontend language', playerText.includes('SONOS-Player'), playerText);
check(
    'repository: adapter, "Adapter fehlt" and "nicht getestet"',
    /sonos · Adapter fehlt · nicht getestet/.test(playerText),
    playerText,
);
eq('repository: the picture of the repository', await player.locator('img').getAttribute('src'), PLAYER_ICON);
check('repository: shown dimmed like a known missing one', (await player.getAttribute('data-missing')) === 'true');

const flow = entry('Fluss-Diagramm');
const flowText = await flow.innerText();
check('known: stays tested (no "nicht getestet")', !flowText.includes('nicht getestet'), flowText);
eq('known: gets the picture of the repository', await flow.locator('img').getAttribute('src'), FLOW_ICON);
check('the pictures are loaded from the web', iconReads.length >= 1, iconReads.join(' '));

// placed: the widget says which adapter to install
await player.dblclick();
await page.locator('text=Widget manuell hinzufügen').first().waitFor({ state: 'hidden', timeout: 10000 });
const missingText = page.locator('text=SONOS-Player: Adapter „sonos“ fehlt (ab Version 4.7.0)');
await missingText
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {});
check('placed: the widget names the adapter and its version', (await missingText.count()) > 0);

eq('no page errors', errors, []);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
