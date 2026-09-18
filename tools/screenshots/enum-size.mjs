// Auswahlfeld (enum) widget — the three dropdown sizes side by side (#679).
// Writes docs/widgets/assets/auswahlfeld/groessen.png.
// Side-effect-free: nothing is picked, so nothing is written.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/auswahlfeld';
mkdirSync(OUT, { recursive: true });

const DP = 'demo.enum';
const SIZES = [
    { size: 'sm', title: 'Klein (sm)' },
    { size: 'md', title: 'Mittel (md)' },
    { size: 'lg', title: 'Groß (lg)' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

await page.evaluate(
    ({ DP, SIZES }) => {
        window.__auraShot.mock({ [DP]: 1 });
        window.__auraShot.mockServerState({ [DP]: 1 });
        window.__auraShot.showWidgets(
            SIZES.map((s, i) => ({
                id: `sz-${s.size}`,
                type: 'enum',
                title: s.title,
                datapoint: DP,
                layout: 'compact',
                gridPos: { x: 0, y: i * 4, w: 18, h: 4 },
                options: {
                    showValue: false,
                    selectSize: s.size,
                    entries: [
                        { value: '0', label: 'Aus' },
                        { value: '1', label: 'SV Wohnzimmer' },
                        { value: '2', label: 'SV Küche' },
                    ],
                },
            })),
        );
        window.__auraShot.mock({ [DP]: 1 });
    },
    { DP, SIZES },
);
await page.waitForTimeout(900);

// Crop the union of the three cards rather than one widget — the point of the
// picture is the comparison.
const box = await page.evaluate(
    (ids) => {
        const rects = ids
            .map((id) => document.querySelector(`.aura-widget-${id}`))
            .filter(Boolean)
            .map((el) => el.getBoundingClientRect());
        if (!rects.length) return null;
        const x = Math.min(...rects.map((r) => r.left));
        const y = Math.min(...rects.map((r) => r.top));
        return {
            x,
            y,
            width: Math.max(...rects.map((r) => r.right)) - x,
            height: Math.max(...rects.map((r) => r.bottom)) - y,
        };
    },
    SIZES.map((s) => `sz-${s.size}`),
);
if (!box) throw new Error('widgets not found');

const pad = 6;
await page.screenshot({
    path: `${OUT}/groessen.png`,
    clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
    },
});
console.log('✓ groessen.png', box);

await browser.close();
console.log('done');
