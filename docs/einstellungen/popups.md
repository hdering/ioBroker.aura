# Popups

Eigene Popup-Views erstellen und als Standard für Widget-Typen zuweisen. Ein Popup öffnet sich beim Klick auf ein Widget oder über einen Datenpunkt.

![](./assets/popups.png)

## Globale Popup-Einstellungen

| Option | |
| --- | --- |
| Auto-Schließen nach (Sek.) | Automatisches Schließen; `0` / leer = aus |

## Popup per Datenpunkt

Öffnet ein Popup, sobald ein beliebiger Datenpunkt seine Bedingung erfüllt — ohne Klick auf ein Widget.

| Option | |
| --- | --- |
| Bedingung | Datenpunkt + Operator + Wert; ausgelöst wird nur die Flanke (nicht erfüllt → erfüllt) |
| Ziel | Vollständige Klick-Aktion: Popup-View, Bild, Webseite, JSON, HTML, Widget-Inhalt |
| Datenpunkt zurücksetzen | Schreibt nach dem Öffnen einen Wert zurück (Tastermodus); leer = `false` |
| Popup schließen, wenn … | Schließt das Popup, sobald die Bedingung nicht mehr erfüllt ist |
| Gültig auf Geräten | Optionaler Client-Filter; leer = alle Geräte |
| Nur in Layout / Nur auf Tab | Optionaler Scope |

Der Trigger-Datenpunkt steht im Popup als `{{dp}}` bereit — eine Popup-View lässt sich so für mehrere Trigger wiederverwenden.

::: tip Flanke statt Zustand
Steht der Datenpunkt beim Laden der Seite schon auf dem Trigger-Wert, öffnet sich kein Popup. Bei mehreren Geräten schreibt das schnellste den Reset-Wert; die Flanke erreicht vorher alle Geräte.
:::

### Per Skript öffnen

| Datenpunkt | |
| --- | --- |
| `aura.0.popup.open` | Alle Geräte |
| `aura.0.clients.<clientId>.popup.open` | Nur dieses Gerät |

Wert: Name oder ID einer Popup-View, oder JSON `{"view":"…","dp":"…","title":"…"}`. Der Datenpunkt wird nach dem Öffnen automatisch geleert.

```js
setState('aura.0.popup.open', 'Wetter-Details');
setState('aura.0.popup.open', '{"view":"Gerät","dp":"hm-rpc.0.ABC.1.STATE"}');
```

## Popup-Views

Liste aus mitgelieferten (`Standard: …`) und eigenen Views. Pro View: `Bearbeiten`, `Kopieren`, `Exportieren`; eigene zusätzlich umbenennen/löschen. Über `View hinzufügen` bzw. `Import` neue Views anlegen.

## Widget-Typ-Standards

Ordnet einem Widget-Typ eine Popup-View zu — gilt für alle Widgets dieses Typs ohne individuelle Klick-Aktion.

| Spalte | |
| --- | --- |
| Widget-Typ | Typ, für den der Standard gilt |
| Popup-View | Zugeordnete View |
| Nur für Layouts | Optionaler Layout-Filter |
