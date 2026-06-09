/**
 * Runtime ioBroker instance namespace ("aura.0", "aura.1", ...).
 *
 * Injected by the adapter's HTTP server into index.html as
 * `window.__AURA_NAMESPACE__` (see serveStatic in main.js). The fallback to
 * 'aura.0' is only relevant in dev (Vite) where the HTML is not pre-processed
 * by the adapter — in that mode dev-proxy still talks to the primary instance.
 */
declare global {
    interface Window {
        __AURA_NAMESPACE__?: string;
    }
}

export const NS: string = (typeof window !== 'undefined' && window.__AURA_NAMESPACE__) || 'aura.0';
