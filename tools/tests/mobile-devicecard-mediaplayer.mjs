// A media player in a device card must show in full on the phone (#901).
// On the desktop the player draws cover and controls side by side; the phone stacks
// them (cover on top), so the player needs far more height than its desktop rows. The
// card's mobile stack must size it to its content instead of its stored gridPos.h,
// otherwise only part of the cover shows and the card scrolls inside.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5197
//   AURA_BASE=http://127.0.0.1:5197 node tools/tests/mobile-devicecard-mediaplayer.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
// Below the default mobile breakpoint (600), so the stack renders.
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

const DEF = 'def-player-card';
const vals = { 'test.player.a.state': true, 'test.player.a.title': 'Song', 'test.player.a.volume': 40 };
const children = [
    {
        id: 'child-player',
        type: 'mediaplayer',
        title: 'Player',
        datapoint: '{{dp}}',
        // Desktop: a wide, low player (cover beside the controls).
        gridPos: { x: 0, y: 0, w: 15, h: 4 },
        options: { titleDp: 'test.player.a.title', volumeDp: 'test.player.a.volume' },
    },
];

await page.evaluate(
    ([v, def, kids]) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
        window.__auraShot.groupDefs({ [def]: kids });
        window.__auraShot.showWidgets([
            {
                id: 'w-card',
                type: 'devicecard',
                title: 'Wohnzimmer',
                datapoint: 'test.player.a.state',
                gridPos: { x: 0, y: 0, w: 15, h: 5 },
                options: { defId: def },
            },
        ]);
    },
    [vals, DEF, children],
);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'node_modules/.cache/mobile-devicecard-mediaplayer.png' });

const geo = await page.evaluate(() => {
    const card = document.querySelector('[data-aura-widget="w-card"]');
    const player = card?.querySelector('.aura-widget-child-player');
    const pb = player?.getBoundingClientRect();
    const cb = card?.getBoundingClientRect();
    const cover = player?.querySelector('.aura-widget-icon')?.getBoundingClientRect();
    return {
        found: !!card && !!player,
        overflow: Math.max(
            0,
            ...[...(card?.querySelectorAll('.aura-scroll') ?? [])].map((e) => e.scrollHeight - e.clientHeight),
        ),
        playerInside: !!pb && !!cb && pb.bottom <= cb.bottom + 1,
        coverInside: !!cover && !!pb && cover.top >= pb.top - 1 && cover.bottom <= pb.bottom + 1,
    };
});

check('device card and its media player rendered', geo.found);
check('device card does not scroll inside', geo.overflow <= 1, `overflow ${geo.overflow}px`);
check('media player lies inside the card', geo.playerInside);
check('cover lies inside the media player', geo.coverInside);
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
