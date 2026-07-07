# ioBroker.aura Dokumentation

Lokale VitePress-Doku.

## Entwicklung

```bash
npm install
npm run docs:dev
```

Server läuft dann auf `http://localhost:5173/`.

## Build

```bash
npm run docs:build
npm run docs:preview
```

Build-Output landet in `docs/.vitepress/dist/`.

## Struktur

```
docs/
├── .vitepress/config.ts   # Site-Konfiguration, Sidebar, Suche
├── index.md               # Landing
├── widgets/
│   ├── index.md           # Übersicht
│   ├── schalter.md        # Schalter-Doku
│   └── assets/<widget>/   # Screenshots pro Widget
└── einstellungen/
    └── index.md
```

## Screenshots

Screenshots gehören nach `docs/widgets/assets/<widget-slug>/`. Im Markdown referenzieren als `![Alt](./assets/<widget-slug>/<bild>.png)`.

## Übersetzung

Aktuell nur Deutsch. Später per Skript automatisch nach EN/FR/… übersetzen.

## Test
Änderungstest
