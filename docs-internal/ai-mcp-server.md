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

| Frage                                       | ioBroker-MCP | Aura |
| ------------------------------------------- | ------------ | ---- |
| Welche Datenpunkte, Räume, Gewerke gibt es? | ✅           | —    |
| Welche Widget-Typen, welche Optionen?       | —            | ✅   |
| Wie sieht das Dashboard heute aus?          | —            | ✅   |
| Ist dieses JSON gültig?                     | —            | ✅   |
| Ändern                                      | —            | ✅   |

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

| Feld                    | Vorgabe       | Bedeutung                                                                        |
| ----------------------- | ------------- | -------------------------------------------------------------------------------- |
| MCP-Endpunkt aktivieren | **aus**       | Ohne Haken antwortet `/mcp` mit 404                                              |
| MCP-Token               | leer          | **Pflicht.** Ohne Token weist der Endpunkt jede Anfrage mit 503 ab               |
| Was die KI darf         | **Nur lesen** | `read` → `write` → `rename` → `delete`, jede Stufe schließt die vorherigen ein   |
| Token erzeugen          | —             | Knopf; erzeugt 32 Hex-Zeichen aus dem CSPRNG. Die Instanz muss laufen (`sendTo`) |
| Client-Konfiguration    | leer          | Wird vom Knopf mitbefüllt: der fertige `mcpServers`-Block zum Kopieren           |

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

| Werkzeug                              | Zweck                                                                                                          | Stufe        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| `aura_dashboard`                      | Layouts, Bereiche, Tabs, Rastermaße, Spaltenbreite                                                             | read         |
| `aura_widget_types`                   | Alle Typen kompakt, mit `group=` auf eine Kategorie eingegrenzt                                                | read         |
| `aura_widget_schema`                  | Optionen der genannten Typen, mit `brief=true` nur Namen und Typen                                             | read         |
| `aura_tab`                            | Widgets eines Tabs inkl. `groupDefs`                                                                           | read         |
| `aura_validate`                       | Prüfung gegen Schema und Live-Datenpunkte                                                                      | read         |
| `aura_add_widget`                     | Ein Widget an Tab, Popup oder Gruppe anfügen                                                                   | write        |
| `aura_write_tab`                      | Widgetliste eines Tabs ersetzen                                                                                | write        |
| `aura_create_tab`                     | Neuen Tab anlegen, leer oder gefüllt                                                                           | write        |
| `aura_create_section`                 | Neuen Bereich (Menüeintrag) anlegen, mit einem Start-Tab                                                       | write        |
| `aura_create_layout`                  | Neues Layout mit eigener URL anlegen, mit Bereich und Tab                                                      | write        |
| `aura_popups` / `aura_popup`          | Popup-Ansichten auflisten / eine lesen                                                                         | read         |
| `aura_write_popup`                    | Popup-Widgets ersetzen oder Ansicht anlegen (`create:true`)                                                    | write        |
| `aura_group` / `aura_write_group`     | Kinder einer Gruppe/Panels/Universal lesen bzw. ersetzen                                                       | read/write   |
| `aura_update_widget`                  | Ein einzelnes Widget ändern — im Tab, im Popup oder in einer Gruppe                                            | write        |
| `aura_update_node`                    | Eigenschaften von Layout, Bereich oder Tab-Button: Icon, ausgeblendet, Marker, Aggregat-Anzahl, Bedingungen    | write        |
| `aura_find`                           | Widgets nach Datenpunkt, Typ oder Titel finden — über Tabs, Gruppen und Popups, inkl. Datenpunkten in Optionen | read         |
| `aura_copy_node`                      | Tab, Bereich, Layout oder Popup kopieren bzw. verschieben (`mode:"move"`)                                      | write        |
| `aura_reorder`                        | Layouts, Bereiche oder Tabs neu sortieren — die Reihenfolge muss vollständig sein                              | write        |
| `aura_copy_widget`                    | Ein Widget in einen anderen Tab kopieren oder verschieben (`mode:"move"`)                                      | write        |
| `aura_presets` / `aura_insert_preset` | Widget-Vorlagen auflisten / eine einfügen                                                                      | read / write |
| `aura_save_preset`                    | Ein vorhandenes Widget als Vorlage sichern                                                                     | write        |
| `aura_rename`                         | Layout, Bereich, Tab, Popup oder Vorlage umbenennen — der Slug bleibt                                          | rename       |
| `aura_delete`                         | Widget, Tab, Bereich, Layout, Popup oder Vorlage löschen                                                       | delete       |
| `aura_backups` / `aura_restore`       | Sicherungen auflisten / eine zurückspielen                                                                     | read / write |

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

