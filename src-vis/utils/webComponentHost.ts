/**
 * Host side of ioBroker web components (`@iobroker/web-components`): what the
 * webcomponent widget hands to a custom element, kept free of React and of the
 * live socket so it can be tested on its own.
 *
 * - `createWebComponentSocket` - the `socket` property: the subset of a socket-client
 *   `Connection` a component may use, built on Aura's own socket helpers.
 * - `themeFromVars` - the `theme` property from Aura's theme variables.
 * - `typedSettings` - the `settings` property from what the widget stored.
 * - `evalSettingExpr` - `hidden` / `disabled` of a settings field (JSON-Config style).
 * - `findTabForView` - where the `iob-navigate` event of a component leads.
 */
import {
    getDefaultSettings,
    getSettingTypes,
    toSettings,
    toWebComponentTheme,
    type WebComponentManifest,
    type WebComponentSettings,
    type WebComponentSocket,
    type WebComponentTheme,
} from '@iobroker/web-components';

/** A state as the socket delivers it */
export interface HostState {
    val: unknown;
    ack?: boolean;
    ts?: number;
    lc?: number;
    from?: string;
    q?: number;
    [key: string]: unknown;
}

type StateHandler = (id: string, state: HostState | null | undefined) => void;
type ObjectHandler = (id: string, obj: unknown) => void;

/** What the bridge needs from Aura's socket layer (hooks/useIoBroker), injected for tests */
export interface HostSocketApi {
    /** Subscribe one state; returns the unsubscribe function */
    subscribeState(id: string, cb: (state: HostState) => void): () => void;
    getState(id: string): Promise<HostState | null>;
    setState(id: string, val: unknown, ack: boolean): Promise<void>;
    getObject(id: string): Promise<unknown>;
    /** Subscribe one object; returns the unsubscribe function. Optional: without it, objects are read once */
    subscribeObject?(id: string, cb: (obj: unknown) => void): () => void;
    getHistory(id: string, options: Record<string, unknown>): Promise<unknown>;
    getObjectView(type: string, start: string, end: string): Promise<Record<string, unknown>>;
    sendTo(instance: string, command: string, data: unknown): Promise<unknown>;
}

const ids = (id: string | string[]): string[] => (Array.isArray(id) ? id : [id]).filter(Boolean);

/**
 * The `socket` property. One bridge serves every element: subscriptions are kept
 * per id and callback, so an element that unsubscribes one callback leaves the
 * others alone, and `unsubscribeState(id)` without a callback drops them all.
 *
 * @param api Aura's socket helpers
 * @param systemLang the language of the ioBroker system (`system.config`)
 */
export function createWebComponentSocket(api: HostSocketApi, systemLang: string): WebComponentSocket {
    const stateSubs = new Map<string, Map<StateHandler, () => void>>();
    const objectSubs = new Map<string, Map<ObjectHandler, () => void>>();

    const drop = <H>(subs: Map<string, Map<H, () => void>>, id: string, cb?: H): void => {
        const forId = subs.get(id);
        if (!forId) return;
        for (const [handler, off] of [...forId]) {
            if (cb && handler !== cb) continue;
            off();
            forId.delete(handler);
        }
        if (!forId.size) subs.delete(id);
    };

    const socket = {
        systemLang,
        subscribeState(id: string | string[], cb: StateHandler): Promise<void> {
            for (const one of ids(id)) {
                const forId = stateSubs.get(one) ?? new Map<StateHandler, () => void>();
                if (forId.has(cb)) continue;
                forId.set(
                    cb,
                    api.subscribeState(one, (state) => cb(one, state)),
                );
                stateSubs.set(one, forId);
            }
            return Promise.resolve();
        },
        unsubscribeState(id: string | string[], cb?: StateHandler): void {
            for (const one of ids(id)) drop(stateSubs, one, cb);
        },
        getState(id: string) {
            return api.getState(id);
        },
        async setState(id: string, val: unknown, ack?: boolean): Promise<void> {
            // A SettableState object ({ val, ack }) or the bare value, as in socket-client
            if (val !== null && typeof val === 'object' && 'val' in (val as Record<string, unknown>)) {
                const s = val as { val: unknown; ack?: boolean };
                await api.setState(id, s.val, ack ?? !!s.ack);
                return;
            }
            await api.setState(id, val, !!ack);
        },
        getObject(id: string) {
            return api.getObject(id);
        },
        async subscribeObject(id: string | string[], cb: ObjectHandler): Promise<void> {
            for (const one of ids(id)) {
                const forId = objectSubs.get(one) ?? new Map<ObjectHandler, () => void>();
                if (forId.has(cb)) continue;
                if (api.subscribeObject) {
                    forId.set(
                        cb,
                        api.subscribeObject(one, (obj) => cb(one, obj)),
                    );
                } else {
                    // No object events on this socket: the current object once, so the
                    // component is not left waiting for a first change.
                    forId.set(cb, () => undefined);
                    void api.getObject(one).then((obj) => {
                        if (objectSubs.get(one)?.has(cb)) cb(one, obj);
                    });
                }
                objectSubs.set(one, forId);
            }
        },
        unsubscribeObject(id: string | string[], cb?: ObjectHandler): Promise<void> {
            for (const one of ids(id)) drop(objectSubs, one, cb);
            return Promise.resolve();
        },
        getHistory(id: string, options: Record<string, unknown>) {
            return api.getHistory(id, options);
        },
        getObjectViewSystem(type: string, start?: string, end?: string) {
            return api.getObjectView(type, start ?? '', end ?? '\u9999');
        },
        sendTo(instance: string, command: string, data?: unknown) {
            return api.sendTo(instance, command, data);
        },
    };
    return socket as unknown as WebComponentSocket;
}

