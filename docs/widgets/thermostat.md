# Thermostat

Stellt die Soll-Temperatur per Plus/Minus-Tasten ein und zeigt optional die Ist-Temperatur an. Heiz-/Kühl-Status wird per Icon und Akzentfarbe dargestellt, im Default-Layout ergänzt durch einen Fortschrittsbalken.

![](./assets/thermostat/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | Soll-Temperatur |
| `actualDatapoint` | nein | `number` | Ist-Temperatur |

## Layouts

### Default
Titel/Icon mit Heiz-/Kühl-Symbol oben, große Soll-Temperatur mit Ist-Wert und Plus/Minus-Tasten, darunter ein Fortschrittsbalken — für mittlere Zellen.

### Compact
Eine Zeile mit Icon, Titel, Soll-/Ist-Temperatur und Plus/Minus-Tasten — für Listen mit vielen Thermostaten.

### Minimal
Icon, Soll-Temperatur, Ist-Temperatur und Plus/Minus-Tasten zentriert — für sehr kleine Zellen.

### Custom
Icon, Soll-Wert, Ist-Wert, Status und Plus/Minus-Tasten frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/thermostat/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `showSetpoint` | `true` | Soll-Temperatur anzeigen |
| `showActualTemp` | `true` | Ist-Temperatur anzeigen |
| `showControls` | `true` | Plus/Minus-Tasten anzeigen |
| `icon` | `Thermometer` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `decimals` | globale Vorgabe | Nachkommastellen |

### Steuerung

| Option | Standard | |
| --- | --- | --- |
| `minTemp` | `10` | untere Grenze der Soll-Temperatur |
| `maxTemp` | `30` | obere Grenze der Soll-Temperatur |
| `step` | `0.5` | Schrittweite je Tastendruck |

### Schwellwerte

Färbt die angezeigte Temperatur abhängig vom Ist- (bzw. Soll-)Wert.

| Option | Standard | |
| --- | --- | --- |
| `colorThresholds` | — | Liste aus `[Schwelle, Farbe]`, z. B. `[[18,"#00f"],[30,"#f00"]]` |

### Status-Datenpunkte

Optionale Batterie- und Erreichbarkeits-DPs werden als kleine Badges eingeblendet (Abschnitt **Status-Datenpunkte** im Dialog).