## Warum Rezepte danebenstehen

Validierung sagt, was **erlaubt** ist. Nichts sagte, was **gut** ist — und das
Ergebnis war reproduzierbar: `autolist` dokumentiert 115 Optionen, alphabetisch,
ohne Gewichtung und ohne ein einziges Beispiel. Ein Modell füllt darin die
Pflichtfelder und hört auf. Ganze Räume kamen als Reihe nackter `value`-Kacheln
heraus, während Bedingungen, Farbschwellen, Zweitzeilen und die Zeilen-
Darstellungen der Listen ungenutzt im Schema lagen.

`lib/mcp/recipes.js` hält deshalb fertige, gültige Widgets: Raumliste,
gemischte Gerätliste, Wertkachel mit Schwellen und Bedingung, Verbrauchsbalken,
Zwei-Achsen-Verlauf, Statusübersicht, Thermostat-Rundskala, Füllstand und ein
kompletter Raum-Tab. Jedes Rezept sagt dazu, **wofür** es gedacht ist und
**welche billigere Bauweise** es ersetzt — das ist der Teil, der die Wahl
verschiebt. `aura_recipes` ohne `id` listet sie, mit `id` kommt das vollständige
JSON.

Zwei Entscheidungen dazu:

- **Datenpunkt-Ids sind `%…%`-Platzhalter.** Ein Rezept mit plausibel aussehenden
  echten Ids wird wörtlich geschrieben — genau der Fehler, vor dem die
  `instructions` warnen. Ein Platzhalter kann nicht für eine Id gehalten werden,
  und `aura_validate` benennt ihn, wenn einer überlebt. Bei der statischen Liste
  **ist** `entries[].id` der Datenpunkt; ein eigenes `datapoint`-Feld gibt es je
  Zeile nicht.
- **Der Test validiert jedes Rezept gegen das echte Schema.** Beispiele werden
  kopiert; eines mit einem Tippfehler lehrt den Fehler jedem Modell, das es liest.
  Wird eine Option umbenannt, muss das hier auffallen und nicht im Dashboard eines
  Nutzers.

In den `instructions` steht der Schritt vor der Schemaabfrage, zusammen mit dem
Hinweis, einen vorhandenen Tab per `aura_tab` als Stilvorlage zu lesen: das eigene
Dashboard des Nutzers ist die bessere Vorlage als jede mitgelieferte.

## Der Rückblick auf das, was schon da ist

Rezepte helfen beim Bauen. Für die Tabs, die es längst gibt, tun sie nichts — und
genau dort sieht man das Problem: die Kachelreihe je Raum, Zahlen ohne guten und
schlechten Bereich, der Zähler als Rohwert. Ein Modell sieht die gerenderte Seite
nicht und kann davon nichts von selbst bemerken.

`aura_review` (`lib/mcp/review.js`) macht aus der Konfiguration Befunde:
Kachelreihe ab fünf Einzelwert-Widgets, Kontaktkacheln ohne Statusübersicht,
Zahl ohne `colorThresholds`/`conditions`/`badges`, Zählerstand statt Verbrauch
(erkannt an Einheit **oder** Id), Balkenreihe ohne `aggregate`, Thermostat ohne
`actualDatapoint`, Liste ohne Zeilenregeln und Zweitzeile, und — nur wenn sonst
nichts in diese Richtung gemeldet wurde — dass im ganzen Tab nichts auf irgendetwas
reagiert. Jeder Befund nennt die Widget-Ids und das Rezept, das ihn behebt.

