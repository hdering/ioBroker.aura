# CSS-Klassen

Stabile Haken für [Custom CSS](./css-js). Sie sitzen fest im Markup und ändern sich nicht mit dem Theme.

Custom CSS wirkt im Frontend, im Editor nur mit der Option „CSS auch im Editor anwenden". Farben und Maße kommen besser über [Design-Tokens](./design-tokens) als über eigene Regeln.

## Seitenaufbau

| Selektor | trifft |
| --- | --- |
| `.aura-page` | Wurzel der Frontend-Seite |
| `.aura-page-<layout-slug>` | dieselbe Wurzel, je Layout |
| `.aura-<tab-slug>` | dieselbe Wurzel, je aktivem Tab |
| `.aura-header` | Kopfzeile (Titel, Uhr, Bedienknöpfe) |
| `.aura-titel` | Überschrift in der Kopfzeile |
| `.aura-tabs` | Tab-Leiste, oben wie unten |
| `.aura-tabs-top` | Tab-Leiste über dem Dashboard |
| `.aura-tabs-bottom` | Tab-Leiste als Fußzeile |
| `.aura-section-bar` | Bereichsleiste |
| `.aura-nav-stretch` | Eintragsreihe einer Leiste mit Menü-Position `Gleichmäßig` |
| `.aura-menu-widget` | Widget-Platz in einer Menüleiste |
| `.aura-pin-prompt` | PIN-Abfrage vor einem gesperrten Tab |

## Tabs

Knopf und Inhalt sind zwei verschiedene Elemente: `.aura-tab-btn` sitzt in der Leiste, `.aura-tab` um die Widgets des Tabs.

| Selektor | trifft |
| --- | --- |
| `.aura-tab-btn` | Tab-Knopf in der Leiste |
| `.aura-tab-active` | aktiver Tab-Knopf |
| `.aura-tab` | Inhaltsbereich eines Tabs |
| `.aura-tab-<tab-slug>` | Inhaltsbereich eines bestimmten Tabs |
| `.aura-tab-label` | Beschriftung im Tab-Knopf |
| `.aura-tab-scroll-ind` | Scroll-Anzeiger unter den Tabs (mobil) |

Ein Tab mit dem Slug `active` bekäme über `.aura-tab-<slug>` ebenfalls `.aura-tab-active`. Wo das zählt, den Knopf über `.aura-tab-btn.aura-tab-active` ansprechen.

```css
/* nur die untere Leiste */
.aura-tabs-bottom {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
```

## Widget-Karte

