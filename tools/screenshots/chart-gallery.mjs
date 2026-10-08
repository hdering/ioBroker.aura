// Chart gallery — worked examples with screenshot and widget export for "Diagramm (erweitert)"
// and "Diagramm (Verteilung)". The examples live in chart-gallery/examples.mjs.
//
//   npm run dev                                  (or set AURA_BASE)
//   node tools/screenshots/chart-gallery.mjs     pictures + JSON + pages
//   node tools/screenshots/chart-gallery.mjs --md-only        JSON + pages, no browser
//   node tools/screenshots/chart-gallery.mjs --only <id>[,<id>]
//
// Output: docs/widgets/assets/beispiele/<id>.png|.json and docs/widgets/beispiele-*.md.
// The pages are GENERATED — edit examples.mjs, not the markdown.
//
// Data is fabricated (chart-gallery/data.mjs) and served through the screenshot harness
// (`?shot=1`, `__auraShot.mockHistory`); screenshot mode blocks every write, nothing
// reaches a real instance.
import { mkdirSync, writeFileSync } from 'node:fs';
import { EXAMPLES, PAGES } from './chart-gallery/examples.mjs';
import { NOW } from './chart-gallery/data.mjs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DOCS = 'docs/widgets';
const OUT = `${DOCS}/assets/beispiele`;
const REPO = 'https://github.com/hdering/ioBroker.aura';
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const mdOnly = args.includes('--md-only');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;
const selected = EXAMPLES.filter((e) => !only || only.has(e.id));

// ── export JSON — what the editor's "Exportieren" writes ─────────────────────
for (const e of EXAMPLES) writeFileSync(`${OUT}/${e.id}.json`, JSON.stringify(e.widget, null, 2) + '\n');

// ── pages ─────────────────────────────────────────────────────────────────────
const issueLinks = (nums) => nums.map((n) => `[#${n}](${REPO}/issues/${n})`).join(' · ');
const cell = (s) => String(s).replace(/\|/g, '\\|');

function examplePage(page) {
    const lines = [
        `# ${page.title}`,
        '',
        '<!-- Generiert von tools/screenshots/chart-gallery.mjs aus chart-gallery/examples.mjs — nicht von Hand bearbeiten. -->',
        '',
        `Fertige Konfigurationen für [${page.widgetLabel}](${page.widgetPage}), entstanden aus Fragen und Wünschen im Issue-Tracker. Jedes Beispiel zeigt das Ergebnis, die entscheidenden Optionen und den kompletten Widget-Export.`,
        '',
        '**Übernehmen:**',
        '',
        '1. JSON aufklappen und kopieren (oder die Datei herunterladen).',
        '2. Editor → **Importieren** → JSON einfügen → Tab wählen → **Hinzufügen**.',
        '3. Die `demo.0.*`-Datenpunkte durch die eigenen ersetzen — der Import-Dialog fragt nur den Haupt-Datenpunkt ab, die weiteren stehen im Widget unter „Bearbeiten“.',
        '',
    ];
    for (const section of page.sections) {
        const list = EXAMPLES.filter((e) => e.section === section);
        if (page.sections.length > 1) {
            lines.push(`## ${section}`, '');
            for (const e of list) lines.push(`- [${e.title}](#${e.id})`);
            lines.push('');
        }
        for (const e of list) {
            const h = page.sections.length > 1 ? '###' : '##';
            lines.push(`${h} ${e.title} {#${e.id}}`, '');
            lines.push(`Aus ${issueLinks(e.issues)}. ${e.intro}`, '');
            lines.push(`![${e.title}](./assets/beispiele/${e.id}.png)`, '');
            lines.push('| Option | Wert | |', '| --- | --- | --- |');
            for (const [k, v, note] of e.keys) lines.push(`| \`${cell(k)}\` | ${cell(v)} | ${cell(note)} |`);
            lines.push('');
            if (e.sample) {
                const sample = JSON.parse(e.sample());
                const short = Array.isArray(sample)
                    ? [...sample.slice(0, 3)]
                    : { ...sample, data: sample.data?.slice(0, 3) };
                lines.push(
                    '::: details Inhalt des JSON-Datenpunkts (Auszug)',
                    '```json',
                    JSON.stringify(short, null, 2),
                    '```',
                    ':::',
                    '',
                );
            }
            lines.push(
                '::: details Widget-Export (JSON)',
                '```json',
                JSON.stringify(e.widget, null, 2),
                '```',
                ':::',
                '',
                `[JSON herunterladen](./assets/beispiele/${e.id}.json)`,
                '',
            );
        }
    }
    return lines.join('\n');
}

for (const page of PAGES) {
    writeFileSync(`${DOCS}/${page.file}.md`, examplePage(page));
    console.log('wrote', `${DOCS}/${page.file}.md`);
}
if (mdOnly) process.exit(0);

// ── screenshots ──────────────────────────────────────────────────────────────
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
await ctx.clock.setFixedTime(NOW);
const page = await ctx.newPage();
page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

for (const e of selected) {
    const { history, values } = e.data();
    // Every datapoint reads as logged by history.0, so `autoHistoryInstance` and the
    // entries' automatic instance find an adapter, as they would on a real system.
    const ids = new Set([...Object.keys(history), ...Object.keys(values)]);
    const objects = Object.fromEntries(
        [...ids].map((id) => [
            id,
            {
                _id: id,
                type: 'state',
                common: { name: id.split('.').pop(), custom: { 'history.0': { enabled: true } } },
            },
        ]),
    );
    // Own id per shot so React remounts; animation off so the frozen clock does not catch
    // bars mid-transition. Neither ends up in the export.
    // The distribution widget resolves its instance through getObject, which the harness
    // does not stub — name it here. The export keeps it empty (= detected on the user's system).
    const options = { ...e.widget.options };
    if (e.widget.type === 'echart') options.echartAnimation = false;
    if (e.widget.type === 'energiebilanz') {
        options.bars = options.bars.map((b) => ({
            ...b,
            entries: b.entries.map((en) => ({ historyInstance: 'history.0', ...en })),
        }));
    }
    const shown = { ...e.widget, id: `w-${e.id}`, options };
    await page.evaluate(
        ({ w, h, v, o }) => {
            window.__auraShot.setTheme('light');
            window.__auraShot.mockHistory(h);
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.mockObject(o);
            window.__auraShot.showWidgets([w]);
        },
        { w: shown, h: history, v: values, o: objects },
    );
    await page.waitForTimeout(e.wait ?? 2500);
    const el = page.locator(`.aura-widget-${shown.id}`).first();
    await el.screenshot({ path: `${OUT}/${e.id}.png` });
    const text = (await el.innerText()).replace(/\s+/g, ' ').slice(0, 140);
    const plotted = e.widget.type === 'echart' ? await page.evaluate(() => window.__auraShot.chartSeries()) : null;
    const pts = plotted ? ' | ' + plotted.map((s) => `${s.name}:${s.points}`).join(' ') : '';
    console.log('✓', e.id, '—', text + pts);
}

await browser.close();
