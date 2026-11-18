'use strict';

/**
 * Timer pair for the lib/ modules.
 *
 * With an adapter, its own setTimeout/clearTimeout are used: js-controller tracks
 * them and clears every pending one on unload, so a debounce or a countdown can
 * never fire into a stopped instance. Without one (unit tests, standalone helpers)
 * the global timers stand in.
 *
 * @param {{ setTimeout?: Function, clearTimeout?: Function } | null | undefined} [adapter] adapter instance
 * @returns {{ setTimeout: (fn: () => void, ms: number) => any, clearTimeout: (handle: any) => void }} timer pair
 */
function adapterTimers(adapter) {
    if (adapter && typeof adapter.setTimeout === 'function' && typeof adapter.clearTimeout === 'function') {
        const a = /** @type {any} */ (adapter);
        return {
            setTimeout: (fn, ms) => a.setTimeout(fn, ms),
            clearTimeout: (handle) => {
                if (handle) {
                    a.clearTimeout(handle);
                }
            },
        };
    }
    return {
        setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
        clearTimeout: (handle) => globalThis.clearTimeout(handle),
    };
}

/**
 * Promise that resolves after `ms` — `adapter.delay()` when there is one.
 *
 * @param {{ delay?: (ms: number) => Promise<void> } | null | undefined} adapter adapter instance
 * @param {number} ms wait time
 * @returns {Promise<void>} resolves after the wait
 */
function adapterDelay(adapter, ms) {
    if (adapter && typeof adapter.delay === 'function') {
        return adapter.delay(ms);
    }
    return new Promise((resolve) => adapterTimers(null).setTimeout(resolve, ms));
}

module.exports = { adapterTimers, adapterDelay };
