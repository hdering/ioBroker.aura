/**
 * Apple keyboards carry a Command key where PC keyboards carry Ctrl, and macOS
 * users read shortcuts as ⌘/⌥/⌫ rather than Strg/Alt/Entf (#651).
 *
 * There is no feature test for "this keyboard has a Command key", so the
 * platform is sniffed from the user agent. That is deliberately low-stakes:
 * the keyboard handlers keep accepting Ctrl *and* Cmd, so a wrong guess only
 * mislabels a hint - it never makes a shortcut unreachable.
 */

/** Pure predicate, so it can be exercised without a browser. */
export function isAppleUA(platform: string, ua: string): boolean {
    // "Win32", "Linux x86_64", "Android" - never Apple, and cheaper than the
    // UA scan below, which has to cope with "Macintosh" hiding inside a UA.
    if (/win|android|cros|linux/i.test(platform)) return false;
    return /mac|iphone|ipad|ipod/i.test(`${platform} ${ua}`);
}

let cached: boolean | null = null;

/** True on macOS, iPadOS and iOS. Evaluated once - the platform cannot change. */
export function isApplePlatform(): boolean {
    if (cached !== null) return cached;
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    // iPadOS 13+ reports "MacIntel" here - which is the answer we want anyway.
    cached = isAppleUA(nav.userAgentData?.platform || nav.platform || '', nav.userAgent || '');
    return cached;
}

/** Symbols macOS prints on the keys themselves; every other platform spells them out. */
export const APPLE_KEY_LABELS = { mod: '⌘', alt: '⌥', del: '⌫' } as const;
export type ShortcutKey = keyof typeof APPLE_KEY_LABELS;

/**
 * Does this pointer/keyboard event carry the "copy instead of move" modifier?
 * On Apple that is Option, everywhere else Ctrl - Cmd stays accepted on Apple
 * because the drag targets used to answer to it.
 */
export function isCopyDragModifier(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
    return isApplePlatform() ? e.altKey || e.metaKey : e.ctrlKey || e.metaKey;
}
