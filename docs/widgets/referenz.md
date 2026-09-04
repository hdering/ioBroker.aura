# Widget-Referenz (Primer)

Maschinenlesbarer Katalog aller Aura-Widgets — Single Source of Truth für Layouts, Optionen und Farben. Für optische Mockups **zuerst diese Seite und die [Design-Tokens](../einstellungen/design-tokens) lesen**, dann die Einzelseiten für Details/Screenshots. Rohdaten: [`catalog.json`](./catalog.json).

Nicht nur das Default-Layout verwenden: jedes Widget kann in **allen** unten gelisteten Layouts gerendert werden.

## Steuerung & Anzeige

| Widget | `type` | Layouts | Default-Grid (w×h) |
| --- | --- | --- | --- |
| [Rollladen](./rollladen) | `shutter` | `default` | 9×6 |
| [Dimmer](./dimmer) | `dimmer` | `default` | 11×6 |
| [Schieberegler](./schieberegler) | `slider` | `default` | 11×5 |
| [Thermostat](./thermostat) | `thermostat` | `default` · `compact` · `minimal` · `dial` · `custom` | 11×7 |
| [Wert-Anzeige](./wert-anzeige) | `value` | `default` | 11×5 |
| [Gauge](./gauge) | `gauge` | `default` | 11×8 |
| [Füllstandsanzeige](./fuellstandsanzeige) | `fill` | `default` · `battery` · `bar` · `segments` · `wave` · `custom` | 9×9 |
| [Drehregler](./drehregler) | `knob` | `default` | 8×8 |
| [Fenster-/Türkontakt](./fensterkontakt) | `windowcontact` | `default` | 11×5 |
| [Binärsensor](./binaersensor) | `binarysensor` | `default` | 11×5 |
| [Raumklima](./raumklima) | `climate` | `default` | 12×7 |
| [Datumswähler](./datumswaehler) | `datepicker` | `default` | 11×5 |
| [Eingabefeld](./eingabefeld) | `input` | `default` | 12×4 |
| [Auswahlfeld](./auswahlfeld) | `enum` | `default` | 12×6 |
| [Diagramm (einfach)](./diagramm) | `chart` | `default` | 12×6 |
| [Diagramm (erweitert)](./diagramm-erweitert) | `echart` | `default` | 12×6 |
| [Diagramm (Verteilung)](./verteilung) | `energiebilanz` | `default` | 8×8 |
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
| [Meldungen](./meldungen) | `messages` | `default` · `count` | 12×6 |
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
| [Menü](./menue) | `menu` | `default` | 12×2 |
| [Spiegel](./spiegel) | `mirror` | `default` | 8×4 |

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

### Diagramm (Verteilung) `energiebilanz`

| Option | Typ | Standard | |
| --- | --- | --- | --- |
| `bars` | `EnergyBar[]` | `[]` | Gruppen — je Gruppe ein Balken bzw. Kreis |
| `bars[].title` | `string` | `—` | Titel über der Gruppe |
| `bars[].legendSide` | `left` · `right` · `top` · `below` | `below` | Legende dieser Gruppe |
| `bars[].entries` | `EnergyEntry[]` | `[]` | Einträge der Gruppe |
| `entries[].datapointId` | `datapoint` | `—` | Pflicht je Eintrag |
| `entries[].historyInstance` | `string` | `auto` | history/influxdb/sql; leer = aus common.custom erkannt |
| `entries[].aggregate` | `last` · `delta` · `sum` · `average` · `max` · `min` | `last` | reduziert den Eintrag auf EINEN Wert im Zeitraum |
| `entries[].label` | `string` | `—` | Bezeichnung in der Legende |
| `entries[].icon` | `lucide-icon` | `—` |  |
| `entries[].color` | `color` | `Palette` |  |
| `entries[].unit` | `string` | `unit` | Einheit nur für diesen Eintrag |
| `entries[].decimals` | `number` | `decimals` |  |
| `chartStyle` | `bars` · `pie` · `donut` | `bars` |  |
| `barWidth` | `number(px)` | `46` | nur chartStyle bars |
| `pieSize` | `number(px)` | `160` | nur pie/donut |
| `unit` | `string` | `kWh` |  |
| `decimals` | `number` | `global` |  |
| `range` | `1h` · `6h` · `24h` · `7d` · `30d` · `custom` | `24h` | gemeinsames Fenster aller Einträge |
| `rangeCustomValue` | `number` | `24` | nur range custom |
| `rangeCustomUnit` | `h` · `d` | `h` | nur range custom |
| `visibleRanges` | `EChartTimeRange[]` | `alle Presets` | Auswahl des Frontend-Umschalters |
| `lockRange` | `boolean` | `false` | Umschalter im Frontend ausblenden |
| `showTitle` | `boolean` | `true` |  |
| `showBarTitles` | `boolean` | `true` | Titel je Gruppe |
| `showTotals` | `boolean` | `true` | Summe je Gruppe |
| `barTitleAlign` | `left` · `center` · `right` | `center` |  |
| `showPercent` | `boolean` | `true` | Prozent-Label im Segment |
| `showSegmentIcon` | `boolean` | `false` | Icon zusätzlich im Segment |
| `showOutsidePercent` | `boolean` | `true` | kleine Segmente außen anschreiben (pie/donut) |
| `showLegend` | `boolean` | `true` |  |
| `legendSide` | `left` · `right` · `top` · `below` | `je Gruppe` | gilt für alle Gruppen |
| `legendAlign` | `left` · `center` · `right` | `aus der Position` |  |
| `legendFormat` | `value` · `icon-value` · `label` · `label-value` · `icon-label-value` | `icon-value` |  |
| `icon` | `lucide-icon` | `PieChart` |  |
| `showIcon` | `boolean` | `true` |  |
| `iconSize` | `number(px)` | `18` |  |
| `titleAlign` | `left` · `center` · `right` | `left` |  |

### Menü `menu`

| Option | Typ | Standard | |
| --- | --- | --- | --- |
| `menuMode` | `section` · `tab` | `section` | Bereiche des Layouts bzw. Tabs des Bereichs |
| `hiddenItems` | `string[]` | `[]` | abgewählte Einträge (Slug oder ID) |
| `variant` | `hbar` · `pills` · `vlist` · `grid` | `hbar` |  |
| `indicatorStyle` | `text` · `underline` · `filled` · `pills` | `underline` | Aktiv-Stil; variant pills erzwingt pills |
| `align` | `start` · `center` · `end` | `start` | wirkt bei hbar und pills |
| `gridCols` | `number` | `3` | nur variant grid (1–12) |
| `gap` | `number(px)` | `6` |  |
| `iconSize` | `number(px)` | `18` |  |
| `showIcons` | `boolean` | `true` | Icons stammen aus Bereich/Tab, nicht aus dem Widget |
| `showLabels` | `boolean` | `true` |  |

### Spiegel `mirror`

| Option | Typ | Standard | |
| --- | --- | --- | --- |
| `targetWidgetId` | `string` | `—` | ID des Quell-Widgets; Inhalt, Titel und Werte kommen live von dort |
| `transparent` | `boolean` | `false` | Rahmen des Spiegels; beim Auswählen von der Quelle übernommen |
| `transparency` | `number` | `—` | wie transparent |
| `styleOverride` | `Record<string,string>` | `—` | wie transparent |

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
