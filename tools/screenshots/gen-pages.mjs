// Generate one documentation page per widget from widgets-meta.mjs, the widgets
// overview index, and the VitePress sidebar data. Runtime image is included
// only when it was captured.
import { writeFileSync, existsSync } from 'node:fs';
import { WIDGETS, GROUPS } from './widgets-meta.mjs';

const DOCS = 'docs/widgets';

// Hand-written pages that already exist — included in nav/index, never overwritten.
const EXISTING = {
    control: [{ slug: 'schalter', label: 'Schalter', hint: 'Ein/Aus-Schalter für Boolean-Datenpunkte (z. B. Lampe, Steckdose).' }],
    special: [{ slug: 'zeitschaltuhr', label: 'Zeitschaltuhr', hint: 'Zeitgesteuerte Ereignisse — Wochentag/Astro/Einmalig/Zeitraum.' }],
    layout: [],
};

function page(w) {
    const runtime = existsSync(`${DOCS}/assets/${w.slug}/runtime.png`);
    const lines = [`# ${w.label}`, '', w.hint, ''];
    if (runtime) lines.push(`![](./assets/${w.slug}/runtime.png)`, '');
    lines.push('## Einstellungen', '', 'Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.', '', `![](./assets/${w.slug}/config.png)`, '');
    return lines.join('\n');
}

// 1. Per-widget pages — BOOTSTRAP ONLY: an existing page is never touched. Every
// page has been extended by hand since it was generated (option tables, examples,
// screenshots), and regenerating would replace all of that with the stub below.
// Pass --force to overwrite anyway.
const force = process.argv.includes('--force');
let written = 0;
let kept = 0;
for (const w of WIDGETS) {
    const file = `${DOCS}/${w.slug}.md`;
    if (!force && existsSync(file)) {
        kept++;
        continue;
    }
    writeFileSync(file, page(w));
    written++;
}
console.log(`wrote ${written} widget pages, kept ${kept} existing`);

// 2. Overview index, grouped.
const byGroup = (g) => {
    const fromMeta = WIDGETS.filter((w) => w.group === g).map((w) => ({ slug: w.slug, label: w.label, hint: w.hint }));
    return [...(EXISTING[g] ?? []), ...fromMeta].sort((a, b) => a.label.localeCompare(b.label, 'de'));
};
const indexLines = ['# Widgets', '', 'Übersicht aller verfügbaren Widgets. Jede Seite zeigt das Widget und seinen Einstellungs-Dialog.', ''];
for (const grp of GROUPS) {
    const items = byGroup(grp.id);
    if (!items.length) continue;
    indexLines.push(`## ${grp.label}`, '', '| Widget | Beschreibung |', '| --- | --- |');
    for (const it of items) indexLines.push(`| [${it.label}](./${it.slug}) | ${it.hint} |`);
    indexLines.push('');
}
indexLines.push('## Konzepte', '', '- [Custom-Layout](./custom-layout) — Widgets mit freier Zellen-Matrix gestalten', '');
// Hand-written tail of the overview — kept here so regenerating the index does not drop it.
indexLines.push(
    '## Datenpunkt-Wert im Widget-Namen',
    '',
    'Der Name jedes Widgets löst `[[<dp>]]` zum aktuellen Wert dieses Datenpunkts auf, gemischt mit festem Text:',
    '',
    '| Name | zeigt |',
    '| --- | --- |',
    '| `Wohnzimmer [[0_userdata.0.Temp]] °C` | `Wohnzimmer 21.5 °C` |',
    '| `[[0_userdata.0.Status]]` | den Inhalt des Datenpunkts |',
    '',
    'Mehrere Tokens pro Name sind erlaubt, JSON-Pfade (`[[dp?battery.soc]]`) ebenfalls; Booleans erscheinen als `AN` / `AUS`. In einer [Popup-View](../einstellungen/popups#platzhalter) kombinierbar mit `{{parent}}`.',
    '',
);
writeFileSync(`${DOCS}/index.md`, indexLines.join('\n'));
console.log('wrote index.md');

// 3. Sidebar data for config.mts.
const sidebar = GROUPS.map((grp) => ({
    text: grp.label,
    collapsed: grp.id !== 'control',
    items: byGroup(grp.id).map((it) => ({ text: it.label, link: `/widgets/${it.slug}` })),
})).filter((g) => g.items.length);
sidebar.unshift({ text: 'Bildpfade', link: '/widgets/bildpfade' });
sidebar.unshift({ text: 'Referenz (Primer)', link: '/widgets/referenz' });
sidebar.unshift({ text: 'Übersicht', link: '/widgets/' });
sidebar.push({ text: 'Konzepte', items: [{ text: 'Custom-Layout', link: '/widgets/custom-layout' }] });
writeFileSync('docs/.vitepress/widgetsSidebar.json', JSON.stringify(sidebar, null, 2) + '\n');
console.log('wrote widgetsSidebar.json');
