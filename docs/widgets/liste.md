# Statische Liste

Manuell gepflegte Liste mit frei konfigurierbaren Datenpunkt-Links. Jeder Eintrag bindet seinen eigenen Datenpunkt und wird je nach Wert als Schalter, Regler, Wert oder Sensor-Badge dargestellt.

## Datenpunkt

Kein Haupt-Datenpunkt — jeder Listeneintrag (`entries[]`) trägt seine eigene `id`. Booleans werden als Schalter, Zahlen mit Level-/Dimmer-Rolle als Regler, alles andere als Wert dargestellt; `displayType` (`shutter` · `stepper` · `buttons` · `momentary` · `switch` · `slider` · `value` · `auto`) erzwingt die Darstellung pro Eintrag.

## Layouts

### Default
Volle Zeilen mit Label, optionalem Raum/ID und Wert rechts — für Standardlisten.

### Card
Kacheln im Raster (`auto-fill`, min. `90px`) mit Label oben und Wert zentriert.

### Compact
Zweispaltiges, dichtes Gitter — für viele Einträge auf wenig Platz.

### Minimal
Inline-Pills mit Label und Wert, umbrechend — für kompakte Status-Anzeigen.

### Custom
Einträge frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/liste/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `List` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showCount` | `true` | Anzahl hinter dem Titel |
| `showId` | `false` | Datenpunkt-ID unter dem Label (nur `default`) |
| `showRoom` | `false` | zugeordnete Räume unter dem Label (nur `default`) |
| `showDividers` | `true` | Trennlinien zwischen Einträgen |
| `wrapText` | `false` | lange Labels/Werte umbrechen statt abschneiden |
| `labelMinPercent` | `50` | min. Breite des Labels in % (nur bei `wrapText`) |

### Werte & Farben

| Option | Standard | |
| --- | --- | --- |
| `trueText` / `falseText` | — | globale AN/AUS-Texte (Eintrag überschreibt) |
| `activeColor` | `--accent-green` | Textfarbe bei AN |
| `inactiveColor` | `--text-secondary` | Textfarbe bei AUS |
| `activeBg` / `inactiveBg` | — | Hintergrund des Eintrags je Zustand |

### Filter

Frontend-Filter als Chip im Header; `backendValueFilter` steuert nur die Editor-Vorschau.

| Option | Standard | |
| --- | --- | --- |
| `valueFilter` | `all` | `all` · `active` · `inactive` |
| `filterActiveLabel` | `Nur aktive` | Chip-Text |
| `filterInactiveLabel` | `Nur inaktive` | Chip-Text |
| `hideFilterButton` | `false` | Filter-Chip ausblenden |
| `backendValueFilter` | `all` | Vorschau-Filter im Editor |

### Sortierung

| Option | Standard | |
| --- | --- | --- |
| `sortBy` | `none` | `none` · `label` · `value` |
| `sortOrder` | `asc` | `asc` · `desc` |
| `sortBy2` | `none` | zweites Sortierkriterium |
| `sortOrder2` | `asc` | Richtung des zweiten Kriteriums |

### Summe

Summiert die numerischen Werte der sichtbaren Einträge unter dem Titel.

| Option | Standard | |
| --- | --- | --- |
| `showSum` | `false` | Summenzeile anzeigen |
| `sumLabel` | `Σ` | Prefix der Summenzeile |
| `sumAlign` | `left` | `left` · `center` · `right` |
| `sumFontSize` | `10` | px |

### Sammelschalter

Master-Steuerung im Header für alle Einträge.

| Option | Standard | |
| --- | --- | --- |
| `groupSwitch` | `false` | Sammelschalter anzeigen |
| `groupActionType` | `switch` | `switch` · `dimmer` · `shutter` · `momentary` |
| `groupDimmerOnValue` | `100` | Schreibwert bei „alle an" (Dimmer) |
| `groupExcludeIds` | — | von der Gruppenaktion ausgenommene Einträge |

### Zähler veröffentlichen

| Option | Standard | |
| --- | --- | --- |
| `publishCount` | `false` | gefilterte Anzahl nach `aura.0.lists.<id>.count` schreiben |
