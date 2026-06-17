# Bild

Zeigt ein statisches Bild aus einer URL, einer lokalen Datei oder einem Datenpunkt (URL oder Base64). Optional wird das Bild in einem Intervall neu geladen.

## Datenpunkt

Kein Pflicht-Datenpunkt; die Quelle kann eine feste URL oder ein Datenpunkt sein.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `imageUrl` | ja* | — | Bild-URL, lokale Datei oder Base64/Data-URI |
| `imageDatapoint` | ja* | — | Datenpunkt mit URL, Data-URI oder Base64-JPEG |

*einer von beiden. Liegt am Datenpunkt ein Wert an, hat er Vorrang vor `imageUrl`.

## Layouts

### Default
Optionaler Titel/Icon oben, darunter das Bild mit der gewählten Anpassung.

### Custom
Felder `url` und `dp` frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/bild/config.png)

### Quelle

| Option | Standard | |
| --- | --- | --- |
| `imageUrl` | — | Bild-URL, lokale Datei oder Base64 |
| `imageDatapoint` | — | Datenpunkt mit URL/Base64 |
| `fit` | `contain` | `none` · `contain` · `width` · `height` |
| `refreshInterval` | `0` | Sekunden zwischen Reloads (`0` = aus) |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `ImageIcon` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |
