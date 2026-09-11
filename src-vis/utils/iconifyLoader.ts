/**
 * Iconify integration — served from Aura's own origin.
 *
 * Instead of shipping the full lucide + mdi collections (~3.3 MB raw,
 * ~800 KB gzipped) with every page load, the `<Icon>` component from
 * `@iconify/react` fetches individual icons on demand. Multiple icon requests
 * within ~50 ms are batched into a single HTTP call automatically, and
 * successful results are cached in the browser's localStorage for 7 days.
 *
 * Those requests go to `/icons/…` on Aura's own server, NOT to the public
 * `api.iconify.design` / `api.simplesvg.com` / `api.unisvg.com` hosts the
 * library ships with. Those three are on the block lists of Samsung Internet
 * and Opera, and a kiosk tablet (Fully Kiosk, Native Alpha) often has no route
 * to the internet at all — so on exactly the devices a wall dashboard runs on,
 * every icon stayed blank while the library kept rotating through all three
 * hosts every 750 ms (#636). The adapter answers the same API shape from a
 * local cache and only reaches out once per icon it has never seen.
 *
 * `loadIconSets` / `areIconSetsLoaded` are kept as no-ops so existing
 * callers (TabBar, IconPickerModal) keep working without a refactor.
 */
import { addAPIProvider } from '@iconify/react';

/** Same-origin Iconify API. The empty host keeps the URL relative, so it follows
 *  the page's protocol, host and port without any configuration.
 *
 *  The public API stays behind it as a last resort for the mirror image of the
 *  reported setup: an ioBroker host without internet, reached from a browser
 *  that has it. Iconify only rotates to the next resource once the one before it
 *  gave up, and `rotate` is raised well above the default 750 ms so a cold icon —
 *  which the adapter has to fetch before it can answer — is not raced against the
 *  public hosts on every first request. */
addAPIProvider('', {
    resources: ['', 'https://api.iconify.design'],
    path: '/icons/',
    rotate: 6000,
    timeout: 12000,
});

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
