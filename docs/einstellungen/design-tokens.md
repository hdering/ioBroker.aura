# Design-Tokens

Aura rendert alle Widgets über CSS-Variablen. Wer ein Dashboard optisch nachbauen (oder als Mockup entwerfen) will, nutzt diese Tokens statt fester Farben — dann trifft das Ergebnis Auras Look und folgt automatisch jedem Theme.

Die Werte unten stammen aus den beiden Basis-Themes **Hell** und **Dark**. Alle Doku-Screenshots verwenden das Theme **Hell**.

## Basis-Tokens

Diese Variablen sind in jedem Theme gesetzt und bilden das Grundgerüst.

| Token | Bedeutung | Hell | Dark |
| --- | --- | --- | --- |
| `--app-bg` | App-Hintergrund | `#f9fafb` | `#111827` |
| `--app-surface` | Flächen (Panels, Bars) | `#ffffff` | `#1f2937` |
| `--app-border` | Trennlinien, inaktive Flächen | `#e5e7eb` | `#374151` |
| `--widget-bg` | Widget-Kartenfläche | `#ffffff` | `#1f2937` |
| `--widget-border` | Widget-Rahmen | `#e5e7eb` | `#374151` |
| `--widget-border-width` | Rahmenbreite | `1px` | `1px` |
| `--widget-radius` | Eckenradius der Karte | `0.75rem` | `0.75rem` |
| `--widget-shadow` | Kartenschatten | `0 1px 3px rgba(0,0,0,0.08)` | `none` |
| `--text-primary` | Haupttext, Werte | `#111827` | `#ffffff` |
| `--text-secondary` | Sekundärtext, Titel, Labels | `#6b7280` | `#9ca3af` |
| `--accent` | Primärakzent (blau) | `#3b82f6` | `#3b82f6` |
| `--accent-green` | Status „an/ok" (grün) | `#16a34a` | `#22c55e` |
| `--accent-yellow` | Status „Warnung" (gelb) | `#ca8a04` | `#eab308` |
| `--accent-red` | Status „kritisch/heizen" (rot) | `#dc2626` | `#ef4444` |

## Element-Tokens (optionale Overrides)

Element-Tokens verfeinern einzelne Bauteile. Sie sind **nicht** pro Theme gesetzt — solange der Nutzer sie nicht überschreibt, erben sie über eine CSS-Fallback-Kette (`var(--switch-bg, var(--accent-green))`) vom angegebenen Basis-Token. Für Mockups genügt es, den Fallback zu verwenden.

| Token | erbt von | Bauteil |
| --- | --- | --- |
| `--switch-bg` | `--accent-green` | Schalter „an" |
| `--switch-off-bg` | `--app-border` | Schalter „aus" |
| `--switch-thumb-color` | `#ffffff` | Schalter-Knopf |
| `--slider-track` | `--app-border` | Regler-Schiene |
| `--slider-fill` | `--accent` | Regler-Füllung |
| `--slider-thumb` | `--accent` | Regler-Knopf |
| `--gauge-arc` | `--accent` | Gauge-Bogen |
| `--gauge-track` | `--app-border` | Gauge-Hintergrundbogen |
| `--climate-heat` | `--accent-red` | Thermostat „heizen" |
| `--climate-cool` | `--accent` | Thermostat „kühlen" |
| `--blind-color` | `--accent` | Rollladen-Position |
| `--button-bg` / `--button-text` / `--button-border` | `--app-bg` / `--text-primary` / `--app-border` | Button-Widget |
| `--chip-bg` / `--chip-border` / `--chip-active` | `--app-bg` / `--app-border` / `--accent` | Chips |
| `--badge-ok` / `--badge-warn` / `--badge-crit` | `--accent-green` / `--accent-yellow` / `--accent-red` | Status-Badges |
| `--light-on` / `--light-off` | `--accent-yellow` / `--text-secondary` | Lampen-Power-Button |
| `--header-text` / `--header-accent` | `--text-primary` / `--accent` | Abschnittstitel |
| `--nav-bg` / `--nav-active` | `--app-surface` / `--accent` | Tab-Leiste |

## Raster

Widgets liegen auf einem feinen Grid. Die Zellgröße ist pro Layout konfigurierbar (`gridRowHeight`, `gridSnapX`, `gridGap`); in den Doku-Screenshots gilt `gridRowHeight = 20`, `gridGap = 10`. Widget-Größen (`gridPos.w`/`gridPos.h`) sind Vielfache dieser Zelleinheiten.
