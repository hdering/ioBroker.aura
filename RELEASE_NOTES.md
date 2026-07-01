# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the device
Status overview - new "Battery inventory" layout groups all battery devices by battery type with a shopping list; battery types are auto-detected per device and shown next to low batteries
Batteries - new admin page listing every battery device with its detected type and coverage stats, a searchable battery database, and per-device manual assignment
Batteries - hide/ignore individual battery devices (false positives) so they no longer appear in the inventory, warnings or stats
Batteries - generic "Akku" type for built-in rechargeables; eufy (eusec) cameras are auto-detected as rechargeable
Batteries - clearer detected-model column (drops cryptic vendor codes) and correct model for devices with channels (e.g. HomeMatic)
