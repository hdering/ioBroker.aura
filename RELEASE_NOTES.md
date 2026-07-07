# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
Clients - store each client's current screen resolution in ioBroker (clients.<id>.info.resolutionWidth / resolutionHeight), updated on connect and on resize
Settings - the frontend resolution display is now its own block, independent of the guidelines (no longer requires guidelines to be active)
Tab bar - fix tabs sticking to the top instead of being vertically centered (regression from the mobile scroll-hint change)
