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
| 4 | `tools/schema/widget-schema-overlay.mjs` | Beschreibungen und Korrekturen von Hand |

Quelle 3 liest keine TypeScript-AST, sondern die wenigen Schreibweisen, in denen
Widgets ihre Optionen auswerten (`(o.k as number) || 20`, `o.k !== false`, …).
Was sie nicht sicher bestimmen kann, lässt sie weg — ein fehlender Schlüssel ist
harmloser als ein erfundener.

Zwei Fallen, die dabei umschifft werden:

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

## Prüfung

`npm run test:schema` prüft, dass das Schema genau die Typen aus `WidgetType`
abdeckt, jedes `layout` ein echtes `WidgetLayout` ist, jede `ref` auflösbar ist
und **jeder Optionsschlüssel echter Konfigurationen** (der Screenshot-Harness in
`tools/screenshots/widgets-meta.mjs`) im Schema vorkommt. Die letzte Prüfung hat
`gauge.min`, `gauge.max` und `header.title` gefunden — Einstellungen, die kein
Widget je gelesen hat.
