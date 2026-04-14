# Aura – Development Guidelines for Claude

## Project Overview

**iobroker.aura** is a visualization dashboard adapter for ioBroker built with React 18 + TypeScript + Vite + Tailwind CSS + Zustand. The adapter serves a frontend from `www/` via ioBroker's web adapter.

- Frontend: `src/` (React/TypeScript, built to `www/`)
- Adapter backend: `lib/main.js` (Node.js, ioBroker adapter-core)
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
- Use `getSocket()` from `src/hooks/useIoBroker.ts` for all socket operations
- **Do NOT use `sendTo` with acknowledgement callbacks** — the ioBroker web adapter does not reliably forward them
- Use **state-based relay** for request/response patterns (see `calendar.request` / `calendar.response`)

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

### Steps for every release

1. Bump version in **both** `package.json` AND `io-package.json` (must match)
2. Add entry to `news` in `io-package.json` (EN + DE minimum)
3. Add entry to `## Changelog` in `README.md`
4. `npm run build:adapter`
5. `git add ... && git commit && git push`
6. Create GitHub release:
   - **Beta** (new features, not yet fully tested):
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z --title "vX.Y.Z" --notes "..." --prerelease
     ```
     → GitHub Actions publishes with `npm publish --tag beta`
   - **Stable** (tested, ready for all users):
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z --title "vX.Y.Z" --notes "..."
     ```
     → GitHub Actions publishes with `npm publish` (tag `latest`)
   - **Promote existing pre-release to stable:**
     ```
     "/c/Program Files/GitHub CLI/gh.exe" release edit vX.Y.Z --prerelease=false
     ```

### When to ask about release type

Ask the user "Beta oder Stable Release?" when:
- The change adds new user-facing features
- The change touches adapter backend logic (`lib/main.js`)
- The change could break existing setups
- It's the first release after a series of fixes/features

Don't ask for pure internal fixes (typos, i18n, build config) — those can go stable directly.
