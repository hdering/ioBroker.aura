# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Load times - add a dedicated backend page (Admin -> Ladezeiten) with live metrics, a per-widget breakdown showing each widget's tab with click-through to the editor, network breakdown metrics (TTFB, transfer, DNS, TCP/TLS) plus a backend ping (RTT) to spot high latency (e.g. over VPN), client names from Settings instead of raw ids, a toggleable chart legend, a refresh spinner, and an info popup on which metrics to watch; the old dashboard widget is superseded and hidden from the picker but keeps working
Popup views - widgets now show their normal card background instead of always appearing transparent; a widget's own transparency setting is still respected
