/**
 * Staggered group writes (#974): a group action with a delay between devices
 * ("Versatz") — e.g. all shutters down without every motor starting at once.
 *
 * Items with delay 0 are written right here (optimistic echo, no round trip);
 * the delayed rest goes to the adapter (sendTo 'staggeredWrite', lib/staggeredWrite.js),
 * so the sequence completes even when the tablet sleeps or the page is closed.
 * A new run or cancel of the same key drops what is still pending — a late
 * "down" never overtakes the following "up" or stop.
 *
 * Without an adapter answer (old adapter, offline) and in the screenshot harness
 * the delayed items run on browser timers instead.
 */
import { sendToDirect, devWritesBlocked } from '../hooks/useIoBroker';
import { NS } from './namespace';

export type StaggerValue = boolean | number | string;
export interface StaggerItem {
    id: string;
    val: StaggerValue;
    delayMs: number;
}
type SetState = (id: string, v: StaggerValue) => void;

/** Longest accepted delay per item, same as the adapter (lib/staggeredWrite.js). */
export const MAX_STAGGER_MS = 600000;

const localTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
/** Keys that sent a run to the adapter — only those need a remote cancel. */
const hadRemote = new Set<string>();

function safeKey(key: string): string {
    return key.replace(/[^\w.:-]/g, '_').slice(0, 128) || 'group';
}

function cancelLocal(key: string): void {
    const handles = localTimers.get(key);
    if (!handles) return;
    handles.forEach((h) => clearTimeout(h));
    localTimers.delete(key);
}

function runLocal(key: string, items: StaggerItem[], setState: SetState): void {
    cancelLocal(key);
    if (items.length === 0) return;
    const handles = items.map((it) => setTimeout(() => setState(it.id, it.val), it.delayMs));
    localTimers.set(key, handles);
}

/** The delay of the i-th device for a step between devices: 0, step, 2·step … */
export function staggerDelay(index: number, stepMs: number | undefined): number {
    const step = Number(stepMs);
    if (!Number.isFinite(step) || step <= 0) return 0;
    return Math.min(MAX_STAGGER_MS, Math.round(index * step));
}

/**
 * Write all items, the delayed ones staggered. Without any delay this is the plain
 * old loop over setState — nothing goes to the adapter.
 */
export function runStaggered(key: string, items: StaggerItem[], setState: SetState): void {
    const k = safeKey(key);
    cancelLocal(k);
    const now = items.filter((it) => !(it.delayMs > 0));
    const later = items.filter((it) => it.delayMs > 0);
    now.forEach((it) => setState(it.id, it.val));
    if (later.length === 0) {
        // A previous staggered run of this key may still be pending in the adapter.
        if (hadRemote.has(k)) cancelStaggered(key);
        return;
    }
    if (devWritesBlocked()) {
        runLocal(k, later, setState);
        return;
    }
    hadRemote.add(k);
    void sendToDirect<{ ok?: boolean }>(NS, 'staggeredWrite', { key: k, items: later }, 4000).then((res) => {
        const ok = !!res && typeof res === 'object' && (res as { ok?: boolean }).ok === true;
        if (!ok) runLocal(k, later, setState);
    });
}

/** Drop whatever of the key's run is still pending (stop button). */
export function cancelStaggered(key: string): void {
    const k = safeKey(key);
    cancelLocal(k);
    if (!hadRemote.has(k) || devWritesBlocked()) return;
    hadRemote.delete(k);
    void sendToDirect(NS, 'staggeredWrite', { key: k, cancel: true }, 4000);
}
