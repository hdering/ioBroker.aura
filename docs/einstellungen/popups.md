# Popups

Eigene Popup-Views erstellen und als Standard für Widget-Typen zuweisen. Ein Popup öffnet sich beim Klick auf ein Widget oder über einen Datenpunkt.

![](./assets/popups.png)

## Globale Popup-Einstellungen

| Option | |
| --- | --- |
| Auto-Schließen nach (Sek.) | Automatisches Schließen; `0` / leer = aus |
| Popup-Transparenz | `0 %` = deckend, höhere Werte lassen das Dashboard durchscheinen (max. `95 %`) |
| Hintergrund abdunkeln | Abdunklung hinter dem Popup; `0 %` = keine, Standard `60 %` |
| Hintergrundfarbe | Fläche des Popups; leer = Theme (`--popup-bg`, sonst `--app-surface`) |
| Innenabstand | Abstand zwischen Popup-Rand und den Widgets darin; `0`–`40 px`, Standard `12 px` |

Alle fünf Werte gelten als Standard für jedes Popup und lassen sich überschreiben:

| Ebene | Wo |
| --- | --- |
| Popup-View | Toolbar im View-Editor (leer = global) |
| Klick-Aktion | Widget-Optionen → Klick-Aktion (leer = View/global) |

Der **Innenabstand** wirkt zusätzlich zum Innenabstand der Widgets selbst (**Frontend-Design → Typografie & Spacing**). `0 px` lässt die Widget-Karten bis an den Popup-Rand laufen — auf dem Handy die schmalste Variante. Den Scrollbalken-Streifen reserviert das Popup nur, solange sein Inhalt wirklich scrollt.

Die Hintergrundfarbe gibt es zusätzlich als Theme-Token: `--popup-bg` (und `--popup-border`) in **Layouts & Theme** färbt jedes Popup eines Layouts, ohne pro Popup etwas zu setzen — siehe [Design-Tokens](./design-tokens.md).

## Popup per Datenpunkt

Öffnet ein Popup, sobald ein beliebiger Datenpunkt seine Bedingung erfüllt — ohne Klick auf ein Widget.

| Option | |
| --- | --- |
| Bedingung | Datenpunkt + Operator + Wert; ausgelöst wird nur die Flanke (nicht erfüllt → erfüllt) |
| Ziel | Vollständige Klick-Aktion: Popup-View, alle Datenpunkte des Geräts, Bild, Webseite, JSON, HTML, Widget-Inhalt |
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

