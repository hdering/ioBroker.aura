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
| `aura_dashboard`                      | Layouts, Bereiche, Tabs, Rastermaße, Spalten, Zielbildschirm                                                   | read         |
| `aura_widget_types`                   | Alle Typen kompakt, mit `group=` auf eine Kategorie eingegrenzt                                                | read         |
| `aura_widget_schema`                  | Optionen der genannten Typen, mit `brief=true` nur Namen und Typen                                             | read         |
| `aura_tab`                            | Widgets eines Tabs inkl. `groupDefs`                                                                           | read         |
| `aura_types`                          | Benannte Typen einzeln holen (`WidgetCondition`, `CustomCell` …) statt sie je Widget-Typ mitzuschleppen        | read         |
| `aura_measure`                        | Zeilen in Pixel, gegen die gemessene Höhe des Typs — Layout, Optionen und Zeilendarstellung, plus Tab-URL      | read         |
| `aura_validate`                       | Prüfung gegen Schema, Live-Datenpunkte, die Objekte dahinter und die Darstellung der Zeilen                    | read         |
| `aura_review`                         | Vorhandenes prüfen: Stil (`mode:"style"`) und Gesundheit (tote/leere/eingefrorene DPs, unwirksame Optionen)    | read         |
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

**Dieselbe Eingabe, dasselbe Format.** Aus der Praxis gemeldet: `aura_validate`
antwortete auf ein nacktes Widget-**Array** mit „widget: kein Objekt" und
verlangte eine `aura-tab`-Hülle — während `aura_write_tab` im selben Gespräch
genau dieses Array annahm. `widgetListOf()` kennt jetzt alle Formen an einer
Stelle, und beide Werkzeuge nehmen dieselben:

| Eingabe                              | geprüft als                                  |
| ------------------------------------ | -------------------------------------------- |
| ein Widget-Objekt                    | Widget                                       |
| `[…]` (nacktes Array)                | Widgetliste (Überlappungen, doppelte Ids)    |
| `{ widgets: […] }`                   | Widgetliste                                  |
| `{ tab: { widgets: […] } }`          | Widgetliste                                  |
| `{ _type: "aura-tab", tab: {…} }`    | Import-Hülle, hier **mit** `name`            |

`validateWidgetList()` trägt jetzt die Regeln, die vom **Ergebnis** sprechen
(jedes Widget einzeln, doppelte Ids, Überlappungen); `validateTab()` prüft
darüber nur noch die Hülle. Der `name` gehört ausdrücklich zur Hülle: bei
`{ widgets: […] }` kommt er vom Ziel-Tab, ihn dort zu verlangen hieße, ein
gültiges Schreib-Payload abzulehnen. Nebenbei stimmten auch die Datenpunkt-Reads
nicht: der Handler holte die Widgets mit einer eigenen Fallunterscheidung, in der
das Array fehlte — die Objekte einer so übergebenen Liste wurden also nie
gelesen.

**Der richtige Name genügt nicht: er muss auch bei der richtigen Darstellung
stehen.** Aus der Praxis gemeldet: `trueLabel`/`falseLabel` auf einer Zeile mit
`displayType: "value"`. Der Schlüssel existiert, das Schema nimmt ihn, und
gezeichnet wird er nie — der Editor bietet die Felder dort nicht einmal an
(`usesOnOffLabels()` in `entryControls.tsx`), ein geschriebenes Payload trägt sie
trotzdem. `entryDisplayFindings()` in `validate.js` prüft deshalb die Felder, die
nur **eine** Darstellung liest:

| Felder                                              | gelesen von                                   |
| --------------------------------------------------- | --------------------------------------------- |
| `trueLabel`, `falseLabel`, `trueIcon`, `falseIcon`  | `switch` (und `auto` auf einem booleschen DP) |
| `states`                                            | `states`                                      |
| `presets` und die `presets*`-Felder                 | `buttons`, `select`                           |

Warnung, kein Fehler — der Schlüssel ist gültig, nur wirkungslos. Gruppiert nach
Darstellung (sechzehn Zeilen desselben Fehlers sind ein Befund, mit maximal sechs
genannten Zeilen) und gültig für die Zeilen **und** den listenweiten Block
`entryDisplay`; der bekommt zusätzlich einen Hinweis, wenn er selbst keinen
`displayType` nennt — dann greift er gar nicht (`listDisplayApplies()`).

Zwei bewusste Ausnahmen, damit kein Fehlbefund entsteht: `layout: "minimal"`
wertet das AN/AUS-Paar selbst aus (die Pille zeichnet kein Bedienelement, siehe
`ListWidget`), und `auto` bleibt bei den Labels außen vor, weil die Darstellung
dort erst aus der Rolle des Datenpunkts entsteht. Neue Zeilen in der Tabelle nur
mit Blick in den Renderpfad — ein Befund auf einer funktionierenden Zeile ist
schlimmer als keiner.

## Optionen, die das Widget nie liest

Aus der Praxis gemeldet, und der Anfang war eine fehlende Messung: die statische
Liste führte `showEntryLastChange` im Schema, die Option tut dort aber nichts.
Im Browser nachgesehen — und es waren nicht eine, sondern **zwanzig**:
`maxRows`, `entryDisplay`, `groupByRoom`, `subDpTemplate`, `showMore`,
`cardMinWidth`, die `filter*`-Felder der Discovery, die Raumüberschriften …
alles Optionen der **dynamischen** Liste.

Ursache: `extractOptionKeys()` folgt Imports drei Ebenen tief, weil ein Widget
seine Optionen oft in einem Helfer liest (`listFilter.ts` liest
`opts.valueFilter`). `ListWidget` importiert aber `resolveName` aus
`AutoListWidget` — ein einziger Import, und die Reads der dynamischen Liste
landeten als Optionen der statischen. Dieselbe Mechanik traf `camera` und
`autolist` (über `entryControls` → `EnumWidget`) und `trashSchedule` (über
`TrashWidget`).

Die Regel ist jetzt: **niemals in eine andere Widget-Datei laufen** — deren
Optionen gehören ihr. Ergebnis: 45 Phantom-Optionen weg (1783 → 1738), geprüft
je Widget, dass keine davon in der eigenen Datei gelesen wird.

Zwei Folgen im Server selbst, beide gemessen statt vermutet:

- `capped()` in `measure.js` wendet `maxRows` nur noch auf die Typen an, die es
  **lesen** (`autolist`, `statusoverview`, `jsontable`). Vorher meldete eine
  statische Liste mit `maxRows: 4` vier Zeilen, während neun gezeichnet werden —
  der umgekehrte Fehler zu allen anderen hier: eine zu KLEINE Zahl, und die Liste
  scrollt.
