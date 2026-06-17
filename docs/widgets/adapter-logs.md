# Adapter-Logs

Live-Log-Stream aller Adapter, abgefragt über die aura-Instanz. Filtert nach Schweregrad (Debug/Info/Warn/Error), Adapter und Freitext. Mit Auto-Scroll, Pause und Puffer-Leeren. Anonyme Web-Nutzer erhalten Logs nicht direkt von `iobroker.web`, daher läuft die Abfrage über aura.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/adapter-logs/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `ScrollText` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `compact` | `false` | lange Nachrichten auf 120 Zeichen kürzen |
| `newestFirst` | `true` | neueste Einträge oben |

### Filter & Suche

| Option | Standard | |
| --- | --- | --- |
| `showFilter` | `true` | Filter-Pills (Schweregrad + Adapter) anzeigen |
| `levels` | `info`, `warn`, `error` | vorausgewählte Schweregrade (`debug` · `info` · `warn` · `error`) |
| `adapterFilter` | — | Backend-Vorfilter, kommagetrennt: `aura, admin` (alle Instanzen) oder `aura.0, admin.1` (exakte Instanz) |
| `showSearch` | `true` | Freitext-Suchfeld (Nachricht + Quelle) |

### Steuerung & Puffer

| Option | Standard | |
| --- | --- | --- |
| `showControls` | `true` | Buttons Auto-Scroll · Pause · Puffer leeren |
| `bufferSize` | `500` | Ring-Puffergröße (50–5000) |
| `visibleLimit` | `200` | max. angezeigte Zeilen (20 bis `bufferSize`) |
