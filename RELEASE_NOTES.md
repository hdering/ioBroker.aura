# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Switching a widget to the custom layout now asks how to start and can rebuild the previous layout (default, card, compact, minimal, dial) as an editable grid that looks the same — for value, binary sensor, window contact, state image, switch, thermostat, weather, knob, dimmer, shutter, slider, selection, button, HTTP request, text input, clock, time switch, countdown, media player, light, calendar and evcc (#768)
- Thermostat - setpoints written as text (e.g. a time switch exception value "14,5") are shown instead of a fallback 20 °C, and time switch values accept a decimal comma (#769)
- Waste collection - bins now sit at the top of the widget instead of being centered vertically when the widget is taller than its content
- PIN protection - a section or tab can now reuse the PIN of another section or tab instead of a new one; the PIN stays linked, so changing it at the source changes it everywhere
