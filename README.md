# Aura – Modernes Dashboard für ioBroker

Aura ist ein modernes Visualisierungs-Dashboard für [ioBroker](https://www.iobroker.net/). Die Entwicklung erfolgt KI-gestützt mit [Claude](https://claude.ai/) von Anthropic.

> **Beta** – Das Projekt ist noch in aktiver Entwicklung. Bugs und Breaking Changes sind möglich.

---

## Features

- **Flexibles Grid-Layout** mit Drag & Drop
- **Mehrere Tabs / Seiten** pro Dashboard
- **Themes:** Dark, Light, Catppuccin (Latte, Frappé, Macchiato, Mocha), Apple Liquid Glass u.v.m.
- **Vollständige Admin-Oberfläche** – keine YAML, kein JSON-Editieren
- **Responsive** – funktioniert auf Tablet, Smartphone und Desktop

### Widgets

| Widget | Beschreibung |
|--------|-------------|
| Schalter | Ein/Aus, Toggle |
| Dimmer | Helligkeit mit Slider |
| Thermostat | Soll-/Ist-Temperatur |
| Gauge | Rundes Messgerät mit Farbzonen |
| Füllstandsanzeige | Tank/Wasser/Gas – vertikal oder horizontal |
| Diagramm | Linien-, Balken-, Tortendiagramm (ECharts) |
| Kalender | iCal / Google Calendar |
| Wetter | Aktuelle Wetterdaten |
| Uhr | Analog oder Digital |
| iFrame / Kamera | Einbettung beliebiger URLs |
| EVCC | Wallbox, Solar, Batteriespeicher |
| Müllabfuhr | Welche Tonne muss raus? |
| Gruppe | Verschachtelte Widgets |

---

## Installation

Aura ist noch **nicht** im offiziellen ioBroker-Repository. Die Installation erfolgt manuell über eine GitHub-URL.

### Schritt 1 – Adapter installieren

1. ioBroker Admin öffnen
2. **Adapter** → oben rechts auf das **GitHub-Icon** (Von URL installieren) klicken
3. Folgende URL eingeben und installieren:

```
https://github.com/hdering/iobroker.aura
```

### Schritt 2 – Instanz anlegen

Nach der Installation eine neue Instanz von **Aura** anlegen (falls nicht automatisch geschehen).

### Schritt 3 – Dashboard öffnen

Das Dashboard ist erreichbar unter:

```
http://<iobroker-ip>:8082/aura/
```

Die Admin-Oberfläche unter:

```
http://<iobroker-ip>:8082/aura/#/admin
```

---

## Updates

Da Aura von einer externen URL installiert wird, werden Updates **nicht automatisch** eingespielt.

Per SSH auf den ioBroker-Server verbinden, ins ioBroker-Verzeichnis wechseln (meist `/opt/iobroker`) und folgenden Befehl ausführen:

```bash
npm install iobroker.aura@latest --force && iobroker upload aura && iobroker restart aura
```

Den aktuellen Versionsstand und alle Änderungen gibt es unter [Releases](https://github.com/hdering/iobroker.aura/releases).

---

## Entwicklung (lokale Testinstanz)

```bash
# Abhängigkeiten installieren
npm install

# Dev-Server starten (verbindet sich mit ioBroker per Proxy)
npm run dev

# Produktions-Build erstellen
npm run build:adapter
```

Der Dev-Server erwartet eine laufende ioBroker-Instanz. Die Ziel-URL kann in der Admin-Oberfläche unter Einstellungen konfiguriert werden.

---

## Bugs & Feature-Wünsche

Bitte direkt als GitHub Issue melden:

👉 **[github.com/hdering/iobroker.aura/issues](https://github.com/hdering/iobroker.aura/issues)**

---

## Lizenz

MIT
