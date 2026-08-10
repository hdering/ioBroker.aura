# Statische Liste

Manuell gepflegte Liste mit frei konfigurierbaren Datenpunkt-Links. Jeder Eintrag bindet seinen eigenen Datenpunkt und wird je nach Wert als Schalter, Regler, Wert oder Sensor-Badge dargestellt.

## Datenpunkt

Kein Haupt-Datenpunkt — jeder Listeneintrag (`entries[]`) trägt seine eigene `id`. Booleans werden als Schalter, Zahlen mit Level-/Dimmer-Rolle als Regler, alles andere als Wert dargestellt; `displayType` (`shutter` · `stepper` · `buttons` · `momentary` · `switch` · `slider` · `value` · `time` · `auto`) erzwingt die Darstellung pro Eintrag.

### Darstellung Datum/Zeit

`displayType: 'time'` zeigt einen Zeit-Datenpunkt als Uhrzeit und/oder Datum. Zeitstempel (Sekunden/Millisekunden), ISO-Zeitangaben und `HH:mm` werden automatisch erkannt; nicht lesbare Werte zeigen `–`. Gilt auch für die [dynamische Liste](./dynamische-liste).

| Feld | Standard | |
| --- | --- | --- |
| `timeFormat` | `time` | `time` (14:32) · `time-sec` · `date` (01.08.2026) · `date-long` (Samstag, 1. August 2026) · `datetime` · `datetime-sec` · `custom` |
| `timePattern` | — | Token-Muster bei `custom`, z. B. `EEEE, dd.MM. HH:mm` |

Tokens: `HH` `mm` `ss` · `hh` · `dd` `MM` `yyyy` `yy` · `EEEE` (Wochentag) · `EE` · `MMMM` (Monat) · `ww` (KW)

## Layouts

### Default
Volle Zeilen mit Label, optionalem Raum/ID und Wert rechts — für Standardlisten.

### Card
Kacheln im Raster (`auto-fill`, min. `90px`) mit Label oben und Wert zentriert.

### Compact
Zweispaltiges, dichtes Gitter — für viele Einträge auf wenig Platz.

### Minimal
Inline-Pills mit Label und Wert, umbrechend — für kompakte Status-Anzeigen.

## Einstellungen

Im Editor unter **Widget bearbeiten**. Die Datenpunkte selbst liegen dahinter im eigenen Dialog **Datenpunkte verwalten**; im Panel bleiben nur die Optionen der Liste als Ganzes, in aufklappbaren Abschnitten.

![](./assets/liste/config.png)

### Datenpunkte verwalten

Links alle Einträge, rechts die vollständige Konfiguration des ausgewählten. Der Dialog ist verschiebbar, größenveränderbar und merkt sich seine Größe.

![](./assets/liste/datenpunkte-dialog.png)

| Tab | |
| --- | --- |
| Einträge | Datenpunkte hinzufügen, per Drag & Drop sortieren, löschen; rechts der Detail-Editor (ID, Icon, Bezeichnung, Format, Darstellung, Farben, Schwellen). Ab 8 Einträgen mit Filterfeld |
| Klick auf Zeile | Detail-Popup beim Klick auf eine Zeile (siehe unten) |
| Namen | Namensmuster und Namens-Filter |

### Klick auf Zeile

Dialog **Datenpunkte verwalten** → Tab **Klick auf Zeile**. Ein Klick auf eine Listenzeile öffnet ein Detail-Popup zu genau diesem Datenpunkt. Klicks auf Schalter, Regler oder Buttons in der Zeile schalten weiterhin direkt.

| Option | Standard | |
| --- | --- | --- |
| `rowClickAction` | automatisch | `auto` · `{ "kind": "none" }` (aus) · vollständige Klick-Aktion |
| `rowPopupTitle` | Zeilenname | Titel des Popups |
| `rowPopupWidth` / `rowPopupHeight` | auto | px |
| `rowPopupAutoCloseSec` | View/Global | Sekunden, `0` = aus |
| `entries[].clickAction` | wie Liste | Override pro Eintrag: `auto` · `{ "kind": "none" }` (aus) |

