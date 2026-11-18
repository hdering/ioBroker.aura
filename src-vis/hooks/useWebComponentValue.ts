import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CHANGE_EVENT, type WebComponentElement } from '@iobroker/web-components';
import { useDatapoint } from './useDatapoint';
import { getObjectDirect } from './useIoBroker';
import { baseDpId } from '../utils/dpRef';
import { createEchoGuard, fromStateValue, sameValue, toStateValue } from '../utils/webComponentValue';

/** What the binding needs of the object of the datapoint */
interface DpInfo {
    id: string;
    /** `common.type`, null without an object */
    type: string | null;
    /** false only when the object says the state is read-only */
    writable: boolean;
}

/**
 * Binds the `value` of a web component (`@iobroker/web-components`) to a datapoint:
 * the state is handed to the element as `value` (JSON text as the object it
 * describes), and the element's `iob-change` is written to the state - taken with
 * `preventDefault()`, so the component keeps the new value itself.
 *
 * - The element is set only when the stored value differs from the one it holds
 *   (equal as JSON), and not with a late echo of an older own write.
 * - In edit mode, without a datapoint and for a read-only state the event is left
 *   alone: the component's value stays as it was. Nothing is written then.
 * - Removing the datapoint takes the value from the element again.
 *
 * @param elRef the element of the component
 * @param ready true once the element is defined and mounted
 * @param dp `options.wcValueDp`; empty = no value
 * @param editMode the widget is in the editor
 */
export function useWebComponentValue(
    elRef: RefObject<WebComponentElement | null>,
    ready: boolean,
    dp: string,
    editMode: boolean,
): void {
    const id = baseDpId(dp.trim());
    const { state, setValue } = useDatapoint(id);

    const [info, setInfo] = useState<DpInfo | null>(null);
    useEffect(() => {
        if (!id) return;
        let alive = true;
        getObjectDirect(id).then(
            (obj) => {
                if (alive) setInfo({ id, type: obj?.common?.type ?? null, writable: obj?.common?.write !== false });
            },
            () => {
                if (alive) setInfo({ id, type: null, writable: true });
            },
        );
        return () => {
            alive = false;
        };
    }, [id]);
    // undefined while the object is read: the value waits for its type
    const current = info?.id === id ? info : undefined;

    const [guard] = useState(() => createEchoGuard());
    const bound = useRef(false);

    // state -> element
    useLayoutEffect(() => {
        const el = elRef.current;
        if (!ready || !el) return;
        if (!id) {
            if (bound.current) {
                el.value = undefined;
                bound.current = false;
            }
            return;
        }
        if (!current || !state) return;
        if (!guard.accept(state.val)) return;
        const next = fromStateValue(state.val, current.type);
        bound.current = true;
        if (!sameValue(el.value, next)) el.value = next;
    }, [ready, id, state, current, guard, elRef]);

    // element -> state; the handler reads the latest values through a ref
    const live = useRef({ setValue, current, editMode });
    live.current = { setValue, current, editMode };
    useEffect(() => {
        const el = elRef.current;
        if (!ready || !el || !id) return;
        const onChange = (event: Event): void => {
            const { setValue: write, current: dpInfo, editMode: editing } = live.current;
            // like a disabled field: the component's value stays as it was
            if (editing || dpInfo?.writable === false) return;
            event.preventDefault();
            const val = toStateValue((event as CustomEvent<unknown>).detail, dpInfo?.type);
            guard.wrote(val);
            // ioBroker takes null as well; the hook's type knows the primitives only
            write(val as boolean | number | string);
        };
        el.addEventListener(CHANGE_EVENT, onChange);
        return () => el.removeEventListener(CHANGE_EVENT, onChange);
    }, [ready, id, guard, elRef]);
}
