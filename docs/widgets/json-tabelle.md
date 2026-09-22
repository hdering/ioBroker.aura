# JSON-Tabelle

Zeigt einen Datenpunkt mit JSON-Daten als formatierte Tabelle. Erkennt automatisch ein Array von Objekten, ein Array von Arrays oder ein `{headers, rows}`-Objekt. Spalten lassen sich umbenennen, ausblenden, sortieren und als Bild, HTML oder Iconify-Icon rendern.

Mögliche Bildquellen (URL, Adapter-Pfad, Datei, Base64): siehe [Bildpfade](./bildpfade).

![](./assets/json-tabelle/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `string` / `array` | JSON-Array, Array-von-Arrays oder `{headers, rows}`; Strings werden geparst |

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/json-tabelle/config.png)

### Tabelle

| Option | Standard | |
| --- | --- | --- |
| `autoHeight` | `false` | Widget-Höhe folgt der Zeilenanzahl |
| `showSearch` | `false` | Suchfeld über der Tabelle |
| `showHeader` | `true` | Kopfzeile anzeigen |
| `striped` | `true` | Zebra-Streifen |
| `fontSize` | `12` | Schriftgröße in px |

### Kopfzeile

Nur wirksam bei `showHeader: true`.

| Option | Standard | |
| --- | --- | --- |
| `headerBg` | `var(--accent)` | Hintergrund der Kopfzeile |
| `headerColor` | `#ffffff` | Textfarbe der Kopfzeile |

### Erste Spalte als Bezeichnung

Hebt die erste Spalte als Label-Spalte hervor.

| Option | Standard | |
| --- | --- | --- |
| `firstColHeader` | `false` | erste Spalte hervorheben |
| `firstColBg` | `var(--app-bg)` | Hintergrund der Bezeichnungsspalte |
| `firstColColor` | `var(--text-secondary)` | Textfarbe der Bezeichnungsspalte |

### Spalten

Liste in `columns` (leer = alle Spalten automatisch aus den JSON-Daten). Pro Spalte:

| Feld | |
| --- | --- |
| `key` | Schlüssel aus dem JSON |
| `label` | abweichender Anzeigename |
| `hidden` | Spalte ausblenden |
| `order` | Reihenfolge (kleiner = weiter links) |
| `image` | Wert als Bild rendern (URL, `data:`-URI oder ioBroker-Pfad) |
| `imageSize` | Bildgröße in px |
| `imagePathPrefix` | Pfad-Präfix, überschreibt die globale Admin-URL |
| `html` | Wert als HTML rendern |
| `htmlWidth` | HTML-Breite: `auto` (eigene Breite) · `fill` (Spalte füllen) · `scale` (längster Wert der Spalte füllt, kürzere im gleichen Verhältnis) |
| `iconify` | Iconify-Tokens (z. B. `mdi:home`) inline als Icon |
| `width` | feste Spaltenbreite in px (leer = automatisch) |
| `align` | Ausrichtung: `left` · `center` · `right` |
| `wrap` | Zeilenumbruch erlauben (sonst einzeilig mit …) |
| `prefix` / `suffix` | Text vor / hinter dem Wert (z. B. `€`, ` °C`) |

#### Wert-Format

Zwei Schalter in der Spalte, neben Bild/HTML/Icons: **Datum/Zeit** und **Umrechnung**. Jeder blendet seine Felder ein, wenn er an ist. Nur bei Text-Spalten (nicht Bild/HTML); ändert nur die Anzeige, nicht die JSON-Daten. Reihenfolge: Umrechnung → Zeit-Format → Nachkommastellen.

| Feld | |
| --- | --- |
| `valueTransform` | Umrechnungs-Vorlage (z. B. `wh-kwh`, `s-min`) oder `custom` |
| `valueFactor` / `valueOffset` | Anzeige = Wert × Faktor + Offset |
| `valueTimeFormat` | Wert als Zeit: `relative` · `time` · `time-sec` · `date` · `date-long` · `datetime` · `datetime-sec` · `custom` |
| `valueTimePattern` | Token-Muster bei `valueTimeFormat: custom`, z. B. `dd.MM.yyyy HH:mm` |
| `decimals` | Nachkommastellen für Zahlen (leer = unverändert) |

Zeitstempel in Sekunden und Millisekunden, ISO-Zeitangaben und `HH:mm` werden automatisch erkannt: `1720562400000` mit `valueTimeFormat: date` ergibt `10.07.2024`.

#### HTML-Breite

![](./assets/json-tabelle/html-breite.png)

### Titel & Icon

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Table2` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
