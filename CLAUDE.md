# Aura – Development Guidelines for Claude

## Project Overview

**iobroker.aura** is a visualization dashboard adapter for ioBroker built with React 18 + TypeScript + Vite + Tailwind CSS + Zustand. The adapter serves a frontend from `www/` via ioBroker's web adapter.

- Frontend: `src-vis/` (React/TypeScript, built to `www/`)
- Adapter backend: `main.js` (Node.js, ioBroker adapter-core)
- Build: `npm run build:adapter` (always use this, not `npm run build`)

## ioBroker Adapter Rules

These rules come from the [ioBroker AI Developer Guide](https://github.com/Jey-Cee/iobroker-ai-developer-guide) and are mandatory:

### Timers & Scheduling
- **NEVER** use native `setTimeout` / `setInterval` in adapter code (`lib/main.js`)
- **ALWAYS** use `this.setTimeout` / `this.setInterval` / `this.clearTimeout` / `this.clearInterval`
- The adapter framework manages these and cleans them up on unload automatically

### Process termination
- **NEVER** use `process.exit()` in adapter code
- **ALWAYS** use `this.terminate()` for fatal errors

### State management
- **ALWAYS** use `setObjectNotExistsAsync` for creating objects (never `setObjectAsync` which overwrites)
- Use `extendObjectAsync` only when intentionally updating an existing object definition
- `ack: true` → confirmed/read value (adapter writing a sensor value)
- `ack: false` → command (user/script wants to change something)
- Subscribe to states with `this.subscribeStates()` and handle in `onStateChange`

### Object hierarchy
- Object tree must follow: `device` → `channel` → `state`
- **Every intermediate node must be explicitly created**
  - e.g. for `calendar.request`: create `calendar` (channel) AND `calendar.request` (state)
- Object IDs must only contain: `A-Za-z0-9._-` — no spaces, no special characters

### State Roles
- Do NOT use generic `role: "state"` everywhere
- Use correct roles from the [State Roles list](https://github.com/ioBroker/ioBroker/blob/master/doc/STATE_ROLES.md):
  - `indicator.connected` for connection status
  - `json` for JSON strings
  - `url` for URL strings
  - `level` for writable numeric values
  - `value` for read-only numeric values
  - `switch` for boolean on/off
  - `button` for trigger states

### Logging
- All log messages must be in **English**
- Use appropriate log levels:
  - `this.log.debug()` for verbose debug info
  - `this.log.info()` for important state changes
  - `this.log.warn()` for recoverable issues
  - `this.log.error()` for errors

### Unload / Cleanup
- `onUnload` must clean up ALL resources: timers, connections, servers
- The current implementation is minimal — extend if new resources are added

### Compact Mode
- Currently set to `compact: false` in io-package.json
- Do not change this without fully testing compact mode

## Frontend Rules

### Socket communication
- Use `getSocket()` from `src-vis/hooks/useIoBroker.ts` for all socket operations
- **Do NOT use `sendTo` with acknowledgement callbacks** — the ioBroker web adapter does not reliably forward them
- Use **state-based relay** for request/response patterns (see `calendar.request` / `calendar.response`)

### Modifying system.adapter objects

The adapter currently calls `setForeignObjectAsync('system.adapter.aura.X', ...)` to update `localLinks` when a custom URL is configured. **This is under review by the ioBroker core team.** Do not expand this pattern until the review result from @Apollon77 is known. If it turns out to be disallowed, the custom URL feature must be implemented differently (e.g. via the web adapter's `pathPrefix` config or a dedicated ioBroker feature).

### Datapoints
- State subscriptions via `useDatapoint(id)` hook
- Direct subscriptions via `subscribeStateDirect(id, callback)` from `useIoBroker.ts`

### Build
- Always build with `npm run build:adapter` (sets `VITE_BASE=/aura/`)
- Never commit without a fresh build — `www/` must be up to date

## Release Process

Releases are staged — never go straight to stable for significant changes.

### Stages

| Stage | How | Who sees it |
|-------|-----|-------------|
| **Local test** | build + copy `www/` to local ioBroker test instance | Developer only |
| **npm / beta** | GitHub Pre-release → npm tag `beta` | ioBroker users with Beta channel enabled |
| **npm / stable** | GitHub Release (non-pre-release) → npm tag `latest` | All ioBroker users |
| **ioBroker beta repo** | PR on `ioBroker/ioBroker.repositories` → `sources-dist.json` | Shown in ioBroker adapter list (beta) |
| **ioBroker stable repo** | PR on `ioBroker/ioBroker.repositories` → `sources-dist-stable.json` | Shown in ioBroker adapter list (stable) |

### io-package.json news rules

- **Max 7 entries** — remove the oldest when adding a new one
- **npm latest must always be present** — never remove the version that npm `latest` points to
- **Only published versions** — never list a version that failed CI and was never published to npm (E2004)
- **Validate before every commit:**
  ```bash
  # 1. JSON valid?
  node -e "JSON.parse(require('fs').readFileSync('io-package.json','utf8')); console.log('OK')"
  # 2. All news versions exist on npm?
  node -e "
    const news = Object.keys(JSON.parse(require('fs').readFileSync('io-package.json','utf8')).common.news);
    const https = require('https');
    https.get('https://registry.npmjs.org/iobroker.aura', res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        const versions = Object.keys(JSON.parse(d).versions);
        news.forEach(v => console.log(v, versions.includes(v) ? 'OK' : 'MISSING ON NPM'));
      });
    });
  "
  ```

### Workflow: Coding vs. Releasing

**After completing a task:** only commit locally — do NOT push and do NOT create a GitHub release.
The user will explicitly say "neues release" (or similar) when a release is wanted.

### Steps when the user requests a release

1. Bump version in **both** `package.json` AND `io-package.json` (must match)
2. Add entry to `news` in `io-package.json` (EN + DE minimum, all 11 languages preferred)
3. Add entry to `## Changelog` in `README.md` — **mandatory, causes E6006 if missing**
   - Format: `### X.Y.Z (YYYY-MM-DD)` followed by bullet points
   - Every version that appears in `io-package.json` news **must** also appear in README.md Changelog
4. Run the news validation checks above
5. `npm run build:adapter`
6. `git add -A && git commit` (if there are uncommitted changes)
7. `git push`
8. Create GitHub release:
   - **Beta** (new features, not yet fully tested):
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z --title "vX.Y.Z" --notes "..." --prerelease
     ```
   - **Stable** (tested, ready for all users):
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z --title "vX.Y.Z" --notes "..."
     ```
   - **Promote existing pre-release to stable:**
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release edit vX.Y.Z --prerelease=false
     ```

### npm tag behaviour (CI workflow)

`ioBroker/testing-action-deploy@v1` always publishes to `latest` regardless of the GitHub prerelease flag. The workflow (`.github/workflows/test-and-release.yml`) contains a fix step that runs after the deploy for prereleases:

1. Tags the new version as `beta` via `npm dist-tag add`
2. Finds the last stable version by querying **GitHub releases** (`isPrerelease: false`) — **not** npm versions, because npm may contain mislabeled betas
3. Restores `latest` to that stable version

**This is fully automatic — no manual `npm dist-tag` needed after a beta release.**

If `latest` is ever wrong (e.g. after a failed CI run), fix manually:
```bash
npm dist-tag add iobroker.aura@X.Y.Z latest   # restore stable
npm dist-tag add iobroker.aura@X.Y.Z beta     # set beta
```
Note: npm 2FA (OTP) is required for manual dist-tag commands.

### When to ask about release type

Ask the user "Beta oder Stable Release?" when:
- The change adds new user-facing features
- The change touches adapter backend logic (`lib/main.js`)
- The change could break existing setups
- It's the first release after a series of fixes/features

Don't ask for pure internal fixes (typos, i18n, build config) — those can go stable directly.
