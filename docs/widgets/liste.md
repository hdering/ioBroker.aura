# Statische Liste

Manuell gepflegte Liste mit frei konfigurierbaren Datenpunkt-Links. Jeder Eintrag bindet seinen eigenen Datenpunkt und wird je nach Wert als Schalter, Regler, Wert oder Sensor-Badge dargestellt.

## Datenpunkt

Kein Haupt-Datenpunkt — jeder Listeneintrag (`entries[]`) trägt seine eigene `id`. Booleans werden als Schalter, Zahlen mit Level-/Dimmer-Rolle als Regler, alles andere als Wert dargestellt; `displayType` (`shutter` · `stepper` · `buttons` · `momentary` · `switch` · `slider` · `value` · `time` · `input` · `auto`) erzwingt die Darstellung pro Eintrag.

### Darstellung Eingabefeld

`displayType: 'input'` macht die Zeile zum Eingabefeld — dieselben Möglichkeiten wie das [Eingabefeld-Widget](./eingabefeld), nur pro Listenzeile. Im Badges-Layout wird stattdessen der reine Wert angezeigt. Gilt auch für die [dynamische Liste](./dynamische-liste).

| Feld | Standard | |
| --- | --- | --- |
| `inputPlaceholder` | — | Platzhalter im leeren Feld |
| `inputWidth` | `110` | Feldbreite in px (Card-Layout der dynamischen Liste: volle Breite) |
| `inputMode` | `text` | `text` · `number` |
| `inputSubmitMode` | `submit` | `submit` (Enter / Feld verlassen / Senden-Button) · `live` (jeder Tastenschlag) |
| `inputShowSubmit` | `true` | Senden-Button anzeigen (nur bei `submit`) |
| `inputClearAfterSubmit` | `false` | Befehlsfeld: nach dem Senden leeren, Datenpunkt-Wert nie anzeigen |
| `confirm` / `confirmText` | `false` | Sicherheitsabfrage vor dem Senden (nur bei `submit`) |
| `inputTextAlign` | `left` | `left` · `center` · `right` |
| `inputReadOnly` | `false` | Schreibschutz — Wert wird angezeigt, aber nicht geschrieben |

Ein schreibgeschützter Datenpunkt ist immer schreibgeschützt, unabhängig von `inputReadOnly`.

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

Der Detail-Editor rechts ist in Abschnitte gegliedert: **Datenpunkt** · **Beschriftung** · **Darstellung** (mit dem gewählten Typ als Kennzeichen, darin alle typabhängigen Felder) · **Farbschwellen** · **Verhalten** (letzte Änderung, Klick auf Zeile).

### Klick auf Zeile

Dialog **Datenpunkte verwalten** → Tab **Klick auf Zeile**. Ein Klick auf eine Listenzeile öffnet ein Detail-Popup zu genau diesem Datenpunkt. Klicks auf Schalter, Regler oder Buttons in der Zeile schalten weiterhin direkt.

| Option | Standard | |
| --- | --- | --- |
| `rowClickAction` | Eigene Aktion: alle DP des Geräts | `auto` · `{ "kind": "none" }` (aus) · vollständige Klick-Aktion |
| `rowPopupTitle` | Zeilenname | Titel des Popups |
| `rowPopupWidth` / `rowPopupHeight` | auto | px |
| `rowPopupAutoCloseSec` | View/Global | Sekunden, `0` = aus |

Standard ohne eigene Einstellung: **Eigene Aktion** → *Popup: Alle Datenpunkte des Geräts*, Umfang **Gleicher Strang (Elternobjekt)**, **Nur relevante Datenpunkte** an — entspricht `{ "kind": "popup-dps", "scope": "parent", "relevantOnly": true }`. **Automatisch** (Popup nach Rolle) muss aktiv gewählt werden.

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

Pro Datenpunkt lässt sich das im Detail-Editor überschreiben (`entries[].clickAction`):

| Modus | |
| --- | --- |
| Wie Liste | Übernimmt die Listen-Einstellung — der Normalfall |
| Automatisch | Erzwingt die Ableitung aus der Rolle, auch wenn die Liste auf `Aus` oder eine eigene Aktion steht |
| Aus | Diese Zeile reagiert nicht auf Klicks |
| Eigene Aktion | Vollständige Klick-Aktion nur für diese Zeile — eine Zeile öffnet ein Widget-Popup, die nächste springt in einen anderen Tab. Die Popup-Größe kommt weiterhin aus der Listen-Einstellung |

Popup-Titel und Titelzeile lassen sich zusätzlich pro Datenpunkt setzen — in jedem Modus außer `Aus`:

| Feld | Standard | |
| --- | --- | --- |
| `entries[].popupTitle` | Listen-Titel, sonst Zeilenname | Überschrift des Popups nur für diese Zeile |
| `entries[].popupHideTitle` | wie Liste | `true` = Titelzeile aus · `false` = an, auch wenn die Liste sie ausblendet |

Navigations-Aktionen (`Sprung: Tab` · `Externe URL` · `Widget`) springen direkt, statt ein Popup zu öffnen.

::: tip Badges-Layout
Ein Badge ist die ganze Zeile. Bei `Automatisch` schalten schaltbare Badges weiterhin, das Popup übernimmt nur Badges ohne eigenen Schalter (Sensoren, schreibgeschützte und numerische Werte). Eine ausdrücklich gesetzte Aktion gewinnt dagegen auch bei schaltbaren Badges.
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