/**
 * The `theme` property from Aura's theme variables. A component gets the accent
 * as primary color, the page and widget backgrounds, the text colors and the
 * colors of a state; the base class completes the rest.
 *
 * @param readVar value of a CSS custom property, e.g. `--accent` (empty when unset)
 * @param dark whether the active theme is a dark one
 * @param fontFamily the font of the page
 * @param remPx the size of 1rem in px - Aura gives its radii in rem
 */
export function themeFromVars(
    readVar: (name: string) => string,
    dark: boolean,
    fontFamily?: string,
    remPx = 16,
): WebComponentTheme {
    const v = (name: string): string | undefined => readVar(name).trim() || undefined;
    return toWebComponentTheme({
        type: dark ? 'dark' : 'light',
        primary: v('--accent'),
        secondary: v('--accent-yellow'),
        background: v('--app-bg'),
        paper: v('--widget-bg'),
        text: v('--text-primary'),
        textSecondary: v('--text-secondary'),
        divider: v('--widget-border'),
        error: v('--accent-red'),
        warning: v('--accent-yellow'),
        success: v('--accent-green'),
        info: v('--accent'),
        fontFamily: fontFamily?.trim() || undefined,
        borderRadius: lengthToPx(v('--widget-radius'), remPx),
    });
}

/**
 * A CSS length in px: `12px` -> 12, `0.75rem` -> 12. Anything else (calc(), %, var())
 * is left to the default - a component gets its radius as a number of px.
 *
 * @param value the length
 * @param remPx the size of 1rem in px
 */
function lengthToPx(value: string | undefined, remPx: number): number | undefined {
    const m = /^(-?\d*\.?\d+)(px|r?em)?$/.exec(value ?? '');
    if (!m) return undefined;
    const n = Number(m[1]);
    return m[2] === 'rem' || m[2] === 'em' ? Math.round(n * remPx * 100) / 100 : n;
}

/**
 * The `settings` property: the declared defaults, overwritten by what the widget
 * stored, each converted to the type its field declares. Unknown keys are dropped.
 *
 * @param manifest the manifest of the component
 * @param stored `options.wcSettings` of the widget
 */
export function typedSettings(manifest: WebComponentManifest, stored: unknown): WebComponentSettings {
    const values = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
    return toSettings(getSettingTypes(manifest), { ...getDefaultSettings(manifest), ...values });
}

/**
 * `hidden` / `disabled` of a settings field: a JS expression over `data` (the
 * values of all settings), as JSON-Config evaluates it. A broken expression
 * counts as false - the field stays visible and usable.
 *
 * @param expr the expression from the manifest
 * @param data the current values
 */
export function evalSettingExpr(expr: string | undefined, data: Record<string, unknown>): boolean {
    if (!expr) return false;
    try {
        return !!new Function('data', `return (${expr});`)(data);
    } catch {
        return false;
    }
}

interface NavTab {
    id: string;
    name: string;
    slug: string;
}
interface NavSection {
    id: string;
    slug: string;
    tabs: NavTab[];
}
interface NavLayout {
    id: string;
    slug: string;
    sections: NavSection[];
}

/**
 * Where `iob-navigate` leads: a tab of the active layout named by its slug, id or
 * name (case-insensitive), first in the active section, then in the others.
 *
 * @param view `detail.view` of the event
 * @param layouts all layouts
 * @param activeLayoutId the layout on screen
 * @param activeSectionId the section on screen, searched first
 */
export function findTabForView(
    view: unknown,
    layouts: NavLayout[],
    activeLayoutId: string,
    activeSectionId?: string,
): { layoutId: string; sectionId: string; tabId: string } | null {
    const wanted = typeof view === 'string' ? view.trim().toLowerCase() : '';
    if (!wanted) return null;
    const layout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
    if (!layout) return null;
    const sections = [...layout.sections].sort(
        (a, b) => Number(b.id === activeSectionId) - Number(a.id === activeSectionId),
    );
    for (const section of sections) {
        const tab = section.tabs.find((t) =>
            [t.slug, t.id, t.name].some((key) => typeof key === 'string' && key.toLowerCase() === wanted),
        );
        if (tab) return { layoutId: layout.id, sectionId: section.id, tabId: tab.id };
    }
    return null;
}
