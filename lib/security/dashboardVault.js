'use strict';

/**
 * Splits a dashboard config into a socket-safe *public* copy and the *protected*
 * payloads that may only live in the server-side vault.
 *
 * Why this exists: without ioBroker ACLs every connected socket client can read
 * every state, so a PIN stored in `aura.0.config.dashboard` — and the widgets it
 * was meant to hide — are readable by anyone who can open the dashboard. The
 * adapter therefore strips protected sections/tabs out of that state before any
 * browser sees it and keeps the real content in `security.json` (see VaultFile),
 * handed back only after `/pin/unlock` verified the code server-side.
 *
 * Pure logic (redaction + merge) is fs-free and unit-tested; VaultFile is the thin
 * disk wrapper.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashSecret } = require('./authCore');

/**
 * Sentinel the admin editor sends in a section/tab `pin` to mean "keep the PIN
 * that is already set". The editor never receives the plaintext PIN back from the
 * vault (only a scrypt hash is stored), so this is how an unchanged PIN survives a
 * save without the editor knowing it: buildVaultSections reuses the existing
 * salt/hash for these while still taking the (possibly edited) content.
 */
const KEEP_PIN = '__aura_keep__';

/**
 * Sentinel for a view that takes its PIN from another one (`pinFrom` = that view's
 * vault key) and has no stored hash of its own yet. A stored view that gets linked
 * keeps KEEP_PIN; both resolve through `pinFrom` in buildVaultSections.
 */
const LINK_PIN = '__aura_link__';

/** Same normalisation as src-vis/utils/pinLock.ts — trim, non-string ⇒ "". */
function normPin(raw) {
    return typeof raw === 'string' ? raw.trim() : '';
}
function sectionKey(sectionId) {
    return `section:${sectionId}`;
}
function tabKey(sectionId, tabId) {
    return `tab:${sectionId}:${tabId}`;
}

function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Fields a still-locked tab may expose so the tab bar can draw its button. Its
// widgets and any DP-referencing decoration (conditions/badges) stay in the vault.
// `pinHideLock` is menu decoration, not content: the frontend needs it on the
// redacted stub to know whether the locked entry may show its padlock (#692).
// `pinFrom` only names the view whose PIN this one follows, `pinCode` the named PIN
// it uses — no secret either, and the editor needs both on the stub.
// `pinShowMarkers` opts the view's conditions/badges into the stub (#944).
const TAB_STUB_FIELDS = [
    'id',
    'name',
    'slug',
    'icon',
    'hideLabel',
    'hidden',
    'disabled',
    'pinHideLock',
    'pinShowMarkers',
    'pinFrom',
    'pinCode',
];
const SECTION_STUB_FIELDS = [
    'id',
    'name',
    'slug',
    'icon',
    'hidden',
    'activeTabId',
    'defaultTabId',
    'settings',
    'pinHideLock',
    'pinShowMarkers',
    'pinFrom',
    'pinCode',
];

/**
 * Section fields that are neither menu stub nor tabs: DP-referencing decoration of
 * the menu entry. They must stay OUT of the public stub (a badge counting widgets
 * behind the PIN would leak how many there are) but they must go INTO the vault
 * content — reported from use: a section that had `badgeAggregate.enabled` lost the
 * setting the moment it got a PIN, because the stub dropped it and the content only
 * held `tabs`. Whatever is added to Section later lands here too, hence a list of
 * what to carry rather than a list of what to drop.
 */
const SECTION_CONTENT_FIELDS = ['conditions', 'badges', 'badgeAggregate'];

/**
 * Decoration a locked view may show on its menu / tab-bar entry when the admin
 * switched `pinShowMarkers` on (#944). Off by default: conditions and badges name
 * datapoints, and the stub is socket-readable. `badgeAggregate` never goes out —
 * it counts the widgets behind the PIN, which the stub does not have.
 */
const MARKER_FIELDS = ['conditions', 'badges'];

function pick(obj, fields) {
    const out = {};
    for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
    return out;
}

