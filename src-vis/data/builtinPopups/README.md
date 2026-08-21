# Built-in Popup Views

Jede `*.json` in diesem Ordner wird zur Build-Zeit via `import.meta.glob`
in `BUILTIN_VIEWS` (siehe `src-vis/store/popupConfigStore.ts`) eingelesen.

## Status: ausgelaufen

Neue Installationen bekommen nur noch die IDs aus `ALWAYS_SEEDED_VIEW_IDS`
(derzeit `pv-builtin-datapoint`, der Fallback fuer Listenzeilen im
Automatik-Modus). Die typ-spezifischen Views und `BUILTIN_TYPE_DEFAULTS` sind
Altlast: sie bleiben fuer Installationen erhalten, die sie schon haben, werden
aber nirgends neu eingerichtet. Eine neue JSON hier anzulegen bringt also
nichts, solange sie nicht in `ALWAYS_SEEDED_VIEW_IDS` steht — Standard-Popups
fuer einen Widget-Typ gehoeren in die Admin-Konfiguration, nicht ins Bundle.

Bestandsinstallationen koennen ihre ungenutzten Standard-Views unter
Admin -> Popups entfernen; der Nutzungs-Scan dazu liegt in
`src-vis/utils/builtinPopupUsage.ts`.

## Workflow: Standard-Popup ändern

1. Im Admin-UI (`Popups` → "Bearbeiten" auf einem Built-in) die View anpassen.
2. **Export** klicken → JSON-Datei laden.
3. `version` in der JSON bumpen (z.B. `1` → `2`).
4. Datei hier ablegen (überschreibt die alte).
5. Adapter-Version bumpen + Release.

Auf allen Installs prüft `ensureBuiltins()` beim nächsten Rehydrate die
persistierte Version gegen die Code-Version. Niedrigere persistierte Versionen
werden komplett ersetzt — ausser die View traegt `userEdited`: eine vom Nutzer
angepasste View behaelt ihren Inhalt und bekommt nur den Versions-Marker
hochgezogen. Den ausgelieferten Stand holt dann nur noch der "Werkszustand"-Button.

## Workflow: Neuen Standard-Popup anlegen

1. Custom-View im Admin bauen → exportieren.
2. JSON öffnen und Felder anpassen:
    - `id`: `pv-builtin-<name>` (z.B. `pv-builtin-airco`)
    - `name`: z.B. `"Standard: Klimaanlage"`
    - `version`: `1`
3. Als `src-vis/data/builtinPopups/<name>.json` ablegen.
4. Damit die View ueberhaupt ausgeliefert wird, ihre ID in
   `ALWAYS_SEEDED_VIEW_IDS` (popupConfigStore.ts) aufnehmen. `BUILTIN_TYPE_DEFAULTS`
   ist ausgelaufen und bekommt keine neuen Eintraege.
