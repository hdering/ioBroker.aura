/**
 * Up/down commands of a shutter widget that does not drive by position:
 * - controlMode "taster": separate up/down DPs, each pulsed with true;
 * - controlMode "move": one move DP (KNX DPT 1.008 "Auf/Ab") that gets
 *   moveUpValue / moveDownValue (default false = up, true = down).
 * Returns null in position mode or when no command DP is configured.
 */
export type ShutterWriteValue = boolean | number | string;

export interface ShutterCommands {
    upDp?: string;
    upValue: ShutterWriteValue;
    downDp?: string;
    downValue: ShutterWriteValue;
}

/** Turns an editor text ("true", "0", "AUF") into the value written to the DP. */
export function parseShutterValue(v: unknown, fallback: ShutterWriteValue): ShutterWriteValue {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean' || typeof v === 'number') return v;
    const s = String(v).trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : s;
}

export function shutterCommands(o: Record<string, unknown>): ShutterCommands | null {
    if (o.controlMode === 'move') {
        const dp = (o.moveDp as string | undefined) || undefined;
        if (!dp) return null;
        return {
            upDp: dp,
            upValue: parseShutterValue(o.moveUpValue, false),
            downDp: dp,
            downValue: parseShutterValue(o.moveDownValue, true),
        };
    }
    if (o.controlMode === 'taster') {
        const upDp = (o.openDp as string | undefined) || undefined;
        const downDp = (o.closeDp as string | undefined) || undefined;
        if (!upDp && !downDp) return null;
        return { upDp, upValue: true, downDp, downValue: true };
    }
    return null;
}
