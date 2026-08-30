# KI-Widget-Schema

Maschinenlesbare Beschreibung aller Widget-Typen, damit ein Sprachmodell eine
gültige Widget-/Tab-JSON für den vorhandenen Import-Dialog erzeugen kann, ohne
den Quelltext zu lesen.

## Erzeugen

| Befehl | Wirkung |
| --- | --- |
| `npm run schema` | Schreibt `public/ai/aura-widget-schema.json` neu |
| `npm run schema -- --report` | Zusätzlich: Optionen ohne Beschreibung, nach Widget |
| `npm run schema:check` | Bricht ab, wenn die eingecheckte Datei veraltet ist |
| `npm run test:schema` | Prüft Abdeckung, Konsistenz und echte Konfigurationen |

Die Datei ist eingecheckt und wandert über `public/` in den Build, ist also
unter `<aura>/ai/aura-widget-schema.json` abrufbar.

## Aufbau

| Block | Inhalt |
| --- | --- |
| `$meta` | Version, Zweck, Anwendungshinweise |
| `widgetConfig` | Die Pflichtfelder eines Widgets (id, type, title, datapoint, gridPos …) |
| `groups` | Gruppierung der Typen im Widget-Auswahldialog |
| `commonOptions` | Optionen, die ≥ 6 Widgets teilen — einmal definiert statt 55-mal wiederholt |
| `types` | Aufgelöste benannte Typen, auf die Optionen per `ref` zeigen |
| `widgets.<typ>` | Label, Standardgröße, `layouts`, `conditionSlots`, `commonOptions`-Liste, eigene `options` |

Eine Option mit `"datapoint": true` muss eine existierende ioBroker-State-Id
sein. Fehlt `description`, ist der Schlüssel nur über Name, Typ und Vorgabewert
dokumentiert.

## Quellen

| Rang | Quelle | Was daraus kommt |
| --- | --- | --- |
| 1 | `widgetRegistry.tsx`, `utils/widgetLayouts.ts` | Wird mit esbuild gebündelt und **ausgeführt** — Label, Standardgröße, Layoutliste können nicht abweichen |
| 2 | Benannte Options-Interfaces (`StatusOverviewOptions`, `AutoListOptions` …) | Feldtypen und JSDoc wörtlich |
| 3 | Die Options-Zugriffe in der Widget-Komponente | Schlüssel, Typ und Vorgabewert aus festen Schreibweisen |
| 4 | `UNIVERSAL_OPTIONS` im Overlay | Optionen, die **jedes** Widget hat |
| 5 | `tools/schema/widget-schema-overlay.mjs` | Beschreibungen und Korrekturen von Hand |

Quelle 3 liest keine TypeScript-AST, sondern die wenigen Schreibweisen, in denen
Widgets ihre Optionen auswerten (`(o.k as number) || 20`, `o.k !== false`, …).
Was sie nicht sicher bestimmen kann, lässt sie weg — ein fehlender Schlüssel ist
harmloser als ein erfundener.

**Übergreifende Optionen fehlten zunächst ganz.** `conditions`, `badges`,
`clickAction`, `transparent`, `transparency` und `styleOverride` liest nicht das
Widget, sondern der Wrapper `WidgetFrame` — und der liegt in
`components/layout/`, wo der Leser nicht hinschaut. Die Folge war handfest: das
Schema wies `transparent` nur bei den sieben Widgets aus, die es zusätzlich selbst
lesen, und ein Modell schloss daraus „nur Gruppe und Panels können transparent
sein". Bedingungen, Marker und Klick-Aktionen fehlten komplett. Sie stehen jetzt
als `UNIVERSAL_OPTIONS` im Overlay und gelten für alle 55 Typen.

`npm run test:schema` prüft beides: dass jeder dieser Schlüssel im Schema bei
jedem Widget steht **und** dass `WidgetFrame` ihn tatsächlich noch liest — als
ganzes Wort, denn ein `includes()` hätte auch `conditionsRenamed` durchgehen
lassen.

Zwei weitere Fallen, die umschifft werden:

