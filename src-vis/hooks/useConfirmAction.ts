import { useRef, useState } from 'react';

export function useConfirmAction(action: () => void, enabled: boolean) {
    const [pending, setPending] = useState(false);

    const run = () => {
        if (!enabled) {
            action();
            return;
        }
        setPending(true);
    };

    const confirm = () => {
        setPending(false);
        action();
    };
    const cancel = () => setPending(false);

    return { run, pending, confirm, cancel };
}

/**
 * Confirmation gate for widgets with several different writes (shutter, thermostat — #977).
 *
 * `guard(fn, detail)` runs `fn` straight away when the gate is off; otherwise it parks
 * the closure (with a short description of what it will do) until the user confirms.
 * A ref, not state: the closure already carries its target value, so nothing a later
 * render changes can alter what gets written. Cancelling drops it for good.
 */
export function useConfirmGate(enabled: boolean, onCancel?: () => void) {
    const parked = useRef<(() => void) | null>(null);
    const [pending, setPending] = useState(false);
    const [detail, setDetail] = useState<string | undefined>(undefined);

    const guard = (fn: () => void, what?: string) => {
        if (!enabled) {
            fn();
            return;
        }
        parked.current = fn;
        setDetail(what);
        setPending(true);
    };
    const confirm = () => {
        const fn = parked.current;
        parked.current = null;
        setPending(false);
        fn?.();
    };
    const cancel = () => {
        parked.current = null;
        setPending(false);
        onCancel?.();
    };

    return { guard, pending, detail, confirm, cancel };
}
