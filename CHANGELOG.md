# Changelog

## v0.6.18 (2026-05-08)

- feat: add global decimal places support to value, chart and echart widgets
- feat: global default decimal places with per-widget override

## v0.6.17 (2026-05-08)

Release v0.6.17

## v0.6.16 (2026-05-07)

- feat: add colSpan to custom grid component cells for dimmer slider sizing

## v0.6.15 (2026-05-07)

- fix: create config.popup-config object in onReady

## v0.6.14 (2026-05-07)

- feat: replace curated icon grid with IconPickerModal in AdminEditor tab settings
- feat: replace curated icon grid in tab settings with full IconPickerModal

## v0.6.13 (2026-05-07)

- feat: allow URL datapoint in IframeWidget
- fix: show target temp when targetDatapoint is configured

## v0.6.12 (2026-05-07)

- fix: ClimateWidget icon, icon size, title align, layouts, humidity icon, last-change
- feat: add ClimateWidget (Raumklima)

## v0.6.11 (2026-05-07)

Release v0.6.11

## v0.6.10 (2026-05-06)

Release v0.6.10

## v0.6.9 (2026-05-06)

Release v0.6.9

## v0.6.8 (2026-05-06)

Release v0.6.8

## v0.6.7 (2026-05-06)

- fix: escape quotes in JSX text to satisfy no-unescaped-entities lint rule

## v0.6.6 (2026-05-06)

- feat: reset-to-type-default button in click action editor
- fix: type-default popup-view follows admin changes for unmodified widgets
- fix: auto-set type-default popup-view on first editor open
- feat: allow per-widget opt-out of type-level popup default

## v0.6.5 (2026-05-06)

- fix: chart in popup-view with {{dp}} now auto-detects and loads history

## v0.6.4 (2026-05-06)

- fix: center popup body content horizontally and vertically

## v0.6.3 (2026-05-06)

- feat: SliderWidget Bar-Stil (custom div-Slider, pointer events, barSize %)

## v0.6.2 (2026-05-06)

- fix: route HttpRequestWidget fetch through /proxy to bypass CORS

## v0.6.1 (2026-05-06)

- feat: AdminPopups 2-column layout (views left, type-defaults right)
- feat: remove width cap from Admin Widgets and Popups pages
- Revert "feat: popup uses full width, grid scales to fill container"
- feat: popup uses full width, grid scales to fill container

## v0.6.0 (2026-05-06)

- fix: add 24px padding buffer to popup naturalMinWidth
- feat: auto-size popup to content width
- refactor: replace legacy popup-* click action kinds with popup-view+builtin
- feat: allow direct editing of builtin views in super-admin mode
- feat: super-admin mode via secret URL key for builtin view protection
- feat: restore deleted standard popup views
- feat: auto-fill popup placeholder options + show all keys in toolbar
- fix: always show {{dp}} placeholder pill in view editor toolbar
- feat: show all used {{key}} placeholders in popup view editor toolbar
- feat: generalize popup placeholder substitution to all widget options
- feat: standard views read-only — copy-only workflow
- feat: popup phase 2 — {{dp}} substitution + predefined standard views
- refactor: remove popup groups, expose popup-view directly in click action
- feat: grid-based popup view editor with drag/resize positioning
- feat: popup views as standalone mini-dashboards (Phase 1)
- feat: implement 3-level popup configuration system

## v0.5.90 (2026-05-06)

- chore: delete unused AddWidgetDialog.tsx, fix stale comment in widgetRegistry
- fix: show hint for selected DP template (was only showing for further-widgets)
- feat: add hint texts to all DP_TEMPLATES, show hint for both template and further-widget selection
- feat: merge related templates in ManualWidgetDialog
- feat: move mediaplayer to further widgets (remove from DP_TEMPLATES)
- fix: dialog step1 wider (max-w-5xl), flex layout — only template grid scrolls
- fix: move further-widget hint outside scroll area to avoid layout shift and scrollbar
- fix: reserve space for "Erkannt als" line to prevent layout shift
- fix: remove inline hint from further-widgets to prevent scrollbar/layout shift
- fix: use visibility instead of minHeight for hint area to prevent scrollbar
- fix: reserve hint space in ManualWidgetDialog to prevent layout shift on double-click
- feat: double-click on widget in ManualWidgetDialog advances to step 2
- fix: widget naming in ManualWidgetDialog — template label as default title, full labels + hints for further widgets

## v0.5.88 (2026-05-06)

