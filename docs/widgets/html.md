# HTML

Bettet beliebigen HTML/CSS-Code in einer Sandbox-iFrame ein. Der Inhalt kann statisch hinterlegt oder aus einem Datenpunkt gelesen werden — ein gesetzter Datenpunkt überschreibt das statische HTML.

Datenpunkt-Werte lassen sich als [Platzhalter](#platzhalter) mitten in den HTML-Code schreiben — inklusive
[Berechnungen](./bindings).

Mögliche Bildquellen (URL, Adapter-Pfad, Datei, Base64): siehe [Bildpfade](./bildpfade).

## Datenpunkt

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `htmlDatapoint` | nein | `string` | DP-Wert wird als HTML gerendert; überschreibt `htmlContent` |

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/html/config.png)

### Inhalt

| Option | Standard | |
| --- | --- | --- |
| `htmlContent` | — | statisches HTML |
| `htmlDatapoint` | — | Datenpunkt mit HTML (überschreibt `htmlContent`) |
| `valueDatapoint` | — | Datenpunkt für den Platzhalter `{dp}` |
| `decimals` | global | Nachkommastellen für Zahlen aus Platzhaltern |
| `scrollable` | `true` | Scrollen im iFrame erlauben |

### Platzhalter

Im HTML werden Platzhalter live durch Datenpunkt-Werte ersetzt — im statischen HTML
genauso wie in HTML, das aus `htmlDatapoint` kommt.

| Platzhalter | ersetzt durch |
| --- | --- |
| `{beliebige.dp.id}` | Wert dieses Datenpunkts, z. B. `{alias.0.Raeume.Bad.ACTUAL}` (wird live abonniert) |
| `{dp}` | Wert von `valueDatapoint`, ersatzweise des Haupt-Datenpunkts des Widgets |

JSON-Werte über einen Pfad-Suffix — die drei Schreibweisen sind gleichwertig:

```html
{0_userdata.0.Akku?soc}
{0_userdata.0.Akku#soc}
{0_userdata.0.Akku}#soc
```

Das gilt auch für `{dp}`: `{dp}#battery.soc` · `{dp}#cells[1]`

Beispiel:

```html
<div style="font:600 28px system-ui">
  {alias.0.Raeume.Bad.ACTUAL} °C
  <small>Akku {0_userdata.0.Akku}#soc %</small>
</div>
```

Fehlende Werte erscheinen als „–". CSS-Klammern (`{ color: red }`) und unbekannte
Platzhalter bleiben unangetastet. Ein `#`-Anhang in Großbuchstaben gilt nie als
JSON-Pfad, damit IDs mit `#` (Shelly) und Anker wie `href="{dp}#TOP"` heil bleiben.

### Berechnungen

Platzhalter können rechnen, runden, Farben bilden und Zeitstempel formatieren — in
drei zu ioBroker.vis kompatiblen Schreibweisen:

```html
{0_userdata.0.Netz;round(0)} W
{a:0_userdata.0.Rot;b:0_userdata.0.Gruen;a + b}
<span style="color:{{ 0_userdata.0.Netz < 0 ? '#00ff00' : '#ff2c0a' }}">…</span>
```

Vollständige Referenz — Operationen, Funktionen, Datums-Tokens, Rezepte und
Fehlersuche: **[Bindings & Berechnungen](./bindings)**.

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Code2` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Sandbox

Schränkt die Berechtigungen des eingebetteten Inhalts ein.

| Option | Standard | |
| --- | --- | --- |
| `sandboxPreset` | `standard` | `off` · `minimal` · `standard` · `extended` · `full` · `custom` |
| `sandboxCustom` | — | eigene Flags bei `custom`, z. B. `allow-scripts allow-forms` |