- **Alias-Shadowing.** Widgets binden ihre Optionen an ein einbuchstabiges `o`,
  und `o` ist zugleich der beliebteste Arrow-Parameter (`.filter((o) => …)`). Der
  Leser bestimmt darum je Zugriff die nächstliegende vorangehende Bindung; nur
  Zugriffe auf die Options-Bindung zählen. Ohne das landete `Power` als Option am
  evcc-Widget.
- **Dispatcher.** `widgetMap.ts` und `popup/` rendern *fremde* Widget-Configs.
  Wer ihnen folgt, hängt jede Option jedes Widgets an das Spiegel- bzw.
  Karussell-Widget. Sie werden beim Verfolgen der Importe ausgelassen.

## Overlay pflegen

`tools/schema/widget-schema-overlay.mjs` ist die einzige handgeschriebene Datei.

| Export | Zweck |
| --- | --- |
| `KEY_DESCRIPTIONS` | Text je Schlüsselname, gilt in jedem Widget mit diesem Schlüssel |
| `WIDGET_OPTION_NOTES` | Text/`enum` je Widget, schlägt `KEY_DESCRIPTIONS` |
| `EXTRA_OPTIONS` | Schlüssel, die der Leser nicht sehen kann (z. B. `defId` bei Gruppe/Panels) |
| `DROP_KEYS` | Fehllesungen aussortieren |

Der Generator warnt bei Notizen, deren Schlüssel es nicht mehr gibt. Bei doppelten
Widget-Schlüsseln im selben Objekt gewinnt der letzte — die Blöcke müssen
zusammengeführt werden, nicht angehängt.

## Prompt-Dialog

Im Dialog „Widget importieren" liegt oben rechts die Schaltfläche **KI-Prompt**
(`AiPromptDialog.tsx`). Sie baut einen Text zum Einfügen in ChatGPT, Claude o. Ä.;
die Antwort kommt als JSON zurück und wird im selben Dialog eingefügt.

| Abschnitt des Prompts | Inhalt |
| --- | --- |
| Aufgabe | Freitext des Nutzers |
| Ausgabe | Das erwartete JSON — einzelnes Widget oder `aura-tab`-Hülle |
| Aufbau eines Widgets | `widgetConfig` aus dem Schema |
| Regeln | Spaltenzahl, Rastermaße, keine Überlappung, keine erfundenen Datenpunkte |
| Verfügbare Widget-Typen | Alle Typen kompakt: Label, Standardgröße, Layouts, Hinweis |
| Optionen der gewählten Typen | Volle Optionsliste je ausgewähltem Typ, inkl. geteilter Optionen |
| Verwendete Typen | Nur die benannten Typen, auf die diese Optionen zeigen |
| Datenpunkte | Nach Raum/Gewerk/Suche gefiltert, gedeckelt auf 400 Zeilen |
| Aktueller Tab | Optional, als Vorlage für Stil und Größen |

Größe ist die bestimmende Einschränkung: das volle Schema hat ~280 KB, ein
ioBroker-Objektbaum ein Vielfaches davon. Darum stehen alle Typen nur kompakt
drin, volle Optionen nur für die ausgewählten, und ohne Raum-, Gewerk- oder
Suchfilter kommen **gar keine** Datenpunkte in den Prompt. Eine typische Auswahl
(zwei Typen, eine Handvoll Datenpunkte) liegt bei ~4k Token.

Die **Spaltenzahl** ist der Wert, bei dem ein Fehler am teuersten wäre: sie ist
nicht fest, sondern folgt der Rasterbreite. `currentCols()` misst darum das echte
`.react-grid-layout` im DOM und fällt nur auf das Fenster zurück.

Die Logik steht in `src-vis/utils/aiPrompt.ts` — reine Funktionen, geprüft von
`npm run test:ai-prompt` (esbuild-Bundle, kein Dev-Server).

## Prüfung

`npm run test:schema` prüft, dass das Schema genau die Typen aus `WidgetType`
abdeckt, jedes `layout` ein echtes `WidgetLayout` ist, jede `ref` auflösbar ist
und **jeder Optionsschlüssel echter Konfigurationen** (der Screenshot-Harness in
`tools/screenshots/widgets-meta.mjs`) im Schema vorkommt. Die letzte Prüfung hat
`gauge.min`, `gauge.max` und `header.title` gefunden — Einstellungen, die kein
Widget je gelesen hat.
