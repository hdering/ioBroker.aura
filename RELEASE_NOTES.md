# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.

- General - verified on Node.js 26; the CI adapter tests now run on Node 22, 24 and 26 (#631)
- Knob - only the dial reacts to touch now: a swipe on the free area next to it scrolls the page instead of turning the knob, and the value no longer skews on widgets that are not square (#630)
- Settings - the admin PIN can be changed again: an expired admin session now says so and sends you to the login page instead of answering "Wrong PIN", and the password manager no longer prefills the new-PIN field (#632)
- Admin login - every refusal now names its reason instead of "Wrong PIN": too many attempts (with the wait), an admin PIN that is already set, or no reachable Aura instance behind the page - which used to offer a first-run setup that could never succeed (#632)
