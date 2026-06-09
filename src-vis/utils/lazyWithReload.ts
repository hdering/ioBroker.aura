import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// After a deploy, Vite emits new hashed chunk filenames. Tabs still holding the
// previous HTML reference the old filenames; their lazy imports then fail with
// "Failed to fetch dynamically imported module". A one-shot reload picks up the
// fresh index.html and recovers. The sessionStorage flag prevents reload loops
// if the real cause is something else (e.g. offline).

const RELOAD_FLAG = 'aura:chunk-reload-attempted';

function isChunkLoadError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message || '';
    return (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Unable to preload CSS') ||
        err.name === 'ChunkLoadError'
    );
}

function triggerReloadOnce(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (sessionStorage.getItem(RELOAD_FLAG)) return false;
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    } catch {
        // sessionStorage may be unavailable (private mode); still attempt reload.
    }
    window.location.reload();
    return true;
}

export function lazyWithReload<T extends ComponentType<any>>(
    factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
    return lazy(async () => {
        try {
            return await factory();
        } catch (err) {
            if (isChunkLoadError(err) && triggerReloadOnce()) {
                return new Promise<{ default: T }>(() => {});
            }
            throw err;
        }
    });
}

export function installChunkErrorRecovery(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('vite:preloadError', (event) => {
        if (triggerReloadOnce()) event.preventDefault();
    });

    window.addEventListener('load', () => {
        setTimeout(() => {
            try {
                sessionStorage.removeItem(RELOAD_FLAG);
            } catch {
                /* ignore */
            }
        }, 5000);
    });
}
