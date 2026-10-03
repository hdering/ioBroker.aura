/**
 * The adapter answers every save that carries a PIN-protected view with a redacted
 * copy of config.dashboard: the view's content moves into the server-side vault and
 * the state keeps an empty stub (`pinProtected`, tabs without widgets). Applied as
 * is, the editor showed that stub until the vault merge put the content back — every
 * widget of the view unmounted in between, the screen flickered and an open
 * „Widget bearbeiten“ dialog closed with it (#740).
 *
 * carryProtectedContent() fills each stub with the content this editor already holds
 * for the view before the copy is applied. requestVaultRefresh() then asks for a
 * vault read anyway, so content another device saved still arrives — swapped in
 * place under the same ids, nothing remounts.
 *
 * Pure module (no React, no store imports) so a test can bundle it directly.
 */
import { KEEP_PIN } from './pinLock';

type Node = Record<string, unknown>;

const isObj = (v: unknown): v is Node => !!v && typeof v === 'object' && !Array.isArray(v);
const byId = (list: unknown, id: unknown): Node | undefined =>
    Array.isArray(list) ? (list as unknown[]).find((x): x is Node => isObj(x) && x.id === id) : undefined;

/** A view this editor holds with its real content: merged from the vault, or a PIN just typed. */
const holdsContent = (local: Node | undefined): local is Node => !!local && !local.pinProtected && !!local.pin;

/** Turn a redacted stub back into the open view, with `content` taken from the local copy. */
function fill(stub: Node, local: Node, content: string[]): void {
    for (const f of content) stub[f] = local[f];
    stub.pin = KEEP_PIN;
    stub.pinRelock = local.pinRelock;
    delete stub.pinProtected;
    delete stub.pinLength;
}

/**
 * Fill the stubs of `remoteLayouts` (parsed state, mutated in place) from
 * `localLayouts`. Returns true when at least one view was filled.
 */
export function carryProtectedContent(remoteLayouts: unknown[], localLayouts: readonly unknown[]): boolean {
    let carried = false;
    for (const l of remoteLayouts) {
        if (!isObj(l) || !Array.isArray(l.sections)) continue;
        const localLayout = byId(localLayouts, l.id);
        if (!localLayout) continue;
        for (const sec of l.sections as unknown[]) {
            if (!isObj(sec)) continue;
            const localSec = byId(localLayout.sections, sec.id);
            if (!localSec) continue;
            if (sec.pinProtected === true) {
                if (holdsContent(localSec)) {
                    fill(sec, localSec, ['tabs', 'badges', 'badgeAggregate']);
                    carried = true;
                }
                continue; // a section PIN covers its tabs
            }
            if (!Array.isArray(sec.tabs)) continue;
            for (const tab of sec.tabs as unknown[]) {
                if (!isObj(tab) || tab.pinProtected !== true) continue;
                const localTab = byId(localSec.tabs, tab.id);
                if (!holdsContent(localTab)) continue;
                fill(tab, localTab, ['widgets', 'conditions', 'badges', 'badgeAggregate']);
                carried = true;
            }
        }
    }
    return carried;
}

const refreshListeners = new Set<() => void>();

/** Ask the editor for a fresh vault read (after content was carried over a stub). */
export function requestVaultRefresh(): void {
    refreshListeners.forEach((fn) => fn());
}

export function onVaultRefreshRequest(fn: () => void): () => void {
    refreshListeners.add(fn);
    return () => {
        refreshListeners.delete(fn);
    };
}
