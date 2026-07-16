# Widget-Referenz (Primer)

Maschinenlesbarer Katalog aller Aura-Widgets — Single Source of Truth für Layouts, Optionen und Farben. Für optische Mockups **zuerst diese Seite und die [Design-Tokens](../einstellungen/design-tokens) lesen**, dann die Einzelseiten für Details/Screenshots. Rohdaten: [`catalog.json`](./catalog.json).

Nicht nur das Default-Layout verwenden: jedes Widget kann in **allen** unten gelisteten Layouts gerendert werden.

## Steuerung & Anzeige

| Widget | `type` | Layouts | Default-Grid (w×h) |
| --- | --- | --- | --- |
| [Rollladen](./rollladen) | `shutter` | `default` | 9×6 |
| [Dimmer](./dimmer) | `dimmer` | `default` | 11×6 |
| [Schieberegler](./schieberegler) | `slider` | `default` | 11×5 |
| [Thermostat](./thermostat) | `thermostat` | `default` · `compact` · `minimal` · `custom` | 11×7 |
| [Wert-Anzeige](./wert-anzeige) | `value` | `default` | 11×5 |
| [Gauge](./gauge) | `gauge` | `default` | 11×8 |
| [Füllstandsanzeige](./fuellstandsanzeige) | `fill` | `default` | 9×9 |
| [Drehregler](./drehregler) | `knob` | `default` | 8×8 |
| [Fenster-/Türkontakt](./fensterkontakt) | `windowcontact` | `default` | 11×5 |
| [Binärsensor](./binaersensor) | `binarysensor` | `default` | 11×5 |
| [Raumklima](./raumklima) | `climate` | `default` | 12×7 |
| [Datumswähler](./datumswaehler) | `datepicker` | `default` | 11×5 |
| [Eingabefeld](./eingabefeld) | `input` | `default` | 12×4 |
| [Auswahlfeld](./auswahlfeld) | `enum` | `default` | 12×6 |
| [Diagramm (einfach)](./diagramm) | `chart` | `default` | 12×6 |
| [Diagramm (erweitert)](./diagramm-erweitert) | `echart` | `default` | 12×6 |
| [eCharts](./echarts) | `echartsPreset` | `default` | 12×6 |
| [RGB-Licht](./rgb-licht) | `light` | `default` | 12×6 |
| [Mediaplayer](./mediaplayer) | `mediaplayer` | `default` | 12×6 |
| [Statische Liste](./liste) | `list` | `default` | 12×6 |
| [Dynamische Liste](./dynamische-liste) | `autolist` | `default` | 12×6 |
| [Schnellzugriff-Chips](./chips) | `chips` | `default` | 12×6 |
| [HTTP-Aktion](./http-aktion) | `httpRequest` | `default` | 12×6 |
| [Universal-Widget](./universal-widget) | `universal` | `default` | 12×6 |

## Spezial

| Widget | `type` | Layouts | Default-Grid (w×h) |
| --- | --- | --- | --- |
| [Uhrzeit](./uhrzeit) | `clock` | `default` | 11×6 |
| [Wetter](./wetter) | `weather` | `default` | 12×6 |
| [Kalender](./kalender) | `calendar` | `default` | 12×6 |
| [evcc](./evcc) | `evcc` | `default` | 12×6 |
| [Kamera](./kamera) | `camera` | `default` | 12×6 |
| [Bild](./bild) | `image` | `default` | 12×6 |
| [Müllabfuhr](./muellabfuhr) | `trash` | `default` | 12×6 |
| [Müllabfuhr-Zeitplan](./muellabfuhr-zeitplan) | `trashSchedule` | `default` | 12×6 |
| [JSON-Tabelle](./json-tabelle) | `jsontable` | `default` | 13×6 |
| [iFrame](./iframe) | `iframe` | `default` | 12×6 |
| [HTML](./html) | `html` | `default` | 12×6 |
| [Zustandsbild](./zustandsbild) | `stateimage` | `default` | 12×6 |
| [Adapter-Status](./adapter-status) | `adapterstatus` | `default` | 12×6 |
| [Skript-Status](./skript-status) | `scriptstatus` | `default` | 12×6 |
| [Adapter-Logs](./adapter-logs) | `adapterlogs` | `default` | 12×6 |
| [Alarmanlage](./alarmanlage) | `alarm` | `default` | 12×6 |
| [Karte](./karte) | `map` | `default` | 12×6 |
| [Karussell](./karussell) | `carousel` | `default` | 12×6 |

## Layout

| Widget | `type` | Layouts | Default-Grid (w×h) |
| --- | --- | --- | --- |
| [Abschnittstitel](./abschnittstitel) | `header` | `default` | 14×2 |
| [Button](./button) | `button` | `default` | 6×4 |
| [Gruppe](./gruppe) | `group` | `default` | 12×6 |
| [Panels](./panels) | `panels` | `default` | 12×6 |

## Detaillierte Optionen

Bislang formal erfasst (weitere folgen; alle Optionen stehen auf der jeweiligen Widget-Seite):

### Thermostat `thermostat`

| Option | Typ | Standard | |
| --- | --- | --- | --- |
| `actualDatapoint` | `datapoint` | `—` | Ist-Temperatur-DP |
| `showTitle` | `boolean` | `true` |  |
| `showIcon` | `boolean` | `true` |  |
| `showSetpoint` | `boolean` | `true` |  |
| `showActualTemp` | `boolean` | `true` |  |
| `showControls` | `boolean` | `true` |  |
| `showPresets` | `boolean` | `true` |  |
| `presets` | `number[]` | `[18,20,22,24]` |  |
| `icon` | `lucide-icon` | `Thermometer` |  |
| `iconSize` | `number(px)` | `20` |  |
| `titleAlign` | `left` · `center` · `right` | `left` |  |
| `decimals` | `number` | `global` |  |
| `minTemp` | `number` | `10` |  |
| `maxTemp` | `number` | `30` |  |
| `step` | `number` | `0.5` |  |
| `colorThresholds` | `[number,color][]` | `—` | färbt die Ist-Temperatur |

**Custom-Layout-Schlüssel** — Komponenten: `icon`, `btn-plus`, `btn-minus`, `battery-icon`, `reach-icon`, `status-badges` · Felder: `setpoint`, `actual`, `status`, `battery`, `reach`

## Querschnitts-Optionen

Gelten für nahezu alle Widgets (außer reinen Layout-/Spezial-Widgets ohne Datenpunkt):

| Option | Typ | Standard | |
| --- | --- | --- | --- |
| `clickAction` | `ClickAction` | `{ kind: "none" }` | Klick/Tap-Aktion (Popup, Link, DP schreiben …) |
| `conditions` | `WidgetCondition[]` | `[]` | Bedingte Farb-/Sichtbarkeits-Styles |
| `badges` | `BadgeDef[]` | `[]` | Overlay-Indikatoren an der Kartenecke |
| `batteryDp` | `datapoint` | `—` | Batterie-Badge |
| `unreachDp` | `datapoint` | `—` | Erreichbarkeits-Badge |
| `popupTitle` | `string` | `—` | Titel im geöffneten Popup |
| `popupShowHistory` | `boolean` | `false` | History-Icon im Popup |
