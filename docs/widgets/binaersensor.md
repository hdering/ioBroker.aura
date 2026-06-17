# Binärsensor

Zeigt einen allgemeinen Binärsensor an (z. B. Bewegungsmelder, Alarm). Liest einen `boolean`-Datenpunkt und stellt je nach Zustand Label, Icon und Farbe dar. Sensor-Voreinstellungen (Bewegung, Rauch, Wasser …) liefern passende Texte und Farben.

![](./assets/binaersensor/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `boolean` | aktiv = `true` |

Optionale Status-Datenpunkte (Batterie, Erreichbarkeit) werden als Badges eingeblendet (Abschnitt **Status-Datenpunkte** im Dialog).

## Layouts

### Default
Titel mit Icon oben, darunter der Status-Text — für mittlere Zellen.

### Card
Vollflächige Karte, im Aktiv-Zustand farbig hinterlegt mit weißer Schrift — für prominente Sensoren.

### Compact
Eine Zeile mit Icon, Titel und Status-Badge — für Listen mit vielen Sensoren.

### Minimal
Icon und großer Status-Text zentriert, Titel klein darunter — für sehr kleine Zellen.

### Custom
Icon, Status, Label und Aktiv-Zustand frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/binaersensor/config.png)

### Voreinstellung

`sensorType` lädt passende Texte und Farben; die einzelnen Werte lassen sich darunter überschreiben.

| Option | Standard | |
| --- | --- | --- |
| `sensorType` | `generic` | `motion` · `smoke` · `doorbell` · `vibration` · `flood` · `lowbat` · `generic` |
| `labelOn` | aus Voreinstellung | Text im Aktiv-Zustand |
| `labelOff` | aus Voreinstellung | Text im Inaktiv-Zustand |
| `colorOn` | aus Voreinstellung | Farbe im Aktiv-Zustand |
| `colorOff` | aus Voreinstellung | Farbe im Inaktiv-Zustand |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showLabel` | `true` | Status-Text anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | zustandsabhängig | [Lucide-Icon](https://lucide.dev); fest gesetzt überschreibt den Zustandswechsel |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
