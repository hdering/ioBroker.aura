# Changelog (older entries)

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

