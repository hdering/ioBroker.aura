import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Sound of the `<video>`/`<audio>` elements inside an embedded page. (issue #855)
 *
 * The parent can only reach into a frame of its own origin — a page loaded
 * through Aura's `/proxy`, a file under `/webfs`, a direct video link through the
 * proxy (the browser wraps it in its own media document).  * A foreign page stays
 * closed: `reachable` turns false and the caller says so instead of pretending.
 *
 * Behind the web extension a proxied page runs sandboxed in an opaque origin
 * (#997) and is no longer reachable that way. Aura's proxy injects a small
 * bridge into it instead: `{auraMute}` messages go in, `{auraMuteState}`
 * reports come back — the page counts as reachable once it answers.
 *
 * `wanted` null leaves the page alone; the hook then only reports what the page
 * itself does (`pageMuted`), so the button shows the real state before the first
 * tap. Media the page creates later is caught on `loadstart`/`play` (capture —
 * neither event bubbles), and a change through the player's own controls flows
 * back through `volumechange`.
 */
export function useIframeMute(
    frameRef: RefObject<HTMLIFrameElement | null>,
    enabled: boolean,
    wanted: boolean | null,
    onPageChange: (muted: boolean) => void,
): { reachable: boolean | null; pageMuted: boolean | null; attach: () => void } {
    const [reachable, setReachable] = useState<boolean | null>(null);
    const [pageMuted, setPageMuted] = useState<boolean | null>(null);
    const wantedRef = useRef(wanted);
    wantedRef.current = wanted;
    const onPageChangeRef = useRef(onPageChange);
    onPageChangeRef.current = onPageChange;
    const docRef = useRef<Document | null>(null);
    /** The sandboxed page's window when it is reached over the message bridge. */
    const bridgeRef = useRef<Window | null>(null);

    // Reports of the bridge in a sandboxed proxied page (main.js sandboxShim).
    useEffect(() => {
        if (!enabled) return;
        const onMessage = (e: MessageEvent) => {
            const win = frameRef.current?.contentWindow;
            if (!win || e.source !== win || !e.data || typeof e.data !== 'object' || !('auraMuteState' in e.data))
                return;
            const state = (e.data as { auraMuteState: unknown }).auraMuteState;
            bridgeRef.current = win;
            setReachable(true);
            if (typeof state !== 'boolean') return;
            setPageMuted(state);
            if (wantedRef.current != null && state !== wantedRef.current) onPageChangeRef.current(state);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [enabled, frameRef]);

    const attach = useCallback(() => {
        docRef.current = null;
        bridgeRef.current = null;
        if (!enabled) return;
        let doc: Document | null = null;
        try {
            doc = frameRef.current?.contentDocument ?? null;
        } catch {
            doc = null;
        }
        if (!doc) {
            setReachable(false);
            // Maybe a sandboxed proxied page: ask its bridge (it answers, or nothing does).
            frameRef.current?.contentWindow?.postMessage({ auraMute: wantedRef.current }, '*');
            return;
        }
        docRef.current = doc;
        setReachable(true);
        const media = (t: EventTarget | null) => (t instanceof doc.defaultView!.HTMLMediaElement ? t : null);
        const enforce = (e: Event) => {
            const el = media(e.target);
            if (!el) return;
            if (wantedRef.current != null) el.muted = wantedRef.current;
            setPageMuted(el.muted);
        };
        doc.addEventListener('loadstart', enforce, true);
        doc.addEventListener('play', enforce, true);
        doc.addEventListener(
            'volumechange',
            (e) => {
                const el = media(e.target);
                if (!el) return;
                setPageMuted(el.muted);
                if (wantedRef.current != null && el.muted !== wantedRef.current) onPageChangeRef.current(el.muted);
            },
            true,
        );
        const first = doc.querySelector<HTMLMediaElement>('video, audio');
        applyMute(doc, wantedRef.current);
        if (first) setPageMuted(first.muted);
    }, [enabled, frameRef]);

    useEffect(() => {
        if (docRef.current) applyMute(docRef.current, wanted);
        else if (bridgeRef.current && wanted != null) bridgeRef.current.postMessage({ auraMute: wanted }, '*');
    }, [wanted]);

    return { reachable: enabled ? reachable : null, pageMuted, attach };
}

function applyMute(doc: Document, muted: boolean | null) {
    if (muted == null) return;
    for (const el of doc.querySelectorAll<HTMLMediaElement>('video, audio')) {
        if (el.muted === muted) continue;
        el.muted = muted;
        // Chrome pauses a playing video that gets unmuted without a gesture of its
        // own frame; the tap on the button counts for the parent, so restart it.
        if (!muted && el.paused && el.autoplay) el.play().catch(() => undefined);
    }
}
