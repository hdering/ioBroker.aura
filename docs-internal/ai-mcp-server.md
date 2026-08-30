# MCP-Endpunkt (Beta)

> **Beta.** Über diesen Endpunkt kann ein KI-Assistent das Dashboard verändern.
> Dabei kann einiges danebengehen: Widgets an der falschen Stelle, Optionen ohne
> die gewünschte Wirkung, ein überschriebener Tab. Vor jedem Schreibvorgang wird
> nach `<namespace>.backups` gesichert — das Ergebnis trotzdem ansehen. Nicht auf
> einem System aktivieren, dessen Störung man sich nicht leisten kann.

Aura stellt unter `POST /mcp` einen MCP-Server bereit, mit dem ein KI-Assistent
das Dashboard lesen und ändern kann. Zusammen mit dem **ioBroker-MCP** — der
Räume, Gewerke und Datenpunkte kennt — lässt sich ein Dashboard erzeugen, ohne
dass jemand Datenpunktlisten in einen Prompt kopiert.

## Voraussetzung

Der **ioBroker-MCP muss ebenfalls eingerichtet sein.** Nur er liefert die
Datenpunkte — dieser Endpunkt kennt keine. Ohne ihn weiß das Modell weder, welche
Geräte es gibt, noch in welchem Raum sie stehen, und fängt an, IDs zu erfinden;
eine erfundene ID geht als String durch und ergibt ein Widget, das stumm nichts
anzeigt. Beide MCPs müssen auf dieselbe ioBroker-Installation zeigen.

Das steht an drei Stellen: in der Instanzkonfiguration, in der Kurzanleitung und
in den `instructions`, die das Modell beim Verbinden bekommt — dort mit der
Anweisung, es zu sagen und aufzuhören, statt IDs zu raten.

## Arbeitsteilung

| Frage | ioBroker-MCP | Aura |
| --- | --- | --- |
| Welche Datenpunkte, Räume, Gewerke gibt es? | ✅ | — |
| Welche Widget-Typen, welche Optionen? | — | ✅ |
| Wie sieht das Dashboard heute aus? | — | ✅ |
| Ist dieses JSON gültig? | — | ✅ |
| Ändern | — | ✅ |

Das Modell erfährt das nicht aus der Doku, sondern aus dem `instructions`-Block,
den der Server bei `initialize` mitschickt (`INSTRUCTIONS` in `lib/mcp/tools.js`).
Dort steht auch, dass beide MCPs auf **dieselbe** ioBroker-Installation zeigen
müssen — sonst baut das Modell ein Dashboard aus IDs, die hier nicht existieren.

## Einrichten

Die Instanzkonfiguration führt durch die Schritte (Kurzanleitung im Abschnitt
„KI-Zugriff (MCP) — BETA“; `staticText` rendert **kein** HTML, darum ein Eintrag
je Schritt statt einer `<ol>`):

1. Haken bei „MCP-Endpunkt aktivieren“
2. „Token erzeugen“ (Instanz muss laufen), speichern
3. Den erzeugten Block in die MCP-Konfiguration des KI-Clients übernehmen
4. Zusätzlich den ioBroker-MCP einrichten — der liefert die Datenpunkte
5. Sagen, was gebaut werden soll

Felder:

| Feld | Vorgabe | Bedeutung |
| --- | --- | --- |
| MCP-Endpunkt aktivieren | **aus** | Ohne Haken antwortet `/mcp` mit 404 |
| MCP-Token | leer | **Pflicht.** Ohne Token weist der Endpunkt jede Anfrage mit 503 ab |
| Token erzeugen | — | Knopf; erzeugt 32 Hex-Zeichen aus dem CSPRNG. Die Instanz muss laufen (`sendTo`) |
| Client-Konfiguration | leer | Wird vom Knopf mitbefüllt: der fertige `mcpServers`-Block zum Kopieren |

Der Knopf baut den Block vollständig zusammen (`lib/mcp/clientConfig.js`):

- **Basis-URL** gesetzt → sie gewinnt, ohne doppelten Schrägstrich. Nur sie kennt
  einen Reverse-Proxy oder Hostnamen.
- sonst die **geroutete Adresse**: ein UDP-Socket wird auf eine öffentliche IP
  „verbunden“ — dabei wird kein Paket gesendet, der Kernel wählt nur die
  Quelladresse. Das ist die einzige Auskunft, die stimmt, wenn mehrere private
  Adressen existieren: auf einem Rechner mit VMware sehen `192.168.171.1`
  (Host-only) und `192.168.188.235` (LAN) gleich gut aus, und die Interface-Liste
  allein wählt das falsche.
- schlägt das fehl, die Interface-Liste, private Bereiche zuerst.
- **Protokoll** aus dem tatsächlich laufenden Server (`_httpsActive`), nicht aus
  `config.secure`: scheitert HTTPS beim Start, fällt der Server auf HTTP zurück
  und die Einstellung würde lügen.
- findet sich nichts, bleibt ein sichtbares `<ioBroker-IP>` stehen — eine
  offensichtliche Lücke ist besser als ein selbstbewusst falscher Host.

Die Logik liegt bewusst im Modul und nicht in `main.js`: eine Kopie im Test wäre
für immer grün geblieben, während `main.js` davon wegdriftet.

