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
| Was die KI darf | **Nur lesen** | `read` → `write` → `rename` → `delete`, jede Stufe schließt die vorherigen ein |
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

**Der Token steht in `protectedNative`.** Das Passwortfeld in der Konfiguration
verdeckt nur die Eingabe — am gespeicherten Wert ändert es nichts. Ohne
`protectedNative` läge der Token im `native` des Instanzobjekts, und das liest das
Frontend bei jedem Start (`App.tsx` holt `system.adapter.aura.*`): jeder Browser im
Netz bekäme ihn im Klartext. `mcpClientConfig` gehört genauso dazu — der Block
enthält denselben Token ein zweites Mal.

Das Feld „Client-Konfiguration" zeigt den Token **nur direkt nach dem Erzeugen** im
Klartext — genau dann wird er kopiert. Beim nächsten Adapterstart ersetzt
`maskClientConfig()` ihn durch einen Platzhalter (`extendForeignObject` auf das
eigene Instanzobjekt, im selben Block wie die `localLinks`-Pflege). Danach ist er
beim Öffnen der Seite nicht mehr lesbar, die URL bleibt aber korrekt.

Das räumt nebenbei ein zweites Problem ab: ein von Hand geänderter Token machte
den gespeicherten Block still falsch. Ohne Token im Block kann er nicht mehr
veralten. Das Maskieren ist idempotent — `maskClientConfig` liefert `null`, wenn
nichts zu tun ist, sonst schriebe der Adapter sein Instanzobjekt bei jedem Start
neu und würde sich selbst im Kreis neu starten.

## Berechtigungsstufen

Eskalierend, nicht unabhängig — die Reihenfolge folgt daran, wie schwer ein Fehler
rückgängig zu machen ist: Inhalt lässt sich aus der Sicherung neu schreiben, ein
Umbenennen zerstört keine Struktur, ein Löschen nimmt die Widgets mit. Vorgabe ist
`read`, MCP einzuschalten gewährt also zunächst gar nichts.

Werkzeuge oberhalb der Stufe erscheinen **gar nicht erst** in `tools/list` — ein
Werkzeug anzubieten und dann abzulehnen kostet eine Runde und lässt das Modell
rätseln. Die Prüfung sitzt trotzdem zusätzlich am Aufruf, weil ein Client eine
ältere Liste zwischengespeichert haben kann.

Die Stufe steht auch in den `instructions`: das Modell weiß beim Verbinden, was es
darf, und plant nichts, was es hinterher nicht ausführen kann. Auf `read` wird es
angewiesen, das JSON zum manuellen Import anzubieten.

| Werkzeug | Zweck | Stufe |
| --- | --- | --- |
| `aura_dashboard` | Layouts, Bereiche, Tabs, Rastermaße, Spaltenbreite | read |
| `aura_widget_types` | Alle Typen kompakt | read |
| `aura_widget_schema` | Volle Optionen der genannten Typen | read |
| `aura_tab` | Widgets eines Tabs inkl. `groupDefs` | read |
| `aura_validate` | Prüfung gegen Schema und Live-Datenpunkte | read |
| `aura_add_widget` | Ein Widget anfügen | write |
| `aura_write_tab` | Widgetliste eines Tabs ersetzen | write |
| `aura_create_tab` | Neuen Tab anlegen, leer oder gefüllt | write |
| `aura_create_section` | Neuen Bereich (Menüeintrag) anlegen, mit einem Start-Tab | write |
| `aura_create_layout` | Neues Layout mit eigener URL anlegen, mit Bereich und Tab | write |
| `aura_popups` / `aura_popup` | Popup-Ansichten auflisten / eine lesen | read |
| `aura_write_popup` | Popup-Widgets ersetzen oder Ansicht anlegen (`create:true`) | write |
| `aura_group` / `aura_write_group` | Kinder einer Gruppe/Panels/Universal lesen bzw. ersetzen | read/write |
| `aura_update_widget` | Ein einzelnes Widget ändern — im Tab oder (mit `defId`) in einer Gruppe | write |
| `aura_update_node` | Eigenschaften von Layout, Bereich oder Tab-Button: Icon, ausgeblendet, Marker, Aggregat-Anzahl, Bedingungen | write |
| `aura_rename` | Layout, Bereich, Tab oder Popup umbenennen — der Slug bleibt | rename |
| `aura_delete` | Widget, Tab, Bereich, Layout oder Popup löschen | delete |

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

