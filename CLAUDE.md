<!-- dgc-policy-v11 -->
# Dual-Graph Context Policy

This project uses a local dual-graph MCP server for efficient context retrieval.

## MANDATORY: Adaptive graph_continue rule

**Call `graph_continue` ONLY when you do NOT already know the relevant files.**

### Call `graph_continue` when:
- This is the first message of a new task / conversation
- The task shifts to a completely different area of the codebase
- You need files you haven't read yet in this session

### SKIP `graph_continue` when:
- You already identified the relevant files earlier in this conversation
- You are doing follow-up work on files already read (verify, refactor, test, docs, cleanup, commit)
- The task is pure text (writing a commit message, summarising, explaining)

**If skipping, go directly to `graph_read` on the already-known `file::symbol`.**

## When you DO call graph_continue

1. **If `graph_continue` returns `needs_project=true`**: call `graph_scan` with `pwd`. Do NOT ask the user.

2. **If `graph_continue` returns `skip=true`**: fewer than 5 files  - read only specifically named files.

3. **Read `recommended_files`** using `graph_read`.
   - Always use `file::symbol` notation (e.g. `src/auth.ts::handleLogin`)  - never read whole files.
   - `recommended_files` entries that already contain `::` must be passed verbatim.

4. **Obey confidence caps:**
   - `confidence=high` -> Stop. Do NOT grep or explore further.
   - `confidence=medium` -> `fallback_rg` at most `max_supplementary_greps` times, then `graph_read` at most `max_supplementary_files` more symbols. Stop.
   - `confidence=low` -> same as medium. Stop.

## Session State (compact, update after every turn)

Maintain a short JSON block in your working memory. Update it after each turn:

```json
{
  "files_identified": ["path/to/file.py"],
  "symbols_changed": ["module::function"],
  "fix_applied": true,
  "features_added": ["description"],
  "open_issues": ["one-line note"]
}
```

Use this state  - not prose summaries  - to remember what's been done across turns.

## Token Usage

A `token-counter` MCP is available for tracking live token usage.

- Before reading a large file: `count_tokens({text: "<content>"})` to check cost first.
- To show running session cost: `get_session_stats()`
- To log completed task: `log_usage({input_tokens: N, output_tokens: N, description: "task"})`

## Rules

- Do NOT use `rg`, `grep`, or bash file exploration before calling `graph_continue` (when required).
- Do NOT do broad/recursive exploration at any confidence level.
- `max_supplementary_greps` and `max_supplementary_files` are hard caps  - never exceed them.
- Do NOT call `graph_continue` more than once per turn.
- Always use `file::symbol` notation with `graph_read`  - never bare filenames.
- After edits, call `graph_register_edit` with changed files using `file::symbol` notation.

## Context Store

Whenever you make a decision, identify a task, note a next step, fact, or blocker during a conversation, append it to `.dual-graph/context-store.json`.

**Entry format:**
```json
{"type": "decision|task|next|fact|blocker", "content": "one sentence max 15 words", "tags": ["topic"], "files": ["relevant/file.ts"], "date": "YYYY-MM-DD"}
```

**To append:** Read the file -> add the new entry to the array -> Write it back -> call `graph_register_edit` on `.dual-graph/context-store.json`.

**Rules:**
- Only log things worth remembering across sessions (not every minor detail)
- `content` must be under 15 words
- `files` lists the files this decision/task relates to (can be empty)
- Log immediately when the item arises  - not at session end

## MCP-Wissen mitziehen (PFLICHT bei jeder Widget-Änderung)

Das MCP ist die einzige Sicht, die ein Modell auf die Widgets hat. Was dort nicht steht,
existiert für die KI nicht. **Jede Änderung an Widgets, Optionen, Layouts, Themes oder
Rezepten muss im selben Commit im MCP landen** — nicht "später nachziehen".

Vor dem Commit, wenn `src-vis/` angefasst wurde:

1. `npm run ai:sync` — erzeugt `public/ai/aura-widget-schema.json`, `aura-recipes.json`,
   `aura-theme-tokens.json` neu. Ergebnis **mitcommitten** (die Dateien werden ausgeliefert,
   `lib/mcp/httpEndpoint.js` liest sie).