/** A menu/tab-bar-only stub of a tab: no widgets, no DP-bound decoration. */
function tabStub(tab) {
    const stub = pick(tab, TAB_STUB_FIELDS);
    stub.widgets = [];
    return stub;
}

/** Copy the marker fields of `content` onto `stub`, dropping the ones it lacks. */
function copyMarkers(stub, content) {
    for (const f of MARKER_FIELDS) {
        if (content && content[f] !== undefined) stub[f] = clone(content[f]);
        else delete stub[f];
    }
}

/**
 * Put the markers of every protected view that opted in (`pinShowMarkers`) onto
 * its redacted stub in `publicConfig`, taken from the vault `content` of its
 * `protectedList` entry. A locked section shows only its own menu-entry markers —
 * its tabs are off the tab bar until it is unlocked, so theirs would leak DP ids
 * for nothing. Idempotent — the adapter calls it again after swapping a stub's
 * empty content for the stored one, so the markers always come from the real view.
 */
function exposeMarkers(publicConfig, protectedList) {
    for (const p of protectedList) {
        const found = findByKey(publicConfig, p.key);
        if (found && found.node.pinShowMarkers === true) copyMarkers(found.node, p.content);
    }
}

/**
 * Split `fullConfig` (the authoritative dashboard, plaintext PINs and all).
 * Returns `{ publicConfig, protected }`:
 *   - publicConfig: deep clone with every protected section/tab redacted — the
 *     `pin` gone, `pinProtected: true` set, content emptied. Safe to put in the
 *     socket-readable state.
 *   - protected: `[{ key, scope, name, pin, content }]` for the caller to hash
 *     and store in the vault. `content` is what merge-on-unlock restores.
 *
 * A section PIN wins over the tab PINs inside it (mirrors pendingPinTarget): the
 * whole section is redacted as one payload and its tabs are not emitted a second
 * time.
 */
function splitDashboard(fullConfig) {
    const publicConfig = clone(fullConfig) || {};
    const protectedList = [];
    const layouts = Array.isArray(publicConfig.layouts) ? publicConfig.layouts : [];

    for (const layout of layouts) {
        for (const section of layout.sections || []) {
            const sPin = normPin(section.pin);
            if (sPin) {
                const key = sectionKey(section.id);
                // The section's real content is all of its tabs (widgets included).
                // A section PIN supersedes any per-tab PIN inside it, so those inner
                // PINs are stripped from the stored content — after the one section
                // unlock the tabs open, they are not gated a second time.
                const innerTabs = (section.tabs || []).map((tab) => {
                    const t = clone(tab);
                    delete t.pin;
                    delete t.pinRelock;
                    delete t.pinProtected;
                    delete t.pinFrom;
                    delete t.pinCode;
                    return t;
                });
                protectedList.push({
                    key,
                    scope: 'section',
                    name: section.name,
                    pin: sPin,
                    pinFrom: linkSource(section),
                    pinCode: codeSource(section),
                    pinRelock: section.pinRelock === 'session' ? 'session' : 'leave',
                    // A node that still carries `pinProtected` is a redacted stub
                    // whose real content lives in the vault — the caller must reuse
                    // that content, never overwrite it with the empty stub.
                    fromStub: section.pinProtected === true,
                    content: { tabs: innerTabs, ...pick(section, SECTION_CONTENT_FIELDS) },
                });
                // Redact in place: keep menu + tab-bar stubs, drop everything else.
                const stub = pick(section, SECTION_STUB_FIELDS);
                stub.pinProtected = true;
                if (section.pinRelock === 'session') stub.pinRelock = 'session';
                stub.tabs = (section.tabs || []).map(tabStub);
                replaceInPlace(section, stub);
                continue; // tab PINs inside a locked section are subsumed
            }

            for (const tab of section.tabs || []) {
                const tPin = normPin(tab.pin);
                if (!tPin) continue;
                const key = tabKey(section.id, tab.id);
                protectedList.push({
                    key,
                    scope: 'tab',
                    name: tab.name,
                    pin: tPin,
                    pinFrom: linkSource(tab),
                    pinCode: codeSource(tab),
                    pinRelock: tab.pinRelock === 'session' ? 'session' : 'leave',
                    fromStub: tab.pinProtected === true,
                    content: {
                        widgets: clone(tab.widgets) || [],
                        conditions: clone(tab.conditions),
                        badges: clone(tab.badges),
                        badgeAggregate: clone(tab.badgeAggregate),
                    },
                });
                const stub = pick(tab, TAB_STUB_FIELDS);
                stub.pinProtected = true;
                if (tab.pinRelock === 'session') stub.pinRelock = 'session';
                stub.widgets = [];
                replaceInPlace(tab, stub);
            }
        }
    }

    exposeMarkers(publicConfig, protectedList);
    return { publicConfig, protected: protectedList };
}