- Ein Payload mit einer dieser Optionen ist jetzt ein Fehler („liest die Option
  … nicht") statt einer stillen Nichtwirkung. Das ist genau die Klasse, für die
  dieser Validator existiert — sie stand nur im Schema und war deshalb unsichtbar.

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

Die Kachelreihe zählt dabei nur die **nackten** Kacheln. Zwei Regeln zogen sonst
gegeneinander: „Zahl ohne guten oder schlechten Bereich" verlangt eine Schwelle,
eine Bedingung oder ein Badge — und die Kachelreihe schlug danach vor, genau die
Kachel in eine Listenzeile zu falten, wo diese eigene Reaktion verloren geht.
Gemeldet wurde es an einer bewussten Kennzahlenzeile: fünf Kacheln, die über
`conditions[].elements` einzeln auf ihren Wert reagieren. Eine Listenzeile kann
das je Zeile nicht, der Vorschlag war also einer für ein schlechteres Dashboard —
und er kam bei jedem Review wieder. `isConfiguredTile()` nimmt Kacheln mit
`conditions`, `colorThresholds`, `badges` oder Zonen darum aus; stehen daneben
noch fünf nackte, wird weiter gemeldet, und die Begründung sagt, wie viele
ausgenommen sind und warum. Das ist kein Urteil über die Qualität der
Konfiguration — nur die Feststellung, dass jemand dieser einen Kachel absichtlich
ein eigenes Verhalten gegeben hat.

Bewusst nur **mechanisch Prüfbares**. Ein Befund, den man am JSON nachrechnen
kann, ist überprüfbar; „das wirkt unruhig" wäre geraten. Und es bleiben
Vorschläge: der Antworttext sagt ausdrücklich, dem Nutzer die Liste zu zeigen und
nur zu ändern, was er will — mit `aura_update_widget`, damit die übrigen Optionen
stehen bleiben.

## Der Gesundheitscheck: was schon da ist, gegen Schema und Anlage

Der Rückblick oben ist Geschmack in mechanischer Form. Daneben steht die zweite
Hälfte von `aura_review` (`mode: "health"`, `lib/mcp/audit.js`): kein Urteil über
den Aufbau, sondern die Frage, ob das Konfigurierte überhaupt noch funktioniert.

Ohne `tab` läuft sie über **alle** Tabs, Popup-Ansichten und Gruppen-Definitionen
und meldet:

| Befund                                   | Warum er sonst niemandem auffällt                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Datenpunkt existiert nicht               | Widget rendert, zeigt nichts, meldet nichts                                     |
| Datenpunkt ohne Wert (`null`)            | Angelegt und nie beschrieben                                                    |
| Datenpunkt seit >14 Tagen unverändert    | Mehrere DP-Generationen fürs gleiche Gerät, das Widget hängt an der alten       |
| Diagramm-Datenpunkt ohne Aufzeichnung    | Kein History-Adapter aktiv oder die falsche Instanz eingestellt — leerer Rahmen |
| Datenpunkt passt nicht zum Widget        | Schalter auf `write:false`, Zahl-Widget auf Text, Regler ohne min/max           |
| Option, die das Widget nicht liest       | Wird beim Rendern verworfen — hat früher gewirkt, unter anderem Namen           |
| Einstellung eine Ebene zu hoch           | `conditions`/`badges` direkt aufs Widget geschrieben                            |
| Doppelte Widget-Id                       | Geteilter Laufzeit-Zustand, Klickaktion trifft beide (#606)                     |
| Gruppe ohne gespeicherte Kinder          | Import ohne `groupDefs`, Restore ohne den Schlüssel                             |
| Leerer Tab, verwaiste Gruppen-Definition | Menüeintrag ohne Inhalt, Reste gelöschter Gruppen                               |

Die Datenpunkte werden dafür **lose** gesammelt (`collectDatapointRefs` mit
`loose: true`): auch `entries[].id`, `subDps[].id` und die `…Dp`-Felder in
verschachtelten Strukturen — dort steckt in einem gewachsenen Dashboard das
meiste. Trennzeilen und Regel-Ids sind ausgenommen, sonst wäre jede Bedingung ein
„toter Datenpunkt". Für den strengen Pfad (`aura_validate`, blockiert Schreiben)
gilt nur, was das Schema ausdrücklich als Datenpunkt markiert hat — deshalb
markiert `gen-widget-schema.mjs` inzwischen auch Feldnamen in benannten Typen
(48 Felder: `statusDp`, `latDp`, `datapoint` in `ConditionClause` …), aber
bewusst **kein** `id`.

Alles Warnungen, keine Fehler: ein unveränderter Zählerstand ist normal, ein
umbenanntes Gerät nicht — die Entscheidung bleibt beim Nutzer.

## Passt der Datenpunkt zum Widget?

`lib/mcp/dpFit.js` liest die Objekte hinter den Datenpunkten, die eine Nutzlast
nennt (nur die, nicht die ganze Anlage), und vergleicht:

- Schalter/Dimmer/Slider auf einem Datenpunkt mit `write: false` — der Knopf tut
  dauerhaft nichts
- `switch` auf einem `number` ohne `onValue`/`offValue`, `gauge` auf einem `string`
- Dimmer/Slider/Knob/Rollladen ohne `min`/`max` — weder im Objekt noch im Widget,
  dann rechnet das Widget mit 0–100 und schreibt Werte, die das Gerät ablehnt
- `enum`-Werte, die nicht in `common.states` stehen
- Preset-Werte mit falschem Typ

**Nicht nur `widget.datapoint`.** Genau hier war die gefährlichste Lücke, aus der
Praxis gemeldet: `hm-rpc.1.…3.STATE` (ein SWITCH_TRANSMITTER, `write: false`) ging
als Schalter**zeile** einer Liste durch, `aura_validate` sagte „keine
Beanstandungen", und der Schalter hätte stumm nichts getan. Geprüft wurde nur der
Datenpunkt des Widgets selbst — eine Liste ist aber ein Widget mit zwanzig
Bedienelementen darin.

`writeRefs()` sammelt deshalb alles, worauf ein Klick **schreibt**:

| Quelle                                  | geprüft                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| Listenzeile (`entries[].id`)            | wenn ihr `displayType` (oder listenweit `entryDisplay`) ein Bedienelement ist: `switch`, `slider`, `shutter`, `stepper`, `buttons`, `momentary`, `datepicker`, `input`, `select` — und die Zeile nicht `writable: false` sagt |
| Rollladen                               | `openDp`, `closeDp`, `stopDp`, `tiltDp` bzw. je Zeile `shutterUpDp`, `shutterDownDp`, `shutterStopDp`, `shutterTiltDp` |
| Lampe                                   | `switchDp`, `brightnessDp`, `colorDp`, `hueDp`, `temperatureDp`, `effectDp`, … |

Bewusst **nicht** „jedes Feld, das auf `Dp` endet": neben jedem dieser Felder
liegt ein `…ActualDp` / `…ActivityDp` / `statusDp`, das vom Gerät zurückgelesen
wird und `write: false` sein **soll**. Eine Warnung darauf würde dem Leser
beibringen, die Warnung zu ignorieren. `displayType: 'auto'` bleibt ebenfalls
aussen vor — was daraus wird, entscheidet erst die Rolle zur Laufzeit.

**Zwei Wege, auf denen die Prüfung selbst falsch lag** — beide aus der Praxis
gemeldet, beide dieselbe Sorte Schaden: ein Befund auf einer richtigen Zeile.

1. `states` stand in der Tabelle der Bedienelemente. Es ist eine
   **Lese**-Darstellung: `StateDisplay` zeichnet aus der Wertzuordnung einen
   Chip und schreibt nirgends. Ein Raum voller Rauch- und Wassermelder — nur
   lesbare States, für die Anzeige zugeordnet, genau der Zweck der Darstellung —
   ergab neun Hinweise, jeder davon unbegründet. `contact`, `time` und `value`
   standen aus demselben Grund nie darin.
2. `writable: false` wurde nicht ausgewertet. Das Feld ist die Zeile, die sagt
   „ich schreibe nicht" — ihr danach zu erklären, ihr Bedienelement sitze auf
   einem nur lesbaren Datenpunkt, wiederholt bloß die eigene Angabe.

Das Feld hält das Frontend allerdings nur zur Hälfte: `SwitchControl` und
`SliderControl` bekommen es als Prop (der Regler zeigt dann seinen Wert statt
des Balkens), der `auto`-Pfad sichert seinen Toggle — die reichen Bedienelemente
(`shutter`, `stepper`, `buttons`, `momentary`, `select`, `input`, `datepicker`)
sehen es überhaupt nicht und zeichnen auf einer als lesend deklarierten Zeile
weiter ein bedienbares Feld. Damit das Wort-für-Wort-Nehmen oben das nicht
verdeckt, sagt `entryDisplayFindings()` es an genau diesen Darstellungen
ausdrücklich (`onlyFor` + `onlyValue: false` in `ENTRY_DISPLAY_FIELDS`) — auf
einer Lese-Darstellung ist das Feld harmlose Absicht und darum kein Befund.

Damit das überhaupt greifen kann, holen die Werkzeuge die Objekte jetzt mit
`collectDatapointRefs(..., { loose: true })`: `entries[].id` ist im Schema nicht
als Datenpunkt markierbar, ohne Trennzeilen mitzunehmen. Eine synthetische Id hat
kein Objekt und erzeugt darum auch keinen Befund. Und `light` fehlte in `EXPECT`
ganz — eine Lampe auf einem nur lesbaren Datenpunkt lief sauber durch.


Dazu die Prüfung, die am wenigsten nach Fehler aussieht: **Diagramm auf einem
Datenpunkt, den niemand aufzeichnet.** Die Id existiert, der Typ ist eine Zahl,
die Optionen sind richtig geschrieben — und das Diagramm zeichnet dauerhaft einen
leeren Rahmen, weil in `common.custom` kein `history.`/`influxdb.`/`sql.`-Eintrag
aktiv ist. `historyReads()` sammelt dafür, was ein Widget wirklich bei der History
abfragt: beim einfachen `chart` den eigenen Datenpunkt, beim `echart` je Serie —
und nur, wenn die Serie überhaupt aus der History liest (`source: 'json'` und
`echartMode: 'json'` lesen den Datenpunktwert selbst, dort wäre die Warnung
falsch). Zweiter Fall: ein gesetztes `historyInstance`, das diesen Datenpunkt
nicht aufzeichnet — die Abfrage geht an die falsche Instanz und liefert nichts.
Die Regel ist wörtlich die des Frontends (`detectHistoryAdapters` in
`hooks/useChartHistory.ts`), damit Prüfung und Anzeige nicht auseinanderlaufen.

Der Pfad nennt die Serie mit ihrer **Id** — `Reihe s1`, so wie sie in der Config
steht und wie `aura_measure` und der Editor sie zeigen. Ohne Id bleibt der
**gespeicherte** Index: erst indexieren, dann filtern, sonst verschiebt eine
JSON-Serie in der Mitte alle Nummern dahinter. Der Satz nennt am Ende, was leer
bleibt — beim Diagramm „das Diagramm bleibt leer", bei der Energiebilanz „die
Auswertung bleibt leer".

Dieselbe Prüfung gilt für die **Energiebilanz**: jeder Eintrag mit einem
`aggregate` ausser `last` ist eine History-Abfrage (`last` kommt aus dem
Live-State, Issue #596), der `totalDatapoint` eines Balkens immer.

Dritter Fall, der auch den ioBroker selbst betrifft: der `custom`-Eintrag nennt
eine Instanz, die es **nicht mehr gibt** (`history.0` auf einem System mit nur
`influxdb.0`). Dann zeichnet niemand auf, und eine History-Abfrage darauf
schlägt nicht fehl, sondern haengt bis zum Timeout des Clients.
`readLoggingInstances()` liest die vorhandenen Instanzen einmal; `aura_dashboard`
nennt sie jetzt auch — vorher gab es nirgends eine Liste, aus der ein Modell den
Instanznamen nehmen konnte.

Nebenbei geschlossen: `EChartSeriesConfig.datapointId` fiel durch jede
Datenpunkt-Erkennung, weil „endet auf Id" keine Datenpunkt-Regel ist — die eine
Option, die ein Dutzend Ids trägt, war damit ungeprüft. `DP_KEY` im Generator
kennt jetzt auch `datapointId` (50 markierte Felder statt 48), ein Tippfehler in
einer Serie ist also ein Fehler und keine leere Kurve.

Geprüft wird das **beim Schreiben**, nicht nur auf Nachfrage. `aura_validate`
las die Objekte hinter den Datenpunkten schon eine Weile, die Schreib-Werkzeuge
nicht: `validateWidgets()` gab nur `knownDatapoints` weiter, und `aura_write_tab`
und `aura_update_widget` bauten ihren Kontext sogar von Hand. Ein Diagramm auf
einem nicht aufgezeichneten Datenpunkt ging damit wortlos durch — genau
verkehrt, denn beim Bauen ist es noch zu ändern. Jetzt sammelt
`validateWidgets()` die Referenzen selbst und liest Objekte plus
`readLoggingInstances()`; `strictIndices` begrenzt dabei auch das Nachlesen,
damit ein Widget mehr an einem gewachsenen Tab nicht zweihundert Objekte liest.

Immer Warnungen. Das ioBroker-Objekt ist eine Behauptung: Adapter setzen `write`
falsch, viele Anlagen schalten mit 0/1, und ein Bereich darf auch im Widget
stehen. Ein verweigerter Schreibzugriff wäre schlimmer als der Fehler.

## Zwei Fehlbefunde, die teurer waren als die Lücke

**Element-Ids sind keine Datenpunkte.** Die lose Sammlung nahm für eine Liste von
Typen jedes `id`/`dp` — und `id` heisst je Typ etwas anderes: bei einer
Listenzeile ist es der Datenpunkt, bei einem Badge (`b-ph-offline`), einer
Diagramm-Serie (`s-tempout`) oder einem Chip ist es ein Schlüssel, und der
Datenpunkt steht daneben in `dp` bzw. `datapointId`. Ergebnis waren 23
Falschmeldungen auf einem Tab, der sauber validiert — und die eine echte Meldung
ging darin unter. Jetzt entscheidet `LOOSE_DP_FIELDS` **pro Typ**, welches Feld
einen Datenpunkt hält. Umgekehrt fehlte `dp` ganz: die Regel kannte nur das
Suffix `…Dp`, also war der Datenpunkt von Badges, Chips, Karussell-Einträgen und
Slider-Aktionen von keiner Prüfung erreichbar. `DP_KEY` kennt jetzt auch `dp`
(56 markierte Felder).

**Trennzeilen** wurden über `type === 'divider'` erkannt — das Feld heisst
`divider: true` (`isDivider` in ListWidget). Jede Trennzeile im Feld kam damit als
toter Datenpunkt zurück; der Test hatte die falsche Regel festgeschrieben.

**Eine Momentanleistung ist kein Zählerstand.** `…consumption` in **W**
(`role: value.power`) wurde als „Zählerstand statt Verbrauch" gemeldet, weil der
Name das Wort enthielt. `looksLikeCounter()` entscheidet jetzt nach Belegen:
Einheit (aus Widget **oder** Objekt) in beide Richtungen — Wh/kWh/m³ ja, W/A/V/%/°C
nein —, dann die Rolle (`value.energy`/`counter` ja, `value.power` & Co. nein),
und erst wenn beides fehlt, darf der Name mitreden. Dafür liest `aura_review`
jetzt auch für den Stil-Teil die Objekte.

## Größen: gemessen, nicht geschätzt

Die eine Sache, die ein Modell nicht sehen kann. Es schreibt `gridPos.h` in
Zeilen, der Browser rendert Pixel, und eine Liste, die nach neun von sechzehn
Zeilen abgeschnitten ist, sieht im JSON genauso richtig aus wie eine passende.

`tools/schema/measure-widget-metrics.mjs` (`npm run metrics`) rendert dafür jeden
Typ **in der echten Oberfläche** über den `__auraShot`-Harness — Raster mit 2 px
Zeilenhöhe für die Auflösung, normale 20 px Spalten für eine realistische Breite
— und geht mit der Höhe nach unten, bis der Inhalt nicht mehr passt. „Passt"
heißt zweierlei: nichts scrollt im Widget, und nichts wird außerhalb der Karte
gezeichnet. Das zweite ist der Punkt, an dem die Kacheln hängen: sie scrollen
nicht, sie stehen über.

Der Lauf geht **abwärts** von einer Höhe, die passt, nie als Binärsuche — ein
Diagramm bei 30 px rendert überhaupt keine Achse und würde „passt" melden.

Ergebnis: `public/ai/aura-widget-metrics.json`, gemessen z. B.

| Typ          | Messung                                  |
| ------------ | ---------------------------------------- |
| `list`       | 66 px + 33 px je Zeile (Standardform)    |
| `jsontable`  | 86 px + 27 px je Zeile                   |
| `value`      | mind. 72 px (3 Zeilen im Standardraster) |
| `gauge`      | mind. 162 px (6 Zeilen)                  |
| `thermostat` | mind. 144 px                             |
| `echart`     | mind. 52 px                              |

`aura_measure` (`lib/mcp/measure.js`) rechnet damit gegen das Raster **dieses**
Dashboards (`h × rowHeight + (h−1) × gap`) und antwortet pro Widget mit
„passt / knapp / ZU KLEIN, es fehlen N px → h=M".

**Eine Zeile ist nicht eine Form.** Aus der Praxis gemeldet: dieselbe Liste mit
und ohne `subDps`, in `layout: "compact"` und in `"card"`, ergab exakt dieselbe
Zahl — 66 px + 33 px je Zeile für alles. Eine Rolladen-Liste stand damit auf der
gemeldeten „Mindesthöhe" und scrollte. Der Messstand misst deshalb zusätzlich:

| Form                       | gemessen                    |
| -------------------------- | --------------------------- |
| `layout: "card"`           | 75 px + 64,7 px je Zeile    |
| `layout: "compact"`        | 67 px + 14,7 px je Zeile    |
| `layout: "minimal"`        | 75 px + 32,7 px je Zeile    |
| `entries[].subDps`         | +15,3 px je Zeile           |
| Titel **und** Icon aus     | −34 px Basis                |
| nur `showTitle: false`     | ±0 (das Icon hält die Zeile offen) |
| `groupSwitch`, `showSum`   | ±0 (sitzen in der Kopfzeile) |

`variants` sind vollständige Neumessungen (ein Layout zeichnet die Zeile anders),
`modifiers` sind Deltas, jeweils einzeln gegen die Standardform gemessen und von
`rowShape()` addiert. Welcher Eintrag greift, entscheidet ein `when` im JSON
(`{path, equals|not|nonEmpty}` bzw. `{all:[…]}`), ausgewertet gegen die Optionen
des Widgets — `entries[].subDps` heißt „irgendein Eintrag hat welche". Ein
Modifier kann per `notForVariants` für ein Layout ausgenommen werden (`minimal`
zeichnet eine Zeile als Pille und ignoriert `subDps`).

**Was gar nicht in der Zahl stand.** Aus der Praxis gemeldet: eine dynamische
Liste mit `showEntryLastChange: true` hängt unter jede Zeile eine Zeitangabe
(gemessen **+13,7 px**) — bei zwölf Einträgen 164 px, die in der Messung fehlten.
Die Option gibt es in zwei Formen, und sie brauchen unterschiedliche Arithmetik:

| Form                        | Widget          | gerechnet          |
| --------------------------- | --------------- | ------------------ |
| `entries[].showLastChange`  | statische Liste | je betroffene Zeile |
| `showEntryLastChange`       | dynamische Liste | jede Zeile         |

Gemessen wird beides an derselben Darstellung: die dynamische Liste lässt sich
nicht messen (ihre Zeilen entstehen zur Laufzeit), und die statische liest den
listenweiten Schalter nicht — also treibt der Messstand die Zeile per Eintrag und
schreibt die Zahl für beide Regeln. Dasselbe Rendering, dieselbe Höhe.

Damit die listenweite Regel nicht auf der statischen Liste greift (dort tut der
Schalter nichts), tragen Modifier jetzt ein `notForTypes` — dieselbe Mechanik wie
`notForVariants` für Layouts. Ohne das rechnete dieselbe Konfiguration 12 × 13,7 px
für eine Zeile, die das Widget nie zeichnet; der eigene Test hat es gefunden.

**„Irgendein Eintrag" ist aber keine Zeilenzahl.** Aus der Praxis gemeldet: genau
dieses `when` machte aus dem Delta einen Aufschlag auf die **Zeilenhöhe** des
Widgets, also mal aller Zeilen. Eine Liste mit zwölf Einträgen, von denen vier
eine zweite Zeile haben, kam 123 px zu groß heraus — und die Antwort verriet es
selbst: „12 × 48.3 px/Zeile — zweite Zeile je Eintrag (subDps)".

`isPerRowWhen()` erkennt eine Bedingung, die von einer **Zeile** spricht
(`when.path` beginnt mit `entries[].`, bei `all` alle Klauseln). Deren Delta
wandert nicht in `perItemPx`, sondern wird von `perRowSurcharge()` über die
Zeilen gezählt, die es wirklich betrifft — Trennzeilen (die zeichnen keine zweite
Zeile) und alles unterhalb von `maxRows` fallen dabei heraus. Die Antwort
rechnet es getrennt vor:

```
66 px + 12 × 33 px/Zeile + 61.2 px Zeilen mit Zusatz (4 × zweite Zeile je Eintrag
(subDps) +15.3 px/Zeile) + 90 px Darstellung (9 × Rollladen +10 px/Zeile)
```

Warum es so lange stand: wo **jede** Zeile eine zweite hat, sind beide Rechnungen
identisch — und genau so war der Modifier gemessen und getestet. Die vier
gemeldeten Fälle (12/4, 12/1, 5/2, 7/7) stehen jetzt als Testfälle in
`tools/tests/mcp.mjs`, der 7/7-Fall ausdrücklich mit dem Hinweis, dass er den
Fehler nicht zeigt.

**Und eine Zeile ist nicht eine Darstellung.** Derselbe Befund eine Ebene tiefer,
aus der Praxis gemeldet: `aura_measure` meldete „44 px Luft" für eine Liste, die
scrollt. Gemessen war die Wert-Zeile (33 px) — die Liste bestand aus
Fensterkontakten, und ein Kontakt-Chip macht die Zeile 37 px hoch. Elf Zeilen à
4 px sind genau die gemeldete Luft.

Der Messstand misst darum jede `displayType`-Darstellung einzeln, als Delta auf
die Standardzeile **desselben** Layouts (`counted.list.rowTypes`, je Variante
`counted.list.variants.<layout>.rowTypes`):

| `displayType`         | default | card  | compact |
| --------------------- | ------- | ----- | ------- |
| `value`, `time`       | ±0      | ±0    | ±0      |
| `slider`              | ±0      | +22   | ±0      |
| `switch`              | +2      | +12   | +1      |
| `states`, `contact`   | +4      | +4    | +2      |
| `buttons`             | +6,7    | +6,3  | +3      |
| `stepper`, `momentary`| +8      | +8    | +4      |
| `shutter`, `input`    | +10     | +10   | +5      |
| `select`              | +14     | +14   | +7      |
| `datepicker`          | +16     | +16   | +8      |

`rowTypeSurcharge()` rechnet das **je Zeile** dazu, nicht je Widget: vier Werte
und vier Kontakte sind weder acht Wert- noch acht Kontaktzeilen. Welche
Darstellung eine Zeile hat, entscheidet dieselbe Regel wie im Frontend
(`utils/listDisplayDefaults.ts`) — der eigene `displayType` des Eintrags, sonst
der listenweite Block `options.entryDisplay`, sonst `auto`. Damit ist auch eine
gedeckelte `autolist` rechenbar: ihre Zeilen entstehen erst zur Laufzeit, aber
jede startet aus `entryDisplay`.

`layout: "minimal"` bekommt keine Darstellungs-Zuschläge: die Pille zeichnet die
Darstellungen selbst, ein an der Standardzeile gemessener Zuschlag wäre dort
erfunden. Und `auto` steht bewusst bei ±0 — es folgt der Rolle des Datenpunkts,
gemessen ist die Wert-Zeile; das sagt `notIncluded` auch.

**Die Trennzeile war doppelt falsch.** Aus der Praxis gemeldet: unter jeder
Messung stand „Nicht eingerechnet: … Trennzeilen (entries[].divider)" — während
`itemCount()` jede Trennzeile als vollwertige Zeile mitzählte. Beide Hälften
falsch, und zwar gegenläufig: der Satz las sich als „pro Trennzeile Platz
draufschlagen", genau das wurde getan, obendrauf auf eine Zahl, die schon zu groß
war.

Eine Trennzeile ist eine **Zeilenform**, keine Ausnahme — sie steht darum in
derselben Tabelle wie die Darstellungen (`rowTypes.divider`) und wird pro Zeile
gezählt. Gemessen (17 px hoch, gegen die Zeile, die sie ersetzt):

| Layout    | Trennzeile |
| --------- | ---------- |
| default   | −16 px     |
| card      | −41,3 px   |
| compact   | **+16,7 px** |
| minimal   | −9,3 px    |

`compact` ist das interessante Vorzeichen: dort teilen sich zwei Inhaltszeilen
eine Rasterzeile, eine Trennzeile läuft aber über die volle Breite **und** bricht
den zweispaltigen Fluss — sie kostet mehr als die halbe Zeile, die sie ersetzt.
Weil dieser Anteil von der Anordnung abhängt, steht der Mittelwert-Vorbehalt in
`notIncluded`.

Der Messstand kann eine Trennzeile nicht wie eine Darstellung messen: eine Liste
aus lauter Trennzeilen zeigt den Leerzustand, und zwei aufeinanderfolgende werden
als leerer Abschnitt verworfen. `dividerDelta()` misst deshalb bei **gleicher
Zeilenzahl** einmal mit und einmal ohne Trenner (`listWithDividers` setzt sie
strikt zwischen Inhaltszeilen) und teilt die Differenz durch die Zahl der
Trenner, die wirklich gebaut wurden. Der erste Anlauf tat das nicht: ein
führender Trenner wurde beim Rendern verworfen, geteilt wurde trotzdem durch vier
— und aus −16 px wurden −20,5 px.

**Eine gemessene Höhe gilt nur für die Darstellung, in der sie gemessen wurde.**
Aus der Praxis gemeldet, mit 17 Listen über sechs Tabs nachgemessen: jede Liste
war falsch — unter drei Zeilen zu groß, darüber zu klein, und der Fehler wuchs
mit jeder Zeile. Ursache waren nicht die Zuschläge (die stimmten fast alle),
sondern die beiden Grundwerte. Das Dashboard läuft mit `widgetPadding` 8 und
`fontScale` 1.3, gemessen war bei 16 und 1:

| | gemessen | auf dem Dashboard |
| --- | --- | --- |
| Karte (Chrome) | 66 px | 52 px |
| Grundzeile | 33 px | 37,8 px |

Das sind 14 px zu viel einmal je Liste und 4,8 px zu wenig **je Zeile** — bei
drei Zeilen heben sie sich auf, deshalb sah es lange nach Zufallstreffern aus. Bei
zwölf Zeilen fehlten 50 px, und die Empfehlung „nimm h=15" scrollte weiter, weil
sie mit demselben zu kleinen Modell gerechnet war.

Beide Einstellungen sind Drei-Ebenen-Schlüssel wie das Raster und kommen aus
derselben Auflösung (`effectiveSettings` in `canvas.js`, jetzt auch `fontScale`
und `widgetPadding`; `designCanvas` gibt sie als `presentation` mit):

- **Innenabstand** ist reine Arithmetik: er steht zweimal im Chrome jeder Karte.
  Über den ganzen Bereich 0…40 px nachgemessen ist das Chrome der Liste
  `35 px + 2 × Innenabstand`, auf den Pixel. `paddingDelta()` rechnet
  `2 × (Abstand − 16)` auf jede Basis und auf jede Mindesthöhe — außer bei den
  Typen, die der Rahmen randlos zeichnet (`NO_PAD_TYPES`, WidgetFrames `isNoPad`).
- **Schriftskalierung** ist keine Arithmetik, sie wird gemessen. Der Messstand
  fährt darum jeden Punkt **zweimal**: bei 1 und bei 1.3 (`SCALE_HIGH`). Aus der
  Differenz wird `fontScalePx` — was ein Schritt der Skalierung in Pixeln wert
  ist, je Basis und je Zeile.

Der zweite Messpunkt sagt auch, **welche Art Zeile** eine Darstellung zeichnet, und
das ist der eigentliche Gewinn: eine Zeile ist entweder Text oder ein Bedienelement.

| Darstellung | bei 1 | bei 1.3 | Art |
| --- | --- | --- | --- |
| `contact` | 37 px (+4) | 41,8 px (+4) | Text — der Zuschlag bleibt |
| `momentary` | 41 px (+8) | 45,8 px (+8) | Text |
| `switch` | 35 px (+2) | 37,8 px (±0) | Element, 35 px hoch |
| `shutter` | 43 px (+10) | 43 px (+5,2) | Element, 43 px hoch |

Ein Kontakt-Chip ist eine Textzeile mit etwas Polsterung: seine +4 px sind bei
jeder Skalierung +4 px. Eine Rollladen-Zeile ist ein Bedienelement von festen
43 px: ihr Zuschlag schrumpft, während der Text wächst, und ist weg, sobald der
Text höher ist. `rowKind()` im Messstand unterscheidet die beiden daran, ob der
Zuschlag zwischen den zwei Messungen **kleiner** wurde, und schreibt beide Fälle
in dieselbe Formel, die `rowTypePx()` in `measure.js` auswertet:

```
Zuschlag(f) = max(perItemPx + (fontScalePx − Zeilensteigung) × (f − 1), addPx)
```

An beiden gemessenen Skalierungen ist das exakt; dazwischen und darüber ist es
eine Interpolation, und `$meta.caveats` sagt das. Fehlen die Felder (eine ältere
Metrikdatei), ist die Formel genau `perItemPx` — also das, was vorher galt.

Die Antwort nennt die Darstellung, für die sie gerechnet hat, im Kopf — sonst
sehen die Zahlen aus, als kämen sie direkt aus der Messung, und auf diesem
Dashboard taten sie das nicht. `aura_dashboard` nennt sie ebenfalls, gleich neben
dem Raster.

**Und die Trennzeile hatte nie eine Überschrift.** Beim Nachrechnen des Befunds
blieben je Trenner rund 9 px offen. Der Messstand setzte `name` auf seine Trenner
— `SectionBreak` liest aber `dividerLabel`. Gemessen war also immer die nackte
Linie (17 px: Polsterung um ein Haarlinien-`<span>`), während Dashboards die
Überschrift benutzen; die kostet eine Textzeile mehr und liegt damit nahe an
einer vollen Inhaltszeile. Es sind zwei Zeilenformen, und sie stehen jetzt beide
in `rowTypes` (`divider`, `dividerHeading`); `rowDisplayType()` entscheidet am
`dividerLabel` des Eintrags, welche gilt. Eine Metrikdatei ohne die neue Form
fällt über `FALLBACK_ROW_TYPE` auf die nackte Linie zurück, statt die Trennzeile
als volle Zeile zu zählen.

Die gemessenen **Nullen** bleiben im Ergebnis stehen („±0"): dass der
Gruppenschalter nichts kostet, ist eine Antwort — sein Fehlen liest sich wie
Vergessen. Und weil nicht alles gemessen ist, nennt die Antwort im Fuß
ausdrücklich, was **nicht** drinsteckt (`counted.<type>.notIncluded`: Filterzeile,
Raum-Überschriften, Umbrüche, mehr als ein `subDp`) und dass mehrere
Faktoren zusammen addiert werden — eine Näherung, keine Messung dieser
Kombination.

Wo keine Zahl herauskommt, trennt die Antwort zwei Dinge, die vorher im selben
Feld standen und deshalb beide wie ein Befund klangen:

- **eine Rückfrage** (`unknown`) — `autolist` weiß seine Zeilenzahl erst zur
  Laufzeit; mit `items=16` rechnet es mit der `list`-Messung weiter
- **keine Messung für den Typ** (`unmeasured`) — die Zeile beginnt mit „nicht
  gemessen (<typ>: …)", und der Fuß sagt einmal, dass das **kein Befund** ist

Das war ein echter Fehlbefund, zweimal gemeldet: eine funktionierende
`energiebilanz` **mit** Balken bekam „braucht konfigurierte Balken — ohne sie
rendert das Widget nichts", und derselbe Satz traf den Donut daneben. Der Satz
gehört dem Typ, hier liest nichts das Widget — aber an der Stelle, an der sonst
„ZU KLEIN" steht, liest man ihn als Urteil über die eigene Kachel. Die Gründe im
Generator (`SKIP` in `measure-widget-metrics.mjs`) sagen darum jetzt durchweg,
**warum es keine Zahl gibt**, und fordern nichts mehr ein. Bei der
`energiebilanz` nennen sie beide Stile („Höhe folgt der Konfiguration — Balken
oder Ringe, Einträge, Legende"), weil derselbe Typ mit `chartStyle: 'donut'` ein
Ring ist und keine Balkenreihe.

`npm run metrics:check` braucht einen laufenden Dev-Server und ist deshalb
bewusst **nicht** Teil von `npm test`.

## Und der Blick aufs Ergebnis?

Bleibt beim Nutzer. Ein Screenshot im Adapter hieße Playwright plus Browser im
Adapter-Paket; das ist nicht vertretbar. Ersatz ist der Link: `aura_measure`
liefert bei einem Tab dessen URL mit (`tabUrl` in `tools.js`, Hash-Route
`#/view/<layout>/s/<section>/tab/<tab>`), damit der Nutzer in einer Sekunde
sieht, was keine Prüfung sagen kann.

## Antwortgröße

Der Typblock war 62–77 % der Antwort von `aura_widget_schema` — und wurde bei
jedem Aufruf neu ausgegeben, vier Widget-Typen einzeln geholt also viermal
`CustomCell`. Drei Schalter dagegen:

- `options: ["entries","rowConditions"]` — nur diese Schlüssel (aus 40 KB werden
  unter 1 KB)
- `sharedTypes: false` — nennt die Typen mit ihrer Zeilenzahl statt sie
  auszugeben (`list`: 40 KB → 10 KB)
- `shape: false` — der „Aufbau eines Widgets"-Block nur beim ersten Aufruf

Dazu `aura_types` mit `names: ["WidgetCondition","CustomCell"]`: holt einen
benannten Typ **einmal**. Klammern und Groß-/Kleinschreibung werden verziehen
(`WidgetCondition[]`, `customcell`), ein Fehlgriff bekommt die naheliegenden
Namen genannt.

## Ein Rezept für die Zeilenregel

Aus der Praxis gemeldet: Sechzehn Modus-Regeln wurden von Hand geschrieben, weil
`rowConditions` mit `{{parent}}` nur in einer Notiz eines anderen Rezepts vorkam.
Was sechzehn Regeln durch eine ersetzt, verdient ein eigenes Beispiel — neu als
Rezept `zeilenregel`: eine Heizkörperliste, deren Zeilen ihre Betriebsart aus
`{{parent}}.CONTROL_MODE` lesen, mit den drei Platzhaltern (`{{parent}}`,
`{{dp}}`, `{{name}}`), der Reihenfolge der Regeln und dem Hinweis, dass eine
Bedingung am Eintrag selbst danach angewandt wird und die Zeilenregel schlägt.

**Nebenbefund derselben Meldung.** Die gemeldeten `#f59e0b`/`#94a3b8` kamen zum
Teil aus diesem File: die Rezepte schrieben selbst Hex-Werte, und ein Rezept ist
das, was ein Modell am zuverlässigsten übernimmt. Sie stehen jetzt als
`var(--accent-yellow)` und Co. da — außer den eCharts-Serienfarben, denn eCharts
zeichnet auf ein Canvas, wo `var()` nicht aufgelöst wird; das Rezept sagt das
dazu. Ein Test hält es fest: kein Widget eines Rezepts außer `echart` darf einen
Hex-Wert enthalten.

## Union-Typen: `ClickAction`

Aus der Praxis gemeldet: `aura_widget_schema` **und** `aura_types` antworteten
beide `ClickAction = object`. Die 16 `kind`-Werte und ihre Felder waren nirgends
zu finden — wer `link-tab` oder `popup-view` brauchte, musste ein bestehendes
Widget aus einem anderen Tab lesen.

Zwei Ursachen, beide im Generator:

1. `typeAliasBody()` schnitt bei `[^;]+` am **ersten** Semikolon ab — und das
   steht im zweiten Feld des ersten Union-Mitglieds. Der `tsType` endete mitten
   in `{ kind: 'popup-thermostat'`. Jetzt wird das erste `;` auf Klammertiefe 0
   gesucht.
2. Eine Union aus Objektliteralen hatte keine Darstellung. `unionVariants()`
   erkennt sie jetzt an einem gemeinsamen Literal-Feld (`kind`) und schreibt
   `discriminator` + `variants` ins Schema; ein JSDoc über einem Mitglied wird
   dessen `description`. Nebenbei fiel `TimerTrigger` mit ab.

`renderNamedType()` (MCP) und `renderNamedType()` in `src-vis/utils/aiPrompt.ts`
(Editor-Prompt) geben das als `ClickAction = one of` mit einer Zeile je Variante
aus — beide Wege waren betroffen. `validate.js` wählt über den Discriminator das
richtige Mitglied und prüft dessen Felder: ein erfundenes `kind` ist jetzt ein
**Fehler** mit der Liste der echten Werte, ein Tippfehler bekommt den nächsten
Namen vorgeschlagen.

**Und die Frage dahinter.** Gesucht wurde „ein Knopf, der einen Datenpunkt
schreibt" — das gibt es in `ClickAction` nicht, und die Beschreibung der Option
behauptete genau das („Popup, Navigation, **Datenpunkt schreiben**, URL"). Der
Satz ist korrigiert, und `TYPE_NOTES.ClickAction` (neu im Overlay, für Sätze über
einen ganzen Typ) nennt jetzt vor der Variantenliste die Alternativen: `chips`
(`dp` + `value`), eine Listenzeile mit `displayType: "momentary"`/`"switch"`/
`"buttons"`/`"states"`, das `enum`-Widget, `httpRequest`. Eine falsche Beschreibung
kostet mehr als eine fehlende.

## Inline-Objekttypen: `contactAppearance`

Derselbe blinde Fleck eine Etage tiefer, ebenfalls aus der Praxis gemeldet:
`contactAppearance` stand als `object` im Schema, sonst nichts. Damit war nicht
zu sehen, dass eine Kontaktzeile ihre Beschriftungen mitbringt — für eine
Fußbodenheizung „heizt"/„zu" statt „Offen"/„Zu" blieb nur der Umweg über
`states`, eine andere Darstellung mit eigener Werteliste.

Ursache war der Feldleser, nicht der Typ. `interfaceFields()` arbeitet Zeile für
Zeile; bei

```ts
contactAppearance?: {
    closed?: { label?: string; color?: string; icon?: string };
    …
};
```

fing die Regex als Typ das einzelne `{` und übersprang den Rest — `normalizeType()`
sah einen abgeschnittenen Typ und meldete `object`. Jetzt gilt:

1. **Der Leser sammelt das ganze Literal.** Öffnet eine Feldzeile ein Objekt, wird
   bis zur schließenden Klammer weitergelesen (`//`-Kommentare vorher entfernt,
   max. 60 Zeilen, sonst der alte Weg — ein unbalanciertes Literal darf nicht das
   restliche Interface verschlucken).
2. **`normalizeType()` löst balancierte Literale auf**, `{ … }[]` als `array` mit
   `items`. Damit haben auch `CustomCell.entries` und `MessageDraft.actions` ihre
   Felder — vorher beide `object`.
3. **`inlineObjectFields()` hebt JSDoc je Feld heraus**, und zwar **vor** dem
   Split: ein Komma im Prosatext („default »Geschlossen«, green") ist ein
   Top-Level-Komma und riss das Feld auseinander, zu dem es gehörte — das Feld
   fiel danach lautlos aus dem Schema. Genau so wird ein dokumentiertes Literal
   als `object` dokumentiert.

Nebeneffekt, gewollt: die Form wird jetzt auch **geprüft**. `contactAppearance:
{ closed: { labl: 'zu' } }` ist ein Fehler mit Namensvorschlag statt einer
Einstellung, die nichts tut. `test/widget-schema.test.js` hält die drei Felder je
Zustand fest, damit die Form nicht wieder still verschwindet.

## Zeilen, die es noch nicht gibt

Aus der Praxis gemeldet: `statusoverview` und `autolist` ließen sich nicht
deckeln. Ihre Zeilen entstehen erst zur Laufzeit aus Raum, Gewerk und den
gefundenen Datenpunkten — die Höhe ist damit keine Konfigurationsgröße, und auf
einem Dashboard, das nicht scrollen soll, waren beide Widgets deshalb unbrauchbar.

Beide haben jetzt `maxRows` (0 = alle) und `showMore` (Vorgabe an). Gefiltert und
sortiert wird **vor** dem Schnitt, es bleiben also die Zeilen stehen, auf die es
ankommt; was wegfällt, sagt die Fußzeile „+N weitere" statt lautlos zu
verschwinden. Was weiterhin ALLE Zeilen zählt: die Zahl hinter dem Titel, die
Summen/Statistik der Liste und der Hinweis-Chip der Statusübersicht — ein Chip,
der nur die sichtbaren Alarme zählt, würde genau das verstecken, wofür er da ist.

Für `aura_measure` ist das der eigentliche Gewinn: `itemCount()` nimmt den Deckel
als Zeilenzahl (bei einer statischen Liste `min(entries, maxRows)`), das Widget
ist damit messbar. Ohne Deckel nennt die Antwort jetzt beide Wege — `items=N` für
diese eine Rechnung, `maxRows` als dauerhafte Antwort. Die Fußzeile selbst steckt
nicht in der gemessenen Zeilenhöhe; das steht als eigener Satz dabei, statt sie
mit einer geschätzten Pixelzahl hineinzurechnen.

## Farben: Token statt Hex

Aus der Praxis gemeldet: Ein ganzes Dashboard kam mit hart eingetragenen
Hex-Werten zurück (`#f59e0b`, `#94a3b8`), weil die Palette nirgends abfragbar
war. Die Schema-Beschreibungen nennen zwar `var(--accent-green)` und
`var(--text-secondary)`, aber welche Token es gibt und welche Werte sie in
*diesem* Dashboard haben, stand nirgends. Ein fester Wert hält genau in dem
Theme, gegen das er geraten wurde — der Nutzer schaltet hell/dunkel.

`tools/schema/gen-theme-tokens.mjs` (`npm run theme-tokens`,
`theme-tokens:check`) bündelt `src-vis/themes/index.ts` mit esbuild und schreibt
`public/ai/aura-theme-tokens.json`: 14 Themes mit ihren Werten, 15 Basis-Token
und 41 Element-Token mit dem Basis-Token, den sie erben
(`ELEMENT_VAR_FALLBACKS`). Die Gruppenüberschriften („App", „Text", „Akzente",
„Switch / toggle" …) und die Notizen je Token kommen aus den Kommentaren der
beiden Interfaces — die Werte sind ausgeführt, nicht abgeschrieben, können also
nicht driften.

`lib/mcp/theme.js` liest dazu, was diese Installation ausgewählt hat
(`<ns>.config.theme`: `themeId`, `customVars`, und bei `followBrowser` das
Hell/Dunkel-Paar) und setzt beides zusammen:

- **`aura_dashboard`** trägt die Basis-Palette im Kopf mit — dort fängt jedes
  Gespräch an, und genau dort wurde die Farbe erfunden. Größen (`--widget-radius`,
  `--widget-shadow`) sind rausgefiltert, sie helfen bei einer Farbe nicht.
- **`aura_theme`** liefert alles, inklusive der Element-Token mit ihrer Vererbung
  (`elements: false` kürzt auf die Basis).

**Die eine Stelle, an der die Regel fast nicht gegolten hätte.** Aus der Praxis
gemeldet: `var(--accent)` in `echartSeries[].color` — Diagramm dauerhaft leer.
eCharts zeichnet mit `renderer: 'canvas'`, und ein Canvas kennt kein CSS. Im
echten Browser gemessen:

| gesetzt                  | `ctx.fillStyle` danach |
| ------------------------ | ---------------------- |
| `var(--accent)`          | unverändert            |
| `var(--accent, #3b82f6)` | unverändert            |
| `currentColor`           | unverändert            |
| `#3b82f6`                | `#3b82f6`              |

Die Zuweisung wird verworfen — **auch mit Fallback** —, die Serie behält die
zuletzt gesetzte Farbe und ist auf dunklem Grund weg.

Der erste Anlauf verbot darum das Token im Diagramm: Schema-Hinweis, Ausnahme in
der Palette, Fehler in `aura_validate`. Das war die schlechtere Hälfte der
Lösung — zwei Farbregeln, und Diagramme, die dem Theme nicht folgen. Jetzt löst
das **Widget** den Wert auf, bevor er ans Canvas geht:

- `utils/cssColor.ts` — `resolveCssColor(value, computedStyle)`: `var(--x)`,
  `var(--x, fallback)` und `currentColor` (das ist `cs.color`) zu einem echten
  Wert; nicht auflösbar ⇒ `undefined`, damit der Aufrufer seine Palette nimmt
  statt dem Canvas eine Zeichenkette zu geben, die es wegwirft.
- `hooks/useResolvedColors.ts` liest über `getComputedStyle` **am Element des
  Widgets** — damit gelten Layout-/Bereichs-Design und das `styleOverride` der
  Kachel mit, und Ketten (`--x: var(--y)`) hat der Browser schon aufgelöst.
- `store/themeEpoch.ts` löst das Reihenfolgeproblem: React führt Effekte von
  innen nach außen aus, ein Widget liest also **vor** dem Effekt des
  `ThemeProvider` und würde beim Theme-Wechsel das alte Theme auflösen und nie
  wieder davon hören. Die beiden Schreiber (ThemeProvider global, App für das
  bereichsbezogene `<style>`) zählen darum nach dem Schreiben einen Zähler hoch,
  die Leser hängen daran.

Damit ist die Farbregel überall dieselbe, und `echartSeries[].color` folgt dem
Theme wie jede andere Farbe. Dasselbe gilt inzwischen für das, was das Diagramm
**selbst** zeichnet: Achsenbeschriftungen (`--text-secondary`), Achsenlinien
(`--app-border`), Gitterlinien (`--widget-border`), Legende und Gauge-Spur
(`--gauge-track`, ohne eigene Einstellung `--app-border`). Das waren feste
Grautöne (#888/#444/#333/#555) — im dunklen Theme unauffällig, im hellen falsch:
eine #333-Gitterlinie ist auf Weiß fast schwarz. Die Fallbacks sind die alten
Werte, damit ein fehlendes Token nichts verschlimmert. Geblieben ist von der Prüfung genau eine Frage:
**gibt es das Token überhaupt?** Ein unbekanntes löst sich zu nichts auf und die
Serie nimmt still die nächste Palettenfarbe — `tokenColorFindings()` sagt das als
**Warnung** (kein Fehler: das Diagramm zeichnet, und eigene Variablen aus
Admin → CSS/JS sieht die Prüfung nicht). `aura_review` meldet dasselbe als
`unknown-tokens`.

`tools/tests/echart-token-colors.mjs` prüft die Kette im Browser: Token kommt
aufgelöst an, folgt dem Theme (`#eab308` → `#ca8a04`), der `var()`-Fallback
greift, ein unbekanntes Token landet bei der Palette statt bei `var(…)`, ein
Hex-Wert bleibt unangetastet. Die Rezepte tragen jetzt durchweg Token — auch in
den Serien, wo der Test sie früher ausnahm.

Zwei Feinheiten, die die Antwort ehrlich halten: Bei `followBrowser` sind **zwei**
Themes im Spiel, das steht ausdrücklich da (`#111827 / #ffffff`) statt gemittelt
zu werden — und das Default-Theme wird **nicht** zusätzlich angehängt, wenn eines
ausgewählt ist, weil zwei Werte je Token sonst „kommt drauf an" behaupten, wo es
nur einen gibt. Vom Nutzer geänderte Token stehen mit `[angepasst]` da, denn sie
gewinnen über den Theme-Wert.

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

**Zielbildschirm.** Die Hilfslinien im Editor (`guidelinesWidth/-Height`, im
`app-config`-State) sind die einzige Stelle, an der steht, wie groß das Dashboard
werden darf. `lib/mcp/canvas.js` rechnet sie in Spalten und Zeilen um — mit
derselben Formel wie das Frontend (`floor((Breite − gap) / (snapX + gap))`) und
denselben Rahmenhöhen wie `utils/guidelinesInset.ts` (Kopf 65, Tab-Leiste 44,
Bereichsleiste 48, Seitenmenü nach Breite). Raster und Hilfslinien sind pro Layout
**und** pro Bereich überschreibbar, deshalb hängt das Budget am Ziel-Tab, nicht an
den globalen Einstellungen. Genutzt von `aura_dashboard` (eine Zeile im Kopf, pro
Bereich nur wiederholt, wenn er anders liegt), `aura_measure` (nennt die Widgets,
die unter bzw. neben der Linie enden) und der Validierung (Warnung bei
`y + h > maxRows` und `x + w > maxCols`; die alte Breitenwarnung entfällt dann,
damit dasselbe Widget nicht zweimal gemeldet wird). Ohne gesetzte Hilfslinien sagt
die Antwort das ausdrücklich — die Höhe wurde vorher überhaupt nicht geprüft.
Warnung, kein Fehler: die Rahmenhöhen sind kalibrierte Schätzungen (das Frontend
misst sie selbst, der Adapter kann das nicht), und Scrollen darf eine Entscheidung
sein.

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
