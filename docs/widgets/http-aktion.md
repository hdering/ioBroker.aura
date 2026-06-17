# HTTP-Aktion

Löst per Klick eine HTTP-GET- oder POST-Anfrage aus, z. B. für Webhooks oder REST-APIs. Die Anfrage läuft über den internen `/proxy`-Endpunkt; die Antwort kann optional in einen Datenpunkt geschrieben werden. Mit Status-Rückmeldung und optionaler Sicherheitsabfrage.

## Datenpunkt

Kein Pflicht-Datenpunkt — die Aktion ist eine HTTP-Anfrage. Optional kann die Antwort gespeichert werden.

| Feld | Pflicht | Typ | |
| --- | --- | --- | --- |
| `responseDatapoint` | nein | — | Datenpunkt für den Antworttext (als Text geschrieben) |

## Layouts

### Default / Card
Optionaler Titel/Icon-Kopf, darunter die Senden-Taste und der Status-Text.

### Compact
Eine Zeile mit Titel, Status und Taste — für Listen.

### Minimal
Nur Taste und Status zentriert — für sehr kleine Zellen.

### Custom
Taste und Status frei in einer Zellenmatrix platzieren — siehe [Custom-Layout](./custom-layout).

## Einstellungen

Alle Optionen werden im Editor unter **Widget bearbeiten** gesetzt.

![](./assets/http-aktion/config.png)

### Anfrage

| Option | Standard | |
| --- | --- | --- |
| `method` | `GET` | `GET` · `POST` |
| `url` | — | Ziel-URL (über `/proxy` aufgerufen) |
| `body` | — | Request-Body (nur bei `POST`) |
| `contentType` | `application/json` | `Content-Type`-Header (nur bei `POST` mit Body) |
| `responseDatapoint` | — | DP für den Antworttext |

### Taste

| Option | Standard | |
| --- | --- | --- |
| `buttonLabel` | Widget-Titel | Beschriftung der Taste |
| `buttonColor` | `var(--accent)` | CSS-Farbe oder Variable |
| `showStatus` | `true` | Status-Text (`Sende…` / `200 OK` / Fehler) anzeigen |

### Anzeige

| Option | Standard | |
| --- | --- | --- |
| `showTitle` | `true` | Titel anzeigen |
| `showIcon` | `true` | Icon anzeigen |
| `icon` | `Globe` | [Lucide-Icon](https://lucide.dev) |
| `iconSize` | `32` | px |
| `titleAlign` | `left` | `left` · `center` · `right` |

### Sicherheitsabfrage

Bestätigungs-Overlay vor dem Auslösen.

| Option | Standard | |
| --- | --- | --- |
| `confirmAction` | `false` | Bestätigung vor dem Senden |
| `confirmText` | — | Anzeigetext im Overlay |
