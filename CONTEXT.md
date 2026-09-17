# Session Context

**Current Task**: Undo/Redo im Admin-Editor nach Plan `C:\projects\plan-undo-redo-editor.md` — Stufe 1+2 fertig und gepusht (bis c2f41b99), jetzt Stufe 3 (Verlauf überlebt F5 via IndexedDB) und Stufe 4 (serverseitige Sicherung fremder config.*-Writes im Adapter).

**Key Decisions**:
- Verlauf = Store-Snapshots über `managedStorage.setItem` (`editHistory.ts`), kein Command-Pattern; externe Keys per `registerHistoryStore` (AdminMessages).
- `WidgetFrame` ist `React.memo` (Gruppen/Panels ausgenommen); `seedMissingPersistedKeys` beim Admin-Mount schließt die „erster Edit ist Init“-Lücke.
- Stufe 4 nur als Safety-Net für ack=false-Writes (fremde Skripte), kein Ersatz der Client-Backups.

**Next Steps**:
- Stufe 3: `editHistoryPersist.ts` (Referenz-Diff/Patch, IDB, Restore nach Boot mit Validierung gegen aktuellen Stand), Tests in `tools/tests/edit-history.mjs` + Reload-UI-Test.
- Stufe 4: `main.js` onStateChange `config.*` mit `!state.ack` → vorherigen Wert als `backup-<ts>.json.gz` + Sidecar in `aura.0.backups`.
- Danach `npm run test:admin-undo-sweep` und `test:group-fit` erneut; RELEASE_NOTES ergänzen; commit + build + push.
