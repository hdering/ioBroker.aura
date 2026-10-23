# Verlauf per Klick auf eine Listenzeile

Ein Klick auf eine Zeile der Liste öffnet den Verlauf genau dieses Datenpunkts als Diagramm — mit einer einzigen Popup-View für alle Zeilen, ohne ausgeblendete Diagramme.

Das Popup bekommt den Datenpunkt der angeklickten Zeile als `{{dp}}` übergeben.

## 1. Popup-View mit Diagramm anlegen

**Admin → Popups → Popup-Views → View hinzufügen**, Name z. B. „Verlauf“

| Schritt | |
| --- | --- |
| Diagramm einfügen | Im View-Editor oben den Widget-Typ **Diagramm** wählen → **+ Widget** |
| Datenpunkt | Steht bereits auf `{{dp}}` — so lassen |
| Größe | Diagramm auf die gewünschte Breite ziehen |

Eine History-Instanz muss nicht eingestellt werden: Das Diagramm findet sie über den Datenpunkt der angeklickten Zeile. Sind mehrere History-Adapter aktiv, erscheint im Popup ein Auswahlfeld.

## 2. Liste verknüpfen

**Liste → Bearbeiten → Datenpunkte → Datenpunkte verwalten → Klick auf Zeile**

| Option | |
| --- | --- |
| Klick auf Zeile | **Eigene Aktion** |
| Aktion | `Popup: View` |
| Popup-View | Die View aus Schritt 1 |
| Haupt-DP für Popup | **Leer lassen** — sonst zeigen alle Zeilen denselben Datenpunkt |
| Custom Popup-Titel | Leer lassen — dann steht der Zeilenname im Popup-Kopf |

## Ergebnis

Ein Klick auf eine Zeile öffnet den Verlauf ihres Datenpunkts, mit umschaltbaren Zeitbereichen (1 Std … 30 Tage). Schalter, Regler und Buttons in der Zeile schalten weiterhin direkt.

## Varianten

| Fall | |
| --- | --- |
| Nur einzelne Zeilen | Eintrag wählen → **Klick auf Zeile** → **Eigene Aktion** mit der View aus Schritt 1; die Liste selbst bleibt auf **Aus** |
| Einzelne Zeilen ausnehmen | Eintrag wählen → **Klick auf Zeile** → **Aus** |
| Dynamische Liste | Gleiche Einstellung im Tab **Klick auf Zeile** der [dynamischen Liste](../widgets/dynamische-liste) |

Siehe auch: [Liste – Klick auf Zeile](../widgets/liste#klick-auf-zeile), [Popup-Views](../einstellungen/popups), [Diagramm](../widgets/diagramm).
