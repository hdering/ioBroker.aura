# evcc

Bindet die Wallbox- und Energiefluss-Daten des [evcc](https://evcc.io)-Adapters ein: PV-Erzeugung, Haus, Netz, Hausbatterie und bis zu acht Ladepunkte. Pro Ladepunkt lassen sich Lademodus (`AUS` · `PV` · `MIN+PV` · `SOFORT`) und Ziel-SoC direkt umschalten.

## Datenpunkt

Kein Haupt-Datenpunkt. Das Widget liest alle Werte unter dem Adapter-Präfix (`status.*`, `loadpoint.N.status.*`) und schreibt Steuerbefehle nach `loadpoint.N.control.*`.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `evccPrefix` | ja | — | Adapter-Instanz, Standard `evcc.0` |
| `batterySocDatapoint` | nein | — | eigener SoC-DP, falls evcc die Batterie nicht kennt (Prozent oder JSON `{soc,power}`) |
| `batteryPowerDatapoint` | nein | `number` | eigener Batterie-Leistungs-DP in Watt (negativ = laden) |

## Layouts

### Default
Energiefluss-Zeile (Sonne · Haus · Netz, darunter Batterie) plus Ladepunkt-Karten und Tarif-Zeile.

### Card
Wie Default — gleicher Aufbau mit Energiefluss-Zeile und Ladepunkten.

### Flow
Animiertes Energiefluss-Diagramm als SVG mit Sonne, Netz, Haus, Batterie und Ladepunkten.

### Loadpoints
Nur die ausführlichen Ladepunkt-Karten, scrollbar.

### Compact
Eine kompakte Werte-Zeile (Sonne · Haus · Netz · Batterie) plus schmale Ladepunkt-Zeilen.

### Battery
Nur die Hausbatterie als großer Ladebalken mit SoC und Lade-/Entladeleistung.

### Production
Nur die PV-Erzeugung groß, mit Einspeisung und Eigenanteil.

### Consumption
Nur der Hausverbrauch groß, mit Netzbezug/-einspeisung und Tarif.

### Custom
Felder `pvPower`, `gridPower`, `homePower`, `batterySoc`, `batteryPower`, `gridImport`, `gridExport` frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/evcc/config.png)

### Quelle & Umfang

| Option | Standard | |
| --- | --- | --- |
| `evccPrefix` | `evcc.0` | Adapter-Instanz |
| `loadpointCount` | `1` | Anzahl Ladepunkte (`1`–`8`) |
| `showLoadpoints` | `true` | Ladepunkte anzeigen |
| `visibleLoadpoints` | `[]` | angezeigte Ladepunkte (leer = alle) |
| `showBattery` | `true` | Hausbatterie anzeigen |
| `batterySocDatapoint` | — | eigener SoC-Datenpunkt |
| `batteryPowerDatapoint` | — | eigener Leistungs-Datenpunkt |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Zap` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Größe & Skalierung

Skaliert die einzelnen Bereiche; bei `autoScale` zusätzlich automatisch mit der Widget-Breite.

| Option | Standard | |
| --- | --- | --- |
| `autoScale` | `true` | mit Widget-Breite skalieren |
| `autoScaleMin` | `0.6` | untere Skalierungsgrenze |
| `autoScaleMax` | `2.2` | obere Skalierungsgrenze |
| `sizeScale` | `1` | globale Skalierung |
| `headerScale` | `1` | Kopfzeile |
| `flowScale` | `1` | Energiefluss |
| `loadpointScale` | `1` | Ladepunkte |
| `mainScale` | `1` | Haupt-Bereich (Akku/Erzeugung/Verbrauch/Kompakt) |
| `tariffScale` | `1` | Tarif-Zeile |
