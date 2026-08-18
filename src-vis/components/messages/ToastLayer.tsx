import { useEffect, useMemo } from 'react';
import { useMessagesStore, startMessagesRuntime, type MessageScope } from '../../store/messagesStore';
import { MessageToast } from './MessageToast';
import type { AuraMessage, MessagePosition } from '../../types';

/** Distance from the viewport edge, in px. */
const EDGE = 12;

/**
 * Where each position anchors. Rendered as nine independent fixed containers so a
 * stack only ever grows into free space and never reflows its neighbours.
 */
const ANCHOR: Record<MessagePosition, React.CSSProperties> = {
    'top-left': { top: EDGE, left: EDGE, alignItems: 'flex-start' },
    'top-center': { top: EDGE, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' },
    'top-right': { top: EDGE, right: EDGE, alignItems: 'flex-end' },
    'center-left': { top: '50%', left: EDGE, transform: 'translateY(-50%)', alignItems: 'flex-start' },
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center' },
    'center-right': { top: '50%', right: EDGE, transform: 'translateY(-50%)', alignItems: 'flex-end' },
    'bottom-left': { bottom: EDGE, left: EDGE, alignItems: 'flex-start' },
    'bottom-center': { bottom: EDGE, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' },
    'bottom-right': { bottom: EDGE, right: EDGE, alignItems: 'flex-end' },
};

/**
 * Which messages a position actually shows. This is the "operator" from the issue
 * discussion: a position holds `maxVisible` cards, and when it is full the ones
 * that matter most stay. A confirmation-demanding message outranks everything,
 * then priority, then age. Losing the contest is not the same as being dropped —
 * an unmounted toast has no timer, so it comes back with its full duration once a
 * slot frees up.
 */
function selectVisible(group: AuraMessage[], maxVisible: number): AuraMessage[] {
    const ranked = [...group].sort(
        (a, b) => Number(b.requireAck) - Number(a.requireAck) || b.priority - a.priority || a.ts - b.ts,
    );
    const keep = new Set(ranked.slice(0, Math.max(1, maxVisible)).map((m) => m.id));
    // Render in arrival order so the stack reads chronologically top to bottom.
    return group.filter((m) => keep.has(m.id));
}

interface Props {
    /** Active layout/tab, for the per-message target filter. */
    scope: MessageScope;
}

/**
 * The message overlay. Mounted once inside the frontend container (next to
 * DpPopupTriggers) so it keeps running across tab switches and inherits the
 * layout-scoped CSS variables.
 *
 * Sits below the popup portal (z-300) on purpose: a popup the user opened is the
 * thing they are working with, and a toast must not cover its controls.
 */
export function ToastLayer({ scope }: Props) {
    const open = useMessagesStore((s) => s.open);
    const maxVisible = useMessagesStore((s) => s.maxVisible);
    const setScope = useMessagesStore((s) => s.setScope);
    const setDisplayActive = useMessagesStore((s) => s.setDisplayActive);
    const closeLocal = useMessagesStore((s) => s.closeLocal);
    const closeByUser = useMessagesStore((s) => s.closeByUser);

    // The scope has to be in the store before the runtime starts: a message
    // arriving on the priming delivery is filtered against it.
    useEffect(() => {
        setScope(scope);
    }, [setScope, scope]);

    // Mounting this layer is what makes the view a display surface. Views that
    // only read the archive (widget editor, admin history) must not consume
    // arriving messages on the dashboard's behalf.
    useEffect(() => {
        setDisplayActive(true);
        return () => setDisplayActive(false);
    }, [setDisplayActive]);

    useEffect(() => startMessagesRuntime(), []);

    const byPosition = useMemo(() => {
        const groups = new Map<MessagePosition, AuraMessage[]>();
        for (const msg of open) {
            const list = groups.get(msg.position);
            if (list) list.push(msg);
            else groups.set(msg.position, [msg]);
        }
        return groups;
    }, [open]);

    if (!open.length) return null;

    return (
        <>
            {[...byPosition.entries()].map(([position, group]) => (
                <div
                    key={position}
                    className="fixed z-[280] flex flex-col gap-2 pointer-events-none"
                    style={{ ...ANCHOR[position], maxHeight: `calc(100dvh - ${EDGE * 2}px)` }}
                    data-aura-toasts={position}
                >
                    {selectVisible(group, maxVisible).map((msg) => (
                        <MessageToast
                            key={msg.id}
                            msg={msg}
                            onClose={(reason) => (reason === 'user' ? closeByUser(msg) : closeLocal(msg.id))}
                        />
                    ))}
                </div>
            ))}
        </>
    );
}
