/**
 * Iconify integration — API-only mode.
 *
 * Instead of shipping the full lucide + mdi collections (~3.3 MB raw,
 * ~800 KB gzipped) with every page load, the `<Icon>` component from
 * `@iconify/react` fetches individual icons on demand from
 * `api.iconify.design`. Multiple icon requests within ~50 ms are batched
 * into a single HTTP call automatically, and successful results are cached
 * in the browser's localStorage for 7 days. Typical cost per unique icon is
 * 200-500 bytes; cached icons hit zero network on revisits.
 *
 * `loadIconSets` / `areIconSetsLoaded` are kept as no-ops so existing
 * callers (TabBar, IconPickerModal) keep working without a refactor.
 */

/** No-op: icons are now resolved on demand by the `<Icon>` component. */
export function loadIconSets(): Promise<void> {
    return Promise.resolve();
}

/** Always `true`: there is no global "loaded" state in API mode. */
export function areIconSetsLoaded(): boolean {
    return true;
}

/** Convert PascalCase Lucide name to Iconify "lucide:kebab-case" ID.
 *  e.g. "ZapOff" → "lucide:zap-off", "Home" → "lucide:home" */
export function lucidePascalToIconify(name: string): string {
    if (name.includes(':')) return name;
    const kebab = name.replace(/([A-Z])/g, (ch, _, offset) =>
        offset === 0 ? ch.toLowerCase() : `-${ch.toLowerCase()}`,
    );
    return `lucide:${kebab}`;
}
