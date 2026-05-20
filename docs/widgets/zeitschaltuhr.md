# Zeitschaltuhr

Schreibt einen Datenpunkt zeitgesteuert. Wochentag, Uhrzeit, Astro-Ereignis (Sonnenauf-/-untergang, Dämmerung) mit Offset, einmaliges Datum oder Zeitraum. Master-Schalter pausiert ohne die Ereignisse zu verlieren.

Der **Anwender** legt im Frontend per Tipp aufs Widget Ereignisse an (nur Zeitpunkt). **Was** beim Auslösen geschrieben wird, konfiguriert der Admin im Widget-Edit-Panel.

<!-- Screenshot folgt: ./assets/zeitschaltuhr/uebersicht.png -->

## Datenpunkt

Kein Haupt-Datenpunkt am Widget. Stattdessen Widget-Optionen (Admin):

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `targetDp` | ja | beliebig | Datenpunkt, der beim Auslösen geschrieben wird |
| `value` | ja | `string` | wird automatisch als `boolean` · `number` · `string` geparst |
| `holidaysDp` | nein | `string` (JSON) | Feiertage als `["YYYY-MM-DD", …]` |
| `vacationDp` | nein | `string` (JSON) | Urlaubstage als `["YYYY-MM-DD", …]` |

Pro Widget legt der Adapter zwei States unter `aura.0.timers.<widget-id>` an: `config` (JSON aller Ereignisse) und `enabled` (Master). Der Backend-Scheduler liest aus diesen States.

## Layouts

### Default
Statussymbol, Titel, Master-Schalter, Status-Zeile, Ereignisliste, Hinzufügen-Button — für mittlere Zellen.

<!-- Screenshot folgt: ./assets/zeitschaltuhr/layout-default.png -->

### Compact
Eine Kopfzeile mit Icon, Titel, Master und Zähler; darunter die Ereignisse in einer Zeile pro Eintrag — für schmale Zellen.

<!-- Screenshot folgt: ./assets/zeitschaltuhr/layout-compact.png -->

### Custom
Frei plaziert in einer Zellenmatrix. Verfügbare Komponenten: `icon`, `master`, `status`, `events`, `add`.

<!-- Screenshot folgt: ./assets/zeitschaltuhr/layout-custom.png -->

## Statusfarbe

| Farbe | Bedeutung |
| --- | --- |
| Grau | Ziel-DP nicht gesetzt **oder** keine Ereignisse |
| Slate | Master aus — Ereignisse bleiben gespeichert |
| Orange | Master an, aber kein Ereignis aktiv |
| Grün | Mindestens ein Ereignis aktiv |

## Einstellungen (Admin)

### Anzeige-Elemente

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Statussymbol anzeigen |
| `showMasterSwitch` | `true` | Master-Schalter anzeigen |
| `showEvents` | `true` | Ereignisliste anzeigen |
| `showAddButton` | `true` | „+ Ereignis"-Button anzeigen |
| `icon` | `Timer` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `20` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Ziel-Aktion

| Option | Standard | |
| --- | --- | --- |
| `targetDp` | — | Pflichtfeld — ohne Ziel-DP feuert nichts |
| `value` | `true` | Wert beim Auslösen |

Beim Auslöser-Typ **Zeitraum** schreibt der Scheduler am Ende den invertierten Wert (`true → false`, `42 → 0`, sonst leerer String).

### Sondertage (optional)

DP liefert ein JSON-Array von Datumsangaben. Wenn nicht gesetzt, sind die Filter „Nur Feiertage" / „Nur Urlaub" / „Ohne Sondertage" wirkungslos.

```json
[
  "2026-01-01",
  "2026-04-03",
  "2026-12-25",
  "2026-12-26"
]
```

| Option | Standard | |
| --- | --- | --- |
| `holidaysDp` | — | DP mit Feiertagsliste |
| `vacationDp` | — | DP mit Urlaubsliste |

## Ereignis-Editor (Anwender)

Tipp auf einen Eintrag oder den **+ Ereignis**-Button öffnet das Modal. Schließt nur über X · Abbruch · ESC (kein Klick außerhalb).

<!-- Screenshot folgt: ./assets/zeitschaltuhr/event-modal.png -->

### Auslöser

| Typ | Felder | Hinweis |
| --- | --- | --- |
| Zeit | `hour`, `minute` | tagesaktuell, kombiniert mit Wochentagen |
| Astro | `event`, `offsetMin` | `sunrise` · `sunset` · `dawn` · `dusk` · `solarNoon` mit Offset in Minuten |
| Einmalig | `iso` | feuert genau einmal, danach automatisch deaktiviert |
| Zeitraum | `fromIso`, `toIso` | feuert am Start und am Ende (invertiert) |

### Wochentage

Sieben Toggle-Chips (Mo–So) bei Zeit- und Astro-Auslösern. Kein Wochentag ausgewählt = das Ereignis feuert nie.

### Filter

| Wert | Verhalten |
| --- | --- |
| `all-days` | keine Einschränkung |
| `no-special` | überspringt Tage aus `holidaysDp` oder `vacationDp` |
| `only-holidays` | nur an Tagen aus `holidaysDp` |
| `only-vacation` | nur an Tagen aus `vacationDp` |
| `blocked` | überspringt, wenn `blockFromMin ≤ aktuelle Minute < blockToMin` (Fenster darf Mitternacht überschreiten) |

## Scheduler

Der Backend-Scheduler läuft im `iobroker.aura`-Adapter-Prozess. Tick-Intervall ist in den Instanz-Einstellungen einstellbar (`timerTickSeconds`, 5–600 s, Standard 30 s). Jeder Tick prüft alle Ereignisse aller Timer-Widgets gegen das aktuelle Tick-Fenster und schreibt fällige Werte mit `ack=false`.

Logzeilen im Adapter:

```
[timers] loaded N timer widget(s)
[timers] scheduler tick = 30s
[timers] fired <Label>: <Ziel-DP> ← <Wert>
```

## Bearbeitungsmodus

Im Admin-Editor ist das Widget read-only — Master, Events und der „+ Ereignis"-Button reagieren nicht, der Admin stylt und layoutet nur. Ereignisse pflegt ausschließlich der Anwender im Live-Frontend.
