import { cpSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';
import widgetsSidebar from './widgetsSidebar.json';

export default defineConfig({
  lang: 'de-DE',
  title: 'ioBroker.aura',
  description: 'Widget- und Einstellungsdokumentation',

  // GitHub Pages servt unter https://hdering.github.io/ioBroker.aura/
  // Bei eigener Domain (CNAME) auf '/' setzen.
  base: '/ioBroker.aura/',

  cleanUrls: true,

  // Download links in the pages ("[JSON herunterladen](./assets/…json)") are left as
  // plain hrefs, the bundler copies only what it imports (images). Copy every
  // .json/.svg of the assets folders to the same path in dist.
  buildEnd(site) {
    for (const rel of readdirSync(site.srcDir, { recursive: true }) as string[]) {
      const parts = rel.split(path.sep);
      if (parts[0].startsWith('.') || !parts.includes('assets') || !/\.(json|svg)$/i.test(rel)) continue;
      cpSync(path.join(site.srcDir, rel), path.join(site.outDir, rel));
    }
  },

  lastUpdated: true,

  markdown: {
    config(md) {
      // Inline-Code wörtlich ausgeben. Ohne v-pre kompiliert Vue `{{dp}}` als
      // Interpolation (rendert leer, `{{…}}` bricht sogar den Build).
      md.renderer.rules.code_inline = (tokens, idx) =>
        `<code v-pre>${md.utils.escapeHtml(tokens[idx].content)}</code>`;
    },
  },

  themeConfig: {
    nav: [
      { text: 'Start', link: '/' },
      { text: 'Erste Schritte', link: '/start/' },
      { text: 'Widgets', link: '/widgets/' },
      { text: 'Einstellungen', link: '/einstellungen/' },
      { text: 'Anleitungen', link: '/anleitungen/' },
    ],

    sidebar: {
      '/start/': [
        {
          text: 'Erste Schritte',
          items: [
            { text: 'Überblick', link: '/start/' },
            { text: 'Aufrufen und Admin-PIN', link: '/start/#aufrufen-und-admin-pin' },
            { text: 'Bildschirm vermessen', link: '/start/#bildschirm-vermessen' },
            { text: 'Grundeinstellungen', link: '/start/#grundeinstellungen' },
            { text: 'Hilfslinien', link: '/start/#hilfslinien' },
            { text: 'Grid und Breakpoints', link: '/start/#grid-und-breakpoints' },
            { text: 'Layouts und Bereiche', link: '/start/#layouts-und-bereiche' },
            { text: 'Erste Widgets', link: '/start/#erste-widgets' },
            { text: 'Auf Handy und Tablet testen', link: '/start/#auf-handy-und-tablet-testen' },
            { text: 'Tablets und Handys zuordnen', link: '/start/#tablets-und-handys-zuordnen' },
            { text: 'Sichern', link: '/start/#sichern' },
            { text: 'Weiter', link: '/start/#weiter' },
          ],
        },
      ],
      '/widgets/': widgetsSidebar,
      '/anleitungen/': [
        {
          text: 'Anleitungen',
          items: [
            { text: 'Übersicht', link: '/anleitungen/' },
            { text: 'Bildschirmschoner erstellen', link: '/anleitungen/bildschirmschoner' },
            { text: 'Grundriss mit Bedienelementen', link: '/anleitungen/grundriss' },
          ],
        },
      ],
      '/einstellungen/': [
        {
          text: 'Adminbereich',
          items: [
            { text: 'Übersicht', link: '/einstellungen/' },
            { text: 'Dashboard-Editor', link: '/einstellungen/editor' },
            { text: 'Popups', link: '/einstellungen/popups' },
            { text: 'Meldungen', link: '/einstellungen/meldungen' },
            { text: 'Widget-Verwaltung', link: '/einstellungen/widgets' },
            { text: 'Layouts & Theme', link: '/einstellungen/layouts' },
            { text: 'Frontend', link: '/einstellungen/frontend' },
            { text: 'CSS & JS', link: '/einstellungen/css-js' },
            { text: 'CSS-Klassen', link: '/einstellungen/css-klassen' },
            { text: 'Design-Tokens', link: '/einstellungen/design-tokens' },
            { text: 'Einstellungen', link: '/einstellungen/settings' },
          ],
        },
        {
          text: 'Instanz',
          items: [{ text: 'KI-Zugriff (MCP)', link: '/einstellungen/mcp' }],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hdering/ioBroker.aura' },
    ],

    search: { provider: 'local' },

    outline: { label: 'Auf dieser Seite', level: [2, 3] },
    docFooter: { prev: 'Zurück', next: 'Weiter' },
    lastUpdatedText: 'Zuletzt aktualisiert',
  },
});
