# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
Image - datapoints holding raw SVG markup are now displayed, e.g. the guest WLAN QR code of fb-checkpresence (#592)
Image - optional background colour behind the picture, keeps transparent SVGs such as QR codes readable on dark themes (#592)
Mediaplayer - device detection now recognises any adapter that follows the ioBroker media roles (yamaha, denon, volumio, ...), including its volume range, mute and input (#593)
Mediaplayer - play/pause button now reads playback states that are a numbered enum, e.g. a Yamaha receiver reporting 0 = Play (#593)
Static and dynamic list - the Switch display now offers the same options as the Switch widget: own write values per state (e.g. 0/255, ON/OFF), a separate status datapoint for devices that split command and feedback, condition-based on/off evaluation and an icon or image instead of the slide toggle (#591)
Dynamic list - the Switch display now also works for string and enum datapoints and gained the switch style, on/off icons, icon size and confirmation prompt the static list already had (#591)
Charts, lists and value display - new "show as negative" option in the value conversion, for figures that are logged as positive but belong below the zero line, such as grid feed-in or battery charging (#594)
Advanced chart - consumption bars (delta aggregation) came out as a row of zeros when a negative display factor was set; the counter is now differenced before the sign is applied (#594)
Advanced chart - the day navigation gained a date field, so a day can be picked directly instead of stepping there one day at a time (#594)
Advanced chart - a bar axis now always includes zero, so bar lengths stay proportional to their values and a series drawn downwards keeps its zero line; pure line charts still fit their own range, and an explicit axis minimum still wins (#594)
Advanced chart - horizontal grid lines were missing when every series was assigned to the right y axis (#594)
