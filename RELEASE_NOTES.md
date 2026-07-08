# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Load times - add a dedicated backend page (Admin -> Ladezeiten) that shows the metrics live, so you can watch them from the backend while using the frontend in another tab
Load times - the dashboard widget is superseded by that backend page and is now hidden from the widget picker; existing widgets keep working
Load times - the per-widget breakdown now shows which tab each widget is on, and (on the backend page) rows link straight to that widget in the dashboard editor
Load times - the client filter now shows the client name assigned in Settings instead of the raw client id
Load times - the refresh button now shows a spinner while loading so you get feedback that a refresh is in progress
Load times - add network breakdown metrics (TTFB, transfer, DNS, TCP/TLS) plus a backend ping (RTT) so high latency (e.g. over VPN) is distinguishable from device/render cost
Load times - chart legend entries are now clickable to hide/show individual metrics so you can focus on one value
Load times - add an info popup explaining which metrics to watch (network vs device) to diagnose the cause of slow loads
Popup views - widgets now show their normal card background instead of always appearing transparent; a widget's own transparency setting is still respected
