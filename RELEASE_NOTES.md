# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
# Kind (recommended): start the bullet with 'feat:' or 'fix:' - the release turns it
# into the New feature / Bug fix marker; unmarked entries are asked for (or stay unmarked).
- feat: Charts - range chips and paging bar can each be made bigger (touch size) and moved below the chart (#871)
- fix: Fullscreen - the close button no longer covers the top-right corner of the widget (#871)
- feat: Countdown - announce a text or sound file when the countdown ends, on the device that started it, on all devices or on selected ones (#918)
- feat: New Announcements widget - create, switch and test announcement rules for this device right in the dashboard; Admin - Announcements shows them as "from device" and can take them over (#918)
- fix: Popup views - widgets hidden by a "show on match" condition no longer flash briefly when the popup opens, and the popup opens straight at its final height instead of shrinking into it (#924)
- feat: Timer - an event can announce a text or sound file when it fires, on the device it was saved on or on all devices; a timer may then run without target datapoint (#918)
- fix: Mirror - status symbols (battery, reachability, own symbols) of mirrored Universal, Button, Gauge and similar widgets now show in the mirror too (#927)
- fix: Dimmer, Shutter - after a slider drag that ended off the slider (cancelled touch, keyboard, pointer released elsewhere) the widget no longer sticks to the dragged value and follows status updates again (#935)
- fix: Instance links - with "reachable via web adapter" switched on, the quick links now also offer the backend under `<web-port>/aura/#/admin` (#936)
- fix: Universal widget - the "Fullscreen" switch of a cell's click action now sticks, and the cell popup opens fullscreen; same for a list row's own click action (#937)
- feat: Light - colour temperature and brightness range follow the datapoint's min/max when the Min/Max fields are left empty, so one shared popup fits lamps with different ranges; typed values still override (#923)
- feat: Light - new option "Detect datapoints when shown" finds switch, brightness, colour and colour temperature in the lamp's channel at runtime (alias names ON, DIMMER, TEMPERATURE, RGB, HUE/SAT …), so ONE light widget in a shared list popup fits every lamp - no helper script or popup variants; auto-detect now also recognises single RGB hex datapoints (#925)
- feat: Lists - rows set to "Automatic" open a fitting built-in popup per device type (light, switch, dimmer, shutter, thermostat, window contact, sensor, value), editable under Admin › Popups; a lamp opens the light popup, which finds brightness, colour and colour temperature itself; the "Click on row" tab lists what each row was recognised as and which popup it opens; Admin › Popups › List rows picks another popup per type for all lists, e.g. an edited copy (#925)
- fix: Datapoint roles - colour temperature datapoints are no longer taken for a thermostat, and motion or other sensor datapoints no longer for a switch (#925)
- feat: Popups - new placeholder {{dpunit}} for the unit of the popup's datapoint (#925)
- feat: Dynamic list - new options to hide rows whose device reports itself unreachable (UNREACH, available, online …; the row comes back once the device answers) and alias rows whose target datapoint does not exist (#925)
- fix: Date picker - time/date fields on Chrome for Android are now really sized to their value and show the clock/calendar icon instead of a dropdown arrow; the fix in 0.104.0 did not detect real Android devices (#920)
- feat: Widgets - own padding per widget (top/bottom and left/right) under Edit › Advanced; empty keeps the layout padding, e.g. for slim bars of chips or date fields next to normal tiles (#928)
- feat: Chart (advanced) - one JSON series can now draw several lines: with "Several series from the JSON" every entry of the datapoint (name, data, optional color, line style, axis, type) becomes its own line, so new entries show up without editing the widget; JSON data also accepts [timestamp, value] pairs (#926)
