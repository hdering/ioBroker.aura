# Auswahlfeld

Bildet DP-Werte (z. B. `0`, `1`, `2`) auf lesbare Text-Labels ab und zeigt sie als Dropdown. Die Auswahl schreibt den hinterlegten Wert zurück auf den Datenpunkt. Labels lassen sich von Hand pflegen oder per Klick aus `common.states` importieren.

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `string` · `number` · `boolean` | aktueller Wert wird auf ein Label gemappt; die Auswahl schreibt den Wert zurück |

Beim Schreiben wird der Wert typ-erkannt: `true`/`false` → Boolean, reine Zahlen → `number`, sonst Text.

## Layouts

### Default
Titel/Icon oben, aktuelles Label mit Dropdown darunter — für mittlere Zellen.

### Card
Farbiger Akzentbalken links, Titel oben, Label groß mit Dropdown — für prominente Auswahlfelder.

### Compact
Eine Zeile mit Icon, Titel, Label und Dropdown — für Listen mit vielen Auswahlfeldern.

### Minimal
Label groß zentriert, Dropdown darunter — für sehr kleine Zellen.

### Custom
Icon, Label und Dropdown frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/auswahlfeld/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `showValue` | `true` | aktuelles Label anzeigen |
| `showSelect` | `true` | Dropdown anzeigen |
| `icon` | `ListChecks` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Einträge

Liste der Wert→Label-Paare. Per Knopf **Aus common.states importieren** automatisch aus dem Datenpunkt befüllbar.

| Option | Standard | |
| --- | --- | --- |
| `entries` | `[]` | Liste aus `{ value, label, color? }` |
| `entries[].value` | — | DP-Wert als Text (numerisch wird beim Schreiben geparst) |
| `entries[].label` | — | angezeigter Text |
| `entries[].color` | — | optionale Farbe für Label und Icon |
