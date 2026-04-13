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

1. Bump version in **both** `package.json` AND `io-package.json` (must match)
2. Add entry to `news` in `io-package.json` (EN + DE minimum)
3. `npm run build:adapter`
4. `git add ... && git commit && git push`
5. `"/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z --title "vX.Y.Z" --notes "..."`

**Note:** npm publish happens automatically via GitHub Actions when a tag is pushed.
