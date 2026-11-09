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
 * - `webComponentPickerEntries` / `parseWebComponentKey` / `webComponentGridSize` -
 *   every installed component as an entry of its own in the "add widget" dialog.
 * - `KNOWN_WEB_COMPONENTS` / `findKnownWebComponent` - components offered even
 *   before their adapter is installed.
 */
import {
    getDefaultSettings,
    getSettingTypes,
    getText,
    resolveManifestUrl,
    toSettings,
    toWebComponentTheme,
    type LoadedWebComponent,
    type WebComponentManifest,
    type WebComponentSettings,
    type WebComponentSocket,
    type WebComponentTheme,
} from '@iobroker/web-components';
import { isIdPattern } from './idPattern';

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
    /**
     * Subscribe one state or a pattern (`a.0.x.*`); returns the unsubscribe function. `cb` gets the
     * state and, for a pattern, the ID of the state that changed
     */
    subscribeState(id: string, cb: (state: HostState, id?: string) => void): () => void;
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
                // a pattern calls back with the ID of the state that changed, as socket-client does
                forId.set(
                    cb,
                    api.subscribeState(one, (state, stateId) => cb(stateId || one, state)),
                );
                stateSubs.set(one, forId);
            }
            return Promise.resolve();
        },
        unsubscribeState(id: string | string[], cb?: StateHandler): void {
            for (const one of ids(id)) drop(stateSubs, one, cb);
        },
        getState(id: string) {
            // a pattern has no state of its own - asking the server would only cost a round trip
            return isIdPattern(id) ? Promise.resolve(null) : api.getState(id);
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
            // the base class reads the object of every subscribed state ID, a pattern included
            return isIdPattern(id) ? Promise.resolve(null) : api.getObject(id);
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

// ── the "add widget" dialog ─────────────────────────────────────────────────

/** One installed web component as an entry of its own in the "add widget" dialog */
export interface WebComponentPickerEntry {
    /** `wc:<adapter>|<tag>` - cannot clash with a widget type or a template id */
    key: string;
    adapter: string;
    tag: string;
    /** Name of the component in the language of the frontend */
    label: string;
    /** Its description and the adapter that brings it */
    hint: string;
    /** Absolute URL of its picture, if the manifest names one */
    iconUrl?: string;
    /** The size it looks best in (px), if the manifest names one */
    size?: { width: number; height: number };
    /** A known component whose adapter is not installed (or too old) */
    missing?: boolean;
}

/**
 * A component Aura offers by name even while its adapter is missing: the widget can
 * be placed right away, its settings say which adapter to install.
 */
export interface KnownWebComponent {
    adapter: string;
    tag: string;
    /** The first adapter version that brings the component */
    minVersion: string;
    name: { de: string; en: string };
    description: { de: string; en: string };
    size: { width: number; height: number };
    /**
     * Settings of the manifest that Aura's widget frame already covers: not offered
     * in the editor and never handed to the element, so it keeps their defaults
     */
    hostSettings: readonly string[];
}

/** Name, description and size as in the component's own manifest */
export const KNOWN_WEB_COMPONENTS: readonly KnownWebComponent[] = [
    {
        adapter: 'flow',
        tag: 'iob-flow-diagram',
        minVersion: '0.2.0',
        name: { de: 'Fluss-Diagramm', en: 'Flow diagram' },
        description: {
            de: 'Animiertes Fluss-Diagramm für Energie, Wasser, Gas oder Wärme. Zeigt ein Diagramm, das im Tab „Fluss“ des Admins gezeichnet wird.',
            en: 'Animated flow diagram for energy, water, gas or heat. Shows a diagram that is drawn in the Flow tab of admin.',
        },
        size: { width: 480, height: 340 },
        // title = the widget's own title row; fullView = the fullscreen button under "Darstellung"
        hostSettings: ['title', 'fullView'],
    },
];

/** The known component of a widget: by tag, the adapter only as a tie-breaker */
export function findKnownWebComponent(tag: unknown, adapter?: unknown): KnownWebComponent | undefined {
    if (typeof tag !== 'string' || !tag) return undefined;
    const withTag = KNOWN_WEB_COMPONENTS.filter((k) => k.tag === tag);
    return withTag.find((k) => k.adapter === adapter) ?? withTag[0];
}

/** Manifest settings of a component that Aura covers itself (see `hostSettings`) */
export function hostOwnedSettings(tag: unknown, adapter?: unknown): readonly string[] {
    return findKnownWebComponent(tag, adapter)?.hostSettings ?? [];
}

/** `settings` without the keys Aura covers itself */
export function withoutHostSettings<T extends Record<string, unknown>>(
    settings: T,
    tag: unknown,
    adapter?: unknown,
): T {
    const drop = hostOwnedSettings(tag, adapter);
    if (!drop.length) return settings;
    return Object.fromEntries(Object.entries(settings).filter(([key]) => !drop.includes(key))) as T;
}

const KEY_PREFIX = 'wc:';

/** The key of a component in the dialog (and in "recently used") */
export function webComponentKey(adapter: string, tag: string): string {
    return `${KEY_PREFIX}${adapter}|${tag}`;
}

/** Adapter and tag of a key made by `webComponentKey`, or null for anything else */
export function parseWebComponentKey(key: unknown): { adapter: string; tag: string } | null {
    if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return null;
    const rest = key.slice(KEY_PREFIX.length);
    const bar = rest.indexOf('|');
    if (bar < 0 || bar === rest.length - 1) return null;
    return { adapter: rest.slice(0, bar), tag: rest.slice(bar + 1) };
}

/**
 * The installed components as entries of the dialog: once per adapter and tag,
 * named in the frontend's language (English, then the tag, as fallback). The known
 * components that are not installed follow, marked `missing`.
 *
 * @param components the catalog (`loadWebComponentCatalog`)
 * @param lang language of the frontend
 */
export function webComponentPickerEntries(components: LoadedWebComponent[], lang: string): WebComponentPickerEntry[] {
    const entries: WebComponentPickerEntry[] = [];
    for (const c of components) {
        const tag = c?.manifest?.tag;
        if (typeof tag !== 'string' || !tag) continue;
        const key = webComponentKey(c.adapter, tag);
        if (entries.some((e) => e.key === key)) continue;
        const language = lang as Parameters<typeof getText>[1];
        const description = getText(c.manifest.description, language);
        const from = c.adapter ? `Adapter ${c.adapter}` : '';
        const size = c.manifest.size;
        entries.push({
            key,
            adapter: c.adapter,
            tag,
            label: getText(c.manifest.name, language) || tag,
            hint: [description, from].filter(Boolean).join(' – '),
            iconUrl: resolveManifestUrl(c.manifest.icon, c.url),
            size:
                size && Number(size.width) > 0 && Number(size.height) > 0
                    ? { width: Number(size.width), height: Number(size.height) }
                    : undefined,
        });
    }
    const de = lang === 'de';
    for (const k of KNOWN_WEB_COMPONENTS) {
        if (entries.some((e) => e.tag === k.tag)) continue;
        entries.push({
            key: webComponentKey(k.adapter, k.tag),
            adapter: k.adapter,
            tag: k.tag,
            label: de ? k.name.de : k.name.en,
            hint: `${de ? k.description.de : k.description.en} – Adapter ${k.adapter} ${de ? '(nicht installiert)' : '(not installed)'}`,
            size: k.size,
            missing: true,
        });
    }
    return entries;
}

/**
 * Grid size of a new widget for a component's preferred size: the element area
 * plus the widget's inner padding, in cells of the dashboard grid
 * (cells of `snapX` × `rowHeight` px with `gap` px between them).
 *
 * @param size the size the manifest names, in px
 * @param grid the grid and the widget padding (px)
 * @param grid.rowHeight height of a grid row
 * @param grid.snapX width of a grid column
 * @param grid.gap space between two cells
 * @param grid.padding inner padding of a widget
 */
export function webComponentGridSize(
    size: { width: number; height: number } | undefined,
    grid: { rowHeight: number; snapX: number; gap: number; padding: number },
): { w: number; h: number } | null {
    if (!size || !(size.width > 0) || !(size.height > 0)) return null;
    const cells = (px: number, cell: number): number =>
        Math.max(2, Math.round((px + 2 * grid.padding + grid.gap) / (Math.max(1, cell) + grid.gap)));
    return { w: cells(size.width, grid.snapX), h: cells(size.height, grid.rowHeight) };
}

/**
 * The ID of an object in a row of an object view. Most views of js-controller key
 * their rows by the ID, but `config` keys them by `common.name` - flow's diagram
 * `flow.0.diagrams.12v` comes back as `12V`. The object itself knows its ID.
 *
 * @param row a row of `getObjectView`
 * @param row.id the key the view emitted
 * @param row.value the object (or what the view emits for it)
 */
export function objectIdOfRow(row: { id: string; value?: unknown }): string {
    const own = (row.value as { _id?: unknown } | null | undefined)?._id;
    return typeof own === 'string' && own ? own : row.id;
}