Bewusst nur **mechanisch Prüfbares**. Ein Befund, den man am JSON nachrechnen
kann, ist überprüfbar; „das wirkt unruhig" wäre geraten. Und es bleiben
Vorschläge: der Antworttext sagt ausdrücklich, dem Nutzer die Liste zu zeigen und
nur zu ändern, was er will — mit `aura_update_widget`, damit die übrigen Optionen
stehen bleiben.

## Dieselben Rezepte im Editor

`tools/schema/gen-recipes.mjs` schreibt die Rezepte nach
`public/ai/aura-recipes.json` (`npm run recipes`, `npm run recipes:check`). Der
Prompt-Builder des Editors (`src-vis/utils/aiPrompt.ts`) importiert diese JSON und
legt bis zu zwei passende Beispiele in den Prompt — passend heißt: gebaut aus den
Typen, die der Nutzer angehakt hat, plus das Raum-Tab-Beispiel, wenn ein ganzer
Tab gewünscht ist. `lib/mcp/recipes.js` ist CommonJS-Adaptercode, das Frontend ein
ESM-Bundle; die Daten reisen deshalb als JSON statt als zweite handgepflegte
Kopie, die beim ersten korrigierten Rezept auseinanderliefe.

Dort stand außerdem die Regel **„Lass eine Option weg, statt sie zu raten"** —
als Schutz gegen erfundene Optionsnamen richtig, als Gestaltungsanweisung gelesen
aber genau die Aufforderung, alles auf Vorgabe zu lassen. Sie sagt jetzt, keinen
Optionsnamen zu erfinden, und daneben steht ein Abschnitt „Was ein gutes
AURA-Dashboard ausmacht".

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

**Ein Schreibvorgang nach dem anderen.** Jeder Schreibpfad ist
Lesen-Ändern-Schreiben über zwei bis drei ioBroker-States. Zwei davon gleichzeitig
lasen dasselbe Dashboard, der zweite überschrieb den ersten — und weil jeder für
sich gegen seine eigene Grundlage gültig war, meldeten **beide** Erfolg. Ein
Assistent, der zwei Werkzeugaufrufe parallel absetzt (sie tun das), bekam gesagt,
er habe zwei Widgets angelegt, und hatte eines. `callTool` hängt Schreibvorgänge
deshalb pro Adapter-Instanz in eine Promise-Kette; Lesevorgänge laufen weiter
nebenher, sie können nichts verlieren. Ein abgelehnter Schreibvorgang blockiert
die Kette nicht (`previous.then(run, run)`).

