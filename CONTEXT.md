# Session Context

**Current Task**: Undo/Redo im Admin-Editor (Plan `C:\projects\plan-undo-redo-editor.md`, alle 4 Stufen fertig) plus Nachläufer „ungespeicherte Änderungen erreichen das Frontend“ — zuletzt a36e18c3: Frontend-Tab im selben Browser spiegelt Admin-Edits nicht mehr live (storage-Listener in App.tsx entfernt, Inbound-Vergleich über rememberRemoteRaw statt localStorage).

**Key Decisions**:
- Verlauf = Store-Snapshots über `managedStorage.setItem` (`editHistory.ts`), IndexedDB-Persistenz, kein Command-Pattern; Verwerfen/Restore als Gruppen mit Inhaltsvergleich.
- Frontend ist read-only (`setFrontendReadOnly`, `hydrateFromValue`); gespeicherte Änderungen kommen NUR über den Socket, nie über `storage`-Events; Speicher ist im Frontend kein Maßstab für „schon angezeigt“.
- Kein Auto-Save beim Admin-Reload; Statuschip „aus der letzten Sitzung übernommen“.

**Next Steps**:
- Nutzer-Feedback zum Live-Frontend-Fix abwarten (Testinstanz braucht das neue www-Bundle).
- Offen: group-fit 63 vorbestehende Drifts („3 mixed heights“), Offline-Fails in messages.mjs / pin-editor-ui (brauchen Backend).
- Bei neuen „Frontend zeigt Ungespeichertes“-Meldungen zuerst `npm run test:frontend-same-browser-ui` und `test:frontend-readonly` laufen lassen.
