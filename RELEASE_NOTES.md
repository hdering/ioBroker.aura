# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Status overview - new widget that automatically surfaces low batteries, open windows, lights left on, unreachable/offline devices and smoke/water alarms, with an "all clear" state and click-to-jump to the device
Status overview - low batteries now show their battery type and count (e.g. "2× AA") when known; can be turned off per widget
Status overview - added Card and Minimal layouts, an option to show all found devices (not just those needing attention), and a configurable highlight color for devices in an alert state
Status overview - unreachable detection now ignores the latching STICKY_UNREACH twin (kept the live UNREACH), so reachable devices are no longer wrongly listed as offline
Status overview - broader reachability detection (unreach/reachable/connected/available roles with correct online/offline meaning) plus an optional setting for extra offline datapoints
Batteries - battery-type assignment page (device list, coverage stats, searchable database, per-device assignment) is opened from the status-overview widget's settings instead of a permanent admin menu entry
Batteries - hide/ignore individual battery devices (false positives) so they no longer appear in the inventory, warnings or stats
Batteries - generic "Akku" type for built-in rechargeables; eufy (eusec) cameras are auto-detected as rechargeable
Batteries - clearer detected-model column (drops cryptic vendor codes); correct model for devices with channels, including HomeMatic/HomeMatic IP (reads the device type even when it's on the device object)
Batteries - the battery database shows readable brand names (e.g. Tuya) instead of raw Zigbee vendor codes; unrecognized devices can be reported via a pre-filled GitHub issue that includes model, role and datapoint details
Batteries - optional "show datapoint" toggle in the device list to identify devices by their datapoint id when the name/model isn't enough
Batteries - HomeMatic IP devices exposed by both the HmIP and the classic HM instance (hm-rpc.1 + hm-rpc.2) are no longer listed twice — the copy that resolves a battery type is kept
