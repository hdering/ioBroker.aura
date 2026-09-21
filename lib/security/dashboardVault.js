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
const { hashSecret } = require('./authCore');

/**
 * Sentinel the admin editor sends in a section/tab `pin` to mean "keep the PIN
 * that is already set". The editor never receives the plaintext PIN back from the
 * vault (only a scrypt hash is stored), so this is how an unchanged PIN survives a
 * save without the editor knowing it: buildVaultSections reuses the existing
 * salt/hash for these while still taking the (possibly edited) content.
 */
const KEEP_PIN = '__aura_keep__';

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
const TAB_STUB_FIELDS = ['id', 'name', 'slug', 'icon', 'hideLabel', 'hidden', 'disabled', 'pinHideLock'];
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
const SECTION_CONTENT_FIELDS = ['badges', 'badgeAggregate'];

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
                    return t;
                });
                protectedList.push({
                    key,
                    scope: 'section',
                    name: section.name,
                    pin: sPin,
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

    return { publicConfig, protected: protectedList };
}

/** Overwrite every own key of `target` with those of `src` (keeps the reference). */
function replaceInPlace(target, src) {
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, src);
}

/**
 * Build the `sections` map for the vault from a split's `protected` list.
 * `{ [key]: { scope, name, salt, hash, pinRelock, content } }`.
 *
 * A real PIN is hashed fresh (salted scrypt). A KEEP_PIN sentinel reuses the
 * salt/hash of the matching entry in `existingSections` (an edit that left the PIN
 * alone) while taking the new content; a KEEP_PIN with no existing entry to reuse
 * is dropped and its key returned in `unresolved` — the caller must then un-redact
 * that view rather than lose its content.
 */
function buildVaultSections(protectedList, existingSections = {}) {
    const sections = {};
    const unresolved = [];
    for (const p of protectedList) {
        if (p.pin === KEEP_PIN) {
            const prev = existingSections[p.key];
            if (!prev || !prev.salt || !prev.hash) {
                unresolved.push(p.key);
                continue;
            }
            sections[p.key] = {
                scope: p.scope,
                name: p.name,
                salt: prev.salt,
                hash: prev.hash,
                len: prev.len,
                pinRelock: p.pinRelock,
                content: p.content,
            };
            continue;
        }
        const { salt, hash } = hashSecret(p.pin);
        sections[p.key] = {
            scope: p.scope,
            name: p.name,
            salt,
            hash,
            len: String(p.pin).length, // digit count only — drives the keypad, not a secret
            pinRelock: p.pinRelock,
            content: p.content,
        };
    }
    return { sections, unresolved };
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
        if (Array.isArray(c.tabs)) node.tabs = clone(c.tabs);
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

const DEFAULT_VAULT = () => ({ version: 1, serverSecret: null, admin: null, sections: {} });

/**
 * The `security.json` in the adapter's instance data dir (NOT the socket-readable
 * files namespace). Holds the token-signing secret, the admin scrypt hash and the
 * protected section/tab payloads. Written 0600.
 */
class VaultFile {
    constructor(dir) {
        this.file = path.join(dir, 'security.json');
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
    }
}

module.exports = {
    KEEP_PIN,
    SECTION_CONTENT_FIELDS,
    TAB_STUB_FIELDS,
    SECTION_STUB_FIELDS,
    normPin,
    sectionKey,
    tabKey,
    tabStub,
    splitDashboard,
    buildVaultSections,
    unredactView,
    restoreView,
    findByKey,
    stampPinLengths,
    hasPlaintextPin,
    readStateConfig,
    writeStateConfig,
    VaultFile,
    DEFAULT_VAULT,
};
