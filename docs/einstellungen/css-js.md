# CSS & JS

Eigenes CSS und JavaScript global oder pro Layout einbinden (Geltungsbereich oben rechts).

## Custom CSS

![](./assets/css-js-css.png)

Überschreibt Theme-Variablen und Widget-Styles per CSS.

| Selektor | trifft |
| --- | --- |
| `.aura-tabs` | Tab-Leiste, oben wie unten |
| `.aura-tabs-top` | Tab-Leiste über dem Dashboard |
| `.aura-tabs-bottom` | Tab-Leiste als Fußzeile |

```css
.aura-tabs-bottom {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
```

## Custom JS

![](./assets/css-js-js.png)

JavaScript läuft mit den Frontend-Berechtigungen und kann ioBroker-Datenpunkte lesen und schreiben. API über `window.aura`:

| Funktion | |
| --- | --- |
| `setState(id, val, ack?)` | Wert schreiben |
| `getState(id)` | aktuellen Wert lesen |
| `subscribeState(cb, id)` | Live-Updates abonnieren |
| `getObject(id)` | Objektdefinition lesen |
| `sendTo(target, command, payload, timeoutMs?)` | Adapter-Nachricht senden |

Dieselben Funktionen stehen ohne Custom JS im [HTML-Widget](../widgets/html#datenpunkte-schreiben) und im
`htmlTemplate` der [Wert-Anzeige](../widgets/wert-anzeige) bereit.

Externe Skripte über `@import url('…');` am Anfang einbinden.
