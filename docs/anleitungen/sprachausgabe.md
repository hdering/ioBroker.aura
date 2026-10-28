# Sprachausgabe

Das Dashboard spricht Texte und spielt Töne auf dem Gerät ab, auf dem es geöffnet ist — ohne zusätzlichen Adapter. Mehrere Ansagen laufen nacheinander.

## Datenpunkte

| Datenpunkt | |
| --- | --- |
| `aura.0.speech.say` | Alle Geräte |
| `aura.0.clients.<ID>.speech.say` | Nur dieses Gerät |

Der Datenpunkt leert sich nach der Übernahme von selbst.

| Regel | |
| --- | --- |
| Schon beim Laden vorhanden | wird nicht abgespielt |
| Mehrere Tabs im selben Browser | ein Gerät — nur ein Tab spielt, der sichtbare zuerst |
| Älter als 10 Minuten | verfällt (`skipped`), z. B. in einem Tab, den der Browser schlafen gelegt hat |

| Inhalt | |
| --- | --- |
| `Guten Morgen` | Text, gesprochen von der Stimme des Browsers |
| `/sayit.0/tts.mp3`, `0_userdata.0/gong.mp3`, `https://…/gong.mp3` | Datei abspielen (`.mp3` · `.wav` · `.ogg` …) |
| `80;Es hat geklingelt` | Lautstärke;Text wie bei SayIt — auch `80;gong.mp3` |
| `{"text": "…", …}` | JSON, siehe unten |

```js
setState('aura.0.speech.say', 'Die Waschmaschine ist fertig');
setState('aura.0.clients.kuechentablet.speech.say', '60;/0_userdata.0/sounds/gong.mp3');
```

### JSON

| Feld | Typ | |
| --- | --- | --- |
| `text` | string | Gesprochener Text |
| `file` | string | Datei statt Text; hat Vorrang |
| `volume` | `0`–`100` | Standard: `speech.volume` des Geräts |
| `voice` | string | Name oder Teil des Namens einer Stimme, z. B. `Katja` |
| `lang` | string | Sprache, z. B. `de-DE`; Standard: Sprache des Dashboards |
| `rate` | `0.1`–`10` | Tempo, `1` = normal |
| `pitch` | `0`–`2` | Tonhöhe, `1` = normal |
| `interrupt` | boolean | Laufende Ansage abbrechen, Warteschlange leeren |
| `onlyVisible` | boolean | Nur bei eingeschaltetem Display (Seite sichtbar), sonst `skipped` |
| `target` | Objekt | `{ "clients": [...], "layout": "…", "tab": "…" }` — wie bei [Meldungen](../einstellungen/meldungen#empfänger) |

```js
setState('aura.0.speech.say', JSON.stringify({
    text: 'Es hat an der Haustür geklingelt',
    interrupt: true,
    target: { clients: ['flurtablet', 'kuechentablet'] },
}));
```

### Pro Gerät

| Datenpunkt | |
| --- | --- |
| `clients.<ID>.speech.muted` | `true` = stumm |
| `clients.<ID>.speech.volume` | Standard-Lautstärke `0`–`100`, Standard `100` |
| `clients.<ID>.speech.playing` | `true`, solange eine Ansage läuft |
| `clients.<ID>.speech.lastResult` | Ergebnis der letzten Ansage |

| `lastResult` | |
| --- | --- |
| `played` | Abgespielt |
| `blocked` | Browser verlangt erst eine Berührung — die Ansage wartet |
| `muted` | Gerät stumm geschaltet |
| `skipped` | Display aus (`onlyVisible`), älter als 10 Minuten oder Warteschlange voll |
| `interrupted` | Von einer Ansage mit `interrupt` abgebrochen |
| `error` | Datei nicht ladbar oder keine Sprachausgabe im Browser |

## Autoplay

Browser spielen Ton erst ab, nachdem jemand den Bildschirm berührt hat.

| Browser | |
| --- | --- |
| Fully Kiosk | **Web Content Settings** → Autoplay von Audio/Video erlauben |
| Chrome / Chromium | Startparameter `--autoplay-policy=no-user-gesture-required` |
| Sonst | Einmal aufs Display tippen nach dem Laden |

Wird eine Ansage blockiert, erscheint unten rechts **Ton aktivieren**. Das nächste Tippen — auf den Knopf oder irgendwo — spielt sie ab. Nach 10 Minuten verfällt sie.

## SayIt

Bestehende Skripte mit `setState('sayit.0.tts.text', …)` funktionieren ohne Änderung.

**Ab SayIt 5.5.0:**

| SayIt-Instanz | |
| --- | --- |
| Ausgabetyp | **Browser** |
| Vis-Instanzen | **Aura-Dashboards** |
| Browser-Instanz | Client-IDs mit Komma getrennt; leer = alle Geräte (siehe [Client-ID](../einstellungen/settings#client-id)) |
| Aura-Instanz | Leer = `aura.0` |

Die Lautstärke aus `80;Text` wird übernommen.

**Ältere SayIt-Version** oder Vis-Instanzen auf vis/vis-2: Aura spielt jede Ansage dieser Instanz auf allen Geräten ab. Ohne installiertes VIS meldet SayIt im Log „Cannot control browser via vis(1)“ — die Ansage kommt trotzdem.

## Meldungen vorlesen

Meldungen mit `"speak": true` liest das Gerät vor, das sie anzeigt: Titel, dann Text. Voreinstellung je Schweregrad: **Admin → Meldungen → Standardwerte → Vorlesen**. Siehe [Meldungen](../einstellungen/meldungen#verhalten).