| Selektor | trifft |
| --- | --- |
| `.aura-widget` | jede Widget-Karte |
| `.aura-widget-<widget-id>` | eine bestimmte Karte |
| `.aura-widget-type-<typ>` | alle Karten eines Widget-Typs, z. B. `.aura-widget-type-light` |
| `.aura-widget-focused` | Karte, die gerade angesprungen wurde (Puls) |
| `.aura-widget-fullscreen` | Vollbild-Overlay eines Widgets |
| `.aura-fullscreen-btn` | Vollbild-Knopf in der Kartenecke |
| `.aura-badge-corner` | Badge-Overlay in der Kartenecke |
| `.aura-textwrap` | Karte mit aktivem Textumbruch (Option „Textumbruch") |

## Widget-Innenleben

Diese vier setzt jedes Widget selbst — sie sind der Weg, Titel, Icon oder Wert über alle Typen hinweg zu treffen.

| Selektor | trifft |
| --- | --- |
| `.aura-widget-row` | Inhaltswurzel des Widgets |
| `.aura-widget-icon` | Icon |
| `.aura-widget-title` | Titelzeile |
| `.aura-widget-value` | Wertanzeige |
| `.aura-widget-action` | Bedienelement-Gruppe (nicht ziehbar) |
| `.aura-last-change` | Zeitstempel „zuletzt geändert" |
| `.aura-frame-neutral` | eingebettetes Dokument ohne eigenes Farbschema (HTML-, eCharts- und Kamera-Widget) |

```css
.aura-widget-type-thermostat .aura-widget-title {
    text-transform: uppercase;
}
```

## Bedienelemente

| Selektor | trifft |
| --- | --- |
| `.aura-slider-bar` | Balkenregler |
| `.aura-slider-range` | Schieberegler |
| `.aura-slider-scale` | Skala am Regler |
| `.aura-shutter-control` | Rollladen-Bedienung |
| `.aura-shutter-slider` | Rollladen-Regler |
| `.aura-shutter-pos` | Positionswert in Prozent |
| `.aura-shutter-tilt` / `.aura-widget-tilt` | Lamellenwert bzw. Lamellen-Block |
| `.aura-select-control` | Auswahlfeld |
| `.aura-preset-button` | Voreinstellungs-Chip |
| `.aura-state-display` | Status-Pille |
| `.aura-contact-lock` | Kontakt-/Schloss-Symbol |
| `.aura-input-unit` | Einheit hinter einem Eingabefeld |
| `.aura-dt-input` | Datums-/Zeitfeld mit eigenem Picker |

## Listen und Einträge

| Selektor | trifft |
| --- | --- |
| `.aura-entry-subline` | zweite Zeile eines Eintrags |
| `.aura-room-header` | Raum-Zwischenüberschrift (Auto-Liste) |
| `.aura-section-break` | Abschnittstrenner (Liste) |
| `.aura-list-more` | „+N weitere"-Zeile |
| `.aura-badge-room` | Tab-Zeile mit Platz für überstehende Badges |

## Einzelne Widgets

| Selektor | trifft |
| --- | --- |
| `.aura-clock-time` · `.aura-clock-date` · `.aura-clock-weekday` | Uhr: Zeit, Datum, Wochentag |
| `.aura-clock-custom` | Uhr mit eigenem Format |
| `.aura-clock-extras` | Zusatzzeile (Ort, Auf-/Untergang, KW) |
| `.aura-cal-*` | Kalender — [eigene Tabelle](../widgets/kalender#css-klassen) |
| `.aura-custom-grid` | Raster des Benutzerdefinierten Widgets |
| `.aura-custom-cell-<index>` | eine Zelle darin, von `0` an gezählt |
| `.aura-marquee-track` | Lauftext im Karussell |
| `.aura-carousel-shake` | kurzer Anstoß beim Öffnen (Karussell) |
| `.aura-map-pin` | Markierung im Karten-Widget |
| `.aura-msg-html` | HTML-Inhalt einer Meldung (Titel und Text) |

## Bedingungen

Setzt eine [Bedingung](./editor) einen Effekt, landet die passende Klasse auf der Karte. Nützlich, um den Effekt umzudefinieren.

| Selektor | trifft |
| --- | --- |
| `.aura-cond-bold` · `.aura-cond-italic` | ganze Karte fett bzw. kursiv |
| `.aura-cond-ring` | Rahmeneffekt |
| `.aura-cond-title-*` | Titel: `-color`, `-bold`, `-italic`, `-size`, `-hide` |
| `.aura-cond-icon-*` | Icon: `-color`, `-hide` |
| `.aura-cond-value-*` | Wert: `-color`, `-bold`, `-italic`, `-size`, `-hide` |

## Hilfsklassen

| Selektor | trifft |
| --- | --- |
| `.aura-scroll` | Scrollbereich mit dünner Akzent-Scrollleiste |
| `.aura-scroll-touch` | derselbe Bereich auf Touch-Geräten (native Leiste aus) |
| `.aura-no-scrollbar` | Scrollbereich ohne sichtbare Leiste |
| `.aura-bleed-host` · `.aura-bleed-row` · `.aura-bleed-clip` · `.aura-bleed-scroll` | Listenzeilen, die in den Innenabstand der Karte ragen |

## Im Editor

| Selektor | trifft |
| --- | --- |
| `.aura-edit-chrome` | Bedienknöpfe am Widget im Bearbeiten-Modus |
| `.aura-group-toolbar` | Werkzeugleiste einer Gruppe ohne Kopfzeile |
| `.aura-widget-inert` | Widget-Inhalt mit gesperrter Bedienung |
| `.aura-peek` | am `<body>`, solange `Strg`+`Alt` die Editor-Elemente ausblendet |
| `.aura-config-modal` | Konfigurations-Popup |
| `.aura-widget-edit-modal` | Widget-Bearbeiten-Popup |

Weitere `aura-`Klassen im Adminbereich sind Anker für die automatischen Tests — Custom CSS läuft dort nicht.

## Daten-Attribute

| Selektor | trifft |
| --- | --- |
| `[data-aura-app="frontend"]` | Frontend-Container (Skalierung, Theme-Bereich) |
| `[data-aura-tab-id="<id>"]` | Inhaltsbereich eines Tabs |
| `[data-aura-widget="<id>"]` | Widget-Box im mobilen Layout |
| `[data-aura-widget-type="<typ>"]` | dieselbe Box je Typ |
| `[data-aura-nav-icon="tab\|section\|menu"]` | Icon in einer Navigationsleiste |
| `[data-aura-toasts="<position>"]` | Toast-Ecke der Meldungen |
| `[data-aura-click-popup="<art>"]` | Popup eines Widget-Klicks |
| `[data-aura-locked]` | Widget mit gesperrter Bedienung |

## CSS-Variablen

| Variable | Bedeutung |
| --- | --- |
| `--aura-widget-pad` | Innenabstand der Karte, aus den Layout-Einstellungen |
| `--aura-wrap-lines` | Zeilenzahl der Option „Textumbruch" |
| `--aura-bleed-max` | wie weit Listenzeilen in den Innenabstand ragen dürfen |
| `--aura-sbw` | gemessene Breite der Scrollleiste |
| `--font-scale` | Schriftskalierung des Frontends |
| `--aura-safe-top` / `--aura-safe-bottom` | Höhe des sicheren Bereichs oben/unten, Vorgabe `env(safe-area-inset-*)` |
| `--aura-safe-left` / `--aura-safe-right` | dasselbe seitlich (Notch im Querformat) |
| `--aura-safe-top-bg` / `--aura-safe-bottom-bg` | Farbe des Streifens im sicheren Bereich |

Eigener Inhalt am Kartenrand richtet sich nach `--aura-widget-pad` statt nach einem festen Wert:

```css
.aura-widget-type-list .aura-widget-row {
    margin-inline: calc(-1 * var(--aura-widget-pad, 16px));
}
```

## Sicherer Bereich

Auf Geräten mit Notch, Dynamic Island oder Gestenleiste hält `.aura-page` den Inhalt aus diesen Zonen heraus und färbt den frei gewordenen Streifen in der Farbe der angrenzenden Leiste (`.aura-page::before` oben, `.aura-page::after` unten). Auf Bildschirmen ohne solche Zonen sind die Streifen 0 px hoch.

Installierte Web-Apps unter iOS 26/27 legen dort einen System-Blur über die Seite. Ein einfarbiger Streifen macht ihn unsichtbar; nötigenfalls lässt sich mehr Platz reservieren:

```css
.aura-page {
    --aura-safe-top: 44px;
    --aura-safe-top-bg: #1f2937;
}
```

Abschalten:

```css
.aura-page {
    --aura-safe-top: 0px;
    --aura-safe-bottom: 0px;
}
```
