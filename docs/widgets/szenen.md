# Szenen

Löst Szenen des ioBroker-Szenen-Adapters (`scenes`) aus. Neue Szenen lassen sich direkt im Dashboard anlegen: Geräte wählen, Werte lernen, fertig. Aura speichert keine eigenen Szenen. Alle liegen als `scene.0.*` im Szenen-Adapter und funktionieren auch in Skripten, Blockly und Alexa.

| Liste | Kacheln | Szene bearbeiten |
| --- | --- | --- |
| ![](./assets/szenen/runtime.png) | ![](./assets/szenen/kacheln.png) | ![](./assets/szenen/popup.png) |

## Voraussetzung

| | |
| --- | --- |
| Adapter | `scenes` installiert und gestartet |
| Instanz-Einstellungen von Aura → **Szenen-Widget** | Instanz, erlaubte Geräte, optional PIN |

### Instanz-Einstellungen

| Feld | |
| --- | --- |
| Instanz des Szenen-Adapters | Standard `scenes.0` |
| Für Szenen erlaubte Geräte | ein Datenpunkt je Zeile (z. B. `….STATE`, `….LEVEL`), Bezeichnung optional |
| PIN zum Ändern von Szenen | leer = kein PIN; gesetzt = Anlegen, Lernen und Löschen fragen danach |

Nur die eingetragenen Datenpunkte lassen sich einer Szene hinzufügen. Der Adapter prüft das bei jedem Speichern.

## Bedienung

| Aktion | |
| --- | --- |
| Tipp auf eine Szene | Szene auslösen |
| hervorgehoben | alle Geräte stehen auf den Werten der Szene |
| **+ Neue Szene** | Name, Geräte wählen, **Speichern** = aktuelle Werte übernehmen |
| **⋯** | bearbeiten, **Neu lernen**, löschen |

**Lernen:** Geräte erst so einstellen, wie die Szene sein soll, dann speichern. Nachträglich hinzugefügte Geräte lernen ihren Wert beim Speichern, **Neu lernen** übernimmt alle Werte erneut.

| Szenen | bearbeitbar | Ablage |
| --- | --- | --- |
| im Dashboard angelegt | ja | `scene.0.aura.<name>` |
| im Admin des Szenen-Adapters angelegt | nein, nur auslösen | `scene.0.…` |

## Einstellungen

| Option | Standard | |
| --- | --- | --- |
| `layout` | `default` | `default` = Liste, `card` = Kacheln |
| `allowEdit` | `true` | **+ Neue Szene** und **⋯** |
| `showDeviceCount` | `true` | Anzahl Geräte je Szene (Liste) |
| `showForeignScenes` | `false` | Szenen aus dem Admin mit anzeigen |
| `autoHeight` | `false` | Höhe folgt der Zahl der Szenen — siehe [Höhe an Inhalt anpassen](../einstellungen/editor#hohe-an-inhalt-anpassen) |

## Hinweise im Widget

| Hinweis | Ursache |
| --- | --- |
| Szenen-Adapter nicht installiert | Adapter `scenes` fehlt |
| Szenen-Adapter läuft nicht | Instanz gestoppt, Auslösen wirkt nicht |
| Noch keine Geräte freigegeben | Liste in den Instanz-Einstellungen leer |
| Ohne Wert (beim Auslösen „aus“) | Gerät hatte beim Lernen keinen Wert |
| Falscher PIN | PIN der Instanz-Einstellungen eingeben |
