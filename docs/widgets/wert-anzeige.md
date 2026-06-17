# Wert-Anzeige

Zeigt einen Datenpunktwert als Zahl oder Text an (read-only). Mit Einheit, optionaler Werte-Transformation, farbigen Schwellwerten und freiem HTML-Template. Mehrere Layouts vom Karten- bis zum reinen Zahlen-Stil.

![](./assets/wert-anzeige/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | beliebig | angezeigter Wert; Zahlen werden gerundet, sonst als Text ausgegeben |

## Layouts

### Default
Titel/Icon oben, darunter der Wert mit Einheit. Inhalts- und Titelposition über `contentPosition`/`titlePosition` justierbar — für mittlere Zellen.

### Card
Akzent-Leiste links, Titel/Icon oben, großer Wert mit hervorgehobener Einheit — für prominente Kacheln.

### Compact
Eine Zeile mit Icon, Titel und Wert — für Listen mit vielen Werten.

### Minimal
Nur die Zahl, sehr groß, mit kleinem Titel darunter — für sehr kleine Zellen.

### Custom
Icon und Wert frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/wert-anzeige/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `showValue` | `true` | Wert anzeigen |
| `showUnit` | `true` | Einheit anzeigen |
| `icon` | layoutabhängig | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `valueFontSize` | `0` | px; `0` = automatische Größe je Layout |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `unit` | — | Einheit hinter dem Wert |
| `decimals` | globale Vorgabe | Nachkommastellen |
| `contentPosition` | — | Inhalts-Ausrichtung (nur Default) |
| `titlePosition` | — | Titel-Position (nur Default) |

### Werte-Transformation

Reine Anzeige-Umrechnung `Wert × Faktor + Offset`; der Datenpunkt selbst bleibt unverändert.

| Option | Standard | |
| --- | --- | --- |
| `valueFactor` | `1` | Multiplikator |
| `valueOffset` | `0` | Summand |

### HTML-Template

| Option | Standard | |
| --- | --- | --- |
| `htmlTemplate` | — | freies HTML, `{dp}` wird durch den Wert ersetzt |

### Schwellwerte

Färbt den angezeigten (transformierten) Wert abhängig von seiner Höhe.

| Option | Standard | |
| --- | --- | --- |
| `colorThresholds` | — | Liste aus `[Schwelle, Farbe]`, z. B. `[[20,"#0f0"],[100,"#f00"]]` |

### Status-Datenpunkte

Optionale Batterie- und Erreichbarkeits-DPs werden als kleine Badges eingeblendet (Abschnitt **Status-Datenpunkte** im Dialog).