/** `pinFrom` of a node, but only while its PIN is a sentinel — a typed PIN wins over the link. */
function linkSource(node) {
    const pin = normPin(node.pin);
    return (pin === KEEP_PIN || pin === LINK_PIN) && typeof node.pinFrom === 'string' && node.pinFrom
        ? node.pinFrom
        : undefined;
}

/** `pinCode` of a node, but only while its PIN is a sentinel — a typed PIN wins over the named one. */
function codeSource(node) {
    const pin = normPin(node.pin);
    return (pin === KEEP_PIN || pin === LINK_PIN) && typeof node.pinCode === 'string' && node.pinCode
        ? node.pinCode
        : undefined;
}

/** Overwrite every own key of `target` with those of `src` (keeps the reference). */
function replaceInPlace(target, src) {
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, src);
}

/**
 * Build the `sections` map for the vault from a split's `protected` list.
 * `{ [key]: { scope, name, salt, hash, len, code, pinRelock, content } }`.
 *
 * A view that names a PIN (`pinCode`, see `codes`) takes that PIN's salt/hash and
 * remembers the code, so changing the named PIN later reaches every view using it.
 * A named PIN that no longer exists keeps the view's own last PIN.
 *
 * A real PIN is hashed fresh (salted scrypt). A KEEP_PIN sentinel reuses the
 * salt/hash of the matching entry in `existingSections` (an edit that left the PIN
 * alone) while taking the new content; a KEEP_PIN with no existing entry to reuse
 * is dropped and its key returned in `unresolved` — the caller must then un-redact
 * that view rather than lose its content.
 *
 * A linked view (`pinFrom`) takes the salt/hash of its source — freshly hashed in
 * this same save when the source PIN was just changed, otherwise the source's stored
 * one. Links may chain; they are resolved once their source is. A link whose source
 * is gone, unprotected or part of a cycle keeps the view's own last PIN.
 */