Automatik nach Rolle des Datenpunkts:

| Rolle | Popup |
| --- | --- |
| `level.dimmer` · `level.*` · `*dimmer*` · `*brightness*` | Dimmer |
| `switch` · `switch.*` · `sensor.*` · `indicator.*` · `button` | Schalter |
| `level.blind` · `*shutter*` · `*cover*` · `*awning*` | Rollladen |
| `level.temperature` · `heating*` | Thermostat |
| `media.*` (außer `media.volume`) | Schalter |
| sonst | `Standard: Datenpunkt` (Wert, Steuerung, ID, letzte Änderung) |

Zugewiesene [Widget-Typ-Standards](../einstellungen/popups#widget-typ-standards) gelten auch hier — wer dem Typ `switch` eine eigene View zuweist, bekommt sie auch in der Liste.

::: tip Badges-Layout
Ein Badge ist die ganze Zeile. Schaltbare Badges schalten weiterhin, das Popup übernimmt nur Badges ohne eigenen Schalter (Sensoren, schreibgeschützte und numerische Werte).
:::

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `List` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showCount` | `true` | Anzahl hinter dem Titel |
| `showId` | `false` | Datenpunkt-ID unter dem Label (nur `default`) |
| `showRoom` | `false` | zugeordnete Räume unter dem Label (nur `default`) |
| `showDividers` | `true` | Trennlinien zwischen Einträgen |
| `wrapText` | `false` | lange Labels/Werte umbrechen statt abschneiden |
| `labelMinPercent` | `50` | min. Breite des Labels in % (nur bei `wrapText`) |

### Werte & Farben

| Option | Standard | |
| --- | --- | --- |
| `trueText` / `falseText` | — | globale AN/AUS-Texte (Eintrag überschreibt) |
| `activeColor` | `--accent-green` | Textfarbe bei AN |
| `inactiveColor` | `--text-secondary` | Textfarbe bei AUS |
| `activeBg` / `inactiveBg` | — | Hintergrund des Eintrags je Zustand |

### Filter

Frontend-Filter als Chip im Header; `backendValueFilter` steuert nur die Editor-Vorschau.

| Option | Standard | |
| --- | --- | --- |
| `valueFilter` | `all` | `all` · `active` · `inactive` |
| `filterActiveLabel` | `Nur aktive` | Chip-Text |
| `filterInactiveLabel` | `Nur inaktive` | Chip-Text |
| `hideFilterButton` | `false` | Filter-Chip ausblenden |
| `backendValueFilter` | `all` | Vorschau-Filter im Editor |

### Sortierung

| Option | Standard | |
| --- | --- | --- |
| `sortBy` | `none` | `none` · `label` · `value` |
| `sortOrder` | `asc` | `asc` · `desc` |
| `sortBy2` | `none` | zweites Sortierkriterium |
| `sortOrder2` | `asc` | Richtung des zweiten Kriteriums |

### Summe

Summiert die numerischen Werte der sichtbaren Einträge unter dem Titel.

| Option | Standard | |
| --- | --- | --- |
| `showSum` | `false` | Summenzeile anzeigen |
| `sumLabel` | `Σ` | Prefix der Summenzeile |
| `sumAlign` | `left` | `left` · `center` · `right` |
| `sumFontSize` | `10` | px |

### Sammelschalter

Master-Steuerung im Header für alle Einträge.

| Option | Standard | |
| --- | --- | --- |
| `groupSwitch` | `false` | Sammelschalter anzeigen |
| `groupActionType` | `switch` | `switch` · `dimmer` · `shutter` · `momentary` |
| `groupDimmerOnValue` | `100` | Schreibwert bei „alle an" (Dimmer) |
| `groupExcludeIds` | — | von der Gruppenaktion ausgenommene Einträge |

### Zähler veröffentlichen

| Option | Standard | |
| --- | --- | --- |
| `publishCount` | `false` | gefilterte Anzahl nach `aura.0.lists.<id>.count` schreiben |
