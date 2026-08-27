# Dynamische Liste

Listet Datenpunkte automatisch anhand von Filtern (Rolle, ID-Muster, Raum, Funktion, Typ, Adapter) auf und synchronisiert sie periodisch. Jeder gefundene Eintrag wird je nach Wert als Schalter, Regler, Wert oder Sensor-Badge dargestellt.

## Datenpunkt

Kein Haupt-Datenpunkt — die Einträge (`entries[]`) werden über die Filter ermittelt und beim Sync ergänzt. Booleans werden als Schalter, Zahlen mit Level-/Dimmer-Rolle als Regler, `value.*`/`level`-Rollen immer als Wert dargestellt.

Pro Eintrag lässt sich die Darstellung erzwingen (`displayType`) — inklusive `switch` für einen [Schalter](./liste#darstellung-schalter) mit eigenen Schreibwerten, Status-Datenpunkt und Icon-/Bild-Stil, `time` für Zeit-Datenpunkte (Uhrzeit / Datum / beides / eigenes Muster, siehe [Statische Liste](./liste#darstellung-datum-zeit)), `datepicker` für einen [Datumswähler](./liste#darstellung-datumswaehler) und `input` für ein [Eingabefeld](./liste#darstellung-eingabefeld) in der Zeile.

Pro Eintrag (Dialog **Datenpunkte verwalten** → Abschnitt **Datenpunkt**) lässt sich der Wert außerdem nur für die Anzeige umrechnen und/oder als Uhrzeit/Datum formatieren, siehe [Wert-Umrechnung / Zeit](./liste#wert-umrechnung-zeit). Ohne eigene Einstellung gilt die globale Umrechnung der Liste.

## Layouts

### Default
Volle Zeilen mit Label, optionalem Raum/ID und Wert rechts — für Standardlisten.

### Card
Kacheln im Raster (Breite via `cardMinWidth`) mit großem zentriertem Wert.

### Compact
Zweispaltiges, dichtes Gitter — für viele Einträge auf wenig Platz.

### Minimal
Inline-Pills mit Label und Wert — für kompakte Status-Anzeigen.

### Count
Nur die Anzahl der (gefilterten) Einträge groß zentriert mit Icon und Titel.

## Einstellungen

Im Editor unter **Widget bearbeiten**. Die Datenpunkte selbst liegen dahinter im eigenen Dialog **Datenpunkte verwalten**; im Panel bleiben nur die Optionen der Liste als Ganzes, in aufklappbaren Abschnitten.

![](./assets/dynamische-liste/config.png)

### Datenpunkte verwalten

Links alle Einträge, rechts die vollständige Konfiguration des ausgewählten. Der Dialog ist verschiebbar, größenveränderbar und merkt sich seine Größe.

![](./assets/dynamische-liste/datenpunkte-dialog.png)

| Tab | |
| --- | --- |
| Suchen & Filter | Datenpunkt-Suche, Ausschlüsse, Trefferliste, Übernehmen — dazu Sync-Intervall und „Nur relevante DPs" |
| Icon | Icon vor dem Namen für alle Zeilen (siehe unten) |
| Einträge | Gefundene Datenpunkte; rechts der Detail-Editor (Bezeichnung, Einheit, Darstellung, Farben) |
| Bedingungen | Regeln für alle Zeilen (siehe unten) |
| Zweite Zeile | Vorlage für zusätzliche Datenpunkte in allen Zeilen (siehe unten) |
| Klick auf Zeile | Detail-Popup beim Klick auf eine Zeile (siehe unten) |
| Namen | Namensmuster und Namens-Filter — Platzhalter wie bei der [statischen Liste](./liste#namen), inklusive `[[{{parent}}.DeviceName]]` für Namen aus einem eigenen Datenpunkt |

Der Detail-Editor rechts ist in Abschnitte gegliedert: **Datenpunkt** · **Beschriftung** · **Zweite Zeile** · **Darstellung** (mit dem gewählten Typ als Kennzeichen, darin alle typabhängigen Felder) · **Verhalten** (letzte Änderung, Klick auf Zeile).

### Icon vor dem Namen

Die Datenpunkte kommen aus einem Filter und ändern sich beim Sync, deshalb wird das Icon einmal für die ganze Liste gesetzt: Dialog → Tab **Icon** ([Lucide](https://lucide.dev) / Iconify-ID, Größe in px, Standard `13`, dazu die Farbe).

| Quelle | |
| --- | --- |
| `entryIcon` · `entryIconSize` · `entryIconColor` | Dialog → Tab **Icon**: gilt für **alle** Zeilen |
| `entries[].icon` · `entries[].iconSize` | Detail-Editor → Abschnitt **Beschriftung**: nur diese Zeile — die Farbe gibt es nur listenweit |
| `icon` · `iconSize` · `iconColor` einer Bedingung | solange die Regel greift — gewinnt gegen beide |

Der Tab zeigt eine Vorschau der ersten Zeilen und wie viele Datenpunkte ein eigenes Icon haben; **Eigene Icons entfernen** setzt sie zurück, damit die Vorgabe überall gilt.

### Zweite Zeile (zusätzliche Datenpunkte)

Zusätzliche Datenpunkte unter dem Wert einer Zeile — Batterie, Signalstärke, Sollwert. **Nur Anzeige**, kein Schreiben. Felder, Plätze (links/mitte/rechts) und Formatierung wie bei der [statischen Liste](./liste#zweite-zeile-zusatzliche-datenpunkte). Layouts `default` · `card` · `compact`, nicht `minimal`.

Zwei Quellen, pro Eintrag gesetzte Datenpunkte gewinnen:

| Quelle | |
| --- | --- |
| `subDpTemplate` | Dialog → Tab **Zweite Zeile**: gilt für **alle** Einträge |
| `entries[].subDps` | Detail-Editor → Abschnitt **Zweite Zeile**: ersetzt die Vorlage für diese Zeile |

In der Vorlage darf die Datenpunkt-ID Platzhalter enthalten, aufgelöst gegen den Datenpunkt der jeweiligen Zeile:

| Platzhalter | |
| --- | --- |
| `{{parent}}` | ID ohne letztes Segment, z. B. `{{parent}}.BATTERY` |
| `{{dp}}` | vollständige ID der Zeile |
| `{{name}}` | letztes Segment der ID |

Ohne Platzhalter gilt derselbe Datenpunkt für jede Zeile (Außentemperatur, Strompreis). Ein Beispiel-Eintrag im Tab liefert die Auswahl der Geschwister-Datenpunkte und die Vorschau der aufgelösten IDs.

Zusätzlich pro Datenpunkt der zweiten Zeile:

| Feld | |
| --- | --- |
| Werte-Zuordnung (`states`) | Tabelle `Wert → Text`, optional mit Icon und Farbe — z. B. `true` → `ONLINE`. Ersetzt den Werttext; die Einheit entfällt dann |
| Bedingungen (`conditions`) | dieselben Regeln wie [je Zeile](#bedingungen-je-zeile), nur für diesen einen Wert |

Die Werte-Zuordnung ist dieselbe Tabelle wie beim Darstellungstyp `Zustände` und wirkt an beiden Stellen
gleich.

| Option | Standard | |
| --- | --- | --- |
| `subDpTemplate` | — | Vorlage für alle Einträge |
| `subDpTemplateHideMissing` | `true` | Zeilen ohne den aufgelösten Datenpunkt bleiben leer statt `–` zu zeigen |

### Bedingungen je Zeile

Regeln, die auf einen Wert reagieren und Farbe, Icon oder Text einer Zeile ändern. Zwei Orte, gleiche
Regeln:

| Ort | Gilt für |
| --- | --- |
| Dialog **Datenpunkte verwalten** → Tab **Bedingungen** (`rowConditions`) | alle Zeilen |
| Detail-Editor → Abschnitt **Bedingungen** (`entries[].conditions`) | nur diese Zeile |

Die listenweiten Regeln laufen zuerst, die des Eintrags danach — **pro Eigenschaft gewinnt die letzte**.
Ausblenden ist absorbierend.

| Feld | |
| --- | --- |
| `target` | `row` (Standard) · `name` · `value` · `icon` — worauf die Regel wirkt |
| `clauses` / `logic` | wie bei den [Widget-Bedingungen](../einstellungen/editor#bedingungen-marker-operatoren), inkl. Vergleich gegen einen zweiten Datenpunkt |
| `color` · `bg` · `iconColor` | Textfarbe · Zeilenhintergrund (nur `row`) · Icon-Farbe |
| `icon` | anderes Icon, solange die Regel greift |
| `iconSize` | Icon-Größe in px, solange die Regel greift; leer lässt die eingestellte Größe |
| `text` | ersetzt den angezeigten Text; die Einheit entfällt dabei |
| `bold` · `italic` | Schriftschnitt |
| `effect` | `pulse` · `blink` — lässt das Element pulsieren bzw. blinken |
| `hide` | Element ausblenden |

Eine Regel auf `row` gibt Textfarbe, Fett/Kursiv sowie Icon, Icon-Farbe und Icon-Größe an Name, Wert und
Icon weiter; Hintergrund und Ausblenden bleiben bei der Zeile. Eine Regel auf einen einzelnen Teil gewinnt gegen sie.

#### Datenpunkt einer Bedingung

| Schreibweise | bedeutet |
| --- | --- |
| `{dp}` (leer) | Wert der Zeile selbst |
| `hm-rpc.0.Gerät.UNREACH` | genau dieser Datenpunkt, in jeder Zeile derselbe |
| `{{parent}}.UNREACH` | Nachbar-Datenpunkt **der jeweiligen Zeile** |
| `{{dp}}` · `{{name}}` | vollständige ID bzw. letztes Segment der Zeile |

Die doppelten Klammern sind dieselben Platzhalter wie in der [zweiten Zeile](#zweite-zeile-zusatzliche-datenpunkte).
Zeilen, deren Datenpunkt einen Platzhalter nicht beantworten kann (kein Elternstrang), überspringen die
Regel — statt gegen den wörtlichen Text zu vergleichen.

::: tip Beispiel
`{{parent}}.UNREACH` ist wahr → `target: icon`, Icon `CloudOff`, Icon-Farbe rot. Eine Regel, jede Zeile
prüft ihr eigenes Gerät.
:::

### Datenpunkt-Suche

Dialog **Datenpunkte verwalten** → Tab **Suchen & Filter**. Mehrere Werte je Feld kommagetrennt; ID-Muster akzeptiert Text (Teilstring) oder `/regex/`.

Neben Raum und Funktion steht jede selbst angelegte enum-Kategorie zur Auswahl (z. B. `enum.floors` für Stockwerke). Enthält ein Eintrag Räume statt Datenpunkte, werden diese mit aufgelöst — ein Stockwerk findet also die Datenpunkte seiner Räume. Hängen die Mitglieder direkt an der Kategorie (`enum.etage` ohne Ebene darunter), ist die Kategorie selbst der Auswahleintrag. Gibt es außer `enum.rooms` und `enum.functions` nichts, bleibt das Feld leer und sagt das auch.

| Option | Standard | |
| --- | --- | --- |
| `filterRoles` | — | Rollen (exakt, ODER-Verknüpfung) |
| `filterIdPattern` | — | ID-Muster (Text oder `/regex/`) |
| `filterRooms` | — | Räume |
| `filterFuncs` | — | Funktionen |
| `filterEnums` | — | eigene Kategorien: volle enum-IDs (`enum.floors.og`), ODER innerhalb einer Kategorie, UND über Kategorien |
| `filterTypes` | — | Typen (`boolean`, `number`, …) |
| `filterAdapters` | — | Adapter-Instanzen (`hm-rpc.0`, …) |
| `excludeIdPatterns` | — | auszuschließende ID-Muster |
| `excludeIds` | — | einzeln ausgeschlossene IDs |
| `filterRelevant` | `true` | nur Widget-relevante Rollen/Typen übernehmen |
| `syncIntervalMin` | `5` | Sync-Intervall in Minuten |

### Klick auf Zeile

Dialog **Datenpunkte verwalten** → Tab **Klick auf Zeile**. Ein Klick auf eine Listenzeile öffnet ein Detail-Popup zu genau diesem Datenpunkt. Klicks auf Schalter, Regler oder Buttons in der Zeile schalten weiterhin direkt.

| Option | Standard | |
| --- | --- | --- |
| `rowClickAction` | Aus | `auto` · `{ "kind": "none" }` (aus) · vollständige Klick-Aktion |
| `rowPopupTitle` | Zeilenname | Titel des Popups |
| `rowPopupWidth` / `rowPopupHeight` | auto | px |
| `rowPopupAutoCloseSec` | View/Global | Sekunden, `0` = aus |

Standard ohne eigene Einstellung: **Aus** — Zeilen reagieren nicht auf Klicks. **Eigene Aktion** startet mit *Popup: Alle Datenpunkte des Geräts*, Umfang **Gleicher Strang (Elternobjekt)**, **Nur relevante Datenpunkte** an — entspricht `{ "kind": "popup-dps", "scope": "parent", "relevantOnly": true }`. **Automatisch** (Popup nach Rolle) muss aktiv gewählt werden.

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
| Eigene Aktion | Vollständige Klick-Aktion nur für diese Zeile — eine Zeile öffnet ein Widget-Popup, die nächste springt in einen anderen Tab. Popup-Titel und -Größe kommen weiterhin aus der Listen-Einstellung |

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
| `entryIcon` | — | [Icon vor dem Namen](#icon-vor-dem-namen) — gilt für alle Zeilen |
| `entryIconSize` | `13` | px |
| `entryIconColor` | `--text-secondary` | Farbe des Zeilen-Icons (im Layout `minimal` sonst die Badge-Farbe) |
| `showId` | `false` | Datenpunkt-ID unter dem Label |
| `showRoom` | `false` | Räume unter dem Label |
| `showEntryLastChange` | `false` | Zeitstempel der letzten Änderung je Eintrag |
| `decimals` | global | Nachkommastellen numerischer Werte |
| `cardMinWidth` | `90` | min. Kachelbreite in px (nur `card`) |
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
| `valueTransform` / `valueFactor` / `valueOffset` | — | globale [Wert-Umrechnung](./liste#wert-umrechnung-zeit) (Eintrag überschreibt) |
| `valueTimeFormat` / `valueTimePattern` | — | globale Zeit-Formatierung (Eintrag überschreibt) |
| `colorThresholds` | — | Farbskala aus `[Schwelle, Farbe]`, z. B. `[[17,"#ef4444"],[100,"#22c55e"]]` — der Wert nimmt die Farbe der ersten Schwelle, unter der er liegt, oberhalb der letzten bleibt deren Farbe. Reihenfolge beliebig |

### Anzeige-Filter

Frontend-Filter als Chip im Header (nicht zu verwechseln mit der Datenpunkt-Suche oben); `backendValueFilter` steuert nur die Editor-Vorschau. Neben den drei eingebauten Modi bietet das Menü die eigenen Filter und ein Freitextfeld.

| Option | Standard | |
| --- | --- | --- |
| `valueFilter` | `all` | `all` · `active` · `inactive` · ID eines eigenen Filters |
| `filterActiveLabel` | `Nur aktive` | Chip-Text |
| `filterInactiveLabel` | `Nur inaktive` | Chip-Text |
| `hideBuiltinFilters` | `false` | `Nur aktive`/`Nur inaktive` aus dem Menü nehmen |
| `hideFilterSearch` | `false` | Freitextfeld im Menü ausblenden |
| `filterSearchPlaceholder` | `Suchen …` | Platzhalter des Freitextfelds |
| `hideFilterButton` | `false` | Filter-Chip ausblenden |
| `backendValueFilter` | `all` | Vorschau-Filter im Editor |

Freitext trifft Name, Datenpunkt-ID, Wert und alle Werte der [zweiten Zeile](#zweite-zeile-zusatzliche-datenpunkte).

### Eigene Filter

Panel **Filter & Sortierung** → **Eigene Filter**. Aufbau und Optionen (`filterPresets[]`, `rules[]`) wie bei der [statischen Liste](./liste#eigene-filter) —
inklusive `source: name` und `enthält nicht`, mit denen sich Zeilen anhand ihres Namens **ausschließen**
lassen. Regeln mit `source: sub` prüfen die Datenpunkte der zweiten Zeile — auch die per Vorlage aufgelösten, `subKey` trifft dann die Bezeichnung oder die DP-Endung (`{{parent}}.BATTERY` → `BATTERY`).

### Sortierung

Panel **Filter & Sortierung** → **Sortierung**. Kriterien-Kette und Optionen (`sortRules[]`) wie bei der
[statischen Liste](./liste#sortierung) — inklusive `mode: custom` für eine eigene Werte-Reihenfolge und
`empty` für Zeilen ohne Wert. Der Dialog zeigt live die entstehende Reihenfolge.

Ein Kriterium mit `source: sub` liest die Datenpunkte der zweiten Zeile — auch die per
[Vorlage](#zweite-zeile-zusatzliche-datenpunkte) aufgelösten. `subKey` trifft dann die Bezeichnung oder
die DP-Endung (`{{parent}}.BATTERY` → `BATTERY`), leer = erster weiterer DP der Zeile.

Die älteren Optionen `sortBy` / `sortOrder` / `sortBy2` / `sortOrder2` wirken unverändert weiter; die
erste Änderung im Dialog ersetzt sie durch `sortRules[]`.

### Summe

| Option | Standard | |
| --- | --- | --- |
| `showSum` | `false` | Summe der sichtbaren numerischen Werte |
| `sumLabel` | `Σ` | Prefix der Summenzeile |
| `sumAlign` | `left` | `left` · `center` · `right` |
| `sumFontSize` | `10` | px |

### Sammelschalter

| Option | Standard | |
| --- | --- | --- |
| `groupSwitch` | `false` | Sammelschalter im Header |
| `groupActionType` | `switch` | `switch` · `dimmer` · `shutter` · `momentary` |
| `groupDimmerOnValue` | `100` | Schreibwert bei „alle an" (Dimmer) |
| `groupExcludeIds` | — | ausgenommene Einträge |

### Zähler veröffentlichen

| Option | Standard | |
| --- | --- | --- |
| `publishCount` | `false` | gefilterte Anzahl nach `aura.0.lists.<id>.count` schreiben |
