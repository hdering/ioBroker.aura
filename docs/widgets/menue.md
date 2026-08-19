# Menü

Frei positionierbares Navigations-Menü — zeigt die Bereiche des Layouts oder die Tabs des Bereichs zum direkten Umschalten.

![](./assets/menue/variant-hbar.png)

## Datenpunkt

Keiner. Die Einträge, ihre Namen und Icons stammen aus dem Layout ([Layouts](../einstellungen/layouts)).

## Menü-Typ

| `menuMode` | Einträge | Klick springt auf |
| --- | --- | --- |
| `section` | Bereiche des Layouts | `/view/<layout>/s/<bereich>` |
| `tab` | Tabs des aktuellen Bereichs | `/view/…/tab/<tab>` |

Tab-Menü (`menuMode: tab`):

![](./assets/menue/mode-tab.png)

Als `hidden` markierte Bereiche und Tabs erscheinen nie. Ein Wechsel des Menü-Typs setzt die Auswahl der Menüpunkte zurück.

## Varianten

### Leiste horizontal (`hbar`)

Eine Zeile, horizontal scrollbar — Standard.

![](./assets/menue/variant-hbar.png)

### Chips (`pills`)

Umbrechende Chip-Leiste, erzwingt den Aktiv-Stil `pills`.

![](./assets/menue/variant-pills.png)

### Liste vertikal (`vlist`)

Einträge untereinander, vertikal scrollbar.

![](./assets/menue/variant-vlist.png)

### Raster (`grid`)

Feste Spaltenzahl über `gridCols`.

![](./assets/menue/variant-grid.png)

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/menue/config.png)

### Menü-Typ

| Option | Standard | |
| --- | --- | --- |
| `menuMode` | `section` | `section` (Bereich-Menü) · `tab` (Tab-Menü) |
| `hiddenItems` | `[]` | abgewählte Einträge; im Dialog werden die **sichtbaren** Menüpunkte gewählt |

### Variante

| Option | Standard | |
| --- | --- | --- |
| `variant` | `hbar` | `hbar` · `pills` · `vlist` · `grid` |
| `indicatorStyle` | `underline` | Aktiv-Stil: `text` · `underline` · `filled` · `pills` |
| `align` | `start` | `start` · `center` · `end` — wirkt bei `hbar` und `pills` |
| `gridCols` | `3` | Spalten (1–12), nur bei `variant: grid` |
| `gap` | `6` | Abstand zwischen den Einträgen in px |
| `iconSize` | `18` | px (8–64) |
| `showIcons` | `true` | Icons anzeigen — Bereiche ohne eigenes Icon zeigen ein Standard-Icon, Tabs ohne Icon nur Text |
| `showLabels` | `true` | Text anzeigen |

## Verhalten

| | |
| --- | --- |
| Aktiver Eintrag | Bereich bzw. Tab der aktuell angezeigten Ansicht |
| Deaktivierte Tabs | ausgegraut, kein Klick |
| Keine Einträge übrig | Hinweis „Keine Menüpunkte" |
| Editor & Admin-Bereich | Vorschau, Klicks navigieren nicht |
| Rahmen | ohne Titelzeile; im Editor liegen die Werkzeuge oben rechts |

Für eine Überschrift über dem Menü den [Abschnittstitel](./abschnittstitel) verwenden.
