# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

Mediaplayer - a stop datapoint now works: a stop button appears next to play/pause when one is configured
Mediaplayer - players found by device detection (Alexa, Sonos, Spotify, Kodi) can be edited through AI access again; their next/previous/shuffle/repeat datapoints were declared as switches and every write was refused
AI access - an option a widget no longer reads is a warning instead of an error, so one leftover setting no longer blocks every change to that widget, not even moving it
AI access - new tool aura_compact writes the positions the dashboard already renders, clearing overlaps that only show up in the editor
AI access - a widget position can be changed one value at a time; a height change no longer has to resend x, y and w as well
AI access - a write is read back and says so when it did not stick, instead of reporting success
AI access - height measurement: charts, chips, media players, energy balances and carousels were measured empty and are now measured with content; a chart also reports the height it is readable at instead of the height at which nothing is cut off yet
AI access - height measurement: the compact list layout is counted per row pair and the "+N more" row is part of the number
AI access - height measurement: a row factor is measured per list layout — the per-entry timestamp costs a whole line in the default layout and nothing in "minimal", and one number for all of them was wrong in three of the four