```json
{
  "mcpServers": {
    "aura": {
      "type": "http",
      "url": "http://192.168.188.168:8095/mcp",
      "headers": { "Authorization": "Bearer <Token>" }
    }
  }
}
```

Der Port ist der von Aura selbst (Standard 8095), nicht der des Web-Adapters.

## Warum Token Pflicht ist

Auras Server hat **keine eigene Authentifizierung** — auch `/fs/read` ist offen.
Ein ungeschützter MCP-Endpunkt würde jedem im Netz die Dashboard-Konfiguration
zum Lesen und Ändern geben. Darum: aktiviert ohne Token = 503 plus Warnung im
Adapter-Log beim Start. Aktiviert und unbrauchbar ist schlimmer als aus, weil
nichts sonst in diesem Server die Anfrage abweisen würde.

Der Vergleich läuft längenunabhängig, damit ein falscher Token nichts über
Laufzeit verrät.

## Werkzeuge

| Werkzeug | Zweck |
| --- | --- |
| `aura_dashboard` | Layouts, Bereiche, Tabs, Rastermaße, Spaltenbreite |
| `aura_widget_types` | Alle Typen kompakt |
| `aura_widget_schema` | Volle Optionen der genannten Typen |
| `aura_tab` | Widgets eines Tabs inkl. `groupDefs` |
| `aura_validate` | Prüfung gegen Schema und Live-Datenpunkte |
| `aura_add_widget` | Ein Widget anfügen |
| `aura_write_tab` | Widgetliste eines Tabs ersetzen |

## Warum Validierung der eigentliche Gewinn ist

Eine falsch benannte Option ist sonst **unsichtbar**: Aura rendert das Widget und
ignoriert den Schlüssel. Hier wird daraus ein Fehler, den das Modell selbst
korrigieren kann:

```
- widget: switch liest die Option "showTitel" nicht — meintest du "showTitle"?
- widgets[2]: layout "dial" gibt es für switch nicht — erlaubt: default, card, compact, minimal, custom
- widgets[3]: Datenpunkt "hm-rpc.0.NOPE" gibt es in dieser ioBroker-Installation nicht
- widgets[1] ("a") und widgets[4] ("b") überlappen sich im Raster
```

Beide Schreibwerkzeuge validieren vorher und **schreiben bei jedem Fehler gar
nicht** — auch keine Sicherung.

## Vier Stellen, die man leicht falsch macht

**Bestehende Widgets dürfen nicht blockieren.** Ein Widget anzufügen prüft nur
das *neue* Widget streng (`strictIndices`). Sonst würde ein einziges vor drei
Versionen angelegtes Widget mit einer inzwischen umbenannten Option jeden
Schreibvorgang in einem gewachsenen Dashboard verhindern. Überlappungen und
doppelte IDs werden weiterhin über den ganzen Tab geprüft — das sind
Eigenschaften des Ergebnisses, nicht eines einzelnen Widgets.

**Gruppen-Kinder liegen in `config.group-defs`**, nicht in `config.dashboard`.
`aura_tab` sammelt die referenzierten `defId`s rekursiv ein. Beim Schreiben gehen
die Definitionen **zuerst** raus: ein Widget, das auf eine schon vorhandene
`defId` zeigt, rendert korrekt — umgekehrt zeigt die Gruppe im Zeitfenster
dazwischen leer.

**Spaltenzahl.** Das laufende Dashboard leitet sie aus der Pixelbreite ab, die
kein Server kennt. `designColumns()` nimmt das größte `x + w` über alle Tabs: die
Breite, für die dieses Dashboard bereits entworfen ist.

**Der offene Editor.** Ein Editor-Fenster mit ungespeicherten Änderungen kann eine
MCP-Änderung beim nächsten Speichern überschreiben. Die Antwort jedes
Schreibwerkzeugs sagt das dazu.

## Kein MCP-SDK

`httpEndpoint.js` spricht JSON-RPC 2.0 selbst. Das SDK hätte **95 Pakete / 24 MB**
(express, hono, jose, ajv, zod) in einen Adapter gezogen, der davon nichts
ausführt — für vier Methoden: `initialize`, `tools/list`, `tools/call`, `ping`.
Zusätzliche Laufzeit-Abhängigkeiten: **keine**. Im Adapter zu laufen heißt auch,
dass die ioBroker-Verbindung schon da ist — kein Socket-Client, keine
Zugangsdaten, kein Reconnect.

Das SDK bleibt devDependency: `npm run test:mcp` fährt den **echten** MCP-Client
über HTTP gegen den Endpunkt. Eine selbstgebaute Protokollschicht, die nur gegen
sich selbst getestet wird, beweist nichts.

## Tests

`npm run test:mcp` — 48 Checks: die Validierungsregeln gegen das echte Schema, die
Config-Helfer, Token-Abweisung (fehlend, falsch, nicht konfiguriert), der
Handshake mit dem echten Client, die `instructions`, jedes Werkzeug, und die
Schreibpfade gegen ein Adapter-Doppel — inklusive der Zusicherung, dass ein
abgelehnter Schreibvorgang nichts hinterlässt und die Sicherung den Stand **vor**
der Änderung enthält. Dazu die Token-Erzeugung: 200 Durchläufe auf Form und
Wiederholungsfreiheit, und dass ein um ein Zeichen abweichender sowie ein
gekürzter Token abgewiesen werden.
