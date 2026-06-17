# Eingabefeld

Nimmt Text per Tastatur entgegen und schreibt ihn in einen Datenpunkt. Wahlweise einzeilig oder mehrzeilig, mit Live-Schreiben oder Senden per Button/Enter. Externe Änderungen am DP werden übernommen, solange nicht gerade getippt wird.

![](./assets/eingabefeld/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `string` | Eingabewert wird als Text geschrieben |

## Layouts

### Default
Titel/Icon oben, darunter das Eingabefeld mit Senden-Button — für mittlere Zellen.

### Compact
Eine Zeile mit Icon, Titel, Eingabefeld und Senden-Button — für Listen.

### Custom
Icon, Eingabefeld und Senden-Button frei in einer Zellenmatrix platzieren; der Senden-Button ist hier immer verfügbar — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/eingabefeld/config.png)

### Eingabe

Im Modus `submit` wird der Wert per Senden-Button, Enter (einzeilig) bzw. Strg/Cmd+Enter (mehrzeilig) oder beim Verlassen des Feldes geschrieben; `Escape` verwirft. Im Modus `live` schreibt jeder Tastendruck sofort.

| Option | Standard | |
| --- | --- | --- |
| `submitMode` | `submit` | `submit` · `live` |
| `multiline` | `false` | mehrzeiliges Textfeld |
| `readOnly` | `false` | Feld nur lesbar |
| `placeholder` | — | Platzhaltertext |
| `maxLength` | — | maximale Zeichenzahl (begrenzt einzeilig auch die Breite) |
| `showSubmit` | `true` | Senden-Button anzeigen (nur bei `submit`) |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `TextCursorInput` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `textAlign` | `left` | `left` · `center` · `right` (Eingabetext) |
