# AURA-MCP-Server (Phase A)

Gibt einem Sprachmodell direkten Zugriff auf das Widget-Schema, die laufende
Dashboard-Struktur und eine Validierung. Zusammen mit dem **ioBroker-MCP** — der
Räume, Gewerke und Datenpunkte kennt — kann sich der Anwender ein Dashboard
zusammenstellen lassen, ohne dass jemand Datenpunktlisten in einen Prompt kopiert.

Phase A ist **rein lesend**. Kein Werkzeug schreibt ins Dashboard.

## Arbeitsteilung

| Frage | ioBroker-MCP | AURA-MCP |
| --- | --- | --- |
| Welche Datenpunkte, Räume, Gewerke gibt es? | ✅ | — |
| Welche Widget-Typen, welche Optionen? | — | ✅ |
| Wie sieht mein Dashboard heute aus? | — | ✅ |
| Ist dieses JSON gültig? | — | ✅ |

## Werkzeuge

| Werkzeug | Zweck | Braucht ioBroker |
| --- | --- | --- |
| `aura_widget_types` | Alle Typen kompakt: Label, Standardgröße, Layouts | nein |
| `aura_widget_schema` | Volle Optionen der genannten Typen + Widget-Aufbau | nein |
| `aura_dashboard` | Layouts/Bereiche/Tabs, Rastermaße, Spaltenbreite | ja |
| `aura_tab` | Die Widgets eines Tabs als JSON (inkl. `groupDefs`) | ja |
| `aura_validate` | Prüft Widget- oder Tab-JSON vor dem Import | teilweise |

Schema und Validierung laufen ohne Verbindung — eine falsche URL macht also nicht
den ganzen Server unbrauchbar, sondern nur die Werkzeuge, die live lesen müssen.

## Einrichten

```json
{
  "mcpServers": {
    "aura": {
      "command": "node",
      "args": ["C:/projects/vis/tools/mcp/server.mjs"],
      "env": {
        "AURA_IOBROKER_URL": "http://192.168.188.168:8095",
        "AURA_NAMESPACE": "aura.0"
      }
    }
  }
}
```

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `AURA_IOBROKER_URL` | `http://127.0.0.1:8095` | Adresse von **Auras eigenem Server**, nicht des Web-Adapters (8082) |
| `AURA_NAMESPACE` | `aura.0` | Adapterinstanz |
| `AURA_SCHEMA` | `public/ai/…` | Pfad zum Schema, falls der Server außerhalb des Repos läuft |
| `AURA_CONNECT_TIMEOUT` | `12000` | ms bis zum Verbindungsabbruch |

**Beide MCPs müssen auf dieselbe ioBroker-Installation zeigen.** Zeigt der
ioBroker-MCP aufs Produktivsystem und der AURA-MCP auf die Testinstanz, baut das
Modell ein Dashboard aus Produktiv-Datenpunkt-IDs, die in der Testinstanz nicht
existieren — und nichts sagt es.

## Warum Validierung der eigentliche Gewinn ist

Eine falsch benannte Option ist heute **unsichtbar**: AURA rendert das Widget und
ignoriert den Schlüssel. `aura_validate` macht daraus einen Fehler, den das Modell
selbst korrigieren kann:

```
- widget: switch liest die Option "showTitel" nicht — meintest du "showTitle"?
- widgets[2]: layout "dial" gibt es für switch nicht — erlaubt: default, card, compact, minimal, custom
- widgets[3]: Datenpunkt "hm-rpc.0.NOPE" gibt es in dieser ioBroker-Installation nicht
- widgets[1] ("a") und widgets[4] ("b") überlappen sich im Raster
```

Geprüft werden: Pflichtfelder, Typ, Layout, `gridPos` (ganzzahlig, positiv, innerhalb
der Spaltenzahl), unbekannte Optionen mit Vorschlag, Enum-Werte, Werttypen,
Datenpunkt-Existenz (auch für Optionen mit `[Datenpunkt-Id]`), doppelte IDs und
Überlappungen.

## Zwei Stellen, die man leicht falsch macht

**Spaltenzahl.** Das laufende Dashboard leitet sie aus der Pixelbreite ab — die
kennt kein Server. `designColumns()` nimmt stattdessen das größte `x + w` über alle
Tabs: die Breite, für die dieses Dashboard bereits entworfen ist.

**Gruppen-Kinder.** Sie liegen in `config.group-defs`, nicht in `config.dashboard`.
`aura_tab` sammelt die referenzierten `defId`s rekursiv ein und legt sie als
`groupDefs` neben den Tab — ohne das käme eine Gruppe leer zurück.

## stdout gehört dem Protokoll

Ein stdio-MCP-Server spricht JSON-RPC über stdout. Ein einziges `console.log` einer
Abhängigkeit landet mitten in einem Frame und der Client bricht ab.
`tools/mcp/stdio-guard.mjs` wird als Erstes importiert und leitet `console.log` und
Verwandte auf stderr um.

## Tests

| Befehl | Was |
| --- | --- |
| `npm run test:mcp` | 22 Checks der Validierungsregeln und Config-Helfer, ohne ioBroker |
| `npm run test:mcp-server` | 11 Checks über einen echten stdio-Transport: Werkzeugliste, Ergebnisse, Fehlerpfade |

## Phase B (offen)

Schreiben — `aura_add_widget`, `aura_replace_tab`. Dafür fehlt noch: Backup vor
dem Schreiben, atomares Schreiben über `config.dashboard` **und**
`config.group-defs`, und eine Antwort auf den Fall, dass gleichzeitig ein Editor im
Browser offen ist (der schiebt sonst seine eingefrorene Kopie zurück).
