# Built-in Popup Views

Jede `*.json` in diesem Ordner wird zur Build-Zeit via `import.meta.glob`
in `BUILTIN_VIEWS` (siehe `src-vis/store/popupConfigStore.ts`) eingelesen.

## Workflow: Standard-Popup ändern

1. Im Admin-UI (`Popups` → "Bearbeiten" auf einem Built-in) die View anpassen.
2. **Export** klicken → JSON-Datei laden.
3. `version` in der JSON bumpen (z.B. `1` → `2`).
4. Datei hier ablegen (überschreibt die alte).
5. Adapter-Version bumpen + Release.

Auf allen Installs prüft `ensureBuiltins()` beim nächsten Rehydrate die
persistierte Version gegen die Code-Version. Niedrigere persistierte
Versionen werden komplett ersetzt — lokale Anpassungen gehen verloren
(per Entscheidung "Code wins").

## Workflow: Neuen Standard-Popup anlegen

1. Custom-View im Admin bauen → exportieren.
2. JSON öffnen und Felder anpassen:
    - `id`: `pv-builtin-<name>` (z.B. `pv-builtin-airco`)
    - `name`: z.B. `"Standard: Klimaanlage"`
    - `version`: `1`
3. Als `src-vis/data/builtinPopups/<name>.json` ablegen.
4. Optional: in `BUILTIN_TYPE_DEFAULTS` (popupConfigStore.ts) einen Mapping-Eintrag
   ergänzen, damit Widgets dieses Typs automatisch das Popup verwenden.
