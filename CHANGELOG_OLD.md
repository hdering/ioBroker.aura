# Changelog (older entries)

## 0.21.5 (2026-07-07)
- Tabs - the "more tabs" scroll hint no longer flickers on mobile and sits higher, right under the tabs

## 0.21.4 (2026-07-06)
- 🌟 **New feature:** Guidelines - show a live badge with the current device screen resolution; enabled by default on fresh installs with a dismissible hint on how to turn it off

## 0.21.3 (2026-07-06)
- Load times - color-coded good/ok/slow thresholds with reference lines and latest-value badges so numbers are interpretable at a glance
- Load times - samples are now tagged per client; widget defaults to the current device and can filter/compare individual clients
- Load times - time range (1h/6h/24h/7d/all) is now switchable live from the widget header, not only in edit mode
- Load times - new "Details" view attributes slowness per widget (render and ready time) and per backend command, so you can see which one is responsible
- Settings - add performance-diagnostics switches: record load-time metrics (default on) and optional per-widget timing (default off, higher overhead)

## 0.21.2 (2026-07-06)
- Chart (Distribution) - "last" values now show the true current value instead of a history bucket average (e.g. 0 was shown as non-zero)

## 0.21.1 (2026-07-06)
- Zeitschaltuhr - adding or editing events now saves when the widget is used inside a popup

## 0.21.0 (2026-07-06)
- Energiebilanz - legend position is now a single option (left/right/above/below) shown under "Show legend", instead of a per-bar dropdown
- Energiebilanz - added a legend text-alignment option (left/center/right)
- Energiebilanz - legend content can now show the label only
- Energiebilanz - bar title and total can now be aligned left/center/right
- 🌟 **New feature:** Energiebilanz - new display style: bars, pie or donut chart (donut shows the total in its center)
- Energiebilanz - fixed legend labels being cut off in pie/donut view
- Energiebilanz - renamed to "Diagramm (Verteilung)" and moved into the standard widget group (it works for any part-of-whole data, not just energy)
- Diagramm (Verteilung) - adjustable bar width (bars) and diagram size (pie/donut)

## 0.20.0 (2026-07-06)
- 🌟 **New feature:** Export - optionally anonymise datapoints, titles, URLs, coordinates and custom code when exporting a widget, tab, layout or popup

## 0.19.5 (2026-07-06)
- Layouts - changing the global theme preset now shows the Save button again

## 0.19.4 (2026-07-06)
- Map - corners are now rounded in the live view too (transparent map widgets used to render square outside the editor)

## 0.19.3 (2026-07-06)
- Map - opens on a sensible overview and zooms to the marker once its position resolves (no more long wait on a blank zoomed-in patch)
- Map - keeps following a slowly moving marker instead of staying put on small position changes
- Datapoint picker - adds a "Show inactive" toggle to reveal states of disabled/uninstalled adapters and orphaned or imported datapoints

## 0.19.2 (2026-07-05)
- Universal widget - slider cell now offers a decimal-places option (with Global fallback) when the value display is enabled

## 0.19.1 (2026-07-05)
- Map - now centers reliably on a marker positioned via two lat/lon datapoints instead of staying on the default view

## 0.19.0 (2026-07-05)
- 🌟 **New feature:** New "Load times" widget - charts frontend load performance over time (initial load, first paint, socket warm-up, tab switches, long tasks), recorded in the aura backend

## 0.18.5 (2026-07-05)
- Popup views - HTTP request, button, map and status overview widgets now render inside popups instead of showing "unknown type"

## 0.18.4 (2026-07-04)
- Status overview - each category now has a freely selectable background color in addition to the highlight color
- Status overview - enabled categories now group their settings in a card so it is clear which settings belong to which category
- Status overview - the hint-count chip in the top-right can now be hidden
- Status overview - new option to size the widget height to its content (auto height), in both the grid and the stacked/mobile view

## 0.18.3 (2026-07-04)
- Conditions - visibility can now show a widget or tab on match, not just hide it (new Hide/Show on match toggle)

## 0.18.2 (2026-07-04)
- Weather - card sizes to its content on mobile, removing the empty gap below it in the single-column layout

## 0.18.1 (2026-07-04)
- Input field - optional confirmation prompt before sending the value (input widget submit mode and universal-widget input cell)
- Universal widget - input cell now matches the input widget: submit-on-Enter/Send vs. live mode, an optional Send button, and a multi-line (textarea) mode
- Input field - add a number input type with optional Min/Max/Step

## 0.18.0 (2026-07-04)
- Settings - Frontend options reordered (Header first) with clearer grouping for sub-settings, and a note that the layout menu only appears with 2+ layouts
- General - adapter readme link now points to the online documentation instead of a dead iobroker.net page
- 🌟 **New feature:** Energiebilanz - new widget: any number of stacked bars, each from multiple datapoints with history aggregation (e.g. Production/Consumption)

## 0.17.5 (2026-07-03)
- Groups - widgets keep their current size when dropped into a group instead of resetting to the type default

## 0.17.4 (2026-07-03)
- Script Status, Adapter Status, Adapter Logs - add optional zebra striping (like the JSON table widget)

## 0.17.3 (2026-07-03)
- Weather - fixed weather condition labels (WMO codes 1-3 were shifted; code 1 now correctly shows "Mainly clear")

## 0.17.2 (2026-07-03)
- Script status - list entries, filter buttons and search box now respect transparent mode
- JSON table - header and search box now respect transparent mode
- Adapter logs - filter buttons, source buttons, search box, table header and log rows now respect transparent mode
- Adapter status - filter buttons, search box and instance rows now respect transparent mode

## 0.17.1 (2026-07-03)
- feat(config): apply typed hex color live in ColorPicker

## 0.17.0 (2026-07-03)
- 🌟 **New feature:** Color pickers - add a 0-100% transparency (alpha) slider plus a hex input to every color control (widgets and settings).

## 0.16.0 (2026-07-03)
- 🌟 **New feature:** Map - add quick-access chips that recenter the map to a configured position on click; each chip supports the same position sources as markers (JSON datapoint, two datapoints, fixed coordinates or address) plus an optional zoom, and can be placed below the map or as an overlay in any corner

## 0.15.5 (2026-07-03)
- Settings - the global decimal-places setting now applies on all browsers/devices, not just the one where it was configured

## 0.15.4 (2026-07-02)
- Tabs - badges are no longer clipped by the header
- Weather - fix jumbled/incorrect forecast weekday labels when using adapter data source (open-meteo-weather emits DD.MM.YYYY dates)
- Weather - forecast now shows rain amount consistently (0 mm on dry days) instead of hiding it, so the column no longer looks ragged
- fix(lint): wrap German typographic quotes in StatusOverviewConfig JSX
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices

## 0.15.3 (2026-07-02)
- Weather - fix jumbled/incorrect forecast weekday labels when using adapter data source (open-meteo-weather emits DD.MM.YYYY dates)
- Weather - forecast now shows rain amount consistently (0 mm on dry days) instead of hiding it, so the column no longer looks ragged
- fix(lint): wrap German typographic quotes in StatusOverviewConfig JSX
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices

## 0.15.2 (2026-07-02)
- fix(lint): wrap German typographic quotes in StatusOverviewConfig JSX
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices

## 0.15.1 (2026-07-02)
- Auswahlfeld - current selection can now be shown as text, icon, or icon + text; entries gained per-entry icons and a compact single-row editor. The Universal widget's DP-select cell matches this: import entries from the datapoint's common.states, per-entry icons, and a tidied entry row
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices

## 0.15.0 (2026-07-02)
- 🌟 **New feature:** Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the affected device; offers list/Card/Minimal layouts with per-category colors, shows battery type and count, uses robust reachability detection, and includes a battery-type assignment page to identify and manage battery devices

