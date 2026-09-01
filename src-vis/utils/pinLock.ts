/**
 * PIN protection for sections ("Bereiche") and tabs.
 *
 * A section or tab may carry a `pin`. As long as it is not unlocked, the frontend
 * refuses to render its content and shows the PIN prompt instead — no matter
 * whether the viewer clicked the entry in the menu / tab bar or opened its slug
 * URL directly.
 *
 * The gate is deliberately advisory: everything the frontend knows lives in the
 * browser, so a PIN keeps guests and children out of a tab, it is not a secret
 * store. Keep that in mind before putting anything behind it that must not be
 * read at all.
 *
 * Pure module (no React, no store imports) so tools/tests/pin-lock.mjs can bundle
 * and drive it directly.
 */

/** When an unlocked entry falls back to locked. */
export type PinRelock =
    /** as soon as the viewer navigates away from it (default) */
    | 'leave'
    /** stays open until the page is reloaded */
    | 'session';

export interface PinProtected {
    pin?: string;
    pinRelock?: PinRelock;
}

export type PinScope = 'section' | 'tab';

/** Trim + coerce; anything non-string counts as "no PIN". */
export function normalizePin(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : '';
}

export function hasPin(item?: PinProtected | null): boolean {
    return normalizePin(item?.pin).length > 0;
}

export function relockMode(item?: PinProtected | null): PinRelock {
    return item?.pinRelock === 'session' ? 'session' : 'leave';
}

/** `true` when `input` opens `item`. An item without a PIN is always open. */
export function pinMatches(item: PinProtected | null | undefined, input: string): boolean {
    const pin = normalizePin(item?.pin);
    if (!pin) return true;
    return normalizePin(input) === pin;
}

/**
 * Unlock keys. Tab ids are only unique inside their section (a fresh section
 * starts with a tab called `default`), so the tab key carries the section id.
 */
export function sectionPinKey(sectionId: string): string {
    return `section:${sectionId}`;
}
export function tabPinKey(sectionId: string, tabId: string): string {
    return `tab:${sectionId}:${tabId}`;
}

export interface PinTarget {
    scope: PinScope;
    key: string;
    /** Name shown in the prompt. */
    name: string;
    pin: string;
    relock: PinRelock;
}

export interface NamedProtected extends PinProtected {
    id: string;
    name: string;
}

/**
 * The one thing that has to be unlocked before the current view may render, or
 * `null` when the view is free. The section wins over the tab: a locked section
 * must not leak its tab names through a tab-level prompt.
 */
export function pendingPinTarget(
    section: NamedProtected | null | undefined,
    tab: NamedProtected | null | undefined,
    isUnlocked: (key: string) => boolean,
): PinTarget | null {
    if (section && hasPin(section)) {
        const key = sectionPinKey(section.id);
        if (!isUnlocked(key))
            return {
                scope: 'section',
                key,
                name: section.name,
                pin: normalizePin(section.pin),
                relock: relockMode(section),
            };
    }
    if (section && tab && hasPin(tab)) {
        const key = tabPinKey(section.id, tab.id);
        if (!isUnlocked(key))
            return { scope: 'tab', key, name: tab.name, pin: normalizePin(tab.pin), relock: relockMode(tab) };
    }
    return null;
}

export interface UnlockGrant {
    key: string;
    relock: PinRelock;
}

/**
 * Everything on the way into the current view that the entered code opens —
 * normally just the lock that was asked for, but a tab carrying the SAME code as
 * its section is opened along with it.
 *
 * That is what makes a section PIN plus a tab PIN inside it bearable: identical
 * codes ask once (asking twice for the same digits adds nothing), different codes
 * ask twice — which is then exactly what the second, different code was for. The
 * choice stays with whoever sets the PINs, without a switch for it.
 *
 * Only the view that is on screen is granted: a `leave` unlock for a sibling tab
 * would be dropped by `retain()` on the very next navigation anyway.
 */
export function unlocksFor(
    section: NamedProtected | null | undefined,
    tab: NamedProtected | null | undefined,
    code: string,
): UnlockGrant[] {
    if (!section) return [];
    const grants: UnlockGrant[] = [];
    if (hasPin(section) && pinMatches(section, code))
        grants.push({ key: sectionPinKey(section.id), relock: relockMode(section) });
    if (tab && hasPin(tab) && pinMatches(tab, code))
        grants.push({ key: tabPinKey(section.id, tab.id), relock: relockMode(tab) });
    return grants;
}

/** Keys of the currently displayed view — everything else may relock on leave. */
export function activePinKeys(sectionId?: string, tabId?: string): string[] {
    const keys: string[] = [];
    if (sectionId) keys.push(sectionPinKey(sectionId));
    if (sectionId && tabId) keys.push(tabPinKey(sectionId, tabId));
    return keys;
}

/**
 * Where to send the viewer when they dismiss the prompt: the last view they were
 * allowed to see, as long as it is still there and still open; otherwise the
 * first free tab of the current section, otherwise the first free section.
 */
export interface EscapeTarget {
    sectionId: string;
    tabId?: string;
}

export interface PinSectionLike extends NamedProtected {
    tabs: NamedProtected[];
}

export function pinEscapeTarget(
    sections: PinSectionLike[],
    currentSectionId: string | undefined,
    last: EscapeTarget | null,
    isUnlocked: (key: string) => boolean,
): EscapeTarget | null {
    const sectionFree = (sec: PinSectionLike): boolean => !hasPin(sec) || isUnlocked(sectionPinKey(sec.id));
    const tabFree = (sec: PinSectionLike, tab: NamedProtected): boolean =>
        !hasPin(tab) || isUnlocked(tabPinKey(sec.id, tab.id));

    if (last) {
        const sec = sections.find((s) => s.id === last.sectionId);
        const tab = sec?.tabs.find((t) => t.id === last.tabId);
        if (sec && sectionFree(sec) && (!last.tabId || (tab && tabFree(sec, tab))))
            return { sectionId: sec.id, tabId: tab?.id };
    }
    const ordered = sections
        .filter((s) => s.id === currentSectionId)
        .concat(sections.filter((s) => s.id !== currentSectionId));
    for (const sec of ordered) {
        if (!sectionFree(sec)) continue;
        const tab = sec.tabs.find((t) => tabFree(sec, t));
        if (tab) return { sectionId: sec.id, tabId: tab.id };
    }
    return null;
}
