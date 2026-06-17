# Skript-Status

Listet alle JavaScript-Skripte (`script.js.*`) mit Live-Status (läuft/gestoppt), Engine-Badge (JS, TS, Blockly, Rules), Filter nach Status und Ordner sowie optionalen Start-/Stopp-Aktionen. Aktionen laufen über die aura-Instanz.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/skript-status/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Code2` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showEngine` | `true` | Engine-Badge (JS/TS/Blockly/Rules) |
| `compact` | `false` | kompakte Zeilen ohne Pfad |

### Filter & Suche

| Option | Standard | |
| --- | --- | --- |
| `showFilter` | `true` | Filter-Pills anzeigen (`Alle` · `Läuft` · `Gestoppt`) |
| `filterMode` | `all` | Vorauswahl: `all` · `running` · `stopped` |
| `groupFilter` | — | Ordner vorauswählen (Dropdown ab mehr als einem Ordner) |
| `showSearch` | `true` | Suchfeld (ab mehr als 5 Skripten) |
| `searchScope` | `both` | Suchfeld durchsucht `name` · `path` · `both` |
| `sortBy` | `name` | Sortierung: `name` · `status` |

### Aktionen

Beide Aktionen sind standardmäßig aus.

| Option | Standard | |
| --- | --- | --- |
| `allowStart` | `false` | Start-Button bei gestoppten Skripten |
| `allowStop` | `false` | Stopp-Button bei laufenden Skripten |
