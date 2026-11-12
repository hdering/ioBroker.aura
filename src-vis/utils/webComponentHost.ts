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
 * - `versionedSources` / `versionedModule` / `mergeCatalog` - versioned URLs, so an
 *   adapter update is not served from the browser cache, and a catalog read again.
 */
import {
    getDefaultSettings,
    getSettingTypes,
    getText,
    resolveManifestUrl,
    toSettings,
    toSendToOptions,
    toWebComponentTheme,
    type LoadedWebComponent,
    type WebComponentSendToRequest,
    type WebComponentSettingOption,
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
    /**
     * Subscribe one object or a pattern of them; returns the unsubscribe function. `cb` gets the new
     * object (null when deleted) and its ID. Optional: without it, objects are read once
     */
    subscribeObject?(id: string, cb: (obj: unknown, id?: string) => void): () => void;
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
                    // a pattern calls back with the ID of the object that changed
                    forId.set(
                        cb,
                        api.subscribeObject(one, (obj, objId) => cb(objId ?? one, obj)),
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

// ── options from the adapter (selectSendTo / autocompleteSendTo) ──────────

/** The answer of the instance for one sendTo setting: options, or null when there was none */
export interface SendToAnswer {
    /** `key` of the request it answers (getSendToRequest) */
    key: string;
    /** null: no answer, an error or a timeout - the field stays a text field */
    options: WebComponentSettingOption[] | null;
}

/**
 * Asks the instance for the options of a `selectSendTo` / `autocompleteSendTo`
 * setting. A timeout, an error text or anything that is no list counts as no
 * answer (null), so the host falls back to the text field.
 *
 * @param request from getSendToRequest
 * @param sendTo the socket's sendTo
 */
export async function askSendToOptions(
    request: WebComponentSendToRequest,
    sendTo: (instance: string, command: string, data: unknown) => Promise<unknown>,
): Promise<SendToAnswer> {
    try {
        const answer = await sendTo(request.instance, request.command, request.data);
        return { key: request.key, options: Array.isArray(answer) ? toSendToOptions(answer) : null };
    } catch {
        return { key: request.key, options: null };
    }
}

/**
 * The options an `autocompleteSendTo` offers: the answer of the instance, then the
 * fixed `options` of the manifest that the answer does not already contain.
 *
 * @param answer options from the instance
 * @param fixed `options` of the setting
 */
export function mergeSendToOptions(
    answer: WebComponentSettingOption[],
    fixed: WebComponentSettingOption[] | undefined,
): WebComponentSettingOption[] {
    const seen = new Set(answer.map((o) => String(o.value)));
    return [...answer, ...(fixed ?? []).filter((o) => !seen.has(String(o.value)))];
}

/**
 * The value an `autocompleteSendTo` stores for what was typed: the value of an
 * option whose value or label matches; any text with `freeSolo`; otherwise
 * undefined (not a value - the stored one stays). An empty text clears it.
 *
 * @param text what is in the field
 * @param options the options offered
 * @param freeSolo any text is a value
 * @param lang language of the labels
 */
export function autocompleteValue(
    text: string,
    options: WebComponentSettingOption[],
    freeSolo: boolean,
    lang: Parameters<typeof getText>[1],
): { value: string | number | boolean | undefined } | null {
    if (text === '') return { value: undefined };
    const byValue = options.find((o) => String(o.value) === text);
    if (byValue) return { value: byValue.value };
    const byLabel = options.find((o) => getText(o.label, lang) === text);
    if (byLabel) return { value: byLabel.value };
    return freeSolo ? { value: text } : null;
}

// ── title and icon from the component ─────────────────────────────────────

/**
 * Event a component dispatches to name what Aura shows in the widget's title row
 * when the widget takes its title or icon from the component (`wcTitleSource` /
 * `wcIconSource: 'component'`) - e.g. a camera the name it has in its adapter.
 * `detail`: `{ title?: string, icon?: string }`, again on every change. The same
 * object may sit in the element's `header` property, read once it is ready.
 * Not part of `@iobroker/web-components` yet (proposed there); a component
 * without it leaves the widget's own title and the manifest's icon.
 */
export const HEADER_EVENT = 'iob-header';

/** What a component reported for the title row */
export interface ComponentHeader {
    title?: string;
    /** URL of a picture, absolute or relative to the component's manifest */
    icon?: string;
}

/** `detail` of `HEADER_EVENT` (or the `header` property) as a header - strings only, empty ones dropped */
export function parseComponentHeader(detail: unknown): ComponentHeader {
    if (!detail || typeof detail !== 'object') return {};
    const d = detail as Record<string, unknown>;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const header: ComponentHeader = {};
    const title = str(d.title);
    const icon = str(d.icon);
    if (title) header.title = title;
    if (icon) header.icon = icon;
    return header;
}

/** Where a widget takes its title or icon from: Aura's own (default) or the component */
export type HeaderSource = 'aura' | 'component';

/** `options.wcTitleSource` / `options.wcIconSource` as a source - anything unknown is Aura's */
export function headerSource(value: unknown): HeaderSource {
    return value === 'component' ? 'component' : 'aura';
}

/**
 * The title row of a webcomponent widget: with source `component` the title the
 * component reported, else (or while it reported none) the widget's title; the
 * icon the component reported, else the picture of its manifest - `iconUrl`
 * undefined means Aura's icon of the widget.
 *
 * @param opts the sources (`wcTitleSource`, `wcIconSource`)
 * @param opts.titleSource where the title comes from
 * @param opts.iconSource where the icon comes from
 * @param widgetTitle `config.title`
 * @param header what the component reported
 * @param manifestIcon URL of the manifest's picture, resolved
 * @param resolve makes a reported icon URL absolute (relative to the manifest)
 */
export function resolveWidgetHeader(
    opts: { titleSource: HeaderSource; iconSource: HeaderSource },
    widgetTitle: string,
    header: ComponentHeader,
    manifestIcon: string | undefined,
    resolve: (url: string) => string | undefined = (url) => url,
): { title: string; iconUrl?: string } {
    const title = (opts.titleSource === 'component' && header.title) || widgetTitle;
    if (opts.iconSource !== 'component') return { title };
    const iconUrl = (header.icon && resolve(header.icon)) || manifestIcon;
    return iconUrl ? { title, iconUrl } : { title };
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
    /** Not among the components tested with Aura (`KNOWN_WEB_COMPONENTS`) - offered, but marked */
    untested?: boolean;
    /** Version of the installed adapter */
    version?: string;
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
    {
        // tested live 2026-11-09: events of the instance, new and changed ones by object pattern (#953)
        adapter: 'fullcalendar',
        tag: 'iob-fullcalendar',
        minVersion: '3.4.1',
        name: { de: 'Kalender', en: 'Calendar' },
        description: {
            de: 'Die geplanten Ereignisse einer Instanz von fullcalendar als Monat, Woche, Tag oder Liste; Ereignisse lassen sich anlegen, verschieben und bearbeiten',
            en: 'The planned events of an instance of fullcalendar as a month, week, day or list; events can be created, moved and edited',
        },
        size: { width: 520, height: 420 },
        hostSettings: [],
    },
    {
        adapter: 'cameras',
        tag: 'iob-cameras-rtsp',
        minVersion: '3.4.0',
        name: { de: 'RTSP Camera', en: 'RTSP Camera' },
        description: { de: 'Livebild einer RTSP-Kamera', en: 'Live picture of an RTSP camera' },
        size: { width: 320, height: 240 },
        // title = the widget's own title row (the component would draw a second one above the picture)
        hostSettings: ['title'],
    },
    {
        adapter: 'cameras',
        tag: 'iob-cameras-snapshot',
        minVersion: '3.4.0',
        name: { de: 'Snapshot Camera', en: 'Snapshot Camera' },
        description: {
            de: 'Regelmäßig aktualisiertes Standbild einer Kamera',
            en: 'Periodically updated snapshot of a camera',
        },
        size: { width: 320, height: 240 },
        hostSettings: ['title'],
    },
];

/** The known component of a widget: by tag, the adapter only as a tie-breaker */
export function findKnownWebComponent(tag: unknown, adapter?: unknown): KnownWebComponent | undefined {
    if (typeof tag !== 'string' || !tag) return undefined;
    const withTag = KNOWN_WEB_COMPONENTS.filter((k) => k.tag === tag);
    return withTag.find((k) => k.adapter === adapter) ?? withTag[0];
}

/** Whether Aura has tested this component of this adapter (it is in `KNOWN_WEB_COMPONENTS`) */
export function isTestedWebComponent(tag: unknown, adapter: unknown): boolean {
    return KNOWN_WEB_COMPONENTS.some((k) => k.tag === tag && k.adapter === adapter);
}

/**
 * Manifest settings of a component that Aura covers itself: the `hostSettings` of a
 * known component, and for any component a text setting `title` - a caption the
 * component would draw above its content, next to the widget's own title row.
 *
 * @param tag tag of the component
 * @param adapter adapter of the component (tie-breaker among known ones)
 * @param manifest its manifest, for the rule that applies to every component
 */
export function hostOwnedSettings(tag: unknown, adapter?: unknown, manifest?: WebComponentManifest): readonly string[] {
    const known = findKnownWebComponent(tag, adapter)?.hostSettings ?? [];
    const generic = manifest && getSettingTypes(manifest).title === 'text' ? ['title'] : [];
    return generic.length && !known.includes('title') ? [...known, ...generic] : known;
}

/**
 * Whether the component takes clicks (`options.wcClick`):
 * - `off`: no - it gets no pointer, no focus, no keys (`inert`); a click is the widget's like on
 *   any widget, so the click action of the widget applies if one is set (Aktion), else nothing
 * - `component`: yes - its own controls and dialog; the widget's click action stays quiet
 */
export type WebComponentClick = 'off' | 'component';

/**
 * The click mode of a widget: `component` only when the widget says so - by default
 * a click belongs to the widget, as on any other (an earlier build's `aura` too).
 *
 * @param own `options.wcClick`
 */
export function webComponentClick(own: unknown): WebComponentClick {
    return own === 'component' ? 'component' : 'off';
}

/** Why the editor greys out a setting Aura covers itself - an i18n key */
export function hostSettingReasonKey(key: string): 'wc.host.title' | 'wc.host.fullView' | 'wc.host.other' {
    if (key === 'title') return 'wc.host.title';
    if (key === 'fullView') return 'wc.host.fullView';
    return 'wc.host.other';
}

/** `settings` without the keys Aura covers itself */
export function withoutHostSettings<T extends Record<string, unknown>>(
    settings: T,
    tag: unknown,
    adapter?: unknown,
    manifest?: WebComponentManifest,
): T {
    const drop = hostOwnedSettings(tag, adapter, manifest);
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
            untested: !isTestedWebComponent(tag, c.adapter),
            version: typeof c.version === 'string' && c.version ? c.version : undefined,
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

// ── versioned URLs, a catalog read again ────────────────────────────────────

/**
 * A URL with the adapter version as query `v`. Manifests and modules lie under
 * URLs without a version, so a browser could keep using cached files of an
 * adapter after its update; with the version the next page load fetches the new
 * ones. The servers (Aura's own, web) ignore the query.
 *
 * @param url absolute URL of a manifest or a module
 * @param version version of the adapter that brings it
 */
export function versionedUrl(url: string, version: string): string {
    if (!version) return url;
    try {
        const u = new URL(url);
        u.searchParams.set('v', version);
        return u.href;
    } catch {
        return url;
    }
}

/**
 * The sources of the catalog (`getWebComponentSources`) with versioned manifest URLs
 *
 * @param sources where the components are described
 */
export function versionedSources<T extends { url: string; version: string }>(sources: T[]): T[] {
    return sources.map((s) => ({ ...s, url: versionedUrl(s.url, s.version) }));
}

/**
 * A loaded component whose module URL is versioned as well: the manifest names its
 * module relative to itself, and resolving that drops the query of the manifest
 * URL. `importWebComponent` still imports every URL once and checks the tag.
 *
 * @param component as `loadWebComponents` gave it
 */
export function versionedModule(component: LoadedWebComponent): LoadedWebComponent {
    return { ...component, moduleUrl: versionedUrl(component.moduleUrl, component.version) };
}

/**
 * The catalog read again (↻, a reconnect, a short catalog), merged with the one before:
 * - a component whose element is defined already keeps the module URL it was
 *   imported from. A browser cannot define a tag twice, so the module of an update
 *   would be loaded and run for nothing - it takes effect with the next page load;
 * - a component that did not change stays the same object, so the widgets showing
 *   it are left alone.
 *
 * @param next the components just read
 * @param previous the components read before
 * @param isDefined whether the element of a tag is defined in this page
 */
export function mergeCatalog(
    next: LoadedWebComponent[],
    previous: LoadedWebComponent[],
    isDefined: (tag: string) => boolean,
): LoadedWebComponent[] {
    return next.map((c) => {
        const before = previous.find((p) => p.adapter === c.adapter && p.manifest.tag === c.manifest.tag);
        if (!before) return c;
        const kept =
            before.moduleUrl !== c.moduleUrl && isDefined(c.manifest.tag) ? { ...c, moduleUrl: before.moduleUrl } : c;
        const same =
            kept.url === before.url &&
            kept.moduleUrl === before.moduleUrl &&
            JSON.stringify(kept.manifest) === JSON.stringify(before.manifest);
        return same ? before : kept;
    });
}
