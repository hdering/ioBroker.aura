# Szenen

Löst Szenen des ioBroker-Szenen-Adapters (`scenes`) aus. Neue Szenen legst du direkt in Aura an: Geräte wählen, Werte festlegen, fertig. Aura speichert keine eigenen Szenen. Alle liegen als `scene.0.*` im Szenen-Adapter und funktionieren auch in Skripten, Blockly und Alexa.

| Liste | Kacheln | Szene bearbeiten |
| --- | --- | --- |
| ![](./assets/szenen/runtime.png) | ![](./assets/szenen/kacheln.png) | ![](./assets/szenen/popup.png) |

## Voraussetzung

| | |
| --- | --- |
| Adapter | `scenes` installiert und gestartet; die Instanz findet Aura selbst |

## Szenen verwalten

Im Bearbeiten-Dialog des Widgets, Abschnitt **Szenen verwalten**. Mit der Option `allowEdit` geht das auch direkt im Dashboard (**+ Neue Szene**, **⋯**).

![](./assets/szenen/verwalten.png)

| Im Popup | |
| --- | --- |
| **Geräte und Werte** | Wert je Gerät: an/aus, Zahl, Auswahlliste (bei `common.states`) oder Text |
| **Geräte in diesem Bereich** | Datenpunkte der Widgets im selben Bereich, ein Tipp fügt hinzu |
| **Weitere Geräte …** | beliebiger Datenpunkt über die Datenpunkt-Suche |
| neues Gerät | startet mit seinem aktuellen Wert |
| **Aktuelle Werte** | alle Werte auf den momentanen Zustand der Geräte setzen |
| **🗑** | Szene löschen (mit Rückfrage) |

Erlaubt ist jeder beschreibbare Datenpunkt außer `system.*` und `scene.*`.

| Szenen | bearbeitbar | Ablage |
| --- | --- | --- |
| in Aura angelegt | ja | `scene.0.aura.<name>` |
| im Admin des Szenen-Adapters angelegt | nein, nur auslösen | `scene.0.…` |

## Bedienung

| Aktion | |
| --- | --- |
| Tipp auf eine Szene | Szene auslösen |
| hervorgehoben | alle Geräte stehen auf den Werten der Szene |

Wer im Dashboard Szenen ändern darf, regelt `allowEdit` zusammen mit dem PIN von Bereich oder Tab.

## Einstellungen

| Option | Standard | |
| --- | --- | --- |
| `layout` | `default` | `default` = Liste, `card` = Kacheln |
| `allowEdit` | `false` | Szenen auch im Dashboard anlegen und bearbeiten |
| `showDeviceCount` | `true` | Anzahl Geräte je Szene (Liste) |
| `showForeignScenes` | `false` | Szenen aus dem Admin mit anzeigen |
| `autoHeight` | `false` | Höhe folgt der Zahl der Szenen — siehe [Höhe an Inhalt anpassen](../einstellungen/editor#hohe-an-inhalt-anpassen) |

## Hinweise im Widget

| Hinweis | Ursache |
| --- | --- |
| Szenen-Adapter nicht installiert | Adapter `scenes` fehlt |
| Szenen-Adapter läuft nicht | Instanz gestoppt, Auslösen wirkt nicht |
| Ohne Wert (beim Auslösen „aus“) | Gerät hatte beim Speichern keinen Wert |
| Nicht als Szenen-Gerät nutzbar | Datenpunkt nur lesbar, `system.*` oder `scene.*` |
| nicht verfügbar (im Popup) | Datenpunkt existiert nicht mehr; Gerät entfernen |
