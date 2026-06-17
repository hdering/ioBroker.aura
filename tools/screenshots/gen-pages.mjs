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

// 1. Per-widget pages.
let written = 0;
for (const w of WIDGETS) {
    writeFileSync(`${DOCS}/${w.slug}.md`, page(w));
    written++;
}
console.log(`wrote ${written} widget pages`);

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
writeFileSync(`${DOCS}/index.md`, indexLines.join('\n'));
console.log('wrote index.md');

// 3. Sidebar data for config.mts.
const sidebar = GROUPS.map((grp) => ({
    text: grp.label,
    collapsed: grp.id !== 'control',
    items: byGroup(grp.id).map((it) => ({ text: it.label, link: `/widgets/${it.slug}` })),
})).filter((g) => g.items.length);
sidebar.unshift({ text: 'Übersicht', link: '/widgets/' });
sidebar.push({ text: 'Konzepte', items: [{ text: 'Custom-Layout', link: '/widgets/custom-layout' }] });
writeFileSync('docs/.vitepress/widgetsSidebar.json', JSON.stringify(sidebar, null, 2) + '\n');
console.log('wrote widgetsSidebar.json');