- feat: button widget — add custom layout support
- fix: apply iconSize in button compact layout
- fix: button widget — show title, hideable icon, no datapoint field
- feat: add button widget type (layout group, click-action only)

## v0.5.87 (2026-05-06)

- feat: httpRequest widget — remove card layout, add custom grid support
- fix: hide datapoint field for httpRequest widget
- feat: add HTTP-Aktion widget (GET/POST button)

## v0.5.86 (2026-05-05)

- feat: add FilePicker (image/*) for local ioBroker files in image config fields

## v0.5.85 (2026-05-05)

Release v0.5.85

## v0.5.84 (2026-05-05)

- fix: GroupWidget fitHeight bottom padding with non-default gridGap
- fix: GroupWidget fitHeight scrollbar with small gridGap

## v0.5.83 (2026-05-05)

Release v0.5.83

## v0.5.82 (2026-05-05)

- fix: PortalDropdown re-clamps on submenu expand to prevent viewport overflow

## v0.5.80 (2026-05-05)

Release v0.5.80

## v0.5.69 (2026-05-03)

- docs: README.md wiederherstellen mit Changelog seit v0.5.17
- feat: ShutterWidget — Option '% geschlossen anzeigen'
- feat: EvccWidget — optimistic UI für Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget — entferne Hinweis "eigener Sensor"
- fix: MediaPlayer — Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer — Cover volle Höhe, Lautstärke-Redesign, Geräteerkennung mit echtem Namen
- feat: MediaPlayer-Widget — Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge
- feat: Klick-Aktion — neue Popups, Auto-Select, Schließen-Fix
- fix: Klick-Aktion — Tab-Navigation + Auto-Select für Dimmer/Thermostat
- feat: Widget-Klick-Aktion — Popups + Navigation per Widget konfigurierbar

## v0.5.66 (2026-05-03)

- feat: ShutterWidget ÔÇö Option '% geschlossen anzeigen'
- feat: EvccWidget ÔÇö optimistic UI f├╝r Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget ÔÇö entferne Hinweis "eigener Sensor"
- fix: MediaPlayer ÔÇö Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer ÔÇö Cover volle H├Âhe, Lautst├ñrke-Redesign, Ger├ñteerkennung mit echtem Namen
- feat: MediaPlayer-Widget ÔÇö Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge
- feat: Klick-Aktion ÔÇö neue Popups, Auto-Select, Schlie├ƒen-Fix
- fix: Klick-Aktion ÔÇö Tab-Navigation + Auto-Select f├╝r Dimmer/Thermostat
- feat: Widget-Klick-Aktion ÔÇö Popups + Navigation per Widget konfigurierbar

## v0.5.65 (2026-05-03)

- feat: ShutterWidget ÔÇö Option '% geschlossen anzeigen'
- feat: EvccWidget ÔÇö optimistic UI f├╝r Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget ÔÇö entferne Hinweis "eigener Sensor"
- fix: MediaPlayer ÔÇö Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer ÔÇö Cover volle H├Âhe, Lautst├ñrke-Redesign, Ger├ñteerkennung mit echtem Namen
- feat: MediaPlayer-Widget ÔÇö Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge
- feat: Klick-Aktion ÔÇö neue Popups, Auto-Select, Schlie├ƒen-Fix
- fix: Klick-Aktion ÔÇö Tab-Navigation + Auto-Select f├╝r Dimmer/Thermostat
- feat: Widget-Klick-Aktion ÔÇö Popups + Navigation per Widget konfigurierbar

## v0.5.64 (2026-05-03)

- feat: ShutterWidget ÔÇö Option '% geschlossen anzeigen'
- feat: EvccWidget ÔÇö optimistic UI f├╝r Modus und Ziel-SoC am Ladepunkt
- fix: WeatherWidget ÔÇö entferne Hinweis "eigener Sensor"
- fix: MediaPlayer ÔÇö Alexa Mute via Volume=0 (muteViaVolume)
- feat: MediaPlayer ÔÇö Cover volle H├Âhe, Lautst├ñrke-Redesign, Ger├ñteerkennung mit echtem Namen
- feat: MediaPlayer-Widget ÔÇö Icon, responsives Layout, mobile-vertikal, Chip-Reihenfolge
- feat: Klick-Aktion ÔÇö neue Popups, Auto-Select, Schlie├ƒen-Fix
- fix: Klick-Aktion ÔÇö Tab-Navigation + Auto-Select f├╝r Dimmer/Thermostat
- feat: Widget-Klick-Aktion ÔÇö Popups + Navigation per Widget konfigurierbar
































