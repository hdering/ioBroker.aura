# Bindings & Berechnungen

Ein **Binding** ist ein Platzhalter im HTML, den aura live durch einen Datenpunktwert ersetzt — und auf Wunsch vorher damit rechnet, vergleicht oder formatiert.

Gültig in:

| Widget | Feld |
| --- | --- |
| [HTML](./html) | `htmlContent` (statisches HTML) **und** der Inhalt aus `htmlDatapoint` |
| [Wert-Anzeige](./wert-anzeige) | `htmlTemplate` |

Die Syntax folgt [ioBroker.vis](https://github.com/ioBroker/ioBroker.vis-2#bindings-of-objects): Bindings aus einer bestehenden vis-Ansicht lassen sich übernehmen. Abweichungen stehen unter [Unterschiede zu ioBroker.vis](#unterschiede-zu-iobroker-vis).

## Die vier Schreibweisen

| Schreibweise | Beispiel | wofür |
| --- | --- | --- |
| Wert | `{0_userdata.0.Netz}` | ein Datenpunkt, formatiert wie im Widget eingestellt |
| Operations-Kette | `{0_userdata.0.Netz;round(0)}` | ein Datenpunkt durch eine Reihe von Operationen |
| Benannte Variablen | `{a:dp1;b:dp2;a + b}` | mehrere Datenpunkte, freier Ausdruck (vis-Schreibweise) |
| Kurzform | `{{ dp1 + dp2 }}` | dasselbe, Datenpunkt-IDs direkt im Ausdruck (aura) |

Alle drei rechnenden Formen benutzen dieselben [Operationen](#operationen) und denselben [Ausdruck](#ausdrucke). Was man nimmt, ist Geschmackssache:

- **Kette**, wenn ein Wert nur durch ein paar Schritte soll — kürzeste Schreibweise.
- **Benannte Variablen**, wenn Bindings aus vis kopiert werden oder IDs lang sind und mehrfach vorkommen.
- **Kurzform**, wenn der Ausdruck im Vordergrund steht. Sie stört Inline-CSS nie, weil `{{` in CSS nicht vorkommt.

## Schnellstart

```html
<!-- 1. roher Wert -->
<b>{0_userdata.0.Temperatur}</b> °C
```
→ `21,4 °C`

```html
<!-- 2. gerundet -->
{0_userdata.0.Netz;round(0)} W
```
→ `-1235 W`

```html
<!-- 3. Farbe nach Vorzeichen -->
<span style="color: {{ 0_userdata.0.Netz < 0 ? '#00ff00' : '#ff2c0a' }}">
  {0_userdata.0.Netz;formatValue(1)} W
</span>
```
→ grüner Text, `-1.234,6 W`

```html
<!-- 4. Balkenhöhe in einem SVG -->
<svg viewBox="0 0 200 200">
  <rect x="0" width="200" height="10"
        y="{{ 180 - 180 * Math.min(0_userdata.0.Fuellstand / 255, 1) }}" />
</svg>
```
→ bei `100` wird daraus `y="109.411764706"`

## Datenpunkte ansprechen

Eine Zeichenkette gilt als Datenpunkt-ID, wenn sie mit einem Buchstaben, einer Ziffer oder `_` beginnt und **mindestens einen Punkt** enthält — `0_userdata.0.Temperatur`, `senec.0.ENERGY.GUI_GRID_POW`. Alles ohne Punkt ist eine [Variable](#variablen).

Jeder referenzierte Datenpunkt wird automatisch abonniert: ändert er sich, rendert das Widget neu.

### JSON-Pfade

Steht im Datenpunkt ein Objekt oder ein JSON-String, adressiert ein Pfad den Teilwert.

| Form | Beispiel | gilt in |
| --- | --- | --- |
| `?pfad` | `{0_userdata.0.Akku?soc}` | Wert, Kette, Deklaration |
| `#pfad` | `{0_userdata.0.Akku#soc}` | Wert |
| `}#pfad` | `{0_userdata.0.Akku}#soc` | Wert |
| `['pfad']` | `{{ 0_userdata.0.Akku['soc'] }}` | Ausdruck |

Alle vier zeigen auf dasselbe und lösen dieselbe eine Subscription aus. Array-Indizes: `{0_userdata.0.Akku?cells.1}` bzw. `{{ 0_userdata.0.Akku['cells'][1] }}`.

::: warning In Ausdrücken kein `?`
Innerhalb von `{{ … }}` und hinter den Deklarationen ist `?` der Bedingungs-Operator. Dort **muss** die Klammer-Schreibweise benutzt werden.
:::

### Zeitstempel

Ein Suffix an der ID liefert statt des Werts seinen Zeitstempel (Millisekunden seit 1970):

| Suffix | bedeutet |
| --- | --- |
| `.ts` | letzte Aktualisierung |
| `.lc` | letzte **Änderung** (last change) |

```html
Zuletzt geändert: {0_userdata.0.Netz.lc;date(hh:mm)}
```
→ `Zuletzt geändert: 14:32`

Das kostet keine zusätzliche Subscription — die Zeitstempel kommen mit dem Wert mit.

### IDs mit Sonderzeichen

`#` und `-` gehören zur ID, solange direkt ein Wortzeichen folgt. Shelly-IDs bleiben damit heil:

```html
{shelly.0.SHSW-25#4C7525#1.Relay0.Switch}
```

::: warning Operatoren mit Leerzeichen schreiben
Genau deshalb ist `dp1-dp2` **eine** ID und keine Subtraktion. In Ausdrücken immer `dp1 - dp2` schreiben. Betroffen ist nur `-`; `+ * / %` sind eindeutig.
:::

Umlaute, `ß` und andere Nicht-ASCII-Buchstaben (z. B. kyrillische) sind gültige ioBroker-IDs und funktionieren in allen vier Schreibweisen:

```html
{0_userdata.0.Haus.EG_Küche.Sensor.temperature}
```

::: tip Trotzdem besser vermeiden
Für neue Datenpunkte sind ASCII-Namen die ruhigere Wahl — Skripte, Exporte und Fremdadapter gehen nicht alle so gelassen damit um.
:::

### Fehlende Werte

| Schreibweise | fehlender Datenpunkt ergibt |
| --- | --- |
| `{id}` | `–` |
| `{id;op}`, `{a:id;…}`, `{{ … }}` | nichts (leerer Text) |

Der Unterschied ist Absicht: ein Gedankenstrich in `y="…"` würde ein SVG zerlegen. Wer eine sichtbare Lücke will, hängt `default()` an:

```html
{0_userdata.0.Fehlt;default(–)}
{{ 0_userdata.0.Fehlt | default('–') }}
```

## Variablen

Ohne Punkt im Namen ist ein Bezeichner eine Variable. Aura kennt diese:

| Variable | Inhalt |
| --- | --- |
| `dp` | Wert des Widget-Datenpunkts (HTML-Widget: `valueDatapoint`, ersatzweise der Haupt-Datenpunkt) |
| `color` | aktuelle Schwellwert-Farbe (nur Wert-Anzeige) |
| `unit` | konfigurierte Einheit (nur Wert-Anzeige) |
| `language` | Sprache der Oberfläche, `de` oder `en` |
| `view` | Name des gerade angezeigten Tabs |
| `wid` | ID des Widgets |
| `wname` | Titel des Widgets |

Dazu alles, was das Binding selbst mit `name:datenpunkt` deklariert:

```html
{leistung:senec.0.ENERGY.GUI_INVERTER_POWER;akku:0_userdata.0.Akku?soc;leistung * akku / 100}
```

Deklarationen gewinnen gegen Datenpunkt-IDs: heißt eine Variable `dp`, ist `dp` die Variable.

JSON-Pfade in Variablen gehen mit Punkt statt Klammer, weil eine Variable nie eine ID ist: `{dp}#battery.soc` bzw. `{{ dp.battery.soc }}`.

::: info Aus vis nicht übernommen
`username`, `login` und `instance` gibt es nicht — das aura-Frontend hat keine eigene Benutzersitzung. Die sitzungslokalen `local_*`-Variablen von vis fehlen ebenfalls.
:::

## Operationen

Operationen hängt man mit `;` an (Kette) oder mit `|` an (Ausdruck). Es ist dieselbe Liste:

```html
{0_userdata.0.Netz;round(0)}          <!-- Kette -->
{{ 0_userdata.0.Netz | round(0) }}    <!-- Ausdruck -->
```

### Rechnen

| Operation | Wirkung | Beispiel → Ergebnis |
| --- | --- | --- |
| `*(n)` | multiplizieren | `{dp;*(4)}` bei `4` → `16` |
| `+(n)` | addieren | `{dp;+(2)}` bei `4` → `6` |
| `-(n)` | subtrahieren | `{dp;-(-674.5)}` bei `0` → `674.5` |
| `/(n)` | dividieren | `{dp;/(100)}` bei `250` → `2.5` |
| `%(n)` | Rest | `{dp;%(3)}` bei `10` → `1` |
| `sqrt` | Quadratwurzel | `{dp;sqrt}` bei `16` → `4` |
| `pow` | quadrieren | `{dp;pow}` bei `3` → `9` |
| `pow(n)` | n-te Potenz | `{dp;pow(10)}` bei `2` → `1024` |

### Runden & Grenzen

| Operation | Wirkung | Beispiel → Ergebnis |
| --- | --- | --- |
| `round` | auf ganze Zahl | `{dp;round}` bei `2.6` → `3` |
| `round(n)` | auf n Nachkommastellen | `{dp;round(1)}` bei `-1234.56` → `-1234.6` |
| `floor` | abrunden | `{dp;floor}` bei `2.7` → `2` |
| `ceil` | aufrunden | `{dp;ceil}` bei `2.1` → `3` |
| `min(n)` | **Untergrenze** | `{dp;min(0)}` bei `-5` → `0`, bei `7` → `7` |
| `max(n)` | **Obergrenze** | `{dp;max(100)}` bei `150` → `100`, bei `40` → `40` |

::: danger `min` und `max` sind vertauscht
Das kommt aus vis und bleibt aus Kompatibilitätsgründen so: **`min(0)` hebt kleine Werte an, `max(100)` deckelt große.** Ein Wert wird also so auf 0…100 geklemmt:

```html
{0_userdata.0.Roh;min(0);max(100)}
```

Die Funktionen `Math.min()` / `Math.max()` in Ausdrücken verhalten sich dagegen wie in JavaScript — `Math.min(a, b)` ist der kleinere der beiden.
:::

### Farben

| Operation | Wirkung | Beispiel → Ergebnis |
| --- | --- | --- |
| `hex` | Hex, klein | bei `255` → `ff` |
| `hex2` | Hex, klein, zweistellig | bei `12` → `0c` |
| `HEX` | Hex, groß | bei `255` → `FF` |
| `HEX2` | Hex, groß, zweistellig | bei `12` → `0C` |

```html
<div style="background:#{0_userdata.0.Rot;HEX2}{0_userdata.0.Gruen;HEX2}{0_userdata.0.Blau;HEX2}">
```
→ bei `100` / `200` / `12`: `background:#64C80C`

Werte in Prozent vorher skalieren: `{0_userdata.0.Rot;/(100);*(255);HEX2}`

### Formatieren

| Operation | Wirkung | Beispiel → Ergebnis |
| --- | --- | --- |
| `formatValue(n)` | Anzeige-Format des Widgets (Tausenderpunkt, Dezimalkomma) | bei `1234.56` → `1.234,6` |
| `fixed(n)` | feste Nachkommastellen, technisch | bei `1234.56` → `1234.6` |
| `default(x)` | Ersatz für leere Werte | bei `null` → `x` |
| `upper` · `lower` · `trim` | Text | bei `ab` → `AB` · `ab` · `ab` |
| `bool` | Wahrheitswert | bei `"true"` → `true` |
| `json` | als JSON-Text | bei `{a:1}` → `{"a":1}` |

`formatValue` ohne Argument nimmt die Nachkommastellen aus den Widget-Einstellungen.

`default`, `fixed`, `upper`, `lower`, `trim`, `bool` und `json` sind aura-Erweiterungen und in vis nicht vorhanden.

### Argumente

| Form | Kette (`;`) | Ausdruck (`\|`) |
| --- | --- | --- |
| Zahl | `round(1)` | `round(1)` |
| Text ohne Anführungszeichen | `date(hh:mm)` ✅ | ❌ |
| Text mit Anführungszeichen | `date('hh:mm')` ✅ | `date('hh:mm')` ✅ |

In der Kette ist ein Argument roher Text — genau wie in vis. Im Ausdruck ist es ein Ausdruck und Text braucht Anführungszeichen.

## Ausdrücke

Ein Ausdruck steht zwischen `{{` und `}}` oder hinter den Deklarationen eines `{a:id;…}`-Bindings.

### Operatoren

Von schwach nach stark bindend:

| Stufe | Operatoren | |
| --- | --- | --- |
| 1 | `\|` | Operation anhängen |
| 2 | `? :` | Bedingung |
| 3 | `??` | erster nicht-`null`-Wert |
| 4 | `\|\|` | erster wahrer Wert |
| 5 | `&&` | letzter Wert, wenn alle wahr |
| 6 | `==` `!=` `===` `!==` | Vergleich |
| 7 | `<` `<=` `>` `>=` | Größenvergleich |
| 8 | `+` `-` | plus/minus (`+` verkettet Text) |
| 9 | `*` `/` `%` | mal/geteilt/Rest |
| 10 | `-x` `+x` `!x` | Vorzeichen, Negation |
| 11 | `[…]` `.name` `(…)` | Pfad, Aufruf |

`(` `)` klammern wie üblich. `==` vergleicht als Text (`1 == '1'` ist wahr), `===` streng typisiert (`1 === '1'` ist falsch) — für ioBroker-Werte, die oft als String ankommen, ist `==` meist das Richtige.

### Funktionen

Nur diese sind aufrufbar; alles andere macht das Binding ungültig und es bleibt sichtbar stehen.

| Gruppe | Funktionen |
| --- | --- |
| Mathematik | `Math.abs` `Math.min` `Math.max` `Math.round` `Math.floor` `Math.ceil` `Math.trunc` `Math.sign` `Math.pow` `Math.sqrt` `Math.log` `Math.exp` `Math.hypot` |
| Konstanten | `Math.PI` `Math.E` |
| Kurzform ohne `Math.` | `abs` `min` `max` `round` `floor` `ceil` `sqrt` `pow` |
| Umwandlung | `Number` `String` `Boolean` `parseFloat` `parseInt` `isNaN` |

### Typen

ioBroker liefert Werte oft als Text. Rechenoperatoren wandeln selbst um, `+` aber nicht — dort entscheidet der Typ über Addition oder Verkettung:

```html
{{ 0_userdata.0.Text * 2 }}                    <!-- "17.5" → 35 -->
{{ parseFloat(0_userdata.0.Text) + 1 }}        <!-- "17.5" → 18.5 -->
{{ 0_userdata.0.Text + 1 }}                    <!-- "17.5" → "17.51" -->
```

Unlesbare Werte ergeben nichts statt `NaN`:

```html
[{{ 'abc' | round(1) }}]
```
→ `[]`

### Zahlen in der Ausgabe

Ergebnisse werden **technisch** ausgegeben: Dezimalpunkt, kein Tausendertrenner.

| Binding | Ausgabe |
| --- | --- |
| `{0_userdata.0.Netz}` | `-1.234,56` (Widget-Format) |
| `{{ 0_userdata.0.Netz }}` | `-1234.56` |
| `{0_userdata.0.Netz;formatValue(1)}` | `-1.234,6` |

Grund: berechnete Zahlen landen meistens in SVG-Koordinaten, CSS-Längen oder Farbwerten — ein Dezimalkomma würde `y="177,3"` ungültig machen. Für die Anzeige also immer `formatValue(n)` anhängen.

Rundungsrauschen wird gekappt: `{{ 0.1 + 0.2 }}` ergibt `0.3`, nicht `0.30000000000000004`.

## Datum & Zeit

`date(muster)` und `momentDate(muster)` formatieren einen Zeitwert. Erkannt werden Unix-Sekunden, Millisekunden, ISO-Zeitangaben und `HH:mm` — also auch `.ts` / `.lc`.

| Token | ergibt | Beispiel (22.08.2026, 14:32:07.045) |
| --- | --- | --- |
| `yyyy` · `YYYY` | Jahr | `2026` |
| `yy` · `YY` | Jahr, zweistellig | `26` |
| `MMMM` | Monatsname | `August` |
| `MM` | Monat | `08` |
| `dd` · `DD` | Tag | `22` |
| `EEEE` · `dddd` | Wochentag | `Samstag` |
| `EE` · `ddd` | Wochentag, kurz | `Sa` |
| `HH` | Stunde (24 h) | `14` |
| `hh` | Stunde — **siehe unten** | `14` bzw. `02` |
| `mm` | Minute | `32` |
| `ss` | Sekunde | `07` |
| `SSS` | Millisekunde | `045` |
| `ww` | Kalenderwoche | `34` |

::: warning `hh` bedeutet zweierlei
In `date()` sind **beide** Stunden-Tokens 24-stündig — so macht es vis, dessen eigenes Beispiel `date(hh:mm)` eine Uhrzeit meint. In `momentDate()` gilt die moment.js-Bedeutung: `hh` ist 12-stündig, `HH` 24-stündig.

| Binding | um 14:32 |
| --- | --- |
| `{dp;date(hh:mm)}` | `14:32` |
| `{dp;momentDate(hh:mm)}` | `02:32` |
| `{dp;momentDate(HH:mm)}` | `14:32` |
:::

`momentDate(muster, true)` ersetzt den Wochentag durch „Heute" bzw. „Gestern", wenn er darauf fällt:

```html
{0_userdata.0.Termin;momentDate(dddd HH:mm, true)}
```
→ `Heute 08:05` · `Gestern 08:05` · `Dienstag 08:05`

Ohne Muster gilt `dd.MM.yyyy HH:mm`. Ein unlesbarer Wert ergibt nichts. Jedes Token wird an jeder Stelle ersetzt, `date(mm:mm)` ergibt also `32:32`.

## Rezepte

**Balkenhöhe in einem SVG** — je größer der Wert, desto weiter oben beginnt der Balken:

```html
<svg viewBox="0 0 200 200">
  <rect x="0" width="200" height="10" fill="#4ade80"
        y="{{ 180 - 180 * Math.min(0_userdata.0.Fuellstand / 255, 1) }}" />
</svg>
```
→ bei `100`: `y="109.411764706"`

**Farbe nach Vorzeichen** — Einspeisung grün, Bezug rot:

```html
<span style="color:{{ senec.0.ENERGY.GUI_GRID_POW < 0 ? '#00ff00' : '#ff2c0a' }}">
  {senec.0.ENERGY.GUI_GRID_POW;round(0)} W
</span>
```

**Farbe aus drei Datenpunkten** — das vis-Standardrezept:

```html
<div style="background:#{0_userdata.0.Rot;HEX2}{0_userdata.0.Gruen;HEX2}{0_userdata.0.Blau;HEX2};
            width:40px;height:40px"></div>
```
→ bei `100` / `200` / `12`: `#64C80C`

**Anteil zweier Datenpunkte in Prozent:**

```html
{{ round(0_userdata.0.Rot / (0_userdata.0.Rot + 0_userdata.0.Gruen) * 100) }} %
```
→ bei `100` und `200`: `33 %`

**Zuletzt geändert um:**

```html
Stand {senec.0.ENERGY.GUI_GRID_POW.lc;date(HH:mm)}
```
→ `Stand 14:32`

**Ampel über zwei Schwellen:**

```html
{{ 0_userdata.0.Temperatur > 25 ? 'rot' : 0_userdata.0.Temperatur > 20 ? 'gelb' : 'gruen' }}
```
→ bei `21.4`: `gelb`

**Fortschrittsbalken mit geklemmtem Wert** — Rohwerte außerhalb von 0…100 laufen sonst aus dem Rahmen:

```html
<div style="width:{0_userdata.0.Roh;min(0);max(100)}%;height:8px;background:#38bdf8"></div>
```
→ bei `120`: `width:100%`

**Text aus mehreren Datenpunkten:**

```html
{{ 'Akku ' + (0_userdata.0.Akku['soc'] | formatValue(0)) + ' %' }}
```
→ `Akku 87 %`

**Deckkraft aus einem Prozentwert:**

```html
<img src="…" style="opacity:{{ Math.min(0_userdata.0.Akku['soc'] / 100, 1) }}">
```
→ bei `87`: `opacity:0.87`

## Was nicht ersetzt wird

Bindings dürfen kein normales HTML/CSS anfassen. Diese Eingaben bleiben Zeichen für Zeichen erhalten:

| Eingabe | Grund |
| --- | --- |
| `{ color: red }` | Leerzeichen in einem einteiligen `{…}` → kein Token |
| `{color:red;background:blue}` | `red` und `blue` sind keine Datenpunkt-IDs → keine Deklarationen |
| `{margin:0;padding:0}` | dito |
| `{ font: 12px/1.4 sans-serif }` | dito |
| `@media(min-width:1px){.a{color:red}}` | `}}` ohne vorheriges `{{` |
| `{foo}` | ein Wort ohne Punkt und keine bekannte Variable |
| `{{ 1 + }}` | kein gültiger Ausdruck |
| `{0_userdata.0.X;frobnicate}` | unbekannte Operation |
| `href="{dp}#TOP"` | Großbuchstaben nach `#` gelten nie als JSON-Pfad |

Grundregel: **was nicht sicher als Binding erkannt wird, bleibt stehen.** Ein sichtbar gebliebenes Binding ist also der Hinweis auf einen Tippfehler — nicht auf einen fehlenden Wert.

### Die drei Platzhalter-Ebenen von aura

Sie sehen ähnlich aus, machen aber Verschiedenes:

| Ebene | Syntax | Wo | Wann |
| --- | --- | --- | --- |
| Widget-Titel | `[[0_userdata.0.Temp]]` | Titelfeld jedes Widgets | live, bei jeder Wertänderung |
| Popup-Views | `{{parent}}` `{{dp}}` `{{name}}` | alle Felder eines Popup-Widgets | einmal beim Öffnen, ersetzt **IDs**, keine Werte |
| Bindings | `{…}` · `{{ … }}` | HTML-Widget, HTML-Template | live, bei jeder Wertänderung |

Die Popup-Ebene benutzt ebenfalls doppelte Klammern, kollidiert aber nicht: `{{parent}}` ist ein einzelnes Wort ohne Leerzeichen und bleibt der Popup-Ebene vorbehalten. Alles mit Leerzeichen, Punkt oder Operator ist ein Ausdruck. Wer in einem Popup den **Wert** des Haupt-Datenpunkts will, schreibt `{dp}` mit einfachen Klammern.

## Unterschiede zu ioBroker.vis

| vis | aura |
| --- | --- |
| `{id}`, `{id;op;op}`, `{a:id;b:id;expr}` | identisch |
| `*()` `+()` `-()` `/()` `%()` `round` `min` `max` `sqrt` `pow` `floor` `ceil` `hex` `hex2` `HEX` `HEX2` `formatValue` `date` `momentDate` | identisch, inklusive der vertauschten `min`/`max`-Bedeutung |
| `.ts` / `.lc` | identisch |
| Ausdruck ist beliebiges JavaScript (`new Function`) | fester Sprachumfang mit Funktions-Whitelist → siehe [Grenzen](#grenzen-sicherheit) |
| Bedingung braucht `::` statt `:` | nicht nötig — der Ausdruck wird nie an `:` zerlegt. `::` wird trotzdem akzeptiert |
| `json(pfad)` | stattdessen `?pfad` / `['pfad']`, funktioniert auch in der Kette |
| `array(a,b)`, `random(n)` | nicht vorhanden |
| `username`, `login`, `instance`, `local_*`, `widget`, `widgetOid` | nicht vorhanden |
| `{{style: value}}` als Escape für CSS | nicht nötig — CSS wird nie als Binding gelesen |
| — | zusätzlich `{{ ausdruck }}` mit IDs direkt im Ausdruck |
| — | zusätzlich `default` `fixed` `upper` `lower` `trim` `bool` `json` |
| moment.js für `momentDate` | eigener Formatter, gleiche Tokens, keine zusätzliche Bibliothek |

## Fehlersuche

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| Binding bleibt als Text sichtbar | Syntaxfehler, unbekannte Operation oder unbekannte Funktion | Klammern und Namen prüfen; erlaubt ist nur, was in [Operationen](#operationen) und [Funktionen](#funktionen) steht |
| Ergebnis ist leer | Datenpunkt existiert nicht oder Wert ist nicht lesbar | ID prüfen; `default()` anhängen, um das sichtbar zu machen |
| `–` statt einer Zahl | einfaches `{id}`-Token ohne Wert | ID prüfen |
| Zahl ergibt Unsinn | Wert kommt als Text und wurde mit `+` verkettet | `parseFloat(…)` benutzen oder mit `*`/`-` rechnen |
| SVG/CSS kaputt, Komma in der Zahl | `formatValue` in einer Koordinate | dort kein `formatValue` verwenden — Ausdrücke geben von sich aus einen Punkt aus |
| Ganzes CSS verschwunden | eine CSS-Zeile sah wie ein Binding aus (`{background:img.0.png;…}`) | Deklaration in eine `<style>`-Regel mit Leerzeichen schreiben oder den Wert anders formulieren |
| Wert aktualisiert sich nicht | ID im Binding falsch geschrieben — dann wird auch nichts abonniert | ID über den Datenpunkt-Wähler kopieren |
| `{{ dp1-dp2 }}` liefert nichts | ohne Leerzeichen ist das eine ID | `{{ dp1 - dp2 }}` schreiben |
| Zeit zeigt 02:32 statt 14:32 | `momentDate(hh:mm)` ist 12-stündig | `HH` benutzen oder `date()` |

## Grenzen & Sicherheit

Der Ausdruck ist **kein JavaScript**, sondern eine eigene, geschlossene Sprache:

- aufrufbar ist nur, was in der [Funktionsliste](#funktionen) steht — kein Zugriff auf `window`, `fetch`, `eval` oder Objekt-Methoden
- keine Schleifen, keine Zuweisungen, keine Funktionsdefinitionen
- höchstens 4000 Zeichen, 500 Bestandteile und 50 Klammer-Ebenen je Ausdruck
- ein Text-Literal darf kein `}}` enthalten — es würde die Kurzform vorzeitig beenden.
  In so einem Fall die Deklarations-Schreibweise nehmen: `{v:id;v + '}}'}`

Das ist bewusst so: HTML darf aus einem Datenpunkt kommen, und Bindings werden ausgewertet, bevor der Inhalt in den Sandbox-iFrame geht. Mit echtem `eval` könnte ein Skript, das diesen Datenpunkt schreibt, beliebigen Code im aura-Frontend ausführen.

Zwei Dinge bleiben in der Verantwortung des Autors:

- Das Ergebnis eines Bindings wird **unmaskiert** ins HTML geschrieben. Ein Datenpunkt, der `<script>` enthält, landet also als Markup im Dokument — im HTML-Widget im Sandbox-iFrame, in der Wert-Anzeige direkt.
- Jeder referenzierte Datenpunkt ist eine Subscription. Ein Widget mit 50 Bindings hält 50 davon offen.
