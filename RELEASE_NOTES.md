# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Fill level - a narrow vertical battery now shows the limit value next to the battery instead of hiding it (#819)
- Screensaver - each device reports its idle state in clients.<id>.idle.active after a configurable time without input; a popup trigger on it (with {{clientId}} for every device) opens a screensaver popup that closes on the next touch (#822)
- Popups - new "Fullscreen" option makes a popup cover the whole screen without margin or frame; also available as "fullscreen": true in popup.open (#822)
- Tab bar - a menu element set to "Center" now stands in the middle of the bar even when the tabs are aligned left or right; it used to appear on the right (#820)
- Aura now ships a web app manifest with proper icons, so "Install" / "Add to Home Screen" in Chrome, Edge, Android and iOS creates an app named Aura with its own icon that opens without browser bars (#823)
- Shutter - new control mode "Move DP (up/down)" for actuators with a single up/down object such as KNX (DPT 1.008): one datapoint gets false for up and true for down, the values are configurable; the shutter popup now also uses the up/down datapoints of push-button and move mode
- Timer - astro events (sunrise/sunset) now reliably show their time in the frontend; on a slow connection the location was read before the connection was up, so only the sun symbol appeared until the next reload (#498)
