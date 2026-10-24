# Ohne Rand anzeigen

Das Dashboard hat links und rechts einen Rand (8 px, ab 640 px Breite 16 px). Auf einem Tablet im Hochformat kostet das Platz — eigenes CSS nimmt ihn weg.

## 1. CSS eintragen

**Admin → CSS & JS → Custom CSS**, Geltungsbereich oben rechts: Global oder das Layout des Tablets.

```css
.aura-scroll.aura-scroll-touch {
    padding-left: 0 !important;
    padding-right: 0 !important;
}
```

| Zeile | |
| --- | --- |
| `padding-left: 0` | Rand links weg |
| `padding-right: 0` | Rand rechts weg — weglassen, wenn nur links gewünscht |

## 2. Nur im Hochformat

```css
@media (orientation: portrait) {
    .aura-scroll.aura-scroll-touch {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }
}
```

Für oben/unten entsprechend `padding-top` / `padding-bottom`.

## 3. Restliche Abstände

Was danach noch bleibt, kommt nicht vom Rand:

| Abstand | Einstellung |
| --- | --- |
| Zwischen den Widgets | **Admin → Frontend-Design → Typografie & Spacing → Abstand zwischen Widgets** |
| Innerhalb der Widget-Karte | **Admin → Frontend-Design → Typografie & Spacing → Innenabstand der Widgets** |

Beide gelten global, pro Layout oder pro Bereich.

Siehe auch: [CSS & JS](../einstellungen/css-js), [CSS-Klassen](../einstellungen/css-klassen).