## 0.14.2 (2026-07-01)
- Map - zoom level is now configurable (fixed zoom, or max-zoom cap when auto-centering on markers)
- Click action "Jump: Widget" now pulse-highlights and scrolls to the target widget after switching tabs
- Badges - renamed to "Marker" in the German UI

## 0.14.1 (2026-07-01)
- Badges - renamed to "Marker" in the German UI

## 0.14.0 (2026-06-30)
- 🌟 **New feature:** Dynamic List - optionally group datapoints by room with the room name as a section heading
- 🌟 **New feature:** Dynamic List - room section headings now support custom font size, text color and background color
- Tabs - fix tab switching needing multiple clicks after auto-return to the default tab
- General - fix datapoints with a JSON path (e.g. dp?soc) in header, tab bar and camera fields being rejected; the nested value is now shown

## 0.13.0 (2026-06-29)
- 🌟 **New feature:** Map - new widget: plot positions (car, person, …) from lat/lon or JSON datapoints, fixed coordinates, or a plain address on an OpenStreetMap map, with optional distance from a reference point
- 🌟 **New feature:** Map - choose a map style: standard map, satellite, or terrain/topo

## 0.12.1 (2026-06-29)
Release v0.12.1

## 0.12.0 (2026-06-29)
- 🌟 **New feature:** Badges - add configurable badges (colored dot, datapoint count, or label/icon) that sit on the edge of widgets, groups and tabs; visible always or when a condition is met, with a free corner position
- 🌟 **New feature:** Tabs - optional aggregate badge counting how many widgets on a tab currently show a badge

## 0.11.5 (2026-06-28)
- Widget menu - Copy/Move target list now uses 2–3 columns and grows to the right when there are many tabs, so entries no longer fall off the bottom of the screen

## 0.11.4 (2026-06-27)
- Popups - removing a widget-type default in the backend now stops auto-linking the built-in popup (e.g. dimmers no longer force the Standard Dimmer popup)

## 0.11.3 (2026-06-27)
- Widget editor - datapoint buttons reordered to "from ioBroker", "JSON path", "transform"
- Widget editor - unified the datapoint picker icon across all widgets (HTML, iframe, camera, carousel, chips, weather, trash, static list)

## 0.11.2 (2026-06-27)
- Universal widget - select cell now re-sends the value when the already-selected entry is picked again

## 0.11.1 (2026-06-26)
- Switch / Dimmer - toggle knob now vertically centered instead of sitting too low

## 0.11.0 (2026-06-26)
- Adapter now requires admin >= 7.8.23
- Clock / astro timers - more accurate sunrise/sunset times (suncalc 2.0)

## 0.10.5 (2026-06-26)
- Editor - reordered tab settings (Name, Icon, URL slug, options, export, conditions) and highlighted the conditions section
- Editor - tabs hidden from the tab bar now show an eye-off icon in the tab list

## 0.10.4 (2026-06-25)
- fix(thermostat): drop "Soll:" label from target temperature
- fix(thermostat): inline "Soll:" label and fix doubled °CC unit

## 0.10.3 (2026-06-25)
- feat(tabs): add "hide from tab bar" option (still reachable via direct link)
- fix(alarm): make acknowledge (quit_changes) button actually clear state
- fix(alarm): wrap long log entries instead of truncating
- feat(alarm): allow hiding individual mode buttons (off/sharp/inside/night)
- feat(light): add hex color mode for single #RRGGBB string datapoints
- fix(light): power entry toggles directly instead of duplicating switch
- feat(list): per-entry icon-switch icons and confirmation prompt
- feat(weather): add separate size factor for warnings
- fix(weather): give warnings their own flex/scroll region, stop them inflating
- fix(weather): size warnings into auto-scale baseline so they fit without scroll
- fix(weather): render DWD warning content instead of empty yellow box
- fix(adapter-status): show schedule-mode adapters as 'scheduled' not 'stopped'
- fix(editor): keep tab settings panel on-screen when conditions expand
- fix(tabbar): keep settings panel on-screen for far-right tabs
- fix(chart): show full German unit word for custom range button
- feat(group): per-group option to keep grid layout on mobile
- fix(group): fill and scroll inside fixed-height containers on mobile
- fix(panels): prevent viewport collapse in mobile portrait layout

