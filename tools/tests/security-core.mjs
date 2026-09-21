#!/usr/bin/env node
/**
 * Unit tests for the server-side PIN / admin security core (lib/security/*).
 *
 *   npm run test:security-core
 *
 * No adapter, no dev server: the modules are pure Node (node:crypto + fs), so a
 * createRequire pulls them in and the test drives them directly. Covers the
 * scrypt hash/verify, the HMAC token round-trip (incl. forgery + expiry) and the
 * dashboard split that keeps protected content out of the socket-readable state.
 */

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const auth = require('../../lib/security/authCore.js');
const vault = require('../../lib/security/dashboardVault.js');

let pass = 0;
const ok = (cond, msg) => {
    assert.ok(cond, msg);
    pass++;
};

// ── scrypt hash / verify ────────────────────────────────────────────────────
{
    const { salt, hash } = auth.hashSecret('1234');
    ok(salt && hash && hash.length === 128, 'hashSecret returns 64-byte hex hash + salt');
    ok(auth.verifySecret('1234', salt, hash), 'correct secret verifies');
    ok(!auth.verifySecret('1235', salt, hash), 'wrong secret rejected');
    // Flip the last nibble to something it is not — appending a fixed '0' left the
    // hash unchanged (and the check passing) for every 16th run.
    ok(
        !auth.verifySecret('1234', salt, hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0')),
        'tampered hash rejected',
    );
    ok(!auth.verifySecret('1234', '', ''), 'missing salt/hash rejected, no throw');

    const a = auth.hashSecret('1234');
    const b = auth.hashSecret('1234');
    ok(a.salt !== b.salt && a.hash !== b.hash, 'same PIN, different salt ⇒ different hash');
}

// ── timing-safe compare ─────────────────────────────────────────────────────
{
    ok(auth.timingSafeEqualStr('abc', 'abc'), 'equal strings compare equal');
    ok(!auth.timingSafeEqualStr('abc', 'abd'), 'different strings differ');
    ok(!auth.timingSafeEqualStr('abc', 'abcd'), 'different lengths differ, no throw');
    ok(!auth.timingSafeEqualStr('', 'x') && auth.timingSafeEqualStr('', ''), 'empty handled');
}

// ── HMAC tokens ─────────────────────────────────────────────────────────────
{
    const secret = auth.generateServerSecret();
    ok(secret && secret.length === 64, 'server secret is 32-byte hex');

    const tok = auth.signToken({ role: 'admin' }, secret, 60_000);
    const body = auth.verifyToken(tok, secret);
    ok(body && body.role === 'admin', 'valid token verifies + carries payload');
    ok(typeof body.exp === 'number' && body.exp > Date.now(), 'token has future exp');

    ok(auth.verifyToken(tok, 'wrong-secret') === null, 'wrong signing secret rejected');
    ok(auth.verifyToken(tok.slice(0, -2) + 'xy', secret) === null, 'tampered signature rejected');
    ok(auth.verifyToken('garbage', secret) === null, 'garbage token rejected');
    ok(auth.verifyToken('', secret) === null, 'empty token rejected');

    const expired = auth.signToken({ role: 'admin' }, secret, -1);
    ok(auth.verifyToken(expired, secret) === null, 'expired token rejected');

    // A token signed for one key must not verify under another (key isolation).
    const unlock = auth.signToken({ key: 'section:s1' }, secret, 60_000);
    ok(auth.verifyToken(unlock, secret).key === 'section:s1', 'unlock token carries its key');
}

// ── dashboard split (redaction) ─────────────────────────────────────────────
const fullConfig = () => ({
    layouts: [
        {
            id: 'l1',
            slug: 'default',
            sections: [
                {
                    id: 'sFree',
                    name: 'Free',
                    slug: 'free',
                    tabs: [{ id: 't1', name: 'Tab1', slug: 'tab1', widgets: [{ id: 'w0', type: 'x' }] }],
                },
                {
                    id: 'sLocked',
                    name: 'Musik',
                    slug: 'musik',
                    pin: '1234',
                    pinRelock: 'session',
                    // Menu decoration on the section itself — neither stub nor tab,
                    // and the reason it used to disappear the moment a PIN was set.
                    badgeAggregate: { enabled: true },
                    badges: [{ id: 'b1', dp: 'some.dp' }],
                    tabs: [
                        { id: 'tA', name: 'A', slug: 'a', widgets: [{ id: 'wSecret', type: 'gauge' }] },
                        { id: 'tB', name: 'B', slug: 'b', widgets: [{ id: 'wSecret2', type: 'chart' }] },
                    ],
                },
                {
                    id: 'sTabLock',
                    name: 'Mixed',
                    slug: 'mixed',
                    tabs: [
                        { id: 'tOpen', name: 'Open', slug: 'open', widgets: [{ id: 'wOpen', type: 'x' }] },
                        {
                            id: 'tPin',
                            name: 'Secret',
                            slug: 'secret',
                            pin: '9999',
                            pinHideLock: true,
                            widgets: [{ id: 'wHidden', type: 'camera' }],
                            conditions: [{ dp: 'some.dp' }],
                        },
                    ],
                },
            ],
        },
    ],
});

{
    const { publicConfig, protected: prot } = vault.splitDashboard(fullConfig());
    const s = publicConfig.layouts[0].sections;

    // Free section untouched.
    ok(s[0].tabs[0].widgets.length === 1, 'unprotected section keeps its widgets');

    // Locked section redacted: no pin, marker set, tab widgets emptied but names kept.
    const locked = s[1];
    ok(locked.pin === undefined, 'section pin stripped from public config');
    ok(locked.pinProtected === true, 'section marked pinProtected');
    ok(locked.pinRelock === 'session', 'section relock mode preserved in stub');
    ok(locked.tabs.length === 2 && locked.tabs.every((t) => t.widgets.length === 0), 'section tab widgets emptied');
    ok(locked.tabs[0].name === 'A', 'section tab names preserved for the tab bar');

    // Tab-level lock redacted, sibling open tab intact.
    const mixed = s[2];
    ok(mixed.tabs[0].widgets.length === 1, 'open sibling tab keeps its widgets');
    const pinTab = mixed.tabs[1];
    ok(pinTab.pin === undefined && pinTab.pinProtected === true, 'tab pin stripped + marked');
    ok(pinTab.widgets.length === 0, 'protected tab widgets emptied');
    ok(pinTab.conditions === undefined, 'protected tab DP-bound conditions removed from public config');

    // Nothing that could be a plaintext PIN survives in the public config.
    ok(!vault.hasPlaintextPin(publicConfig), 'public config carries no plaintext PIN');
    ok(JSON.stringify(publicConfig).indexOf('1234') < 0, 'section PIN value nowhere in public config');
    ok(JSON.stringify(publicConfig).indexOf('9999') < 0, 'tab PIN value nowhere in public config');
    ok(JSON.stringify(publicConfig).indexOf('wSecret') < 0, 'hidden widget id nowhere in public config');
    ok(JSON.stringify(publicConfig).indexOf('wHidden') < 0, 'hidden tab widget id nowhere in public config');

    // Protected payloads carry the real content + plaintext PIN for hashing.
    ok(prot.length === 2, 'two protected payloads (section wins over its tabs)');
    const sec = prot.find((p) => p.key === 'section:sLocked');
    ok(sec && sec.scope === 'section' && sec.pin === '1234', 'section payload has key/scope/pin');
    ok(sec.content.tabs.length === 2 && sec.content.tabs[0].widgets[0].id === 'wSecret', 'section content = full tabs');
    const tab = prot.find((p) => p.key === 'tab:sTabLock:tPin');
    ok(tab && tab.pin === '9999' && tab.content.widgets[0].id === 'wHidden', 'tab payload has pin + widgets');

    // The section's own badge settings: out of the public stub (a count of widgets
    // behind the PIN is a leak) but INTO the vault, or setting a PIN silently
    // deletes them — which is what happened to a live dashboard.
    ok(locked.badgeAggregate === undefined && locked.badges === undefined, 'section decoration not in the stub');
    ok(
        sec.content.badgeAggregate && sec.content.badgeAggregate.enabled === true,
        'section badgeAggregate kept in the vault',
    );
    ok(Array.isArray(sec.content.badges) && sec.content.badges[0].id === 'b1', 'section badges kept in the vault');

    // Idempotence: splitting the already-public config yields nothing more.
    const again = vault.splitDashboard(publicConfig);
    ok(again.protected.length === 0, 're-splitting a redacted config is a no-op (re-entrancy guard)');
}

// ── zustand persist wrapper (the actual config.dashboard state shape) ────────
{
    // The state is not the bare config — zustand persist wraps it as {state,version}.
    // Reading the wrong level here is what made redaction a silent no-op (#bug).
    const wrapped = { state: fullConfig(), version: 3 };
    const r = vault.readStateConfig(wrapped);
    ok(
        r.wrapped === true && Array.isArray(r.config.layouts),
        'readStateConfig unwraps {state,version} to the inner config',
    );
    ok(vault.hasPlaintextPin(r.config) === true, 'hasPlaintextPin sees the PIN once unwrapped');

    const bare = vault.readStateConfig(fullConfig());
    ok(bare.wrapped === false && Array.isArray(bare.config.layouts), 'a bare config passes through unwrapped');

    const { publicConfig } = vault.splitDashboard(r.config);
    const out = vault.writeStateConfig(wrapped, publicConfig, r.wrapped);
    ok(
        out.version === 3 && out.state.layouts[0].sections[1].pinProtected === true,
        'writeStateConfig re-wraps the redacted config and keeps version',
    );
    ok(JSON.stringify(out).indexOf('1234') < 0, 'wrapped writeback carries no plaintext PIN');
}

// ── vault sections build (hashing) ──────────────────────────────────────────
{
    const { protected: prot } = vault.splitDashboard(fullConfig());
    const { sections, unresolved } = vault.buildVaultSections(prot);
    ok(unresolved.length === 0, 'real PINs resolve without leftovers');
    const sec = sections['section:sLocked'];
    ok(sec && sec.salt && sec.hash, 'vault section has salt + hash');
    ok(sec.len === 4, 'vault section stores PIN length (digit count)');
    ok(auth.verifySecret('1234', sec.salt, sec.hash), 'vault hash verifies against the real PIN');
    ok(!auth.verifySecret('0000', sec.salt, sec.hash), 'vault hash rejects a wrong PIN');
    ok(JSON.stringify(sections).indexOf('1234') < 0, 'plaintext PIN not stored in the vault sections');

    // A section PIN supersedes its inner tab PINs — no plaintext PIN in content.
    ok(
        sec.content.tabs.every((t) => t.pin === undefined),
        'inner tab PINs stripped from section content',
    );

    // Stamping pin lengths onto the redacted stubs (keypad hint, not a secret).
    const { publicConfig } = vault.splitDashboard(fullConfig());
    vault.stampPinLengths(publicConfig, sections);
    ok(publicConfig.layouts[0].sections[1].pinLength === 4, 'stamped pinLength on the redacted section stub');
    const tabSections = vault.buildVaultSections(vault.splitDashboard(fullConfig()).protected).sections;
    const pub2 = vault.splitDashboard(fullConfig()).publicConfig;
    vault.stampPinLengths(pub2, tabSections);
    ok(pub2.layouts[0].sections[2].tabs[1].pinLength === 4, 'stamped pinLength on the redacted tab stub');
}

// ── KEEP sentinel: unchanged PIN survives an edit without knowing the PIN ─────
{
    // First save establishes the vault.
    const first = vault.splitDashboard(fullConfig());
    const { sections: existing } = vault.buildVaultSections(first.protected);
    const origHash = existing['section:sLocked'].hash;

    // Editor re-saves the section: same view, edited widget, PIN sent as KEEP.
    const edited = fullConfig();
    edited.layouts[0].sections[1].pin = vault.KEEP_PIN;
    edited.layouts[0].sections[1].tabs[0].widgets = [{ id: 'wEdited', type: 'gauge' }];
    const split2 = vault.splitDashboard(edited);
    const { sections: sections2, unresolved } = vault.buildVaultSections(split2.protected, existing);

    ok(unresolved.length === 0, 'KEEP resolves against the existing vault');
    ok(sections2['section:sLocked'].hash === origHash, 'KEEP reuses the existing hash (PIN unchanged)');
    ok(
        auth.verifySecret('1234', sections2['section:sLocked'].salt, sections2['section:sLocked'].hash),
        'KEEP still verifies old PIN',
    );
    ok(sections2['section:sLocked'].content.tabs[0].widgets[0].id === 'wEdited', 'KEEP takes the newly edited content');

    // KEEP with no existing entry cannot be resolved → reported, not silently kept.
    const orphan = vault.buildVaultSections(split2.protected, {});
    ok(orphan.unresolved.indexOf('section:sLocked') >= 0, 'orphan KEEP is reported as unresolved');
}

// ── VaultFile round-trip ────────────────────────────────────────────────────
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-vault-'));
    const vf = new vault.VaultFile(dir);
    ok(vf.load().sections && Object.keys(vf.load().sections).length === 0, 'missing file loads empty default');

    const data = vault.DEFAULT_VAULT();
    data.serverSecret = auth.generateServerSecret();
    data.admin = auth.hashSecret('adminpass');
    data.sections = vault.buildVaultSections(vault.splitDashboard(fullConfig()).protected).sections;
    vf.save(data);

    const back = vf.load();
    ok(back.serverSecret === data.serverSecret, 'server secret persists');
    ok(auth.verifySecret('adminpass', back.admin.salt, back.admin.hash), 'admin hash persists + verifies');
    ok(Object.keys(back.sections).length === 2, 'vault sections persist');

    // File must not be world-readable on POSIX.
    if (process.platform !== 'win32') {
        const mode = fs.statSync(vf.file).mode & 0o777;
        ok(mode === 0o600, `vault file is 0600 (got ${mode.toString(8)})`);
    } else {
        pass++; // mode is a no-op on Windows; count the slot so totals match
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── restoreView („PIN entfernen“) ───────────────────────────────────────────
// The mirror image of the split for one view: the payload goes back into the
// stub and every protection marker goes away. Server-side, so removing a PIN
// needs neither the PIN nor a save from the editor.
{
    const { publicConfig, protected: prot } = vault.splitDashboard(fullConfig());
    vault.stampPinLengths(publicConfig, vault.buildVaultSections(prot).sections);
    const byKey = Object.fromEntries(prot.map((p) => [p.key, p]));

    ok(vault.restoreView(publicConfig, 'section:sLocked', byKey['section:sLocked'].content), 'section restored');
    const sec = publicConfig.layouts[0].sections[1];
    ok(sec.pin === undefined && sec.pinProtected === undefined, 'section protection markers gone');
    ok(sec.pinLength === undefined && sec.pinRelock === undefined, 'stub PIN hints gone too');
    ok(sec.tabs.length === 2 && sec.tabs[0].widgets[0].id === 'wSecret', 'section tabs and widgets are back');
    ok(sec.badgeAggregate.enabled === true && sec.badges[0].id === 'b1', 'menu decoration comes back with it');

    ok(vault.restoreView(publicConfig, 'tab:sTabLock:tPin', byKey['tab:sTabLock:tPin'].content), 'tab restored');
    const tab = publicConfig.layouts[0].sections[2].tabs[1];
    ok(tab.pin === undefined && tab.pinProtected === undefined && tab.pinLength === undefined, 'tab markers gone');
    ok(tab.widgets[0].id === 'wHidden' && tab.conditions[0].dp === 'some.dp', 'tab widgets + conditions are back');
    ok(tab.name === 'Secret' && tab.slug === 'secret', 'the stub fields survive the restore');

    // Decoration the payload does not carry must go rather than linger from the stub.
    const stub = vault.splitDashboard(fullConfig()).publicConfig;
    stub.layouts[0].sections[2].tabs[1].badges = [{ id: 'leftover' }];
    vault.restoreView(stub, 'tab:sTabLock:tPin', { widgets: [] });
    ok(stub.layouts[0].sections[2].tabs[1].badges === undefined, 'decoration missing from the payload is dropped');

    ok(vault.restoreView(publicConfig, 'tab:sTabLock:gone', { widgets: [] }) === false, 'unknown key → false');

    // #692: the padlock switch is menu decoration, not content — the frontend only
    // sees the redacted stub, so the flag has to ride along on it. Removing the PIN
    // takes it with the rest of the markers.
    const withFlag = vault.splitDashboard(fullConfig()).publicConfig;
    ok(
        withFlag.layouts[0].sections[2].tabs[1].pinHideLock === true,
        'pinHideLock survives the redaction on the public stub',
    );
    ok(
        withFlag.layouts[0].sections[2].tabs[0].pinHideLock === undefined,
        'an unprotected tab gets no flag out of nowhere',
    );
    vault.restoreView(withFlag, 'tab:sTabLock:tPin', byKey['tab:sTabLock:tPin'].content);
    ok(withFlag.layouts[0].sections[2].tabs[1].pinHideLock === undefined, 'removing the PIN drops the flag too');
}

console.log(`security-core: ${pass} checks passed`);
