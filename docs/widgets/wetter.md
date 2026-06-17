# Wetter

Zeigt aktuelles Wetter und Vorhersage – wahlweise online über Open-Meteo oder aus dem ioBroker-Wetter-Adapter. Optional mit Temperaturbalken pro Tag, DWD-Warnungen (Brightsky) und lokalem Temperatur-Sensor.

## Datenpunkt

Kein Haupt-Datenpunkt. Die Wetterdaten kommen aus der gewählten Quelle (`dataSource`); optional überschreibt ein lokaler Sensor die Anzeigetemperatur.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `localTempDatapoint` | nein | `number` | lokaler Temperatursensor, überschreibt die Online-Temperatur |
| `adapterLocationPath` | nein | — | Ordnerpfad im Wetter-Adapter (nur bei `dataSource: adapter`) |

## Layouts

### Default / Card
Kopfzeile mit Emoji, Bedingung, Temperatur, Luftfeuchte und Gefühlt-Zeile, darunter die Vorhersage-Zeilen.

### Compact
Eine Zeile: Emoji, Temperatur und Bedingung — für schmale Zellen.

### Minimal
Nur großes Emoji und Temperatur zentriert.

### Custom
Felder und Komponenten (Emoji, Temperatur, Vorhersage, Tagesbalken, Warnungen) frei platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/wetter/config.png)

### Datenquelle & Ort

| Option | Standard | |
| --- | --- | --- |
| `dataSource` | `online` | `online` (Open-Meteo) · `adapter` (ioBroker) |
| `adapterLocationPath` | — | Ordnerpfad im Wetter-Adapter |
| `latitude` | `48.1` | Breitengrad (online) |
| `longitude` | `11.6` | Längengrad (online) |
| `locationName` | — | Ortsbezeichnung in der Anzeige |
| `refreshMinutes` | `30` | Aktualisierungsintervall in Minuten |
| `localTempDatapoint` | — | lokaler Temperatursensor |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Cloud` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showWeather` | `true` | aktuelles Wetter anzeigen |
| `showCondition` | `true` | Wetterbedingung als Text |
| `showHumidityLabel` | `true` | Beschriftung „Luftfeuchte" hinter dem Wert |
| `showCloudCover` | `false` | Bewölkung zusätzlich anzeigen |
| `feelsLikeStyle` | `text` | `text` · `icon` · `hidden` |
| `tempFontSize` | `0` | Schriftgröße der Temperatur in rem (`0` = auto) |
| `fontScale` | `1` | Skalierungsfaktor der Schrift |

### Vorhersage

| Option | Standard | |
| --- | --- | --- |
| `showForecast` | `true` | Vorhersage anzeigen |
| `forecastDays` | `5` | Anzahl Tage |
| `showToday` | `true` | heutigen Tag einschließen |
| `showRainProb` | `true` | Regenwahrscheinlichkeit |
| `showRainAmount` | `false` | Regenmenge in mm |
| `forecastRowGap` | `0` | Zeilenabstand in rem (`0` = Standard) |
| `forecastWrap` | `false` | Tageszeile bei wenig Platz umbrechen |
| `forecastTempThresholds` | — | Liste `[abTemp, Farbe]` für die Balkenfarbe |

### Warnungen

DWD-Unwetterwarnungen über Brightsky (nur online-bezogen auf `latitude`/`longitude`).

| Option | Standard | |
| --- | --- | --- |
| `showWarnings` | `false` | Wetterwarnungen anzeigen |

### Custom-Layout

| Option | Standard | |
| --- | --- | --- |
| `customForecastBarFontSize` | `0.75` | Schriftgröße der Tagesbalken in rem |
| `customForecastBarHeight` | `0.9` | Höhe der Tagesbalken in rem |