## 0.10.2 (2026-06-25)
- chore(build): rebuild www frontend bundle
- chore(build): rebuild www frontend bundle
- Merge pull request #383 from hdering/chore/ws-upgrade-log-debug
- chore(proxy): lower WS-upgrade diagnostic log to debug level
- chore(build): rebuild www frontend bundle
- style(prettier): auto-format code files
- Merge pull request #382 from hdering/fix/pure-ws-sid-diag
- fix(proxy): inject sid also when empty + log WS upgrades (pure-ws diag)
- chore(build): rebuild www frontend bundle
- Merge pull request #381 from hdering/fix/pure-ws-ensure-sid
- fix(proxy): guarantee a sid on pure-ws root upgrades (fixes 5s reconnect loop)
- chore(build): rebuild www frontend bundle
- style(prettier): auto-format code files
- Merge pull request #380 from hdering/fix/adaptive-forwarded-for
- fix(proxy): only forward X-Forwarded-For for engine.io socket modes
- chore(build): rebuild www frontend bundle
- Merge pull request #369 from hdering/fix/proxy-x-forwarded-for
- feat(proxy): forward X-Forwarded-For/Proto to the socket backend
- chore(build): rebuild www frontend bundle
- Merge pull request #368 from hdering/fix/pin-zustand-v4-prod-loop
- fix(deps): pin zustand to v4 — v5 causes prod-only infinite render loop
- chore(build): rebuild www frontend bundle
- Merge pull request #359 from hdering/fix/force-websockets-transport
- fix(socket): connect websocket-first so "Force web sockets" works
- chore(deps): bump actions/checkout from 6 to 7 (#356)
- chore(deps): bump zustand to v5 and migrate equality-fn store hooks (#358)
- chore(build): rebuild www frontend bundle
- chore(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#330)
- chore(deps): bump @iobroker/adapter-core from 3.3.2 to 3.4.1 (#331)
- chore(deps): bump ioBroker/testing-action-check from 1 to 2 (#327)

## 0.10.0 (2026-06-24) — beta/test release
- Merge pull request #357 from hdering/pr218-pure-ws-followup
- fix(socket): resolve no-use-before-define in load guard
- fix(socket): dev-proxy pure-ws root upgrade + socket-lib load guard
- Support pure WebSocket transport (load socket.io client at runtime)

## 0.9.299 (2026-06-22)
- fix(io-package): restore required common.licenseInformation (E1015/E1105)

## 0.9.298 (2026-06-22)
- fix(backup): decode binary .gz reads so backups aren't reported empty

## 0.9.297 (2026-06-22)
- fix(custom-grid): align default custom-layout font sizes across all widgets
- fix(value-widget): match custom-layout font sizes to other layouts

## 0.9.296 (2026-06-22)
- fix(reset): land on backend overview after reset, not the frontend

## 0.9.295 (2026-06-22)
- test: drop licenseInformation from required io-package fields
- fix(backup): keep change-comment after reload by falling back to ioBroker cache

[Older changelogs can be found there](CHANGELOG_OLD.md)

## 0.9.294 (2026-06-22)
- fix(reset): wipe backend config states on "reset everything", not just localStorage

## 0.9.293 (2026-06-22)
- chore(io-package): remove licenseInformation to skip admin license dialog

## 0.9.292 (2026-06-20)
- fix(group-defs): actually run gcGroupDefs to clean orphaned defs
- fix(broken-dp): skip orphaned group defs, deep-link popup-hosted children

## 0.9.291 (2026-06-20)
- fix(broken-dp): deep-link group/panels and nested-group children to editor

## 0.9.290 (2026-06-20)
- fix(lint): auto-fix mixed typographic quotes
- chore(deps): keep suncalc only in dependencies (backend runtime require)
- feat(universal-widget): deprecate standalone Button (DP) cell type
- feat(universal-widget): add button control mode to switch (DP) cell
- style(prettier): auto-format code files
- fix(timers): compute astro times with bundled suncalc instead of host getAstroDate

## 0.9.289 (2026-06-20)
- fix(settings): let device and backup lists grow together symmetrically
- fix(settings): let the backup list grow with its content

## 0.9.288 (2026-06-20)
- style(prettier): auto-format code files
- fix(settings): let the device list fill the full card height
- fix(settings): scroll the device edit/delete-confirm row into view

## 0.9.287 (2026-06-19)
- fix(enum): theme the Auswahlfeld dropdown from its anchor so it matches the layout theme

## 0.9.286 (2026-06-19)
- fix(panels): track hover and focus separately so open dropdowns don't slide away

## 0.9.285 (2026-06-19)
- fix(panels): let child clicks through; capture pointer only on real swipe

## 0.9.284 (2026-06-19)
- fix(panels): pause autoplay while pointer over or focus inside panel

## 0.9.283 (2026-06-19)
- feat(popup): default importer datapoint to {{dp}}
- feat(popup): import widgets in the popup-view editor
- @ feat(editor): copy/move dashboard widget into a popup view

## 0.9.282 (2026-06-19)
- feat(enum): per-entry render mode (text/image/html/icon) with pickers
- feat(enum): support HTML in Auswahlfeld entry labels

## 0.9.281 (2026-06-19)
- feat(editor): surface save-blocked hint in the save bar

## 0.9.280 (2026-06-19)
- style(list): use template literal for invalid-entry marker (prefer-template)
- fix(list): stop id-less entries from crashing list widgets and config

## 0.9.279 (2026-06-19)
- style(prettier): auto-format code files
- chore: stop tracking .vite-dev.log dev artifact
- feat(admin-widgets): collapse all type sections by default + clickable summary chips

## 0.9.278 (2026-06-19)
- perf(panels): keep slide track on its own GPU layer to reduce autoplay jank

## 0.9.277 (2026-06-19)
- fix(theme): rename config.themeMode.admin → adminUi (hidden by Admin tree)

## 0.9.276 (2026-06-19)
- fix(persist): acknowledge config-storage DP writes (ack=true)

## 0.9.275 (2026-06-19)
- fix(theme): upsert themeMode sub-states so admin DP actually persists

## 0.9.274 (2026-06-17)
- fix(widgets): keep last-change timestamp inside narrow widgets

## 0.9.273 (2026-06-17)
- fix(popup): keep long popup-view fully scrollable and stop scrollbar overlap

## 0.9.272 (2026-06-17)
Release v0.9.272

## 0.9.271 (2026-06-17)
- feat(widgets): derive panels/group add-widget pickers from registry

## 0.9.270 (2026-06-17)
- docs(widgets): expand every widget page with layout & option details

## 0.9.269 (2026-06-17)
- docs(widgets): document all remaining widgets with screenshots

## 0.9.268 (2026-06-17)
- fix: apply value transform to numeric string states
- docs: click-to-zoom lightbox + modest inline image sizing
- docs(admin): document the full admin area with screenshots
- style: wrap configLoader persistManager import (prettier)
- feat(docs): add switch custom-layout screenshot
- feat(docs): screenshot harness + real switch widget screenshots

## 0.9.267 (2026-06-17)
- fix(objects): use role 'text' for navigate.target selector

## 0.9.266 (2026-06-17)
- fix(backup): gzip auto-backups to stay under socket.io frame limit

## 0.9.265 (2026-06-17)
- style(prettier): auto-format code files
- feat(binarysensor): add active/inactive label color pickers, fix icon toggle wobble

## 0.9.264 (2026-06-17)
- style(prettier): auto-format code files
- feat(group): add autoShrink option that collapses group height when child widgets are condition-hidden

## 0.9.263 (2026-06-17)
- feat(panels): block save when group-defs unhydrated, rename slides→panels, move to Spezial
- fix(panels): align defId seeding to GroupWidget + loading state
- feat(panels): re-add slide-of-widgets carousel as new 'panels' widget

## 0.9.262 (2026-06-16)
- fix(navigate): create per-client navigate.target for existing clients
- fix(popup-editor): copy widgets within the popup, drop cross-tab move

## 0.9.261 (2026-06-16)
- feat(navigate): add view/tab selector datapoint

## 0.9.260 (2026-06-16)
- fix(value-transform): persist selected preset so presets sharing a factor stay distinct

## 0.9.259 (2026-06-16)
- fix(image-widget): write selected datapoint to imageDatapoint option

## 0.9.258 (2026-06-16)
- feat(adapter-status): add "Deaktiviert" filter for disabled instances

## 0.9.257 (2026-06-16)
- feat(popup): auto-detect history adapter for charts opened from value widgets

## 0.9.256 (2026-06-16)
- feat(widgets): display-only value transform (factor/offset) with preset dropdown
- chore(deps-dev): bump lucide-react from 1.17.0 to 1.20.0 (#332)

## 0.9.255 (2026-06-16)
- style(prettier): auto-format code files
- feat(widget-editor): card framing with amber tint for Darstellung/Erweitert sections

## 0.9.254 (2026-06-16)
- chore(frontend): silence benign recharts zero-size container warning

## 0.9.253 (2026-06-16)
- refactor(echart): single shared time range, drop per-series ranges
- feat(echart-config): auto-select sole history adapter per series
- fix(echart): fit Y-axis to data range (scale) to remove empty space
- feat(echart): current value, frontend range selector, grid-line toggle

## 0.9.252 (2026-06-16)
- fix(useIoBroker): allow spaces in state IDs

## 0.9.251 (2026-06-15)
- feat(adapter-logs): multi-select adapter filter in the frontend

## 0.9.250 (2026-06-15)
- style(prettier): auto-format code files
- build(adapter-logs): rebuild www so widget sends instances pre-filter
- feat(adapter-logs): comma-separated instance filter in getRecentLogs backend

## 0.9.249 (2026-06-15)
- fix(dp): use `?` not `#` as JSON-path separator so IDs containing `#` stay writable

## 0.9.248 (2026-06-15)
- @ feat(theme): element-specific CSS variables for widgets (#313)

## 0.9.247 (2026-06-15)
- fix(lint): auto-fix mixed typographic quotes
- feat(backup): generic list-item change detection across all widget types
- feat(backup): record per-entity change details in backup list

## 0.9.246 (2026-06-15)
- fix(clients): only register client when new or renamed

## 0.9.245 (2026-06-15)
- fix(theme): readable preset names + explain what a preset changes (#307)
- feat(layouts): export/import complete layouts with all tabs, widgets and groups

## 0.9.244 (2026-06-15)
- chore: ignore examples/ directory
- chore: remove examples/testdata-generator.js from repo
- fix(editor): hide 'card' layout option for header widget in new-widget dialog

## 0.9.243 (2026-06-15)
- style(prettier): auto-format code files
- fix(universal-widget): apply preselected state-text colors initially

## 0.9.242 (2026-06-15)
- feat(popup): sample chart preview + visible history instance in editor

## 0.9.241 (2026-06-14)
- fix(popup): inherit history adapter instance into popup charts
- Merge branch 'fix/309-open-in-dashboard-editor'
- docs(popup): add concrete placeholder examples in popup-view editor

## 0.9.240 (2026-06-13)
- feat(widgets): add "open in dashboard editor" button to widget rows (#309)

## 0.9.239 (2026-06-13)
- fix(popup): resolve {{placeholders}} in nested option arrays (#314)

## 0.9.238 (2026-06-13)
- style(prettier): auto-format code files

## 0.9.237 (2026-06-12)
- feat(datapoint): JSON path support on datapoint refs (id#path)
- feat(group): show loading spinner while group children hydrate

## 0.9.236 (2026-06-12)
- revert(tabbar): remove tab-bar settings preview
- feat(tabbar): live preview in tab-bar settings for the edited scope

## 0.9.235 (2026-06-12)
- fix(tabbar): guard undefined global tabBar for pre-existing configs
- feat(tabbar): make tab-bar settings global with per-layout override
- fix(lint): wrap shutter help text in JS string to avoid JSX typographic quotes

## 0.9.234 (2026-06-12)
- fix(lint): auto-fix mixed typographic quotes
- fix(group-action): resolve target checklist labels like the list does
- refactor(auto-list): compact general per-entry settings to match static list
- refactor(static-list): compact general per-entry settings layout
- refactor(static-list): move font size up to general settings (paired with decimals)
- fix(list-widgets): hide switch-only styling for Auto display type too
- feat(list-widgets): hide switch-only entry styling for non-switch display types
- refactor(static-list): move per-entry icon picker up next to label/unit
- feat(list-widgets): support HomeMatic LEVEL position control for shutter entries

## 0.9.233 (2026-06-12)
- style(list-widgets): use template literal in shutter DP scope check
- style(prettier): auto-format code files
- feat(list-widgets): add shutter DP auto-detection to entry controls
- feat(admin-widgets): sort widget type listing alphabetically by label

## 0.9.232 (2026-06-12)
- style(prettier): auto-format code files
- refactor(backup): drop legacy dashboard_backup state and one-time migration

## 0.9.231 (2026-06-12)
- feat(popup): derive {{parent}}/{{name}} placeholders and add optional popup DP override
- chore(deps): ignore Vite major version bumps in Dependabot
- chore(deps): ignore React major version bumps in Dependabot
- chore(deps): bump actions/checkout from 4 to 6 (#222)
- chore(deps): bump actions/deploy-pages from 4 to 5 (#223)
- chore(deps): bump actions/configure-pages from 5 to 6 (#224)
- chore(deps): bump actions/upload-pages-artifact from 3 to 5 (#225)
- chore(deps): bump dependabot/fetch-metadata from 2 to 3 (#262)

## 0.9.230 (2026-06-11)
- feat(admin): add tab bar icon size control

## 0.9.229 (2026-06-11)
- fix(ci): drop broken npm dist-tag fixup; add missing 0.9.228 changelog
- fix(ci): skip npm publish when version already published (E403 guard)

## 0.9.228 (2026-06-11)
Release v0.9.228

## 0.9.227 (2026-06-11)
- chore(deps): bump echarts/postcss, drop orphaned vitest & react-resizable (W0083)

## 0.9.226 (2026-06-11)
- chore(lint): disable prettier/prettier for main.js
- chore(deps): migrate recharts 2.12.7 -> 3.8.1 (W0083)
- chore(deps): drop @types/dompurify, use bundled types (W0083)
- fix(checker): use globalThis.setTimeout in test-socket.mjs (E5005)

## 0.9.225 (2026-06-11)
- chore(deps): migrate react-grid-layout 1.4.4 -> 2.2.3 via /legacy (W0083)
- chore(deps): bump autoprefixer, vitepress, globals, lucide-react, eslint-config (W0083)
- fix(checker): resolve E5004/E5005/E6022 (globalThis timers, CHANGELOG_OLD link)

## 0.9.224 (2026-06-11)
Release v0.9.224

## 0.9.223 (2026-06-11)
- style(prettier): auto-format src-vis and main.js
- style(prettier): format main.js (indent + collapse aligned requires)

## 0.9.222 (2026-06-11)
- fix(checker): resolve adapter-checker warnings (deps, roles, timers, prettier)

## 0.9.221 (2026-06-10)
- fix(lint): auto-fix mixed typographic quotes
- feat(group-action): per-target checklist to exclude DPs
- refactor(editor): hide empty widget-settings card for group widget
- refactor(editor): move group action into its own card outside the widget box
- feat(group-action): selectable action type (switch/dimmer/shutter/momentary)
- feat(lists): add shutter, stepper, value-presets and momentary controls

## 0.9.220 (2026-06-10)
- style: fix prettier formatting in TabBarSection
- feat(admin): tab bar height + font size as px sliders extendable beyond range

## 0.9.219 (2026-06-10)
- feat(admin): make image/file picker root folders (fsRoots) editable in settings

## 0.9.218 (2026-06-10)
- fix(editor): sort 'Weitere Widgets' by displayed label so new widget types auto-order alphabetically

## 0.9.217 (2026-06-10)
- fix(lint): prettier formatting + wrap German quotes in JSX expressions
- feat(widgets): per-column width ratios for custom-grid layout
- feat(widgets): add 'last change' custom-grid cell type (DP-only timestamp)

## 0.9.216 (2026-06-10)
- feat(editor): peek mode to hide edit chrome while holding Ctrl+Alt
- fix(widgets): add visible label to empty group master switch placeholder
- feat(widgets): show group master switch placeholder in editor when empty

## 0.9.215 (2026-06-10)
- @ fix(groups): stop empty group-defs store from clobbering ioBroker on reload

## 0.9.214 (2026-06-10)
- fix(widgets): keep list subscriptions alive under StrictMode
- feat(settings): optimistic writes with instant UI feedback
- fix(widgets): make group master switch confirm writes via getState
- @ fix(widgets): give group master switch instant optimistic feedback
- @ feat(widgets): add group master switch for lists and groups

## 0.9.213 (2026-06-09)
- fix(meta): remove unpublished 0.9.212 from io-package news (E2004)

## 0.9.212 (2026-06-09)
- fix(ci): remove release trigger to prevent E3032 run cancellation

## 0.9.211 (2026-06-09)
- chore(lint): remove obsolete eslint devDeps, fix workflow concurrency

## 0.9.210 (2026-06-09)
- fix(ts): use optional chain for unsubscribe call in CalendarWidget

## 0.9.209 (2026-06-09)
- fix(lint): suppress no-explicit-any in lazyWithReload generic bound


## 0.9.208 (2026-06-09)
- chore: add .eslintcache to .gitignore
- chore(ci): drop Node 20 from test matrix

## 0.9.207 (2026-06-09)
- fix(lint): remove unused eslint-disable directives

## 0.9.206 (2026-06-09)
- fix(lint): apply prettier formatting + fix ESLint config for ESLint 10
- fix(lint): make ESLint work with @iobroker/eslint-config
- fix(ci): fix E3032/E6025/E8917 adapter checker violations
- chore: fix adapter checker E0077/E0078/E302x violations

## 0.9.205 (2026-06-09)
- fix(adapter): migrate stale themeMode role on adapter start
- fix(adapter): fix ioBroker adapter checker role violations

## 0.9.204 (2026-06-09)
- feat(custom-layout): extend last-change to all data-bearing cell types
- feat(custom-layout): add last-change timestamp to data cells

## 0.9.203 (2026-06-09)
- fix(frontend): stabilize idle-return timer via ref — prevent spurious resets
- fix(frontend): guard idleReturnDelay against undefined (NaN setTimeout)
- feat(frontend): idle return — auto-switch to default tab after inactivity

## 0.9.202 (2026-06-09)
- fix(carousel): disable scroll-snap CSS when autoRotate is active

## 0.9.201 (2026-06-09)
- revert(light): remove onValue/offValue + controlMode from LightWidget
- feat(light): add An/Aus-Werte + Schiebeschalter/Icon for switchDp
- fix(custom-grid): move An/Aus-Werte directly below DP field for switch cell
- fix(switch): move An/Aus-Werte directly below DP field in widget options
- feat(dimmer): add custom on/off write values for switchDp
- fix(custom-grid): reorder switch cell settings to match widget panel order

## 0.9.200 (2026-06-09)
- feat(switch): add custom on/off write values (onValue/offValue)

## 0.9.199 (2026-06-09)
- feat(custom-grid): auto-sort cell type options alphabetically per optgroup
- feat(custom-grid): group cell type options with optgroup (widget vs. own DP vs. static)

## 0.9.198 (2026-06-08)
- fix(lazy): auto-reload on stale chunk hashes after deploy

## 0.9.197 (2026-06-08)
- fix(multi-instance): route sendTo messages to running namespace

## 0.9.196 (2026-06-08)
- chore(settings): equal-height row for Admin URL + DP + Decimals
- chore(settings): move Clients+Backup below config row; let them stretch to equal height
- chore(settings): pair Clients+Backup, group Admin URL+DP+Decimals
- fix(settings): cap Clients + Backup list height with internal scroll
- chore(settings): reorder cards — Admin URL + Backup side-by-side above Clients/DP/Decimals
- chore(admin): reorder sidebar nav
- refactor(admin): split Frontend page from Layouts, switch to master-detail

## 0.9.195 (2026-06-08)
- feat(adapter): per-instance state namespace (multi-instance support)

## 0.9.194 (2026-06-08)
- feat(custom-grid): configurable on/off values for switch cell
- feat(dimmer): icon control mode for on/off button
- fix(dimmer): align showToggle default with editor convention

## 0.9.193 (2026-06-08)
- fix(guidelines): make vertical-line label background hug content
- fix(guidelines): offset lines by header/tab-bar height

## 0.9.192 (2026-06-08)
- feat(adapter): allow multiple instances and surface port collisions

## 0.9.191 (2026-06-02)
- fix(backup): include group children and popup views in backups

## 0.9.190 (2026-06-01)
- fix(CarouselWidget): icon flicker, focus auto-scroll, low-speed rotation, more

## 0.9.189 (2026-06-01)
Release v0.9.189

## 0.9.188 (2026-06-01)
Release v0.9.188

## 0.9.187 (2026-06-01)
- feat(CarouselWidget): per-item state, colors, icon sizing + customCSSInEditor toggle

## 0.9.186 (2026-06-01)
Release v0.9.186

## 0.9.185 (2026-06-01)
- feat(CarouselWidget): replace slide-of-widgets carousel with chip-strip carousel

## 0.9.184 (2026-06-01)
- fix(ChartWidget): use var(--text-primary) instead of hardcoded #000000 for unit color default in card layout so dark mode reads correctly

## 0.9.183 (2026-05-31)
- fix(ImportWidgetDialog): default target tab to the active tab instead of the first tab

## 0.9.182 (2026-05-31)
- feat: add aura-last-change CSS class to all last-change render sites for global styling
- feat(TimerWidget): allow icon instead of '+ Add Event' text
- fix(CustomGrid): keep cell selected on re-click

## 0.9.181 (2026-05-31)
- fix(ListWidget,AutoListWidget): keep label visible with wrapText + add labelMinPercent option
- feat(ListWidget,AutoListWidget): wrap text values too, rename wrapLabels → wrapText
- feat(ListWidget,AutoListWidget): add wrapLabels option
- feat(CustomGridView): add per-cell wrap option for long text

## 0.9.180 (2026-05-31)
- fix(ioBroker): getState writes to stateCache (#281 follow-up)

## 0.9.179 (2026-05-31)
- fix(echart): object override on series array merges as per-item defaults

## 0.9.178 (2026-05-31)
- fix(conditions): suppress reflow until all condition DPs are known (#281)

## 0.9.177 (2026-05-31)
- fix(conditions): stop grid<->offscreen bounce on first paint
- feat(conditions): add opt-in debug logging for hidden-widget diagnostics

## 0.9.176 (2026-05-30)
- feat(widgets): add transparency strength slider for transparent mode

## 0.9.175 (2026-05-30)
- fix(shutter): reserve slider space so status badges do not overlap thumb
- feat(shutter): add resize options for value, buttons and slider

## 0.9.174 (2026-05-30)
- fix(camera): honor transparent option in all layouts

## 0.9.173 (2026-05-30)
- fix(popup): register ChipsWidget in widgetMap
- feat(chips): raise chipSize max from 240 to 500 px
- feat(evcc): add showLoadpoints toggle to hide loadpoint cards

## 0.9.172 (2026-05-30)
- feat(echart): per-series custom history range

## 0.9.171 (2026-05-30)
- feat(static-list): allow changing datapoint of an existing entry

## 0.9.170 (2026-05-30)
- fix(weather): retry online fetch every 30s while no data

## 0.9.169 (2026-05-30)
- fix(alarm): hide datapoint-id field in widget edit panel

## 0.9.168 (2026-05-29)
- fix(lint): auto-fix mixed typographic quotes
- feat(alarm): new widget for ioBroker.alarm adapter

## 0.9.167 (2026-05-29)
- feat(evcc): responsive auto-scale + per-section size sliders
- feat(chips): raise chipSize slider max from 96 to 240 px
- feat(chips): replace sm/md/lg dropdown with px slider (16-96)

## 0.9.166 (2026-05-28)
- chore(theme): add verbose [themeMode] init logging to diagnose missing admin DP

## 0.9.165 (2026-05-28)
- fix(theme): always create themeMode admin/frontend DPs even when migration throws

## 0.9.164 (2026-05-28)
- fix(theme): make themeMode.frontend DP override sticky

## 0.9.163 (2026-05-28)
- refactor(theme): split themeMode into separate frontend & admin DPs

## 0.9.162 (2026-05-28)
- refactor(theme): rename config.darkMode to config.themeMode

## 0.9.161 (2026-05-28)
- fix(io-package): drop empty-key state from config.darkMode states map
- fix(theme): frontend now reacts to config.darkMode DP

## 0.9.160 (2026-05-28)
- feat(theme): add aura.0.config.darkMode DP for bidirectional dark/light sync

## 0.9.159 (2026-05-28)
- feat(input-widget): add text alignment option and cap width to maxLength

## 0.9.158 (2026-05-28)
- feat(custom-grid): flash the matching preview cell when an editor cell is clicked

## 0.9.157 (2026-05-28)
- fix(custom-grid): respect alignment for select cells in display-only mode
- feat(custom-grid): clear selected cell with Delete/Backspace key

## 0.9.156 (2026-05-28)
- feat(iconpicker): live Iconify online search beyond curated categories

## 0.9.155 (2026-05-28)
- feat(jsontable): per-column Iconify toggle for inline mdi: tokens

## 0.9.154 (2026-05-28)
- feat(jsontable): rewrite admin image paths via adminBaseUrl + per-column prefix

## 0.9.153 (2026-05-28)
- fix(enum): apply per-entry color to value cell in custom layout

## 0.9.152 (2026-05-28)
- feat(scriptstatus): configurable search scope (name/path/both)

## 0.9.151 (2026-05-28)
- feat(input-widget): add compact layout (title + field + submit in one row)

## 0.9.150 (2026-05-28)
- feat(adapterlogs): table layout (Quelle/Zeitstempel/Typ/Nachricht) + newestFirst option

## 0.9.149 (2026-05-27)
- fix(adapterlogs): add logTransporter flag so requireLog actually forwards logs

## 0.9.148 (2026-05-27)
- fix(adapterlogs): switch to polling + show backend-not-answering hint
- fix(adapterlogs): relay logs through aura backend so anonymous web users receive them

## 0.9.147 (2026-05-27)
- feat(adapterlogs): new widget streaming iobroker logs with filters

## 0.9.146 (2026-05-27)
- feat(scriptstatus): new widget listing javascript scripts with run/stop filter

## 0.9.145 (2026-05-27)
- fix(input-widget): submit button no longer fills full row in default layout

## 0.9.144 (2026-05-26)
- feat(weather/custom): bar sizing options + rainLine combined field
- feat(weather): add adapter data source for offline use
- chore(deps-dev): bump @typescript-eslint/parser from 8.58.2 to 8.60.0 (#229)
- feat(clock): add city, sunrise, sunset, calendar week

## 0.9.143 (2026-05-26)
- feat(clock): add city, sunrise, sunset, calendar week

## 0.9.142 (2026-05-26)
- feat(custom-js): expose getObject, getObjectView, sendTo on window.aura

## 0.9.141 (2026-05-26)
- feat(iframe): sandbox preset dropdown for html/iframe/popup widgets

## 0.9.140 (2026-05-26)
- feat(timer): re-add custom layout + placeable elements

## 0.9.139 (2026-05-26)
- feat(widgets): add input widget + refactor edit dialog to template

## 0.9.138 (2026-05-26)
- chore: rebuild www bundle
- feat(widgets): add aura-widget-* CSS hook classes across all widgets
- fix(echart): make history instance optional in comparison mode

## 0.9.137 (2026-05-26)
- feat(camera): allow stream URL to come from a datapoint

## 0.9.136 (2026-05-26)
Release v0.9.136

## 0.9.135 (2026-05-26)
- feat(brokenDps): pulse-highlight the focused widget in the editor preview
- feat(brokenDps): route deep links to the dashboard editor's tab instead of the widgets list

## 0.9.134 (2026-05-26)
- feat(brokenDps): deep-link group children to their host group widget
- feat(orphans): show channel common.name next to orphan DP IDs

## 0.9.133 (2026-05-25)
- feat(customJs): show import-order hint above editor
- feat(customJs): support @import url() at top of custom JS

## 0.9.132 (2026-05-25)
- feat(brokenDps): deep-link to the broken widget from the overview panel
- fix(brokenDps): skip handlebars placeholders ({{dp}}) in popup widgets

## 0.9.131 (2026-05-25)
- fix(lint): auto-fix mixed typographic quotes
- fix(StaticListConfig): wrap German typographic quotes in JS expression
- feat(orphans): widget->DP reference check across all widgets
- feat(orphans): always-visible panel with timer + list DP detection
- feat(timer): orphan detector in overview with refresh + confirm-cleanup

## 0.9.130 (2026-05-25)
- fix(timer): only rename channel on explicit save, not per keystroke

## 0.9.129 (2026-05-25)
- fix(timer): rename channel/states when title changes in AdminWidgets
- feat(timer): mirror widget title into ioBroker channel + state names

## 0.9.128 (2026-05-25)
- fix(timer): route DP deletion through adapter sendTo (delObject is web-socket-gated)
- debug(timer): log unpublish path + surface delObject errors
- fix(timer): unpublish ioBroker DPs when widget is deleted

## 0.9.127 (2026-05-25)
- perf(chart): cache getObject + drop duplicate fetch in history path

## 0.9.126 (2026-05-25)
- fix(useDatapointList): skip rows with missing value.common
- fix(lists): declare list-count state writable to silence ioBroker read-only warning

## 0.9.125 (2026-05-24)
- fix(useIoBroker): allow '#' in state IDs so Shelly DPs subscribe

## 0.9.124 (2026-05-23)
- feat(admin): add Custom JS feature and 'CSS & JS' menu page

## 0.9.123 (2026-05-23)
Release v0.9.123

## 0.9.122 (2026-05-23)
- style(value): remove bold weight from value text
- fix(value): use text-primary for compact title to match SwitchWidget

## 0.9.121 (2026-05-23)
- fix(timer): keep copied widgets in sync without F5 + register them without adapter restart
- feat(autolist): global toggle to show last-change timestamp per entry

## 0.9.120 (2026-05-23)
- feat(timer): decouple Zeitschaltuhr backend path from widget id

## 0.9.119 (2026-05-23)
- fix(timer): also freshen Timer event ids when cloning groups that contain a Zeitschaltuhr
- fix(timer): regenerate event ids and clone options when duplicating a Zeitschaltuhr widget

## 0.9.118 (2026-05-22)
- feat(timer): remove custom layout option from Zeitschaltuhr

## 0.9.117 (2026-05-22)
- feat(trashSchedule): raise max for bin/font size sliders (HiDPI/touch)

## 0.9.116 (2026-05-22)
- fix(socket): refuse subscribe for invalid ID patterns
- fix(iframe): guard iframeUrlDp against URL strings

## 0.9.115 (2026-05-22)
- fix(value): isolate htmlTemplate textarea from parent re-renders
- fix(value): defer htmlTemplate select() and add Copy button fallback
- feat(value): double-click on htmlTemplate textarea selects all
- fix(value): htmlTemplate as textarea for proper copy/select behavior
- fix(value): htmlTemplate replaces only value block, not whole widget
- feat(clock,value): font-size options for time, date, custom, value

## 0.9.114 (2026-05-22)
- feat(timer): allow per-event value override (admin-gated)

## 0.9.113 (2026-05-22)
- fix(widgets): guard null state in last-change subscribers

## 0.9.112 (2026-05-21)
- feat(chart): option to hide X-axis in simple and advanced chart widgets

## 0.9.111 (2026-05-21)
- feat(static-list): per-DP icon/font size, switch icon style, last-change, hide filter

## 0.9.110 (2026-05-21)
- feat(universal-widget): slider cell can show DP value at left/right/top/bottom

## 0.9.109 (2026-05-21)
- feat(adapter-status): add frontend filter pills (admin-toggleable)
- chore(adapter-status): remove backend-health ping, status row, and debug console output

## 0.9.108 (2026-05-21)
- fix(adapter-status): set common.messagebox=true so sendTo actually reaches aura

## 0.9.107 (2026-05-21)
- fix(adapter-status): better aura detection + retry button + console diagnostics

## 0.9.106 (2026-05-21)
- feat(adapter-status): backend ping + timeout + visible backend health row

## 0.9.105 (2026-05-21)
- feat(adapter-status): backend onMessage handlers for restart + upgrade
- feat(widget): add adapter-status widget (instances list with optional restart/update)

## 0.9.104 (2026-05-21)
- feat(widget-config): raise max input limits for fonts, icons and sizes (HiDPI/10\" touch use case)

## 0.9.103 (2026-05-21)
- docs(custom-layout): add shared doc page for custom grid + cell move/copy
- fix(custom-layout): close cell context menu on outside click via document listener
- feat(custom-layout): ctrl+drag copy, right-click menu and ctrl+c/x/v for cells
- feat(custom-layout): in-app overwrite dialog for cell drag&drop
- feat(custom-layout): drag & drop cells in grid editor with overwrite confirm
- feat(custom-layout): raise grid max from 8x8 to 20x20

## 0.9.102 (2026-05-21)
Release v0.9.102

## 0.9.101 (2026-05-21)
- fix(lint): stabilise hook deps and drop unused catch binding

## 0.9.100 (2026-05-21)
- fix(knob): remove legacy auto/1fr/auto axis sizes so dial stays centered
- fix(custom-grid): use minmax(0, 1fr) so cell contents don't unbalance tracks
- fix(docs): drop unresolved screenshot placeholders for timer page
- fix(lint): wrap typographic quotes in JSX expressions
- Revert "chore: bump version to 99.99.99"

## 0.9.99 (2026-05-20)
- fix(lint): auto-fix mixed typographic quotes
- fix(lint): typographic quote in timer empty-state text
- docs(timer): add Zeitschaltuhr widget reference

## 0.9.98 (2026-05-20)
- fix(timer): read-only in edit mode, frontend save flush, no object warnings
- fix(timer): icon size, hide DP picker, custom layout, hide-able master
- fix(timer): adopt template config panel layout
- fix(timer): non-dismissible backdrop on event modal
- fix(timer): admin-only target DP, layout list, modal theme, DP examples
- feat(timer): Zeitschaltuhr widget with backend scheduler

## 0.9.97 (2026-05-20)
Release v0.9.97

## 0.9.96 (2026-05-20)
- feat(weather): bar-only temp-strahl variant in custom layout

## 0.9.95 (2026-05-20)
- feat(list): toggle row dividers in static and auto list widgets
- feat(static-list): drag-handle to reorder data point entries

## 0.9.94 (2026-05-20)
- fix(custom-grid): prevent descender clipping on free-text cells
- ci: add dependabot auto-merge workflow (S8913)
- fix(ci): match ioBroker.example concurrency pattern exactly (E3009)

## 0.9.93 (2026-05-20)
- chore(repo): adapter-checker compliance (E3008/E3009/W0050)

## 0.9.92 (2026-05-20)
Release v0.9.92

## 0.9.91 (2026-05-20)
Release v0.9.91

## 0.9.90 (2026-05-19)
- feat(universal-widget): hide dropdown option for select cell

## 0.9.89 (2026-05-19)
- fix(layout-drawer): disable both placement buttons when header is on
- fix(layout-drawer): disable 'in tab bar' when header on or auto-hide on
- feat(layout-drawer): customize title and entry display style
- feat(layouts): drag to reorder layouts in admin list
- feat(layout-drawer): add 'in tab bar' placement option
- fix(layout-drawer): allow inline trigger width to fit icon + name

## 0.9.88 (2026-05-19)
- fix(knob): use knob default grid as editor fallback
- feat(knob): empty default custom grid except dial at 2/2
- fix(knob): honour titleAlign in bogen/skala/endless layouts
- feat(custom-grid): allow fontSize as explicit pixel size on component cells
- feat(knob): add custom layout with selectable dial style

## 0.9.87 (2026-05-19)
- fix(knob): auto-compute label decimals to avoid duplicate scale labels

## 0.9.86 (2026-05-19)
- fix(editor): sort widget types alphabetically within each category

## 0.9.85 (2026-05-19)
- feat(knob): add knob widget with 3 layouts (Bogen / Skala / Endlos 3D)

## 0.9.84 (2026-05-19)
- fix(editor): keep widget type when changing DP; ask before auto-switch on new widgets

## 0.9.83 (2026-05-19)
- feat(weather): pre-populate custom grid from standard layout settings

## 0.9.82 (2026-05-18)
- fix(conditions): hidden+reflow widgets inside groups now hide and slide up

## 0.9.81 (2026-05-18)
- fix(icons): allow null fallback in getWidgetIcon
- fix(icons): broken Iconify IDs fall back to widget default; picker filters them
- fix(jsontable): autoHeight effect no longer clobbers option toggles

## 0.9.80 (2026-05-18)
- fix(conditions): hidden+reflow widgets reappear on live DP change

## 0.9.79 (2026-05-17)
- fix(light): autoDetect mixed DPs from different zigbee devices

## 0.9.78 (2026-05-17)
Release v0.9.78

## 0.9.69 (2026-05-17)
- fix(fill): center horizontal battery silhouette in viewBox
- feat(list): configurable alignment + font size for sum line

## 0.9.66 (2026-05-17)
- chore(backup): surface writeBackup errors and server ack in console

## 0.9.64 (2026-05-17)
- feat(list): show sum of numeric values in static/dynamic list

## 0.9.62 (2026-05-17)
- fix(backup): auto-save also writes auto-backup

## 0.9.60 (2026-05-17)
- feat(json-table): add image column type

## 0.9.58 (2026-05-17)
- feat(universal): add 'Auswahlfeld' cell type
- docs(schalter): remove YAML example — aura uses admin UI, not config files

## v0.9.91 (2026-05-20)

Release v0.9.91

## v0.9.90 (2026-05-19)

- feat(universal-widget): hide dropdown option for select cell

## v0.9.89 (2026-05-19)

- fix(layout-drawer): disable both placement buttons when header is on
- fix(layout-drawer): disable 'in tab bar' when header on or auto-hide on
- feat(layout-drawer): customize title and entry display style
- feat(layouts): drag to reorder layouts in admin list
- feat(layout-drawer): add 'in tab bar' placement option
- fix(layout-drawer): allow inline trigger width to fit icon + name

## v0.9.88 (2026-05-19)

- fix(knob): use knob default grid as editor fallback
- feat(knob): empty default custom grid except dial at 2/2
- fix(knob): honour titleAlign in bogen/skala/endless layouts
- feat(custom-grid): allow fontSize as explicit pixel size on component cells
- feat(knob): add custom layout with selectable dial style

## v0.9.87 (2026-05-19)

- fix(knob): auto-compute label decimals to avoid duplicate scale labels

## v0.9.86 (2026-05-19)

- fix(editor): sort widget types alphabetically within each category

## v0.9.85 (2026-05-19)

- feat(knob): add knob widget with 3 layouts (Bogen / Skala / Endlos 3D)

## v0.9.84 (2026-05-19)

- fix(editor): keep widget type when changing DP; ask before auto-switch on new widgets

## v0.9.83 (2026-05-19)

- feat(weather): pre-populate custom grid from standard layout settings

## v0.9.82 (2026-05-18)

- fix(conditions): hidden+reflow widgets inside groups now hide and slide up

## v0.9.81 (2026-05-18)

- fix(icons): allow null fallback in getWidgetIcon
- fix(icons): broken Iconify IDs fall back to widget default; picker filters them
- fix(jsontable): autoHeight effect no longer clobbers option toggles

## v0.9.80 (2026-05-18)

- fix(conditions): hidden+reflow widgets reappear on live DP change

## v0.9.79 (2026-05-17)

- fix(light): autoDetect mixed DPs from different zigbee devices

## v0.9.78 (2026-05-17)

Release v0.9.78

## v0.9.76 (2026-05-17)

- fix(backup): create `aura.0.backups` meta namespace in onReady so the file-based auto-backup write succeeds (previous attempt failed with "aura.0 is not an object of type meta")

## v0.9.74 (2026-05-17)

- fix(backup): store auto-backups as files under `aura.0:backups/` instead of a single state — bypasses the 1 MB socket frame limit that caused saves to be silently dropped on large dashboards
- chore(backup): one-time migration of existing `aura.0.config.dashboard_backup` blob into per-file backups on first save after upgrade

## v0.9.69 (2026-05-17)

- fix(fill): center horizontal battery silhouette in viewBox
- feat(list): configurable alignment + font size for sum line

## v0.9.66 (2026-05-17)

- chore(backup): surface writeBackup errors and server ack in console

## v0.9.65 (2026-05-17)

- chore(backup): log writeBackup events + server ack to browser console for diagnostics

## v0.9.64 (2026-05-17)

- feat(list): show sum of numeric values in static/dynamic list

## v0.9.62 (2026-05-17)

- fix(backup): auto-save also writes auto-backup

## v0.9.61 (2026-05-17)

- fix(backup): auto-save now also writes an auto-backup (previously only manual save did)

## v0.9.60 (2026-05-17)

- feat(json-table): add image column type

## v0.9.58 (2026-05-17)

- feat(universal): add 'Auswahlfeld' cell type
- docs(schalter): remove YAML example — aura uses admin UI, not config files

## v0.9.56 (2026-05-17)

- docs+widgets: move Universal-Widget from Layout to Steuerung & Anzeige
- docs(widgets): list all widget types — Schalter linked, rest 'geplant'
- docs: link documentation in README and admin sidebar
- docs(schalter): balanced style — short prose + tables + one example
- docs(schalter): strip prose, tables-only style
- ci: auto-enable GitHub Pages in docs workflow
- chore: ignore VitePress cache and dist
- docs: add VitePress site with Schalter widget page

## v0.9.55 (2026-05-16)

- fix(universal): confirm popup inherits anchor theme (v0.9.54)
- fix(universal): switch-cell confirm as small popup near the button (v0.9.53)

## v0.9.53 (2026-05-16)

- fix(universal): switch-cell confirm dialog as centered popup (v0.9.52)

## v0.9.51 (2026-05-16)

- fix(list): backendValueFilter is editor-only, decoupled from publish

## v0.9.50 (2026-05-16)

- fix(list): backend filter visible always + count actually updates

## v0.9.49 (2026-05-16)

- refactor(list): replace publishFilter with parallel backend value filter
- feat(list): independent backend-publish filter

## v0.9.47 (2026-05-16)

- feat(list): publish filtered count to ioBroker state

## v0.9.46 (2026-05-16)

- feat(list): full ON/OFF customization (text, text color, bg) global + per DP

## v0.9.45 (2026-05-16)

- feat(list): configurable active color + per-DP/global entry background

## v0.9.43 (2026-05-16)

- fix(light): power button square + size sliders for switch/brightness/CT

## v0.9.41 (2026-05-16)

- fix(dirty): tab/layout switch no longer marks dashboard as unsaved

## v0.9.39 (2026-05-16)

Release v0.9.39

## v0.9.38 (2026-05-16)

- feat(light): adjustable color wheel size + fix egg deformation

## v0.9.37 (2026-05-16)

- feat(light): decouple status from title
- fix(light): remove duplicate icon-size slider in Layout section
- feat(light): color palette size as free slider (12-96 px)
- feat(light): adjustable color palette size + editable widget title

## v0.9.32 (2026-05-15)

- feat(popups): Built-in Views als JSON-Dateien + Import/Export pro View
- feat(frontend): Hamburger LayoutDrawer für Layout-Wechsel (Desktop + Mobile)

## v0.9.31 (2026-05-15)

- fix(light): Schalt-DP fügt Power-Tab in Standard-Layouts hinzu

## v0.9.29 (2026-05-15)

Release v0.9.29

## v0.9.28 (2026-05-15)

- feat(widget-config): Auto-Erkennen Button-Styling vereinheitlicht

## v0.9.26 (2026-05-15)

- refactor(universal): Taster-Modus mit Toggle-Schalter wie Sicherheitsabfrage
- feat(universal): Sicherheitsabfrage für Switch-Cells
- fix(universal): einheitliche Textfarbe für alle statischen Cells (schwarz)

## v0.9.22 (2026-05-15)

Release v0.9.22

## v0.9.21 (2026-05-15)

- fix(editor): DP-Feld im 'Widget manuell hinzufügen' Step 2 ist nicht mehr Pflicht

## v0.9.19 (2026-05-15)

- fix(light): conic-gradient back to 'from 0deg' so red sits at 12 o'clock

## v0.9.18 (2026-05-15)

- fix(light): color wheel knob aligned with palette colors

## v0.9.17 (2026-05-15)

- feat(light): auto-detect DPs from siblings (Hue / HmIP / WLED)

## v0.9.16 (2026-05-15)

- feat(light): decouple status text from title — own toggle + alignment
- fix(light): suppress legacy Name/Stil sections that duplicated Darstellung
- fix(light): add 'light' to Darstellung/Erweitert/Icon-picker allow-lists
- feat(light): rename 'Alle Tabs' to 'Standard'; custom layout uses 3x3 grid
- fix(widgets): register light widget in WidgetFrame's local getWidgetMap
- feat(widgets): add light widget for RGB/CCT/dimmer lights
- feat(custom-grid): add momentary (Taster) mode to switch cells

## v0.9.15 (2026-05-15)

- fix(sync): prevent deleted widgets from reappearing after F5 / cross-browser saves

## v0.9.14 (2026-05-14)

Release v0.9.14

## v0.9.13 (2026-05-14)

Release v0.9.13

## v0.7.47 (2026-05-13)

- fix(editor): show widget settings in mobile view
- fix(admin): mobile layout fixes – Popups stacked + sidebar auto-close

## v0.7.46 (2026-05-13)

- feat(echart): Vergleichsmodus – Balkendiagramm mit aktuellen Werten als Kategorien

## v0.7.45 (2026-05-13)

- feat(picker): Spaltenansicht mit Wert/Einheit/Typ/History + Filter für Einheit und History

## v0.7.44 (2026-05-13)

- feat: Tab-Export und -Import im Dashboard-Editor

## v0.7.43 (2026-05-13)

- feat(climate): Auto-Erkennen für Luftfeuchtigkeit- und Soll-Temperatur-DP

## v0.7.42 (2026-05-13)

- fix(lint): unescaped quotes in ShutterWidget hint text

## v0.7.41 (2026-05-13)

- feat(universal): Bar-Stil für Schieberegler-Zelle (barStyle/barSize/orientation)

## v0.7.40 (2026-05-13)

Release v0.7.40

## v0.7.39 (2026-05-13)

Release v0.7.39

## v0.7.38 (2026-05-12)

- fix(popup): mobile-Breite nutzt Viewport besser (calc(100vw-16px) statt 90vw)

## v0.7.36 (2026-05-12)

- fix(widget): Klick auf Action-Buttons triggert nicht mehr das Popup

## v0.7.34 (2026-05-12)

- feat(slider): readOnly-Modus als Fortschrittsanzeige

## v0.7.33 (2026-05-12)

- feat(universal): Icon-Picker für Custom-Grid-Zellen
- feat(universal): Switch-Zelle mit optionalem Icon-Modus

## v0.7.32 (2026-05-12)

- feat(switch): optional Icon-Modus statt Schiebeschalter

## v0.7.31 (2026-05-12)

- chore(enum): Darstellung-Label umbenennen 'Aktuelles Label' → 'Aktuelle Auswahl'

## v0.7.30 (2026-05-12)

- feat(enum): Standard-Custom-Layout (3×3 CustomGridView)
- revert(enum): Custom-Layout entfernen – nur Universal-Widget hat das erweiterte Custom-Layout
- feat(enum): aktuelles Label additiv anzeigen + Custom-Layout

## v0.7.29 (2026-05-12)

- fix(enum): register EnumWidget in WidgetFrame's local widget-map
- fix(enum): widget.enum i18n key + rebuild bundle
- feat(enum): Auswahlfeld widget – DP-Werte auf Labels mappen + Dropdown-Schreibback

## v0.7.27 (2026-05-12)

- feat(static-list): per-entry displayType override

## v0.7.26 (2026-05-12)

- feat(static-list): zweite Sortierebene als Tiebreaker

## v0.7.25 (2026-05-12)

Release v0.7.25

## v0.7.24 (2026-05-12)

Release v0.7.24

## v0.7.23 (2026-05-12)

- feat: auto-reload frontend when adapter version changes

## v0.7.21 (2026-05-12)

- feat(dimmer): optional switchDp for separate on/off datapoint

## v0.7.20 (2026-05-12)

- feat(evcc): detect heating loadpoints and show 'Heizen' instead of 'Laden'
- feat(evcc): remove 'Karte' and 'Minimal' layouts from selector

## v0.7.19 (2026-05-12)

- feat(popup): three-level auto-close (global > view > click-action)

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

