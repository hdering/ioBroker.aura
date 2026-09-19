/**
 * Preloading icons for devices without internet (#290).
 *
 * The on-demand path fetches an icon the first time something renders it. For
 * a wall tablet without internet that is one request too late whenever the
 * adapter does not know the icon yet and has no upstream at that moment. So a
 * layout with `iconsOffline` asks for its whole inventory right after boot —
 * through the same `/icons/` route, so Iconify batches the names (128 per
 * request), the adapter fills its cache, and the localStorage cache in
 * `iconifyLoader.ts` keeps the result on the device.
 */
import { iconLoaded, loadIcons } from '@iconify/react';
import type { IconifyIconName } from '@iconify/react';
import { saveIconCache } from './iconifyLoader';

export interface PreloadResult {
    /** Distinct icon ids that were asked for. */
    total: number;
    /** Ids Iconify holds now (either already known or freshly loaded). */
    loaded: string[];
    /** Ids the icon source does not know — typos, removed icons, wrong prefix. */
    missing: string[];
    /** Ids still unanswered when the wait ran out (source unreachable). */
    pending: string[];
}

/** Nothing on a LAN takes this long; a device without any route gives up here. */
const DEFAULT_TIMEOUT_MS = 30_000;

const idOf = (n: IconifyIconName): string => `${n.prefix}:${n.name}`;

/**
 * Load every id in `ids` and resolve once Iconify has an answer for each of
 * them — or once `timeoutMs` has passed, with whatever arrived until then.
 * Afterwards the localStorage cache is written right away, so a device that
 * is switched off a minute later still keeps the whole set.
 */
export function preloadIconIds(ids: readonly string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PreloadResult> {
    const wanted = [...new Set(ids)];
    const known = wanted.filter((id) => iconLoaded(id));
    const todo = wanted.filter((id) => !iconLoaded(id));
    if (!todo.length) {
        return Promise.resolve({ total: wanted.length, loaded: known, missing: [], pending: [] });
    }
    return new Promise((resolve) => {
        let settled = false;
        let abort: (() => void) | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let lastLoaded: string[] = [];
        let lastMissing: string[] = [];
        let lastPending: string[] = todo;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            abort?.();
            saveIconCache();
            resolve({
                total: wanted.length,
                loaded: [...known, ...lastLoaded],
                missing: lastMissing,
                pending: lastPending,
            });
        };
        timer = setTimeout(finish, timeoutMs);
        abort = loadIcons(todo, (loaded, missing, pending) => {
            lastLoaded = loaded.map(idOf);
            lastMissing = missing.map(idOf);
            lastPending = pending.map(idOf);
            if (!pending.length) finish();
        });
        // Everything was already in memory (a race with a concurrent render).
        if (todo.every((id) => iconLoaded(id))) {
            lastLoaded = todo;
            lastPending = [];
            finish();
        }
    });
}
