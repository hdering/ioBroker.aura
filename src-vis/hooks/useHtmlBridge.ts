import { useEffect, type RefObject } from 'react';
import {
    getStateDirect,
    getStateFromCache,
    isStateFresh,
    sendToDirect,
    setStateEchoed,
    subscribeStateDirect,
} from './useIoBroker';
import { BRIDGE_CALL, BRIDGE_EVENT, BRIDGE_REPLY, type BridgeCall } from '../utils/htmlBridge';
import type { ioBrokerState } from '../types';

/**
 * Host end of the HTML widget's `window.aura` (issue #649) — see utils/htmlBridge
 * for the protocol and why the frame cannot simply reach into the host.
 *
 * Everything it exposes is what a dashboard may already do through a normal widget:
 * write a datapoint, read one, subscribe to one, send an adapter message. The
 * gatekeeping is the message source — only the frame this hook was given is heard,
 * so a foreign iframe on the same page cannot use the channel.
 */

/** An id the socket layer accepts — the same characters `isValidStateId` allows. */
function isId(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0 && !/[/?&=:]/.test(v);
}

/** ioBroker takes primitives; objects are the usual "JSON in a string" datapoint. */
function toWritable(v: unknown): boolean | number | string {
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') return v;
    return JSON.stringify(v ?? null);
}

export function useHtmlBridge(frameRef: RefObject<HTMLIFrameElement | null>, enabled: boolean): void {
    useEffect(() => {
        if (!enabled) return;

        // One entry per subscribed id, dropped on `hello` (the frame reloaded) and
        // on unmount. Without that a widget whose content carries a binding would
        // pile up subscriptions: every bound value change rewrites srcDoc, which
        // reloads the document but keeps the same WindowProxy.
        const subs = new Map<string, () => void>();
        const dropSubs = () => {
            subs.forEach((off) => off());
            subs.clear();
        };

        const post = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage(msg, '*');

        const onMessage = (ev: MessageEvent) => {
            const win = frameRef.current?.contentWindow;
            if (!win || ev.source !== win) return;
            const data = ev.data as BridgeCall | undefined;
            if (!data || data.source !== BRIDGE_CALL) return;

            const reply = (patch: { result?: unknown; error?: string }) =>
                post({ source: BRIDGE_REPLY, id: data.id, ...patch });
            const args = Array.isArray(data.args) ? data.args : [];
            const id = args[0];

            switch (data.method) {
                case 'hello':
                    dropSubs();
                    return;

                case 'setState':
                    if (!isId(id)) return reply({ error: 'invalid datapoint id' });
                    setStateEchoed(id, toWritable(args[1]), args[2] === true);
                    return reply({ result: true });

                case 'toggle': {
                    if (!isId(id)) return reply({ error: 'invalid datapoint id' });
                    // A subscribed datapoint — the usual case, since the widget
                    // normally shows the value it toggles — needs no round trip;
                    // anything else is asked for, so the toggle never flips a
                    // value that went stale while nobody was listening (#528).
                    const flip = (st: ioBrokerState | null) => {
                        setStateEchoed(id, !st?.val);
                        reply({ result: !st?.val });
                    };
                    if (isStateFresh(id)) flip(getStateFromCache(id));
                    else void getStateDirect(id).then(flip);
                    return;
                }

                case 'getState':
                    if (!isId(id)) return reply({ error: 'invalid datapoint id' });
                    void getStateDirect(id).then((st) => reply({ result: st }));
                    return;

                case 'subscribe': {
                    if (!isId(id)) return reply({ error: 'invalid datapoint id' });
                    const emit = (st: ioBrokerState | null) => st && post({ source: BRIDGE_EVENT, sub: id, state: st });
                    if (!subs.has(id)) subs.set(id, subscribeStateDirect(id, emit));
                    reply({ result: true });
                    // subscribeStateDirect only reports CHANGES, so a fresh callback
                    // would sit on "–" until the datapoint happens to move. Hand it
                    // the current value right away.
                    const cached = getStateFromCache(id);
                    if (cached) emit(cached);
                    else void getStateDirect(id).then(emit);
                    return;
                }

                case 'unsubscribe':
                    if (typeof id === 'string') {
                        subs.get(id)?.();
                        subs.delete(id);
                    }
                    return reply({ result: true });

                case 'sendTo': {
                    const [target, command, payload] = args;
                    if (typeof target !== 'string' || typeof command !== 'string')
                        return reply({ error: 'sendTo needs a target and a command' });
                    void sendToDirect(target, command, payload).then((res) => reply({ result: res }));
                    return;
                }

                default:
                    reply({ error: `unknown method: ${String(data.method)}` });
            }
        };

        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', onMessage);
            dropSubs();
        };
    }, [frameRef, enabled]);
}
