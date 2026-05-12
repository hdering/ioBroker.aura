# Changelog

## v0.7.18 (2026-05-12)

- fix(climate): wire showAverage and showAverageAsValue options
- fix(climate): respect showYAxis/yAxisCompact options on Raumklima chart

## v0.7.16 (2026-05-12)

- feat(calendar): wire iCal lastUpdated into generic 'Letzte Änderung anzeigen' overlay

## v0.7.15 (2026-05-12)

- fix(evcc): show loadpoint title instead of generic 'Vehicle' fallback

## v0.7.13 (2026-05-12)

- fix(jsontable): re-apply auto-height when external writes revert gridPos.h
- debug(jsontable): log every config.gridPos.h change + onConfigChange calls
- debug(jsontable): log resolved gridGap/gridRowHeight values
- fix(jsontable): auto-height honors global gridGap/gridRowHeight settings
- build: rebuild frontend bundle to include auto-height fixes and debug logs
- debug(jsontable): log all measurements in auto-height effect
- fix(jsontable): handle table-wrapper overflow:auto clipping in auto-height

## v0.7.12 (2026-05-12)

Release v0.7.12

## v0.7.11 (2026-05-12)

- fix(jsontable): include widget padding+border in auto-height calc
- Revert "refactor(socket): load socket library from web/socketio adapter at runtime"
- refactor(socket): load socket library from web/socketio adapter at runtime
- fix(proxy): handle string socketPort and IPv6 bind addresses
- fix(proxy): auto-detect socket.io backend host from web/socketio instance (#195)

## v0.7.10 (2026-05-11)

- fix(clock): respect display setting in custom layout
- ui(conditions): wider settings popup with fluid layout
- feat(conditions): allow comparing two datapoints (DP vs DP)

## v0.7.9 (2026-05-11)

- ui(conditions): wider settings popup with fluid layout for DP comparison

## v0.7.8 (2026-05-11)

- feat(conditions): allow comparing two datapoints (DP vs DP) in widget conditions

## v0.7.7 (2026-05-11)

- fix(chart): tighten Y-axis width in compact mode (22px) vs full (36px)

## v0.7.6 (2026-05-11)

- feat(chart): optional Y-axis with compact notation (7000 → 7K)

## v0.7.5 (2026-05-11)

- feat(weather): expose tomorrow's symbol & values in custom layout
- feat(weather): responsive scaling, temperature color scale & custom-layout components

## v0.7.4 (2026-05-11)

- feat(autolist): add secondary sort level as tiebreaker

## v0.7.3 (2026-05-11)

- feat(trashschedule): add configurable icon sizes for default and list layouts

## v0.7.1 (2026-05-11)

- feat(autolist): expose cardMinWidth config field in card layout
- feat: add list layout and text size options to TrashScheduleWidget

## v0.7.0 (2026-05-11)

- fix: apply colorThresholds to compact layout thermostat value
- fix: add px-2 pt-2 padding to iframe widget title row
- fix: pin climate widget title+icon to top (shrink-0)
- fix: show °C instead of ° in all thermostat layouts
- fix: show degree symbol inline with thermostat setpoint, remove unit from label
- fix: center button label horizontally and vertically in default layout
- fix: center time display in ClockWidget default layout
- fix: ChipsWidget title always stays top, valign only affects chip area
- fix: align ChipsWidget to template standard + remove old layout duplicates
- feat: remove unused layouts from six widgets
- fix: remove extra px-3 from list/autolist header — aligns with widget padding
- fix: add padding to EChartsPresetWidget title/icon row
- fix: move Icon/Icon-Größe from DARSTELLUNG to widget settings for stateimage
- fix: remove duplicate Darstellung fields for stateimage/windowcontact/binarysensor
- fix: align SliderWidget title font size to standard (text-xs)
- fix: reduce status-label font size in default layout for boolean/state widgets
- Create FUNDING.yml
- test: set all widget value font sizes to text-xl font-bold
- fix: align font sizes in all widgets per widget-config-template standard
- fix: align value font sizes across widgets to ValueWidget standard
- fix: change default iconSize from 36px to 20px across all widgets

## v0.6.29 (2026-05-09)

Release v0.6.29

## v0.6.28 (2026-05-09)

- fix: barTrack height in DimmerWidget default/compact/minimal/card layouts
- feat: add Bar-Stil to DimmerWidget (copied from SliderWidget)

## v0.6.27 (2026-05-09)

- fix: remove unused editMode param from ThermostatWidget

## v0.6.26 (2026-05-09)

- fix: hide average ReferenceLine when showAverageAsValue is active (default layout)

## v0.6.25 (2026-05-09)

- feat: filter LayoutPicker to only show layouts available for widget type
- fix: apply admin portal theme vars to LayoutPicker dropdown
- fix: render LayoutPicker dropdown via portal to escape overflow-hidden clip
- feat: restrict popup-view type-defaults to specific widget layouts
- fix: persist removed builtin type-defaults across rehydration

## v0.6.24 (2026-05-09)

- fix: remove remaining clickable (detail-popup) toggle from WidgetFrame thermostat panel
- feat: remove clickable (detail-popup) setting from thermostat widget
- feat: merge Backup & Restore and Auto-Backup into single BackupCard
- feat: remove unused ioBroker Web-Adapter URL setting from expert panel

## v0.6.23 (2026-05-09)

- fix: revert shutter slider direction — slider mirrors displayed value
- fix: shutter slider always right=open; replace invertPosition toggle with actor-preset

## v0.6.22 (2026-05-09)

- feat: apply global decimals + per-cell override to custom layout
- fix: add px-2 pt-1 padding to IframeWidget title/icon row

## v0.6.21 (2026-05-09)

- fix: remove showTitle/titleAlign from MediaplayerWidget — track title always visible
- feat: convert MediaplayerWidget + 8 more widgets to DARSTELLUNG/ERWEITERT template
- fix: HeaderWidget subtitle toggle and title alignment
- feat: convert HeaderWidget, GroupWidget, ButtonWidget to DARSTELLUNG/ERWEITERT template
- feat: convert HtmlWidget and DatePickerWidget to DARSTELLUNG/ERWEITERT template
- feat: convert IframeWidget and JsonTableWidget to DARSTELLUNG/ERWEITERT template
- feat: convert TrashWidget and TrashScheduleWidget to DARSTELLUNG/ERWEITERT template
- feat: ImageWidget template compliance — titleAlign, title/icon row on image, WidgetIcon in placeholder
- feat: add showTitle/showIcon/titleAlign/WidgetIcon to CameraWidget (all layout states)
- feat: add showTitle/showIcon to all evcc layouts (battery, production, consumption, loadpoints, compact, no-connection)
- fix: calendar visFields removed from layout section; iconSize uncapped; no-sources shows title/icon
- fix: add title/icon to calendar minimal layout; cap header icon size to 14px
- feat: add showTitle/showIcon/titleAlign to calendar, evcc, camera, image widgets
- feat: convert WeatherWidget to unified DARSTELLUNG panel
- feat: convert ClockWidget to unified DARSTELLUNG panel
- feat: convert HttpRequestWidget to unified DARSTELLUNG panel
- feat: convert ButtonWidget to unified DARSTELLUNG panel
- feat: convert ChipsWidget to unified DARSTELLUNG panel
- feat: convert StateImageWidget to unified DARSTELLUNG panel
- feat: convert BinarySensorWidget to unified DARSTELLUNG panel
- feat: convert WindowContactWidget to unified DARSTELLUNG panel
- feat: convert FillWidget to unified DARSTELLUNG panel structure
- feat: convert AutoListWidget to new Darstellung/Erweitert panel structure
- fix: title position not applied in ListWidget
- feat: convert ListWidget to new Darstellung/Erweitert panel structure
- fix: show title/icon in EChartsPresetWidget no-preset placeholder
- feat: convert EChartsPresetWidget to new Darstellung/Erweitert panel structure
- feat: convert EChartWidget to new Darstellung/Erweitert panel structure
- feat: convert ClimateWidget to new Darstellung/Erweitert panel structure
- fix: title position not applied in ChartWidget
- feat: convert ChartWidget to new Darstellung/Erweitert panel structure
- feat: convert GaugeWidget to new Darstellung/Erweitert panel structure
- feat: convert ValueWidget to new Darstellung/Erweitert panel structure
- feat: convert ThermostatWidget to new Darstellung/Erweitert panel structure
- fix: define iconSize in SliderWidget
- fix: use iconSize for WidgetIcon in SliderWidget
- feat: convert SliderWidget to new Darstellung/Erweitert panel structure
- fix: use CompactIcon (custom icon) in all DimmerWidget layouts
- feat: convert DimmerWidget to new Darstellung/Erweitert panel structure
- fix: decouple icon visibility from title visibility in default layout
- feat: convert SwitchWidget to new Darstellung/Erweitert panel structure
- fix: apply titleAlign correctly in ShutterWidget default layout
- fix: respect showIcon toggle in ShutterWidget across all layouts
- fix: move Name above Widget-Typ, collapse Darstellung+Erweitert by default
- feat: add consolidated Darstellung panel for ShutterWidget
- feat: replace quickButtons with An/Aus toggle in DimmerWidget
- feat: add quickButtons (Schnellwahl) to DimmerWidget

## v0.6.20 (2026-05-08)

- fix: rename G-button label from 'G' to 'Global' across all widgets
- fix: invert shutter slider direction when showClosedPercent is enabled

## v0.6.19 (2026-05-08)

- fix: swap decimals input and G-button order — value first, button second
- feat: add global decimals setting with per-widget G-button override for list widgets
- feat: add global decimal places support to thermostat widget
- feat: add global decimal places support to climate widget

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

























































