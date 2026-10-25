# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Camera - intercom: an "Answer" button opens a two-way call through go2rtc (webrtc.html), with an optional call datapoint for the doorbell (#836)
- Universal - conditions on a switch cell in button mode now apply bold, italic, font size and text colour to the button caption; button, input and dropdown cells pick up the condition font size too (#842)
- Connected devices - two identical devices (e.g. two Fire tablets of the same model running Fully) no longer share one client ID; the second one moves to its own ID on its next connect (#844)
- 🌟 New feature: Speech output - write a text, a sound file or "volume;text" to speech.say (all devices) or clients.<id>.speech.say and the dashboard speaks or plays it, queued one after another; JSON adds voice, language, rate, interrupt, "only with display on" and a target; per device: muted, volume, playing and lastResult; several tabs of one browser play an announcement once, and one older than 10 minutes (e.g. reaching a tab the browser had put to sleep) is skipped. If the browser blocks sound until a tap, an "Enable sound" button appears and the announcement plays on the next touch (#834)
- SayIt - announcements of a SayIt instance with output type "Browser" now also play on the Aura dashboards, the existing sayit.0.tts.text scripts stay unchanged (#834)
- Messages - new "speak" option reads title and text out on the device that shows the message; Admin → Messages → Defaults can switch it on per severity, e.g. for warnings and errors (#834)
