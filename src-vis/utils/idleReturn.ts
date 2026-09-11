/**
 * Pure resolution rules for the auto-return timer (issue #638).
 *
 * The timer used to read exactly two configuration values. It now answers to
 * four sources at once — the scoped configuration, a datapoint per device, a
 * datapoint for all devices, and the tab currently on screen — so the precedence
 * lives here rather than inline in the component: this is the part that has to
 * be right, and it is the part a test can reach without a browser.
 */

/** Raw datapoint value → minutes of pause left. Anything unusable means "none". */
export function toSnoozeMinutes(val: unknown): number {
    const n = Math.round(Number(val));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Raw datapoint value → delay override in seconds, or null for "not set".
 *
 * The datapoint's idle value is -1 rather than 0, because 0 is a meaningful
 * setting of its own: it switches auto-return off for that scope.
 */
export function toDelayOverride(val: unknown): number | null {
    // Number(null) is 0, and 0 is a real setting here — so an empty value has to
    // be rejected before the conversion, not after it.
    if (val == null || val === '') return null;
    const n = Math.round(Number(val));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A pause on either scope pauses; the longer one decides when it ends. */
export function resolveSnooze(globalMin: number, clientMin: number): number {
    return Math.max(globalMin || 0, clientMin || 0);
}

/** The more specific scope wins: this device, then all devices, then the config. */
export function resolveDelayOverride(globalDelay: number | null, clientDelay: number | null): number | null {
    return clientDelay ?? globalDelay;
}

export interface IdleReturnInputs {
    /** `idleReturnEnabled` from the effective (global / layout / section) settings. */
    configEnabled: boolean;
    /** `idleReturnDelay` from those same settings, in seconds. */
    configDelay: number;
    /** Delay override in seconds from the datapoints, or null when unset. */
    delayOverride: number | null;
    /** Minutes of pause left. */
    snoozeMinutes: number;
    /** The tab on screen is marked "never leave automatically". */
    tabExempt: boolean;
    /** A widget is showing a web page / video fullscreen. */
    fullscreen: boolean;
}

/**
 * Whether the timer runs right now, and with which delay.
 *
 * The delay datapoint is a full override, not just a number: it can arm the
 * timer on a device whose dashboard has auto-return switched off (delay > 0),
 * and switch it off on a device whose dashboard has it on (delay = 0). Without
 * that, "control it per device" would only ever work in one direction.
 */
export function resolveIdleReturn(i: IdleReturnInputs): { armed: boolean; delaySec: number } {
    const delaySec = i.delayOverride ?? i.configDelay;
    const wanted = i.delayOverride != null ? delaySec > 0 : i.configEnabled && delaySec > 0;
    // Fullscreen is the "let me keep watching this" case by definition, and an
    // exempt tab was configured as one — neither may be driven away from.
    const armed = wanted && i.snoozeMinutes <= 0 && !i.tabExempt && !i.fullscreen;
    return { armed, delaySec };
}