function buildVaultSections(protectedList, existingSections = {}, codes = {}) {
    const sections = {};
    const unresolved = [];
    const entry = (p, from, code) => ({
        scope: p.scope,
        name: p.name,
        salt: from.salt,
        hash: from.hash,
        len: from.len,
        ...(code ? { code } : {}),
        pinRelock: p.pinRelock,
        content: p.content,
        ...(p.pinFrom && !code ? { pinFrom: p.pinFrom } : {}),
        // The MCP release (lib/mcp/protectedView.js) belongs to the view, not to the
        // save: every editor save rebuilds the entries, and leaving it out here
        // switched „Über MCP bearbeitbar“ off again on each save — reported from use.
        ...(existingSections[p.key] && existingSections[p.key].mcpWrite === true ? { mcpWrite: true } : {}),
    });
    const linked = [];
    for (const p of protectedList) {
        if (p.pinCode) {
            const c = codes[p.pinCode];
            if (c && c.salt && c.hash) {
                sections[p.key] = entry(p, c, p.pinCode);
                continue;
            }
            // The named PIN is gone — fall back to what this view had last.
            const prev = existingSections[p.key];
            if (prev && prev.salt && prev.hash) sections[p.key] = entry(p, prev);
            else unresolved.push(p.key);
            continue;
        }
        if (p.pinFrom) {
            linked.push(p);
            continue;
        }
        if (p.pin === KEEP_PIN || p.pin === LINK_PIN) {
            const prev = existingSections[p.key];
            if (!prev || !prev.salt || !prev.hash) {
                unresolved.push(p.key);
                continue;
            }
            sections[p.key] = entry(p, prev, prev.code);
            continue;
        }
        const { salt, hash } = hashSecret(p.pin);
        // digit count only — drives the keypad, not a secret
        sections[p.key] = entry(p, { salt, hash, len: String(p.pin).length });
    }

    // Without a source to follow, a link keeps the view's own last PIN.
    const keepOwn = (p) => {
        const prev = existingSections[p.key];
        if (prev && prev.salt && prev.hash) {
            sections[p.key] = entry(p, prev, prev.code);
        } else {
            unresolved.push(p.key);
        }
    };
    let pending = linked;
    while (pending.length) {
        const waiting = new Set(pending.map((p) => p.key));
        const next = [];
        for (const p of pending) {
            if (waiting.has(p.pinFrom)) {
                next.push(p); // the source is a link itself — resolve it first
                continue;
            }
            const src = sections[p.pinFrom] || existingSections[p.pinFrom];
            if (src && src.salt && src.hash) {
                sections[p.key] = entry(p, src, src.code);
            } else {
                keepOwn(p);
            }
        }
        if (next.length === pending.length) {
            break; // only a cycle is left
        }
        pending = next;
    }
    pending.forEach(keepOwn);
    return { sections, unresolved };
}

/**
 * Carry over the vault entries of views that arrived as redacted stubs.
 *
 * splitDashboard only emits views that carry a `pin` (typed or sentinel). A view
 * the saving client holds as a bare stub (`pinProtected`, no `pin`) — the editor
 * did not merge it, or the state changed under it (MCP) — is still protected, but
 * the rebuilt map had no entry for it: the next `/pin/unlock` found nothing and
 * answered „PIN falsch“ until the PIN was removed and set again. Reported from use.
 * An entry whose view is gone from the config is still dropped.
 *
 * Mutates `sections`; returns the keys it kept.
 */
function keepStubEntries(publicConfig, sections, existingSections = {}) {
    const kept = [];
    for (const [key, prev] of Object.entries(existingSections || {})) {
        if (sections[key] || !prev) {
            continue;
        }
        const found = findByKey(publicConfig, key);
        if (found && found.node.pinProtected === true) {
            sections[key] = prev;
            kept.push(key);
        }
    }
    return kept;
}

/**
 * Marker the editor puts on a tab of a protected section that it knows only as a
 * stub (src-vis/utils/protectedCarryOver.ts, VAULT_KEEP_TAB): another writer (the
 * MCP) added it, and its content is in the vault, not in the editor.
 */
const VAULT_KEEP_TAB = '_vaultKeep';

/** Tab fields the saved stub decides even for a marked tab (a rename in the editor). */
const TAB_DISPLAY_FIELDS = ['name', 'slug', 'icon', 'hideLabel', 'hidden', 'disabled'];

/**
 * Fill the marked tabs of a section payload from the vault entry it replaces.
 *
 * Without this, an editor save took its own tab list as the whole content and a tab
 * created by the MCP meanwhile was gone from the vault. A marked tab takes the
 * vault's copy (display fields from the save, widgets from the save only when the
 * editor gave it some); with no vault copy it stays the empty tab it is. The marker
 * never reaches the vault. Mutates `content`; returns the number of tabs filled.
 */
function fillVaultKeptTabs(content, prevContent) {
    const tabs = content && Array.isArray(content.tabs) ? content.tabs : [];
    const stored = prevContent && Array.isArray(prevContent.tabs) ? prevContent.tabs : [];
    let filled = 0;
    content.tabs = tabs.map((tab) => {
        if (!tab || !tab[VAULT_KEEP_TAB]) {
            return tab;
        }
        const out = { ...tab };
        delete out[VAULT_KEEP_TAB];
        const prev = stored.find((t) => t && t.id === tab.id);
        if (!prev) {
            return out;
        }
        filled++;
        const next = clone(prev);
        for (const f of TAB_DISPLAY_FIELDS) {
            if (out[f] !== undefined) {
                next[f] = out[f];
            }
        }
        if (Array.isArray(out.widgets) && out.widgets.length) {
            next.widgets = out.widgets;
        }
        return next;
    });
    return filled;
}