**Mehrdeutigkeit wird gemeldet, nicht entschieden.** Zwei Fälle, beide durch die
Gleichstellung der Popups entstanden: eine Widget-Id, die es in mehreren Wirten
gibt (Ids _sollen_ eindeutig sein, sind es aber nicht garantiert — der Editor hat
seit #606 einen Dedupe für genau die Zwillinge, die das Kopieren erzeugte), und
ein Name, der Tab _und_ Popup-Ansicht bezeichnet. Beide Male wird abgelehnt und
gesagt, welche Orte in Frage kommen; die Id klärt es, weil sie über beide
Namensräume eindeutig ist. `aura_write_popup` legt aus demselben Grund keine
zweite Ansicht gleichen Namens mehr an.

**Duplizieren am selben Ort ist erlaubt.** Bei `aura_copy_node` gilt „liegt schon
dort" nur fürs Verschieben — „dupliziere mir diesen Tab" ist der häufigste
Kopierwunsch überhaupt und wurde vorher abgewiesen. Popup-Ansichten lassen sich
ebenfalls kopieren (verschieben nicht: es gibt kein übergeordnetes Element).

**Popups sind kein Sonderfall.** Ein Widget wohnt in einem Tab, in einer
Popup-Ansicht oder in einer Gruppen-Definition; `locateWidget` findet alle drei
und `writeHost` schreibt in den richtigen State zurück. Deshalb nehmen
`aura_add_widget`, `aura_update_widget`, `aura_copy_widget` und
`aura_delete{kind:"widget"}` eine Popup-Ansicht überall dort, wo sie einen Tab
nehmen — adressiert über ihren Namen. Vorher war die einzige Möglichkeit,
`aura_write_popup` mit der kompletten Widget-Liste aufzurufen: dieselbe
Alles-oder-nichts-Falle, die Gruppen hatten. Ein Gruppen-Kind wird auch ohne
`defId` gefunden; die Angabe bleibt erlaubt und ist schneller.

**Verwaiste Gruppen-Definitionen werden eingesammelt.** Jedes Löschen von
Widgets oder Knoten ruft danach `pruneGroupDefs`: was kein Widget in Tab oder
Popup mehr referenziert, fliegt raus (`collectDefIds` folgt Verschachtelungen).
Das Frontend macht dasselbe vor jedem Speichern (`gcGroupDefs`) — ohne den
Aufruf hier sähe der Zustand nur dann aufgeräumt aus, wenn jemand den Editor
öffnet. Dieselbe Schutzregel wie dort: nie gegen eine leere Wirt-Menge sammeln,
sonst löscht ein halb geladener Zustand alles.

**`replace: true` behält die Id.** Ein Patch ohne `id` bekam vorher „Die id darf
sich nicht ändern (w-1 → undefined)" — ein Fehler über etwas, das der Aufrufer
nie gesagt hatte. Jetzt wird die Id des Ziels vorangestellt; wer eine _andere_
Id schickt, bekommt die Ablehnung weiterhin, denn ein stilles Umbenennen würde
jeden Verweis auf das Widget ins Leere zeigen lassen.

**Antwortlänge ist ein Werkzeug-Parameter.** `aura_widget_types` nimmt
`group=control|special|layout` (halbiert die Liste), `aura_widget_schema` nimmt
`brief=true` und lässt Beschreibungen und Feldkommentare weg (rund 60 % kürzer,
Namen, Typen, Pflichtfelder und Datenpunkt-Markierungen bleiben). Der Einstieg
in ein Gespräch sinkt damit von ~12.700 auf ~8.000 Token.

**Die Spaltenzahl ist eine Beobachtung, kein Gesetz.** Sie wird aus dem breitesten
vorhandenen Widget abgeleitet — das Frontend zieht das Raster ohnehin auf die
belegte Breite auf (`effectiveCols = max(cols, minCols)`). Auf einem dünn belegten
Dashboard schrumpft die Zahl mit jeder Verschiebung, und eine Ablehnung hätte
genau den Aufbau blockiert, für den dieser Server da ist. Zu breit ist deshalb
eine **Warnung**; Maße, die wirklich kaputt sind (negativ, gebrochen), bleiben Fehler.

**Eine Option eine Ebene zu hoch ist ein Fehler.** `conditions`, `badges`,
`clickAction` und die übrigen gemeinsamen Einstellungen leben unter `options`.
Direkt am Widget geschrieben liest AURA sie nirgends — der Schreibvorgang
„gelingt“, das Modell meldet Erfolg, und sichtbar passiert nichts. Deshalb wird
abgelehnt und der Ort genannt, statt nur zu warnen. Ein Schlüssel, den niemand
kennt, bleibt eine Warnung mit Vorschlag.

**Kopierte Knoten bekommen frische Ids.** `aura_copy_node` klont Widgets _und_
Gruppen-Definitionen rekursiv und biegt `widgetId`-Verweise innerhalb der Kopie
auf die Kopien um (Klick-Aktionen `popup-widget`/`link-widget` tragen sie in
beliebiger Tiefe) — dieselbe Zwei-Pass-Logik wie `src-vis/utils/widgetCopy.ts` im
Editor. Beim Verschieben bleibt alles, wie es ist; verliert ein Bereich dabei
seinen letzten Tab, bekommt er einen leeren neuen, weil ein Bereich ohne Tab
weder etwas anzeigt noch über die Oberfläche wieder zu füllen ist.

**Gruppen sind über ihr Widget ansprechbar.** `aura_group`, `aura_write_group` und
`aura_add_widget` nehmen `widgetId` statt `defId` — die Id kennt das Modell aus
`aura_tab`, die defId steckt eine Ebene tiefer in den Optionen. `aura_add_widget`
hängt damit ein einzelnes Kind an, statt über `aura_write_group` zwölf Kacheln
fehlerfrei zurückschreiben zu müssen, um eine dreizehnte zu ergänzen.

**Umsortieren verlangt die vollständige Reihenfolge.** `aura_reorder` nimmt keine
Teilliste entgegen: fehlt ein Eintrag, wird abgelehnt statt gelöscht. Ein Modell,
das nur „Klima nach vorn“ meint, aber nur diesen einen Namen schickt, würde sonst
den Rest des Bereichs entfernen. Namen, Slugs und Ids sind gleichwertig.

**Kopieren klont die Gruppen-Kinder mit.** Ein Gruppen-, Panels- oder Universal-Widget
verweist über `options.defId` auf seine Kinder in `config.group-defs`. Würde die
Kopie dieselbe `defId` behalten, änderte jede spätere Bearbeitung der Kopie auch
das Original. `aura_copy_widget` und `aura_insert_preset` vergeben deshalb neue Ids
für Widget **und** Definitionen, rekursiv. Beim Verschieben (`mode:"move"`) bleibt
die `defId` erhalten — es ist dasselbe Widget an einem anderen Ort.

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

**Sichern allein reicht nicht.** Vor jeder Änderung wird gesichert — ohne Weg
zurück war das nur die halbe Absicherung. `aura_restore` legt zuerst einen
Schnappschuss des aktuellen Standes an, damit auch das Zurückspielen der falschen
Sicherung umkehrbar bleibt, und schreibt nur die States, die die Datei wirklich
enthält: eine ältere Sicherung kennt `popup-config` oder `widget-presets` noch
nicht, und `null` darüberzuschreiben machte aus der Rettung einen zweiten Unfall.
Umgekehrt muss der Schnappschuss jeden beschreibbaren State abdecken — kam ein
vierter dazu (die Vorlagen), war die angekündigte Sicherung sonst für genau die
Änderung wertlos, die sie begleitete. Der Dateiname wird
gegen ein Muster geprüft, bevor er an `readFile` geht.

**Popup- und Gruppen-Raster.** Beide haben ihr eigenes Raster, deshalb gilt dort
die Spaltengrenze des Dashboards **nicht** — sie wird für diese Werkzeuge
weggelassen.

## Vier weitere Stellen

**Bestehende Widgets dürfen nicht blockieren.** Ein Widget anzufügen prüft nur
das _neue_ Widget streng (`strictIndices`). Sonst würde ein einziges vor drei
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

`npm run test:mcp` — 205 Checks: die Validierungsregeln gegen das echte Schema, die
Config-Helfer, Token-Abweisung (fehlend, falsch, nicht konfiguriert), der
Handshake mit dem echten Client, die `instructions`, jedes Werkzeug, und die
Schreibpfade gegen ein Adapter-Doppel — inklusive der Zusicherung, dass ein
abgelehnter Schreibvorgang nichts hinterlässt und die Sicherung den Stand **vor**
der Änderung enthält. Dazu die Token-Erzeugung: 200 Durchläufe auf Form und
Wiederholungsfreiheit, und dass ein um ein Zeichen abweichender sowie ein
gekürzter Token abgewiesen werden.

Dazu die Rezepte: jedes Widget jedes Rezepts gegen das echte Schema (keine Fehler
**und** keine Warnungen), keine Datenpunkt-Id, die für eine echte durchgehen
könnte, eindeutige Ids, und über den echten Client, dass die Liste eine Liste
bleibt und ein unbekanntes `id` die vorhandenen nennt.

Und den Rückblick: jede Regel einzeln, mit dem Gegenbeispiel daneben (unter der
Schwelle wird nicht gemeldet, ein Widget mit Schwellen taucht nicht auf, ein
aggregiertes Balkendiagramm auch nicht), dass ein sauberer Tab **keine** Befunde
erfindet, und dass jeder Befund auf ein existierendes Rezept zeigt.
