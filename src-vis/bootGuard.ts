/**
 * Stops the app when the page was not delivered by Aura's own server.
 *
 * Aura's server injects `window.__AURA_NAMESPACE__` into every index.html it
 * serves (main.js → serveStatic), on port 8095 as well as behind the web adapter
 * extension. Without it the page came from somewhere else — in practice from the
 * copy of www/ that ioBroker uploads into the file storage, which the web adapter
 * serves under `/aura/` whenever the extension is not loaded: Aura stopped (the
 * web instance restarts and leaves it out), or the extension never switched on.
 * That copy has no server behind it: the dashboard comes up from the browser's
 * cache with a socket pointing nowhere and every widget waits for data forever.
 *
 * Imported first in main.tsx: throwing here ends the evaluation of the module
 * graph before any store, socket or React code has run. The boot splash says
 * what is wrong, and the page reloads by itself once Aura answers again.
 */
declare global {
    interface Window {
        __auraBootBlocked?: boolean;
    }
}

const POLL_MS = 10_000;

function notServedByAura(): boolean {
    if (import.meta.env.DEV) return false;
    return typeof window !== 'undefined' && !window.__AURA_NAMESPACE__;
}

function showNotice(): void {
    const de = (navigator.language || '').toLowerCase().startsWith('de');
    const boot = document.getElementById('aura-boot');
    const spinner = document.getElementById('aura-boot-spinner');
    const bar = document.getElementById('aura-boot-bar-wrap');
    const text = document.getElementById('aura-boot-text');
    const detail = document.getElementById('aura-boot-diag-detail');
    const diag = document.getElementById('aura-boot-diag');
    const btn = document.getElementById('aura-boot-reload');
    if (!boot) return;
    if (spinner) spinner.style.display = 'none';
    if (bar) bar.style.display = 'none';
    if (text) {
        text.textContent = de ? 'Aura läuft nicht' : 'Aura is not running';
        text.className = 'is-error';
    }
    if (detail) {
        detail.textContent = de
            ? 'Diese Seite kommt nicht vom Aura-Server. Ist die Aura-Instanz gestartet – und für diese Adresse die Web-Adapter-Erweiterung eingeschaltet? Die Seite lädt neu, sobald Aura wieder antwortet.'
            : 'This page was not served by the Aura server. Is the Aura instance running — and the web adapter extension switched on for this address? The page reloads as soon as Aura answers again.';
    }
    if (btn) btn.onclick = () => window.location.reload();
    if (diag) diag.hidden = false;
}

/** Reload once the same address is answered by Aura again (its index.html carries the namespace). */
function pollForAura(): void {
    const url = window.location.pathname + window.location.search;
    setInterval(() => {
        fetch(url, { cache: 'no-store' })
            .then((r) => (r.ok ? r.text() : ''))
            .then((html) => {
                if (html.includes('__AURA_NAMESPACE__')) window.location.reload();
            })
            .catch(() => {
                /* still down — next round */
            });
    }, POLL_MS);
}

if (notServedByAura()) {
    window.__auraBootBlocked = true;
    showNotice();
    pollForAura();
    throw new Error('[aura] page not served by the Aura server — app not started');
}

export {};