2. `npm run ai:check` läuft als erster Schritt in `npm test` — schlägt der an, ist Schritt 1
   vergessen worden.
3. **Neue Option = neue Beschreibung.** Der Generator liest Typ und Default aus dem Code,
   die Bedeutung nicht:
   - Widget-Optionen → `tools/schema/widget-schema-overlay.mjs`
     (`KEY_DESCRIPTIONS` für einen Schlüssel überall, `WIDGET_OPTION_NOTES` pro Widget).
   - Felder geteilter Typen (`CustomCell`, `FillLimit`, `BadgeDef`, `ConditionClause` …) →
     Kommentar direkt am Feld in `src-vis/types/index.ts` (einzeilig hinter dem Feld,
     bei Objekt-/Array-Feldern als `/** … */` darüber).
   - Kontrolle: `npm run test:schema` nennt die Quote beschriebener Optionen.
4. **Höhe geändert?** (neue Zeile, neues Bedienelement, anderer Innenabstand) → der Typ muss
   neu vermessen werden: `npm run metrics` bzw. `node tools/schema/measure-widget-metrics.mjs
   --only <typ> --write` gegen einen laufenden Dev-Server (eigener Port, Ziel
   `AURA_IOBROKER_URL=http://127.0.0.1:9`, danach Server wieder beenden).
   Hängt die Höhe an einer **Option**, gehört sie in `MIN_MODIFIERS` (Typ ohne Zeilenrechnung,
   z. B. die Skala des Schiebereglers) bzw. in die `modifiers` des gezählten Typs — dann
   rechnet `aura_measure` sie mit, statt sie nur zu erwähnen.
5. Neue Bedienmuster, die ein Modell von allein nicht findet → `lib/mcp/recipes.js`.
   Neue Strukturen/Fähigkeiten (nicht nur Optionen) → Werkzeugbeschreibung in
   `lib/mcp/tools.js` und `docs-internal/ai-mcp-server.md`.

Was das MCP bewusst NICHT kennt: Menü-Elemente (Header/Tab-Leiste/Bereichs-Menü) und deren
Widgets. Kommt das dazu, ist es eine eigene Aufgabe, kein Nebeneffekt.

## Pläne

Implementierungs-, Doku- und Recherche-Pläne als Markdown (deutsch) unter
`C:\projects\tools\plans\<sprechender-name>.md` ablegen — nicht im Projekt-Root, nicht unter
`C:\projects\` direkt und nicht nur im Plan-Mode-Verzeichnis.

## Release Notes (Changelog Highlights)

When the user requests a **user-facing change** (a feature, fix, or visible behavior change), append one short **English** bullet describing it to `RELEASE_NOTES.md` in the project root — in addition to the code commit. `release.ps1` turns these bullets into the ioBroker changelog (admin news + README) at release time and resets the file after the next stable release. If `RELEASE_NOTES.md` holds only `#`-comment lines, the release falls back to filtered feat/fix commit subjects. English only (the release linter rejects German). Skip purely internal changes (refactors, build/CI, dep bumps). Beim Release übersetzt `tools/release/translate-news.mjs` den neuen Eintrag in die zehn weiteren Admin-Sprachen (W1144) — die Bullets selbst bleiben englisch.

**Issue-Referenz:** Nennt der Nutzer zu einer Aufgabe eine GitHub-Issue-Nummer oder einen Issue-Link (auch nur der Link allein, z.B. `https://github.com/hdering/ioBroker.aura/issues/519`), IMMER die ID am Ende des Bullets ergänzen — `... (#519)`. `release.ps1` löst die ID zum Markdown-Link auf (README + GitHub-Release-Notes) und schreibt in die Admin-News nur `(#519)`. Die komplette URL darf auch direkt im Bullet stehen, wird aber vom Release auf `(#519)` normalisiert. Beim Release fragt das Script zusätzlich pro Eintrag nach einem Issue-Link.

## Session End

When the user signals they are done (e.g. "bye", "done", "wrap up", "end session"), proactively update `CONTEXT.md` in the project root with:
- **Current Task**: one sentence on what was being worked on
- **Key Decisions**: bullet list, max 3 items
- **Next Steps**: bullet list, max 3 items

Keep `CONTEXT.md` under 20 lines total. Do NOT summarize the full conversation  - only what's needed to resume next session.
