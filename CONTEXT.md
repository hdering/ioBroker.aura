# Session Context

**Current Task**: Layouts-Admin-Seite als Master-Detail umgebaut (Variante A aus `C:\projects\plan-layouts-redesign.md`) und Menü-Widget um Modus „Übersicht“ erweitert (#669); beides committed und gepusht, www-Bundle neu gebaut.

**Key Decisions**:
- Layouts-Seite: linke Baum-Leiste (geteilte `ScopeRow`) + Layout-/Bereichs-Detail, Auswahl in `?ctx=`, alter Editor-Deep-Link `?expand=` wird umgeschrieben; Tabs im Bereichs-Detail (Standard-Tab, Auge, Suche, Drag).
- Menü-Widget `menuMode: overview` statt neuem Widget-Typ; Suche filtert statt hervorzuheben; Metrics bewusst ohne Messung (Höhe = Zahl der Tabs).
- `tools/screenshots/demo-config.mjs` auf Bereiche migriert (war Vor-v3-Format und ließ den Admin abstürzen).

**Next Steps**:
- Testinstanz (.140) aktualisieren und die neue Layouts-Seite dort einmal durchklicken.
- Feedback von Johannes zu #669 einholen (Screenshot `docs/widgets/assets/menue/mode-overview.png`).
- Bei Layouts-Regressionen: `npm run test:admin-layouts-ui` und `npm run test:menu-overview` gegen einen Dev-Server auf 5199.