/** The section/tab a vault key points at: `{ kind, node }`, or null. */
function findByKey(config, key) {
    const layouts = Array.isArray(config && config.layouts) ? config.layouts : [];
    for (const layout of layouts)
        for (const section of layout.sections || []) {
            if (key === sectionKey(section.id)) return { kind: 'section', node: section };
            for (const tab of section.tabs || [])
                if (key === tabKey(section.id, tab.id)) return { kind: 'tab', node: tab };
        }
    return null;
}

/** Tab fields that live in the vault payload rather than in the public stub. */
const TAB_CONTENT_FIELDS = ['conditions', 'badges', 'badgeAggregate'];

/**
 * Merge a vault payload back into the redacted node it belongs to and drop every
 * protection marker — „PIN entfernen“ in the editor.
 *
 * The mirror image of splitDashboard for one view, and the reason removing a PIN
 * needs no save: the adapter is the only place that holds both halves (the stub
 * in `config.dashboard`, the content in the vault), so it can put them back
 * together itself. The editor therefore does not need to have loaded the
 * protected content first, and nothing is lost if it never saves again.
 *
 * Returns `true` when a node was restored, `false` when the config has no node
 * for that key any more (a deleted tab whose vault entry outlived it).
 */
function restoreView(publicConfig, key, content) {
    const found = findByKey(publicConfig, key);
    if (!found) return false;
    const node = found.node;
    const c = content || {};
    const carried = found.kind === 'section' ? SECTION_CONTENT_FIELDS : TAB_CONTENT_FIELDS;
    if (found.kind === 'section') {
        if (Array.isArray(c.tabs)) {
            // Keep a tab that only the stub has (created next to the vault): it is
            // in the tab bar, so removing the PIN must not be what deletes it.
            const known = new Set(c.tabs.map((t) => t && t.id));
            const stubOnly = (node.tabs || []).filter((t) => t && !known.has(t.id));
            node.tabs = [...clone(c.tabs), ...stubOnly];
        }
    } else {
        node.widgets = clone(c.widgets) || [];
    }
    // Decoration is vault content too: whatever the payload does not carry was
    // not set when the view was locked, so it must go rather than linger.
    for (const f of carried) {
        if (c[f] !== undefined) node[f] = clone(c[f]);
        else delete node[f];
    }
    delete node.pin;
    delete node.pinProtected;
    delete node.pinLength;
    delete node.pinRelock;
    delete node.pinHideLock;
    delete node.pinShowMarkers;
    delete node.pinFrom;
    delete node.pinCode;
    return true;
}

/**
 * Copy the un-redacted node identified by `key` from `sourceConfig` back into
 * `publicConfig`, clearing its PIN. The fallback used when a KEEP sentinel cannot
 * be resolved (no stored hash), so a view's content is never lost — it simply
 * falls open instead of vanishing. Returns `true` when a node was restored.
 */
function unredactView(publicConfig, sourceConfig, key) {
    const src = findByKey(sourceConfig, key);
    const dst = findByKey(publicConfig, key);
    if (!src || !dst) return false;
    replaceInPlace(dst.node, clone(src.node));
    delete dst.node.pin;
    delete dst.node.pinProtected;
    delete dst.node.pinFrom;
    delete dst.node.pinCode;
    return true;
}

/**
 * Stamp each redacted stub in `publicConfig` with the digit count of its PIN
 * (`pinLength`, taken from the vault `sections`), so the client keypad can show
 * the right number of dots and auto-submit without ever seeing the PIN itself.
 */
