# Widget-Bearbeiten-Dialog – Vorlage

Gilt für jeden Widget-Typ im Bearbeiten-Dialog (`src-vis/components/layout/WidgetFrame.tsx`) und damit auch für
Popup-Ansichten (`PopupViewEditor` rendert denselben Dialog).

## Reihenfolge

```
Name · Widget-Typ · Layout
▸ Darstellung              allgemein, eingeklappt
▸ Erweitert                allgemein, eingeklappt
[Gruppenaktion / Gruppe]
┃ TYP-LABEL
┃ ▸ Sichtbare Felder       erster Abschnitt, sobald der Typ Ein-/Ausblenden-Schalter hat
┃ ▸ Datenpunkte            bzw. Datenquelle
┃ ▸ <Thema> …              Skala, Farbzonen, Schnellwahl, Lamellen, Vorhersage …
┃ ▸ Optik                  Größen, Farben, Stil – nicht „Darstellung“ (Namenskollision)
┃ ▸ Verhalten              Bestätigung, Schreibschutz, sendOnRelease, Rechte (allow*)
┃ [Farbschwellen]
┃ ▸ Status-Datenpunkte     immer letzter Abschnitt (test:status-items)
```

## Bausteine

| Baustein | Datei | Zweck |
|---|---|---|
| `ConfigSection` | `config/ConfigSection.tsx` | einklappbarer Abschnitt, startet zu; `sectionKey` → `data-aura-config-section` |
| `FlatSection` | dto. | gleiche Überschrift, nicht einklappbar (kurze Typen) |
| `VisibleFieldsSection` | `config/VisibleFieldsSection.tsx` | „Sichtbare Felder“; einklappbar mit Zähler `n/m` oder flach |
| `ToggleRow` | dto. | die eine Schalter-Zeile; `visKey` → `data-aura-vis-key` |
| `VIS_FIELDS_PER_TYPE` | `WidgetFrame.tsx` | Schalter ohne eigene Logik (`VisibleField`: auch `hint`, `invert`); der generische Block rendert sie |
| `SECTIONED_EDIT_TYPES` | `WidgetFrame.tsx` | Typen mit eingeklappten Abschnitten – ihre „Sichtbare Felder“ und Farbschwellen klappen mit ein; ohne Eintrag folgt auf die Schalter die Überschrift „Einstellungen“ |
| `renderMainDpField()` | `WidgetFrame.tsx` | Haupt-Datenpunkt; flache Typen bekommen ihn an der alten Stelle, gegliederte rufen ihn in ihrem Abschnitt „Datenpunkte“ auf – eigene Config-Komponenten (Slider, JSON-Tabelle) bekommen ihn als Prop `mainDpField` |
| `SECTION_TITLE_CLS` | `config/ConfigSection.tsx` | eine Überschrift für alle Abschnitte, auch „Darstellung“, „Erweitert“, „Status-Datenpunkte“ |

## Regeln

| Regel | Festlegung |
|---|---|
| Sichtbare Felder | nur Schalter, die ein Element des Widgets im Frontend ein-/ausblenden |
| Nicht dort | Verhalten, Stil, Daten-Filter, Rechte → „Verhalten“ bzw. „Optik“ |
| Unteroptionen | klein (≤ 2 Bedienelemente) → eingerückt unter dem Schalter (`children`/`extra`); größer → im Themen-Abschnitt |
| Bedingte Schalter | Bedingung bleiben (`hidden`); ohne sichtbaren Schalter entfällt der Abschnitt |
| Invertierte Optionen | positiv beschriften, `invert: true` – gespeichert wird wie bisher |
| Abschnitte | ab ≥ 12 Einstellungen oder ≥ 3 Themengruppen; dann sind beim Öffnen alle zu |
| Flache Typen | „Sichtbare Felder“ → „Einstellungen“ → ggf. „Verhalten“, alles `FlatSection` (nicht einklappbar) |
| Auf/Zu merken | nein |
| Abstand | Schalter-Zeilen in „Sichtbare Felder“ kompakt (`space-y-1`) |
| Zusätzliche Schalter mit Logik | im generischen Block über `fields.push(…)` (Bedingung `hidden`, Hinweis, Unteroption) – nicht im Typ-Block |

## Test

`node tools/tests/edit-dialog-structure.mjs` – neuen Typ mit Schaltern in `VISIBLE` eintragen, abschnittsweise
gegliederten Typ zusätzlich in `FOLDED`.