Die `<clientId>` steht in Einstellungen → Verbundene Geräte und lässt sich dort fest vergeben (siehe [Client-ID](./settings#client-id)).

Wert: Name oder ID einer Popup-View, oder JSON `{"view":"…","dp":"…","title":"…"}`. Der Datenpunkt wird nach dem Öffnen automatisch geleert.

```js
setState('aura.0.popup.open', 'Wetter-Details');
setState('aura.0.popup.open', '{"view":"Gerät","dp":"hm-rpc.0.ABC.1.STATE"}');
```

## Popup-Views

Mitgeliefert wird `Standard: Datenpunkt` (Wert, Steuerung, ID, letzte Änderung). Sie ist bewusst **kein** Widget-Typ-Standard — sie dient nur als Rückfallebene für den [Klick auf eine Listenzeile](../widgets/dynamische-liste#klick-auf-zeile) und ändert das Verhalten bestehender Widgets nicht.

`Standard: Dimmer`, `Standard: Thermostat`, `Standard: Schalter`, `Standard: Rolladen` und `Standard: Mediaplayer` werden nicht mehr weiterentwickelt und in neue Installationen nicht mehr eingerichtet. Wer sie hat, behält sie unverändert.

### Platzhalter

Haupt-Datenpunkt im Beispiel: `alias.0.Heizung.Bad.TSOLL`

| Platzhalter | ergibt | gilt in |
| --- | --- | --- |
| `{{dp}}` | `alias.0.Heizung.Bad.TSOLL` | jedem Feld der Popup-Widgets · Popup-Titel |
| `{{parent}}` | `alias.0.Heizung.Bad` | jedem Feld der Popup-Widgets · Popup-Titel |
| `{{parent2}}`, `{{parent3}}`, … | `alias.0.Heizung`, `alias.0` | jedem Feld der Popup-Widgets · Popup-Titel |
| `{{name}}` | `TSOLL` | jedem Feld der Popup-Widgets · Popup-Titel |
| `[[<dp>]]` | Wert des Datenpunkts | Popup-Titel · Widget-Name (jedes Widget) |

`{{…}}` ersetzt beim Öffnen einmalig Text, `[[…]]` liest laufend den Wert. Die Text-Ersetzung läuft zuerst, beides ist also kombinierbar:

| eingeben | in Feld | ergibt |
| --- | --- | --- |
| `{{parent}}.TIST` | Datenpunkt eines Widgets | `alias.0.Heizung.Bad.TIST` |
| `[[{{parent}}.TIST]] °C` | Widget-Name | `21.5 °C`, live |
| `{{name}} · [[{{parent}}.TIST]] °C` | Popup-Titel | `TSOLL · 21.5 °C`, live |
| `{{parent2}}.0.OPERATING_VOLTAGE` | Datenpunkt eines Widgets | Wartungskanal eines HomeMatic-Geräts, siehe unten |

Jede Zahl steht für eine Ebene weiter oben. Nötig, wenn der gesuchte Datenpunkt in einem
**anderen Kanal desselben Geräts** liegt — bei HomeMatic z. B. `hm-rpc.2.000A….1.ACTUAL_TEMPERATURE`
(Messwert) und `hm-rpc.2.000A….0.OPERATING_VOLTAGE` (Batterie): `{{parent}}` endet im Kanal `.1`,
`{{parent2}}` trifft das Gerät. Oberhalb von `adapter.instanz` gibt es keine Ebene mehr.

Beim Klick auf eine Listenzeile ist der Haupt-Datenpunkt die geklickte Zeile — ein Popup-Titel mit Platzhaltern gilt damit für alle Zeilen.

Ein Platzhalter im Namensfeld einer Listenzeile bleibt Text — nur das Feld `Datenpunkt-ID` der Zeile wird als Datenpunkt gelesen.

## Klick-Aktion „Alle Datenpunkte des Geräts"

Listet alle Datenpunkte, die unter demselben Elternobjekt, Kanal oder Gerät liegen wie der geklickte — als bedienbare Liste.

| Option | Standard | |
| --- | --- | --- |
| Umfang | Gleicher Strang | `parent` (Elternobjekt) · `channel` · `device` |
| Nur relevante Datenpunkte | aus | filtert auf bedienbare/anzeigbare Rollen |
| Datenpunkt | Widget-/Zeilen-Datenpunkt | überschreibt die Quelle |

`Gleicher Strang` funktioniert immer, auch ohne Kanal-/Geräteobjekte (z. B. bei Aliassen).

## Views verwalten

Liste aus mitgelieferten (`Standard: …`) und eigenen Views. Pro View: `Bearbeiten`, `Kopieren`, `Exportieren`; eigene zusätzlich umbenennen/löschen. Über `View hinzufügen` bzw. `Import` neue Views anlegen.

`Ungenutzte entfernen` löscht die mitgelieferten Standard-Views, auf die nichts verweist. Der Dialog listet vorher auf, was entfernt wird und was aus welchem Grund bleibt:

| Grund | |
| --- | --- |
| wurde angepasst | View wurde bearbeitet |
| ist als Klick-Aktion verlinkt | Widget, Popup-Widget oder Trigger zeigt darauf |
| ist Typ-Standard für vorhandene Widgets | Widgets dieses Typs ohne eigene Klick-Aktion öffnen sie |
| kann über Listenzeilen im Automatik-Modus geöffnet werden | Zeilen-Klick `Automatisch` löst die View über die Rolle auf |

## Widget-Typ-Standards

Ordnet einem Widget-Typ eine Popup-View zu — gilt für alle Widgets dieses Typs ohne individuelle Klick-Aktion. In Bestandsinstallationen sind Dimmer, Thermostat, Schalter, Rolladen und Mediaplayer hier vorbelegt; neue Installationen starten ohne Zuordnung. `Popup-View` auf `— keine View —` unterdrückt das Popup für den Typ, das Papierkorb-Symbol entfernt die Zuordnung ganz.

| Spalte | |
| --- | --- |
| Widget-Typ | Typ, für den der Standard gilt |
| Popup-View | Zugeordnete View |
| Nur für Layouts | Optionaler Layout-Filter |