function stampPinLengths(publicConfig, sections) {
    const layouts = Array.isArray(publicConfig && publicConfig.layouts) ? publicConfig.layouts : [];
    for (const layout of layouts)
        for (const section of layout.sections || []) {
            const sSec = sections[sectionKey(section.id)];
            if (sSec && section.pinProtected) section.pinLength = sSec.len || undefined;
            for (const tab of section.tabs || []) {
                const sTab = sections[tabKey(section.id, tab.id)];
                if (sTab && tab.pinProtected) tab.pinLength = sTab.len || undefined;
            }
        }
}

// ── named PINs ─────────────────────────────────────────────────────────────────

function newCodeId() {
    return `pc_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Give every protected view a named PIN (`code`). Views that share salt+hash share
 * the PIN — that is what a `pinFrom` link left behind, so old link chains become one
 * named PIN each. A view with a fresh own hash (typed PIN, old editor) gets a PIN of
 * its own, named after the view. Independently typed identical codes stay apart:
 * salted hashes cannot be compared. Mutates `data`; returns true on change.
 */
function assignCodes(data) {
    if (!data.codes || typeof data.codes !== 'object') data.codes = {};
    const codes = data.codes;
    const sections = data.sections || {};
    const byHash = new Map();
    for (const [id, c] of Object.entries(codes)) if (c && c.hash) byHash.set(`${c.salt}:${c.hash}`, id);
    let changed = false;
    // Link sources first, so a group is named after the view the others followed.
    const keys = Object.keys(sections).sort((a, b) => Number(!!sections[a].pinFrom) - Number(!!sections[b].pinFrom));
    for (const key of keys) {
        const s = sections[key];
        if (!s || !s.salt || !s.hash) continue;
        const own = s.code && codes[s.code];
        if (own && own.salt === s.salt && own.hash === s.hash) {
            if (s.pinFrom) {
                delete s.pinFrom;
                changed = true;
            }
            continue;
        }
        const hk = `${s.salt}:${s.hash}`;
        let id = byHash.get(hk);
        if (!id) {
            id = newCodeId();
            codes[id] = { name: s.name || key, salt: s.salt, hash: s.hash, len: s.len };
            byHash.set(hk, id);
        }
        s.code = id;
        delete s.pinFrom;
        changed = true;
    }
    return changed;
}

/**
 * Write the named PIN of each vault entry onto its redacted stub (`pinCode`) and
 * drop the old `pinFrom` link there. Returns true when the config changed.
 */
function stampPinCodes(publicConfig, sections) {
    let changed = false;
    const stamp = (node, key) => {
        if (!node.pinProtected) return;
        const s = sections[key];
        const code = s && s.code;
        if (code && node.pinCode !== code) {
            node.pinCode = code;
            changed = true;
        }
        if (node.pinFrom !== undefined) {
            delete node.pinFrom;
            changed = true;
        }
    };
    const layouts = Array.isArray(publicConfig && publicConfig.layouts) ? publicConfig.layouts : [];
    for (const layout of layouts)
        for (const section of layout.sections || []) {
            stamp(section, sectionKey(section.id));
            for (const tab of section.tabs || []) stamp(tab, tabKey(section.id, tab.id));
        }
    return changed;
}

/**
 * Create, rename or re-key a named PIN. `pin` (optional on an existing one) sets a
 * new code and carries it into every view that uses this PIN — the point of naming
 * them. Returns `{ id }` or `{ error }`.
 */
function saveCode(data, { id, name, pin }) {
    if (!data.codes || typeof data.codes !== 'object') data.codes = {};
    const label = typeof name === 'string' ? name.trim() : '';
    const code = normPin(pin);
    const existing = id ? data.codes[id] : null;
    if (id && !existing) return { error: 'unknown code' };
    if (!existing && !code) return { error: 'pin required' };
    if (code && code.length < 4) return { error: 'pin too short' };
    const cid = existing ? id : newCodeId();
    const next = existing ? { ...existing } : {};
    if (label || !existing) next.name = label || cid;
    if (code) {
        const { salt, hash } = hashSecret(code);
        next.salt = salt;
        next.hash = hash;
        next.len = code.length;
        for (const s of Object.values(data.sections || {})) {
            if (s && s.code === cid) {
                s.salt = salt;
                s.hash = hash;
                s.len = code.length;
            }
        }
    }
    data.codes[cid] = next;
    return { id: cid };
}

/** Views (vault keys) that use the named PIN `id`. */
function codeUsers(data, id) {
    return Object.entries(data.sections || {})
        .filter(([, s]) => s && s.code === id)
        .map(([key]) => key);
}

/**
 * The `aura.0.config.dashboard` state does not hold the bare config — zustand's
 * persist middleware wraps the store as `{ state: {...}, version }`, and that is
 * exactly what gets synced to the ioBroker state. Unwrap to the inner config
 * (with `.layouts`) that the split logic works on; `wrapped` records the shape so
 * the redacted copy can be re-wrapped the same way.
 */
function readStateConfig(parsed) {
    if (parsed && parsed.state && Array.isArray(parsed.state.layouts)) return { config: parsed.state, wrapped: true };
    return { config: parsed || {}, wrapped: false };
}

/** Put a redacted inner config back into the shape the state expects. */
function writeStateConfig(parsed, publicConfig, wrapped) {
    return wrapped ? { ...parsed, state: publicConfig } : publicConfig;
}

/** `true` when the config still carries a plaintext PIN (⇒ needs splitting). */
function hasPlaintextPin(config) {
    const layouts = Array.isArray(config && config.layouts) ? config.layouts : [];
    for (const layout of layouts)
        for (const section of layout.sections || []) {
            if (normPin(section.pin)) return true;
            for (const tab of section.tabs || []) if (normPin(tab.pin)) return true;
        }
    return false;
}

// ── on-disk vault ──────────────────────────────────────────────────────────────

const DEFAULT_VAULT = () => ({ version: 1, serverSecret: null, admin: null, sections: {}, codes: {} });

/**
 * The `security.json` in the adapter's instance data dir (NOT the socket-readable
 * files namespace). Holds the token-signing secret, the admin scrypt hash and the
 * protected section/tab payloads. Written 0600.
 */
class VaultFile {
    /**
     * @param {string} dir
     * @param {{onSave?: () => void}} [opts] onSave runs after every write — the
     *   adapter bumps info.vaultRevision so unlocked frontends re-read their view.
     */
    constructor(dir, opts = {}) {
        this.file = path.join(dir, 'security.json');
        this.onSave = typeof opts.onSave === 'function' ? opts.onSave : null;
    }

    load() {
        try {
            const raw = fs.readFileSync(this.file, 'utf8');
            const data = JSON.parse(raw);
            return { ...DEFAULT_VAULT(), ...data };
        } catch {
            return DEFAULT_VAULT();
        }
    }

    save(data) {
        const dir = path.dirname(this.file);
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch {
            /* dir exists */
        }
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 0), { mode: 0o600 });
        fs.renameSync(tmp, this.file);
        try {
            fs.chmodSync(this.file, 0o600);
        } catch {
            /* best effort on platforms without POSIX modes */
        }
        if (this.onSave) {
            try {
                this.onSave();
            } catch {
                /* a notification must never fail the write */
            }
        }
    }
}

module.exports = {
    KEEP_PIN,
    LINK_PIN,
    SECTION_CONTENT_FIELDS,
    TAB_STUB_FIELDS,
    SECTION_STUB_FIELDS,
    normPin,
    sectionKey,
    tabKey,
    tabStub,
    splitDashboard,
    exposeMarkers,
    buildVaultSections,
    keepStubEntries,
    fillVaultKeptTabs,
    VAULT_KEEP_TAB,
    unredactView,
    restoreView,
    findByKey,
    stampPinLengths,
    assignCodes,
    stampPinCodes,
    saveCode,
    codeUsers,
    hasPlaintextPin,
    readStateConfig,
    writeStateConfig,
    VaultFile,
    DEFAULT_VAULT,
};
