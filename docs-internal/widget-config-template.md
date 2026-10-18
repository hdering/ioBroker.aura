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
| `SettingsSection` | dto. | „Einstellungen“ für Typen ohne eigene Abschnitte (eingeklappt); reicht bei gegliederten Typen nur durch |
| `VisibleFieldsSection` | `config/VisibleFieldsSection.tsx` | „Sichtbare Felder“, eingeklappt mit Zähler `n/m` |
| `ToggleRow` | dto. | die eine Schalter-Zeile; `visKey` → `data-aura-vis-key` |
| `VIS_FIELDS_PER_TYPE` | `WidgetFrame.tsx` | Schalter ohne eigene Logik (`VisibleField`: auch `hint`, `invert`); der generische Block rendert sie |
| `SECTIONED_EDIT_TYPES` | `WidgetFrame.tsx` | Typen mit eigenen Abschnitten; Farbschwellen werden dort ein eigener Abschnitt |
| `NO_MAIN_DP_TYPES` | `WidgetFrame.tsx` | Typen ohne Haupt-Datenpunkt-Feld |
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
| Abschnitte | alle beim Öffnen zu, ohne Ausnahme; Typ ohne eigene Abschnitte → ein eingeklappter Abschnitt „Einstellungen“ (`SettingsSection`) |
| Nichts Loses | jedes Feld steht in einem Abschnitt; einzelne Felder wie ein Aktiv-DP gehören in den passendsten Abschnitt |
| Abstände | Abschnitte setzen keinen eigenen Außenabstand, der Dialog gibt ihn vor |
| Eigene Abschnitte | Typ in `SECTIONED_EDIT_TYPES` eintragen, sobald er eigene `ConfigSection`s rendert – sonst landen sie verschachtelt in „Einstellungen“ (Strukturtest prüft das) |
| Auf/Zu merken | nein |
| Abstand | Schalter-Zeilen in „Sichtbare Felder“ kompakt (`space-y-1`) |
| Zusätzliche Schalter mit Logik | im generischen Block über `fields.push(…)` (Bedingung `hidden`, Hinweis, Unteroption) – nicht im Typ-Block |

## Test

| Was | Wie |
|---|---|
| Struktur | `AURA_BASE=… npm run test:edit-dialog-structure` – neuen Typ mit Schaltern in `VISIBLE` eintragen, gegliederten Typ zusätzlich in `SECTIONED`. Prüft Reihenfolge, „alles zu“, gleiche Abstände, nichts Loses, nichts Verschachteltes. |
| Andere Dialog-Tests | Felder liegen eingeklappt: nach dem Harness-Start `await page.evaluate(() => window.__auraShot.unfoldSections())` – oder gezielt `details[data-aura-config-section="…"] > summary` klicken. Tests, die selbst auf Überschriften klicken, nicht mit `unfoldSections` mischen. |
| Schalter finden | `[data-aura-vis-key="<option>"] button[role="switch"]`, Zustand über `aria-checked` |
