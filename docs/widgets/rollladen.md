# Rollladen

Steuert und zeigt die Rollladen-Position (0–100 %) an. Auf-, Stop- und Ab-Tasten, optional ein Schieberegler, dazu eine grafische Lamellen-Darstellung und Fahr-Anzeige. Wahlweise Positions- oder Tasten-Modus.

![](./assets/rollladen/runtime.png)

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `datapoint` | ja | `number` | Position 0–100 %, `0` = geschlossen, `100` = offen |
| `openDp` / `closeDp` | nein | `boolean` | Tasten-DPs für Auf/Ab (nur bei `controlMode: taster`) |
| `stopDp` | nein | `boolean` | separater Stop-DP; ohne ihn wird die aktuelle Position zurückgeschrieben |
| `activityDp` | nein | — | meldet, ob der Rollladen fährt |
| `directionDp` | nein | — | Fahrtrichtung (`1` = auf, `2` = ab) |

## Layouts

### Default
Titel/Icon oben, grafische Lamellen-Anzeige mit vertikaler Tastenreihe, darunter Status, Prozentwert und Schieberegler — für mittlere Zellen.

### Compact
Eine Zeile mit Icon, Titel, Prozentwert und Tastenreihe — für Listen mit vielen Rollläden.

### Minimal
Auf-Taste, Prozentwert und Stop/Ab-Tasten zentriert — für sehr kleine Zellen.

### Custom
Icon, Position, Status und Auf-/Stop-/Ab-Tasten frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/rollladen/config.png)

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen (sonst grafische Lamellen-Anzeige) |
| `showValue` | `true` | Prozentwert anzeigen |
| `showControls` | `true` | Auf-/Stop-/Ab-Tasten anzeigen |
| `showSlider` | `true` | Schieberegler anzeigen (Default-Layout) |
| `icon` | grafische Anzeige | [Lucide-Icon](https://lucide.dev) statt Lamellen-Grafik |
| `iconSize` | `20` | px |
| `valueSize` | `20` | px, Schriftgröße des Prozentwerts |
| `buttonSize` | `14` | px, Tasten-Icongröße |
| `sliderHeight` | `6` | px, Höhe des Schiebereglers |
| `titleAlign` | `left` | `left` · `center` · `right` |
| `showClosedPercent` | `false` | Prozent als „geschlossen" statt „geöffnet" zählen |

### Steuerung

| Option | Standard | |
| --- | --- | --- |
| `controlMode` | `position` | `position` (Position schreiben) · `taster` (`openDp`/`closeDp` pulsen) |
| `invertPosition` | `false` | Positionswert invertieren (`0`↔`100`) |
| `sendOnRelease` | `true` | Regler-Wert erst beim Loslassen schreiben (sonst live) |

### Schwellwerte

Färbt den Prozentwert abhängig von der Position.

| Option | Standard | |
| --- | --- | --- |
| `colorThresholds` | — | Liste aus `[Schwelle, Farbe]`, z. B. `[[30,"#f00"],[100,"#0f0"]]` |

### Fahr-Anzeige

| Option | Standard | |
| --- | --- | --- |
| `activityMovingValues` | — | kommagetrennte Werte von `activityDp`, die „fährt" bedeuten; ohne Angabe gelten `true`/`1` |

### Status-Datenpunkte

Optionale Batterie- und Erreichbarkeits-DPs werden als kleine Badges eingeblendet (Abschnitt **Status-Datenpunkte** im Dialog).
