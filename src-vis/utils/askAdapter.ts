/**
 * Asking the Aura adapter something it answers from its own object DB (Statusübersicht
 * discovery, dynamic list sync) — and NOT falling back to downloading every object when
 * it stays silent.
 *
 * The frontend is served by the adapter, so the adapter always knows the command: no
 * answer means it is restarting (an update, a settings change) or the system is busy.
 * Loading the whole object DB in the browser then was the worst possible reaction — each
 * open dashboard pulled every state/channel/device view at once, and with a large DB in
 * the js-controller process that stalled the whole installation for minutes. So silence
 * is retried with growing pauses; only an actual answer decides.
 */

/** Pauses between the attempts; the last one repeats. */
export const ASK_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

export type AskResult<T> = T | { __timeout: true } | string | null;

export function isSilence(res: unknown): res is { __timeout: true } {
    return !!res && typeof res === 'object' && '__timeout' in res;
}

/**
 * Calls `ask` until it gets an answer other than a timeout. Resolves `undefined` once
 * `isCancelled()` turns true (unmounted, options changed) — the caller then does nothing.
 */
export async function askUntilAnswered<T>(
    ask: () => Promise<AskResult<T>>,
    isCancelled: () => boolean,
    delays: readonly number[] = ASK_RETRY_DELAYS_MS,
): Promise<Exclude<AskResult<T>, { __timeout: true }> | undefined> {
    for (let attempt = 0; ; attempt++) {
        if (isCancelled()) return undefined;
        const res = await ask();
        if (isCancelled()) return undefined;
        if (!isSilence(res)) return res as Exclude<AskResult<T>, { __timeout: true }>;
        const wait = delays[Math.min(attempt, delays.length - 1)];
        await new Promise((r) => globalThis.setTimeout(r, wait));
    }
}