Alle Schreibwerkzeuge validieren vorher und **schreiben bei jedem Fehler gar
nicht** — auch keine Sicherung.

## Zwölf Stellen, die man leicht falsch macht

**Eingebaute Popups.** Wird eine mitgelieferte Ansicht geändert, muss
`userEdited: true` gesetzt werden — sonst verwirft `ensureBuiltins()` die Änderung
beim nächsten Frontend-Start. Der Schreibpfad setzt das Flag bei **jeder**
Ansicht: bei eigenen ist es bedeutungslos, bei eingebauten rettet es die Arbeit.

**Der Rest des Popup-States.** `typeDefaults` und `deletedBuiltinIds` liegen im
selben State wie die Views. Der Schreibpfad liest die Hülle zurück und ersetzt nur
`views`, statt sie neu zu bauen.

**Bereich beim Tab-Anlegen.** Gibt es mehr als einen, wird nachgefragt statt
geraten — ein Tab im falschen Bereich fällt erst auf, wenn jemand ihn sucht. Das
gilt genauso für `aura_create_section` und das Ziel-Layout. Slugs werden wie im
Frontend eindeutig gemacht und transliteriert (`garten`, `garten-2`, `kueche`).

**Leere Hüllen.** Ein neues Layout bekommt einen Bereich und einen Tab, ein neuer
Bereich einen Tab — genau wie im Editor. Ein Bereich ohne Tabs hat nichts
anzuzeigen und keine `activeTabId`, auf die er zeigen könnte.

**Ein Widget ändern verliert sonst Optionen.** `aura_update_widget` **merged**
statt zu ersetzen: `options` werden Schlüssel für Schlüssel zusammengeführt, ein
auf `null` gesetzter Schlüssel wird entfernt. Würde der Patch das Widget ersetzen,
wäre der wahrscheinlichste Fehler, dass das Modell eine Option vergisst, die es
gar nicht ändern wollte. `replace: true` schaltet das bewusst ab.

Die **id darf sich dabei nicht ändern** — sonst zeigen Verweise ins Leere.

**Umbenennen darf den Slug nicht anfassen.** Der Slug steht in URLs und in den
Navigations-Datenpunkten, die der Adapter veröffentlicht. Das Frontend lässt ihn
beim Umbenennen ebenfalls stehen; hier genauso, und die Antwort sagt es dazu.

**Löschen hat Untergrenzen.** Das letzte Layout und der einzige Bereich eines
Layouts bleiben; ein Bereich ohne Tabs bekommt einen neuen. Das Frontend lehnt
still ab — hier ist es ein Fehler, denn wer löschen wollte, sollte erfahren, dass
nichts passiert ist.

**Nicht jeder Navigationsknoten kann alles.** Nur der **Tab-Button** trägt
`conditions`; der Bereichsmenü-Eintrag hat `badges` und `badgeAggregate`, aber
keine Bedingungen, und ein Layout hat weder das eine noch das andere.
`NODE_FIELDS` hält das je Art fest, und ein Feld, das die Art nicht kennt, wird
mit der Liste der erlaubten abgelehnt — sonst läge es gespeichert im Objekt und
würde stumm ignoriert.

**Umbenennen führt nicht durch die Hintertür.** `aura_update_node` nimmt `name`
nicht an. Täte es das, könnte die Stufe `write` die Stufe `rename` umgehen.

**Popup- und Gruppen-Raster.** Beide haben ihr eigenes Raster, deshalb gilt dort
die Spaltengrenze des Dashboards **nicht** — sie wird für diese Werkzeuge
weggelassen.

## Vier weitere Stellen

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

`npm run test:mcp` — 118 Checks: die Validierungsregeln gegen das echte Schema, die
Config-Helfer, Token-Abweisung (fehlend, falsch, nicht konfiguriert), der
Handshake mit dem echten Client, die `instructions`, jedes Werkzeug, und die
Schreibpfade gegen ein Adapter-Doppel — inklusive der Zusicherung, dass ein
abgelehnter Schreibvorgang nichts hinterlässt und die Sicherung den Stand **vor**
der Änderung enthält. Dazu die Token-Erzeugung: 200 Durchläufe auf Form und
Wiederholungsfreiheit, und dass ein um ein Zeichen abweichender sowie ein
gekürzter Token abgewiesen werden.
