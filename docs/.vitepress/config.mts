import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'de-DE',
  title: 'ioBroker.aura',
  description: 'Widget- und Einstellungsdokumentation',

  // GitHub Pages servt unter https://hdering.github.io/ioBroker.aura/
  // Bei eigener Domain (CNAME) auf '/' setzen.
  base: '/ioBroker.aura/',

  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Start', link: '/' },
      { text: 'Widgets', link: '/widgets/' },
      { text: 'Einstellungen', link: '/einstellungen/' },
    ],

    sidebar: {
      '/widgets/': [
        {
          text: 'Widgets',
          items: [
            { text: 'Übersicht', link: '/widgets/' },
            { text: 'Schalter', link: '/widgets/schalter' },
            { text: 'Zeitschaltuhr', link: '/widgets/zeitschaltuhr' },
          ],
        },
        {
          text: 'Konzepte',
          items: [
            { text: 'Custom-Layout', link: '/widgets/custom-layout' },
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
            { text: 'Widget-Verwaltung', link: '/einstellungen/widgets' },
            { text: 'Layouts & Theme', link: '/einstellungen/layouts' },
            { text: 'Frontend', link: '/einstellungen/frontend' },
            { text: 'CSS & JS', link: '/einstellungen/css-js' },
            { text: 'Einstellungen', link: '/einstellungen/settings' },
          ],
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
