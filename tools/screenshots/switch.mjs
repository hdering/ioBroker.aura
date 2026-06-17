// Schalter (switch) widget — documentation screenshots.
// Renders each documented state via the harness and writes element-cropped PNGs
// into docs/widgets/assets/schalter/. Side-effect-free: no ioBroker writes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/schalter';
mkdirSync(OUT, { recursive: true });

const DP = 'demo.switch';
const WID = 'w-shot';
const WIDGET_SEL = `.aura-widget-${WID}`;

// One base widget; each shot overrides layout/options/value/click.
const shots = [
    { file: 'uebersicht', value: true, layout: 'default', w: 12, h: 5, title: 'Stehlampe', options: {} },
    { file: 'layout-default', value: true, layout: 'default', w: 12, h: 5, title: 'Stehlampe', options: {} },
    { file: 'layout-card', value: true, layout: 'card', w: 14, h: 14, title: 'Stehlampe', options: {} },
    { file: 'layout-compact', value: true, layout: 'compact', w: 18, h: 3, title: 'Stehlampe', options: {} },
    {
        file: 'icon-modus',
        value: true,
        layout: 'default',
        w: 12,
        h: 5,
        title: 'Stehlampe',
        options: { controlMode: 'icon', onColor: 'var(--accent-green)', controlIconSize: 34 },
    },
    {
        file: 'sicherheitsabfrage',
        value: false,
        layout: 'default',
        w: 13,
        h: 11,
        title: 'Heizung',
        options: { confirmAction: true, confirmText: 'Heizung wirklich schalten?' },
        clickAction: true, // click the toggle to surface the confirm overlay
    },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

for (const s of shots) {
    await page.evaluate(
        ({ DP, WID, s }) => {
            window.__auraShot.mock({ [DP]: s.value });
            window.__auraShot.showWidgets([
                {
                    id: WID,
                    type: 'switch',
                    title: s.title,
                    datapoint: DP,
                    gridPos: { x: 0, y: 0, w: s.w, h: s.h },
                    layout: s.layout,
                    options: s.options,
                },
            ]);
            window.__auraShot.mock({ [DP]: s.value });
        },
        { DP, WID, s },
    );
    await page.waitForTimeout(700);

    if (s.clickAction) {
        await page.locator(`${WIDGET_SEL} .aura-widget-action`).first().click();
        await page.waitForTimeout(400);
    }

    const el = page.locator(WIDGET_SEL).first();
    await el.screenshot({ path: `${OUT}/${s.file}.png` });
    console.log('✓', `${s.file}.png`);
}

await browser.close();
console.log('done');
