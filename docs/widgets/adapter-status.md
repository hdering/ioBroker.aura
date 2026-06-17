# Adapter-Status

Listet alle ioBroker-Instanzen mit Live-Status (läuft, gestoppt, deaktiviert), Verbindungsanzeige, Versions- und Update-Hinweisen. Optional lassen sich Instanzen direkt neu starten oder Updates installieren. Die Aktionen laufen über die aura-Instanz, nicht über die Socket-Verbindung.

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/adapter-status/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `ServerCog` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showVersion` | `true` | Versionsnummer je Instanz |
| `compact` | `false` | kompakte Zeilen ohne Untertitel |

### Filter & Suche

| Option | Standard | |
| --- | --- | --- |
| `showFilter` | `true` | Filter-Pills anzeigen (`Alle` · `Aktiv` · `Läuft` · `Gestoppt` · `Deaktiviert` · `Updates`) |
| `filterMode` | `all` | Vorauswahl: `all` · `enabled` · `running` · `stopped` · `disabled` · `updates` |
| `showSearch` | `true` | Suchfeld (ab mehr als 5 Instanzen) |
| `sortBy` | `name` | Sortierung: `name` · `status` |

### Aktionen

Beide Aktionen sind standardmäßig aus. Bei anonymem Web-Zugriff braucht der Nutzer `sendTo`-Rechte auf der aura-Instanz.

| Option | Standard | |
| --- | --- | --- |
| `allowRestart` | `false` | Neustart-Button je Instanz |
| `allowUpdate` | `false` | Update-Button bei verfügbarem Update |
