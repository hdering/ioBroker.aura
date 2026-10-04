/**
 * Path prefix Aura is served under.
 *
 * `/` on Aura's own server (port 8095), `/aura/` when the optional web adapter
 * extension (lib/webExtension.js) forwards `<web-port>/aura/*` to that server.
 * The server injects it into index.html as `window.__AURA_BASE__` (see
 * serveStatic in main.js); in dev (Vite) nothing is injected and it stays `/`.
 *
 * Every request to one of Aura's own routes (`/proxy`, `/fs/…`, `/webfs/…`,
 * `/icons/…`, `/adapter-icons/…`, `/api/aura`) goes through `auraUrl()`.
 * Values that are stored in the config (`aura-file:…`, `/webfs/…`) stay without
 * the prefix, so a dashboard works the same on both ways in.
 */
declare global {
    interface Window {
        __AURA_BASE__?: string;
    }
}

function readBase(): string {
    const raw = typeof window !== 'undefined' ? window.__AURA_BASE__ : undefined;
    // Same shape the server accepts: one or more plain path segments, slash on both ends.
    if (typeof raw === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)*$/.test(raw)) return raw;
    return '/';
}

export const AURA_BASE: string = readBase();

/** True when the page came in through the web adapter extension (`/aura/`). */
export const BEHIND_WEB_EXTENSION = AURA_BASE !== '/';

/** `/fs/read?…` → `/aura/fs/read?…` behind the extension, unchanged on port 8095. */
export function auraUrl(path: string): string {
    if (AURA_BASE === '/' || !path.startsWith('/') || path.startsWith('//')) return path;
    if (path.startsWith(AURA_BASE)) return path;
    return AURA_BASE + path.slice(1);
}
