import { ConfigSection, SubGroup } from './ConfigSection';
import { useT } from '../../i18n';
import { VisibleFieldsSection, type VisibleField } from './VisibleFieldsSection';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, SlidersHorizontal } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import {
    customDeviceName,
    discoverStatusCandidates,
    CATEGORY_ORDER,
    BATTERY_KINDS,
    DEFAULT_BATTERY_KINDS,
    DEFAULT_BATTERY_VOLT_THRESHOLD,
    DEFAULT_BATTERY_VOLT_THRESHOLD_1CELL,
    type BatteryKind,
    type StatusOverviewOptions,
    type StatusCandidate,
    type CategoryKey,
    type StatusSortThen,
} from '../../utils/statusOverview';
import { StatusDatapointsEditor } from './StatusDatapointsEditor';
import { StatusRowPartsEditor } from './StatusRowPartsEditor';
import { Unavailable } from './Unavailable';
import { headerShowsStatusHints } from '../../utils/headerItems';

/** Labels of the battery datapoint kinds (option batteryKinds, #1000). */
const BATTERY_KIND_LABELS: Record<BatteryKind, string> = {
    bool: 'Boolesch (LOWBAT)',
    percent: 'Prozent (%)',
    volt: 'Spannung (V)',
    millivolt: 'Spannung (mV)',
};
import { DeviceNamesEditor, deviceRowsOf, type DeviceNameRow } from './StatusDeviceNamesEditor';
import type { NameSource } from '../../utils/nameFilter';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { loadBatteryDeviceTest } from '../../utils/batteryLibrary';
import { useConfigStore } from '../../store/configStore';
import { ColorPicker } from '../common/ColorPicker';
import { TabbedConfigModal, type TabbedConfigTab } from './ConfigModalTabs';
import { NamePatternField } from './NameDisplayFields';
import { NamePreview } from './NamePreview';
import { RowClickSection } from './RowClickSection';
import { StatusRowActionsEditor } from './StatusRowActionsEditor';
import { PublishSection } from './list/PublishSection';
import { DatapointPicker } from './DatapointPicker';

/**
 * Appends picked datapoint ids to a comma list of patterns, skipping ones already in
 * it. Exported for the test.
 */
export function appendPatternIds(current: string | undefined, ids: string[]): string {
    const parts = (current ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    for (const id of ids) if (id && !parts.includes(id)) parts.push(id);
    return parts.join(', ');
}

// Lazy - the rule editor is only needed once step 2 of the Namen tab is opened.
const NameFilterEditor = lazy(() => import('./NameFilterEditor').then((m) => ({ default: m.NameFilterEditor })));

// Lazy so the ~battery admin page stays out of the config chunk until opened.
const AdminBatteries = lazy(() =>
    import('../../pages/admin/AdminBatteries').then((m) => ({ default: m.AdminBatteries })),
);

type LatchActionKey = keyof NonNullable<StatusOverviewOptions['latchActionColors']>;
/** The picker's swatch when unset — "Gewechselt" really takes the row colour (Zweizeilig: green). */
const LATCH_ACTION_COLOR_FIELDS: { key: LatchActionKey; label: string; fallback: string }[] = [
    { key: 'ack', label: 'Gewechselt / Quittieren', fallback: '#22c55e' },
    { key: 'snooze', label: 'Später', fallback: '#94a3b8' },
    { key: 'dismiss', label: 'Verwerfen', fallback: '#94a3b8' },
    { key: 'ignore', label: 'Ignorieren', fallback: '#94a3b8' },
];

/** Tabs of the "Statusübersicht konfigurieren" dialog. */
type StatusTab = 'categories' | 'datapoints' | 'latch' | 'rows' | 'actions' | 'names' | 'batteries';

/** Category names in the dialog's category list. */
const CAT_LABEL: Record<CategoryKey, string> = {
    window: 'Offene Fenster & Türen',
    battery: 'Schwache Batterien',
    light: 'Eingeschaltete Lichter',
    alarm: 'Rauch- & Wasser-Alarme',
    unreach: 'Nicht erreichbar / offline',
};
/** The on/off option of each category. */
const CAT_OPTION = {
    window: 'catWindow',
    battery: 'catBattery',
    light: 'catLight',
    alarm: 'catAlarm',
    unreach: 'catUnreach',
} as const satisfies Record<CategoryKey, keyof StatusOverviewOptions>;

/** The categories the Merkliste can remember, in panel order, and their option keys. */
const LATCH_TOGGLES: { cat: 'battery' | 'unreach' | 'alarm'; label: string; short: string }[] = [
    { cat: 'battery', label: 'Schwache Batterien merken', short: 'Batterien' },
    { cat: 'unreach', label: 'Nicht erreichbare Geräte merken', short: 'Erreichbarkeit' },
    { cat: 'alarm', label: 'Ausgelöste Rauch- & Wasser-Alarme merken', short: 'Alarme' },
];
const LATCH_KEY = { battery: 'latchBattery', unreach: 'latchUnreach', alarm: 'latchAlarm' } as const;
const CAT_KEY = { battery: 'catBattery', unreach: 'catUnreach', alarm: 'catAlarm' } as const;

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintCls = 'text-[11px]';
const hintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.8 };
const jumpBtnCls =
    'inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity';
const jumpBtnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** One numbered step of the "Namen" tab; `foldable` folds it behind its heading. */
function NameStep({
    n,
    title,
    count,
    text,
    foldable,
    defaultOpen,
    children,
}: {
    n: number;
    title: string;
    count?: string;
    text: string;
    foldable?: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const head = (
        <span className="flex items-center gap-2 min-w-0">
            <span
                className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                {n}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {title}
            </span>
            {count && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {count}
                </span>
            )}
        </span>
    );
    const body = (
        <div className="space-y-2 pl-7">
            <p className={hintCls} style={hintStyle}>
                {text}
            </p>
            {children}
        </div>
    );
    const boxStyle: React.CSSProperties = { borderTop: '1px solid var(--app-border)' };
    if (!foldable)
        return (
            <section className="space-y-1.5 pt-2.5" style={boxStyle} data-name-step={n}>
                {head}
                {body}
            </section>
        );
    return (
        <details className="pt-2.5 group" style={boxStyle} data-name-step={n} open={defaultOpen || undefined}>
            <summary className="cursor-pointer list-none flex items-center gap-1.5 select-none">
                {head}
                <ChevronDown
                    size={13}
                    className="shrink-0 transition-transform group-open:rotate-180"
                    style={{ color: 'var(--text-secondary)' }}
                />
            </summary>
            <div className="pt-1.5">{body}</div>
        </details>
    );
}

/** A bare switch (no text) for the category list; `label` names it for screen readers. */
function Switch({
    checked,
    onChange,
    label,
    onAccent,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    onAccent?: boolean;
}) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className="relative w-8 h-4 rounded-full transition-colors shrink-0"
            style={{
                background: checked ? (onAccent ? 'rgba(255,255,255,0.45)' : 'var(--accent)') : 'var(--app-border)',
            }}
        >
            <span
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                style={{ left: checked ? 'calc(100% - 14px)' : '2px' }}
            />
        </button>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
                className="relative w-8 h-4 rounded-full transition-colors shrink-0"
                style={{ background: checked ? 'var(--accent)' : 'var(--app-border)' }}
                onClick={() => onChange(!checked)}
            >
                <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                    style={{ left: checked ? 'calc(100% - 14px)' : '2px' }}
                />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                {label}
            </span>
        </label>
    );
}

export function StatusOverviewConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = (config.options ?? {}) as StatusOverviewOptions;
    const set = (patch: Partial<StatusOverviewOptions>) =>
        onConfigChange({ ...config, options: { ...config.options, ...patch } });

    // Open tab of the config dialog; null = closed.
    const [cfgTab, setCfgTab] = useState<StatusTab | null>(null);
    const [selCat, setSelCat] = useState<CategoryKey>('window');
    const cfgBtnRef = useRef<HTMLButtonElement>(null);
    // A Merkliste chip jumps to its category; the latch switch there blinks so the eye finds it.
    // `n` re-triggers the blink on a second click of the same chip.
    const [latchFlash, setLatchFlash] = useState<{ cat: CategoryKey; n: number } | null>(null);
    // "+ Datenpunkt" next to a pattern field: the field's value and how to write it back.
    const [pickExtra, setPickExtra] = useState<{ value: string; apply: (next: string) => void } | null>(null);
    useEffect(() => {
        if (!latchFlash) return;
        // After the tab switch has painted - the detail is hidden until then.
        const raf = requestAnimationFrame(() => {
            const el = document.querySelector<HTMLElement>(
                `[data-status-cat-detail="${latchFlash.cat}"] [data-latch-toggle="${latchFlash.cat}"]`,
            );
            if (!el) return;
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            const on = {
                background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                boxShadow: '0 0 0 2px var(--accent)',
            };
            const off = { background: 'transparent', boxShadow: '0 0 0 2px transparent' };
            el.animate([off, on, off, on, off], { duration: 1400, easing: 'ease-in-out' });
        });
        return () => cancelAnimationFrame(raf);
    }, [latchFlash]);

    // Reachability escape hatch is global (device-level), not per-widget.
    const offlineExtraPatterns = useConfigStore((s) => s.frontend.offlineExtraPatterns);
    const offlineInvert = useConfigStore((s) => s.frontend.offlineInvert);
    const updateFrontend = useConfigStore((s) => s.updateFrontend);

    // Name-filter preview examples: the widget's own discovery, so the preview shows
    // datapoints this widget really lists. ensureDatapointCache is module-level (5 min TTL).
    const [samples, setSamples] = useState<NameSource[]>([]);
    const [sampleTotal, setSampleTotal] = useState(0);
    // One row per found device, for the "Gerätenamen" popup.
    const [devices, setDevices] = useState<DeviceNameRow[]>([]);
    // Discovery without excludeIds — the rows of the "Erkannte Datenpunkte" popup (#1002).
    const [found, setFound] = useState<StatusCandidate[]>([]);
    const namedSamples = samples.map((s) => {
        const own = customDeviceName(s.id, o.deviceNames);
        return own ? { ...s, name: own } : s;
    });
    const namedCount = Object.values(o.deviceNames ?? {}).filter((v) => v.trim()).length;
    const batteryKinds = o.batteryKinds ?? DEFAULT_BATTERY_KINDS;
    const hasVoltKind = batteryKinds.includes('volt') || batteryKinds.includes('millivolt');
    // Everything discovery reads except excludeIds — the datapoint manager's list key (#1002).
    const foundKey = JSON.stringify([
        o.catBattery,
        o.catWindow,
        o.catLight,
        o.catUnreach,
        o.catAlarm,
        o.includeLowbatBoolean,
        o.batteryKinds,
        o.batteryExtraPatterns,
        o.alarmExtraPatterns,
        o.windowExtraPatterns,
        o.lightExtraPatterns,
        o.lightRoleScope,
        o.lightsOnlyFunction,
        o.lightIncludeDimmers,
        o.filterRooms,
        o.filterFuncs,
        o.filterAdapters,
        o.excludeIdPatterns,
        offlineExtraPatterns,
        offlineInvert,
    ]);
    const scopeKey = JSON.stringify([foundKey, o.excludeIds]);
    useEffect(() => {
        let cancelled = false;
        const opts: StatusOverviewOptions = { ...o, offlineExtraPatterns, offlineInvert };
        Promise.all([ensureDatapointCache(), opts.catBattery === false ? undefined : loadBatteryDeviceTest()]).then(
            ([cache, isBatteryDevice]) => {
                if (cancelled) return;
                // The widget's own discovery, minus the battery-level lookup the preview has no use for.
                const kept = discoverStatusCandidates(
                    cache,
                    { ...opts, latchBattery: false, trackBatteryChanges: false },
                    isBatteryDevice,
                );
                const count = kept.length;
                setDevices(deviceRowsOf(kept));
                const byCat = new Map<CategoryKey, NameSource[]>();
                for (const { dp, cat } of kept) {
                    const list = byCat.get(cat) ?? [];
                    if (list.length < 2) list.push({ id: dp.id, name: dp.name, room: dp.rooms[0] });
                    byCat.set(cat, list);
                }
                // Spread the examples over the active categories instead of showing six batteries.
                const spread: NameSource[] = [];
                for (const cat of CATEGORY_ORDER) spread.push(...(byCat.get(cat) ?? []));
                setSamples(spread.slice(0, 6));
                setSampleTotal(count);
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    // The datapoint manager (#1002) lists what excludeIds hides too, so it can be ticked back
    // on: discovery without excludeIds. Only while the popup is open, and not again per tick —
    // the list does not depend on excludeIds.
    useEffect(() => {
        if (!cfgTab) return;
        let cancelled = false;
        const opts: StatusOverviewOptions = {
            ...o,
            offlineExtraPatterns,
            offlineInvert,
            latchBattery: false,
            trackBatteryChanges: false,
            excludeIds: undefined,
        };
        Promise.all([ensureDatapointCache(), opts.catBattery === false ? undefined : loadBatteryDeviceTest()]).then(
            ([cache, isBatteryDevice]) => {
                if (!cancelled) setFound(discoverStatusCandidates(cache, opts, isBatteryDevice));
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [foundKey, !!cfgTab]);

    const lightScope = o.lightRoleScope ?? 'light';

    // Merkliste: which categories are on (a switched-off category cannot be remembered).
    const catOn = (cat: keyof typeof CAT_KEY) => o[CAT_KEY[cat]] !== false;
    const latchOn = (cat: keyof typeof LATCH_KEY) => o[LATCH_KEY[cat]] === true;
    const latchActive = LATCH_TOGGLES.filter(({ cat }) => catOn(cat) && latchOn(cat)).map((t) => t.short);
    const latchSummary =
        (latchActive.length ? `an: ${latchActive.join(', ')}` : 'aus') + (o.latchIgnore ? ' · Ignorieren' : '');
    const rowActionCount = (o.rowActions ?? []).filter((a) => a.label && a.targetDp).length;

    // Default highlight colour per category (severity): crit = red, warn = amber.
    const DEFAULT_CAT_HEX: Record<CategoryKey, string> = {
        window: '#ef4444',
        alarm: '#ef4444',
        battery: '#f59e0b',
        light: '#f59e0b',
        unreach: '#f59e0b',
    };
    const setCatColor = (cat: CategoryKey, color: string | null) => {
        const next = { ...(o.categoryColors ?? {}) };
        if (color) next[cat] = color;
        else delete next[cat];
        set({ categoryColors: next });
    };
    const setLatchActionColor = (key: LatchActionKey, color: string | null) => {
        const next = { ...(o.latchActionColors ?? {}) };
        if (color) next[key] = color;
        else delete next[key];
        set({ latchActionColors: Object.keys(next).length ? next : undefined });
    };
    const setCatBg = (cat: CategoryKey, color: string | null) => {
        const next = { ...(o.categoryBgColors ?? {}) };
        if (color) next[cat] = color;
        else delete next[cat];
        set({ categoryBgColors: next });
    };
    const CatColor = ({ cat }: { cat: CategoryKey }) => {
        const custom = o.categoryColors?.[cat];
        const customBg = o.categoryBgColors?.[cat];
        return (
            <div className="flex gap-4">
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Hervorhebungsfarbe
                    </label>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            value={custom || DEFAULT_CAT_HEX[cat]}
                            onChange={(v) => setCatColor(cat, v)}
                            className="w-8 h-7 rounded cursor-pointer p-0.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        />
                        {custom && (
                            <button
                                onClick={() => setCatColor(cat, null)}
                                className="text-[11px] hover:opacity-80"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↩ Standard
                            </button>
                        )}
                    </div>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Hintergrundfarbe
                    </label>
                    <div className="flex items-center gap-2">
                        <ColorPicker
                            value={customBg || custom || DEFAULT_CAT_HEX[cat]}
                            onChange={(v) => setCatBg(cat, v)}
                            className="w-8 h-7 rounded cursor-pointer p-0.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        />
                        {customBg ? (
                            <button
                                onClick={() => setCatBg(cat, null)}
                                className="text-[11px] hover:opacity-80"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↩ Standard
                            </button>
                        ) : (
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                automatisch
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Sichtbare Felder first; the "seit …" categories and the all-clear text sit under their switch.
    const visibleFields: VisibleField[] = [
        {
            key: 'showMore',
            label: '„+N weitere“-Zeile',
            hint: 'Abgeschnittene Zeilen zusammenfassen',
            hidden: !o.maxRows,
        },
        { key: 'showReason', label: 'Kennzeichen „per Knopf“ / „automatisch“', hidden: config.layout !== 'history' },
        { key: 'showDuration', label: 'Dauer der schwachen Batterie', hidden: config.layout !== 'history' },
        {
            key: 'showLifetime',
            label: 'Laufzeit seit dem Wechsel',
            hint: '„hielt 14 Monate“',
            hidden: config.layout !== 'history',
        },
        {
            key: 'showCount',
            label: 'Anzahl der Hinweise',
            hint: 'oben rechts',
            disabledReason:
                config.layout !== 'history' && config.layout !== 'count' && headerShowsStatusHints(config.options)
                    ? 'Die Kopfzeile zeigt die Anzahl schon (Eintrag „Hinweise gesamt“ bzw. {hints}) – der Chip entfällt dann von selbst.'
                    : undefined,
        },
        {
            key: 'showRoom',
            label: 'Raum',
            hint: 'hinter dem Gerätenamen (Layouts Standard, Kompakt, Tabelle, Zweizeilig) – Platz unter „Statusübersicht konfigurieren“ → Zeilenaufbau',
        },
        {
            key: 'showSince',
            label: '„seit …“',
            hint: 'Fenster/Türen ab dem Öffnen, Batterien und Erreichbarkeit ab der letzten Änderung; gemerkte Hinweise zeigen den Tag der ersten Meldung',
            children: (
                <div className="flex flex-wrap gap-1">
                    {(['window', 'battery', 'unreach'] as CategoryKey[]).map((cat) => {
                        const cur = o.sinceCategories ?? ['window'];
                        const on = cur.includes(cat);
                        const label =
                            cat === 'window' ? 'Fenster & Türen' : cat === 'battery' ? 'Batterien' : 'Erreichbarkeit';
                        return (
                            <button
                                key={cat}
                                onClick={() => {
                                    const next = on ? cur.filter((c) => c !== cat) : [...cur, cat];
                                    // ['window'] is the default — store nothing for it.
                                    set({
                                        sinceCategories: next.length === 1 && next[0] === 'window' ? undefined : next,
                                    });
                                }}
                                className="text-[11px] rounded-full px-2 py-0.5"
                                style={{
                                    background: on ? 'var(--accent)' : 'transparent',
                                    color: on ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            ),
        },
        {
            key: 'showOkCategories',
            label: 'Kategorien ohne Hinweise',
            def: false,
            hint: 'Jede aktive Kategorie mit „ok“-Häkchen, auch wenn nichts anliegt (nur Layout Standard)',
        },
        {
            key: 'showAllClear',
            label: 'Hinweis „Alles in Ordnung“',
            hint: 'Aus: liegt nichts an, bleibt das Widget leer (nur Titel und Zähler)',
            children: (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Text bei {'„Alles in Ordnung“'}
                    </label>
                    <input
                        type="text"
                        value={o.allClearText ?? ''}
                        onChange={(e) => set({ allClearText: e.target.value || undefined })}
                        placeholder="Alles in Ordnung"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            ),
        },
    ];
    // "Alles in Ordnung" on is the default and stored as unset, like before.
    const setVisible = (patch: Record<string, unknown>) =>
        set((patch.showAllClear === true ? { showAllClear: undefined } : patch) as Partial<StatusOverviewOptions>);

    // ── Dialog "Statusübersicht konfigurieren" ──────────────────────────────────────────
    const catEnabled = (cat: CategoryKey) => o[CAT_OPTION[cat]] !== false;
    const activeCatCount = CATEGORY_ORDER.filter(catEnabled).length;
    const excludedCount = o.excludeIds?.length ?? 0;
    const openConfig = (tab: StatusTab = 'categories') => setCfgTab(tab);

    /** The Merkliste switch of one category, shown in that category's detail. */
    const latchToggle = (cat: 'battery' | 'unreach' | 'alarm') => {
        const def = LATCH_TOGGLES.find((l) => l.cat === cat)!;
        return (
            <div
                className="space-y-2 pt-2 pb-1.5 -mx-1.5 px-1.5 rounded-md"
                data-latch-toggle={cat}
                style={{ borderTop: '1px solid var(--app-border)' }}
            >
                <label className={labelCls} style={labelStyle}>
                    Merkliste
                </label>
                <Toggle
                    checked={latchOn(cat)}
                    onChange={(v) => set({ [LATCH_KEY[cat]]: v || undefined })}
                    label={def.label}
                />
                {cat === 'battery' && (
                    <div data-track-battery-changes>
                        <Unavailable
                            reason={latchOn('battery') ? 'Die Merkliste dokumentiert die Wechsel schon mit' : undefined}
                        >
                            <Toggle
                                checked={latchOn('battery') || !!o.trackBatteryChanges}
                                onChange={(v) => set({ trackBatteryChanges: v || undefined })}
                                label="Batteriewechsel dokumentieren"
                            />
                        </Unavailable>
                        <p className={hintCls} style={hintStyle}>
                            {'„Gewechselt“'} in jeder Batteriezeile, auch ohne Warnung (vorsorglicher Wechsel) – der
                            Wechsel landet im Verlauf ({'„Zuletzt gewechselt“'}). Braucht den AURA-Adapter.
                        </p>
                    </div>
                )}
                {cat === 'battery' && latchOn('battery') && (
                    <>
                        <Toggle
                            checked={!!o.latchAutoClose}
                            onChange={(v) => set({ latchAutoClose: v || undefined })}
                            label="Batterie automatisch schließen, wenn die Spannung deutlich steigt"
                        />
                        <p className={hintCls} style={hintStyle}>
                            Mit OPERATING_VOLTAGE: mindestens 0,3 V und 25 % über dem tiefsten Wert. Mit Prozentwert:
                            mindestens 40 % und 30 Punkte darüber.
                        </p>
                    </>
                )}
            </div>
        );
    };

    /** "Zusätzliche … Datenpunkte": ids or /regex/ that join a category whatever their role. */
    const patternField = (p: {
        attr: Record<string, string>;
        label: string;
        value: string;
        onChange: (next: string) => void;
        placeholder: string;
        hint?: string;
    }) => (
        <div {...p.attr}>
            <label className={labelCls} style={labelStyle}>
                {p.label}
            </label>
            <div className="flex gap-1.5">
                <input
                    type="text"
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    placeholder={p.placeholder}
                    className={`${inputCls} flex-1 min-w-0`}
                    style={inputStyle}
                />
                <button
                    type="button"
                    data-extra-pick
                    onClick={() => setPickExtra({ value: p.value, apply: p.onChange })}
                    title="Einzelne Datenpunkte auswählen und anhängen"
                    className="shrink-0 flex items-center gap-1 text-xs rounded-lg px-2.5 hover:opacity-80"
                    style={{ border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
                >
                    <Plus size={12} />
                    Datenpunkt
                </button>
            </div>
            {p.hint && (
                <p className={`${hintCls} mt-1`} style={hintStyle}>
                    {p.hint}
                </p>
            )}
        </div>
    );

    /** "Zusätzliche … Datenpunkte": ids or /regex/ that join a category whatever their role. */
    const extraField = (
        key: 'batteryExtraPatterns' | 'alarmExtraPatterns' | 'windowExtraPatterns' | 'lightExtraPatterns',
        label: string,
        placeholder: string,
        hint: string,
        attr: Record<string, string> = {},
    ) =>
        patternField({
            attr: { 'data-extra-patterns': key, ...attr },
            label: `${label} (Muster, Text oder /regex/)`,
            value: o[key] ?? '',
            onChange: (v) => set({ [key]: v || undefined }),
            placeholder,
            hint,
        });

    const catBody = (cat: CategoryKey, goTo: (key: string) => void) => {
        switch (cat) {
            case 'window':
                return (
                    <>
                        <CatColor cat="window" />
                        {extraField(
                            'windowExtraPatterns',
                            'Zusätzliche Fenster- und Tür-Datenpunkte',
                            'mqtt.0.shelly., /.contact$/',
                            'Für Kontakte ohne Fenster-Rolle, z. B. über MQTT gespiegelte Geräte. Kommagetrennt; jeder Treffer zählt als Fenster/Tür: true, 1 oder „open“ = offen, 2 bzw. „tilted“ = gekippt.',
                        )}
                    </>
                );
            case 'battery':
                return (
                    <>
                        <CatColor cat="battery" />
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Berücksichtigte Datenpunkte
                            </label>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                {BATTERY_KINDS.map((k) => (
                                    <Toggle
                                        key={k}
                                        checked={batteryKinds.includes(k)}
                                        onChange={(v) => {
                                            const next = BATTERY_KINDS.filter((x) =>
                                                x === k ? v : batteryKinds.includes(x),
                                            );
                                            const isDefault =
                                                next.length === DEFAULT_BATTERY_KINDS.length &&
                                                next.every((x) => DEFAULT_BATTERY_KINDS.includes(x));
                                            set({ batteryKinds: isDefault ? undefined : next });
                                        }}
                                        label={BATTERY_KIND_LABELS[k]}
                                    />
                                ))}
                            </div>
                            <p className={hintCls} style={hintStyle}>
                                Hat ein Gerät mehrere, zählt Prozent vor Spannung und Spannung vor LOWBAT.
                            </p>
                        </div>
                        <Unavailable
                            reason={batteryKinds.includes('bool') ? undefined : 'Nur mit booleschen Datenpunkten'}
                        >
                            <Toggle
                                checked={o.includeLowbatBoolean !== false}
                                onChange={(v) => set({ includeLowbatBoolean: v })}
                                label="Auch LOWBAT-Datenpunkte ohne Batterie-Rolle (nach Name)"
                            />
                        </Unavailable>
                        {extraField(
                            'batteryExtraPatterns',
                            'Zusätzliche Batterie-Datenpunkte',
                            'mqtt.0.shelly., /.battery$/',
                            'Für Datenpunkte ohne Batterie-Rolle, z. B. über MQTT gespiegelte Geräte. Kommagetrennt; jeder Treffer zählt als Batterie: Zahl oder Text = Ladestand in %, boolesch = LOWBAT (true = schwach). Muster möglichst genau fassen, sonst landen z. B. Hausspeicher mit in der Liste.',
                            { 'data-battery-extra': '' },
                        )}
                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
                                <Unavailable
                                    reason={
                                        batteryKinds.includes('percent') ? undefined : 'Nur mit Prozent-Datenpunkten'
                                    }
                                >
                                    <label className={labelCls} style={labelStyle}>
                                        Warnschwelle (%)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={o.batteryThreshold ?? 20}
                                        onChange={(e) =>
                                            set({
                                                batteryThreshold: e.target.value ? Number(e.target.value) : undefined,
                                            })
                                        }
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                </Unavailable>
                            </div>
                            <div className="flex-1">
                                <Unavailable reason={hasVoltKind ? undefined : 'Nur mit Spannungs-Datenpunkten'}>
                                    <label className={labelCls} style={labelStyle}>
                                        Warnschwelle (V)
                                    </label>
                                    <input
                                        type="number"
                                        min={0.1}
                                        max={60}
                                        step={0.05}
                                        value={o.batteryVoltThreshold ?? DEFAULT_BATTERY_VOLT_THRESHOLD}
                                        onChange={(e) =>
                                            set({
                                                batteryVoltThreshold: e.target.value
                                                    ? Number(e.target.value)
                                                    : undefined,
                                            })
                                        }
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                </Unavailable>
                            </div>
                            <div className="flex-1">
                                <Unavailable reason={hasVoltKind ? undefined : 'Nur mit Spannungs-Datenpunkten'}>
                                    <label
                                        className={labelCls}
                                        style={labelStyle}
                                        title="Für Geräte mit nur einer 1,5-V-Zelle (1× AA/AAA), erkannt über den Batterietyp bzw. die manuelle Zuordnung"
                                    >
                                        Schwelle 1× 1,5 V
                                    </label>
                                    <input
                                        type="number"
                                        min={0.1}
                                        max={1.6}
                                        step={0.05}
                                        value={o.batteryVoltThreshold1Cell ?? DEFAULT_BATTERY_VOLT_THRESHOLD_1CELL}
                                        onChange={(e) =>
                                            set({
                                                batteryVoltThreshold1Cell: e.target.value
                                                    ? Number(e.target.value)
                                                    : undefined,
                                            })
                                        }
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                </Unavailable>
                            </div>
                        </div>
                        {hasVoltKind && (
                            <p className={hintCls} style={hintStyle}>
                                Geräte mit nur einer 1,5-V-Zelle (1× AA/AAA laut Batterietyp oder manueller Zuordnung)
                                nutzen die Schwelle „1× 1,5 V“.
                            </p>
                        )}
                        <Toggle
                            checked={o.batteryTypeEnabled !== false}
                            onChange={(v) => set({ batteryTypeEnabled: v ? undefined : false })}
                            label="Batterietyp & Anzahl anzeigen"
                        />
                        <p className={hintCls} style={hintStyle}>
                            Typen werden automatisch erkannt (falls bekannt). Nicht erkannte Geräte manuell zuordnen:
                        </p>
                        <button onClick={() => goTo('batteries')} className={jumpBtnCls} style={jumpBtnStyle}>
                            Batterietypen zuordnen →
                        </button>
                        {latchToggle('battery')}
                    </>
                );
            case 'light':
                return (
                    <>
                        <CatColor cat="light" />
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Welche Schalter zählen als Licht?
                            </label>
                            <select
                                value={lightScope}
                                onChange={(e) => set({ lightRoleScope: e.target.value as 'light' | 'all' })}
                                className={inputCls}
                                style={inputStyle}
                            >
                                <option value="light">Nur Lichter (Rolle switch.light)</option>
                                <option value="all">Alle Schalter (switch, switch.power)</option>
                            </select>
                        </div>
                        <Unavailable reason={lightScope === 'all' ? undefined : 'Nur bei „Alle Schalter“'}>
                            <Toggle
                                checked={!!o.lightsOnlyFunction}
                                onChange={(v) => set({ lightsOnlyFunction: v })}
                                label={'Nur Schalter in Funktion „Licht“'}
                            />
                        </Unavailable>
                        <Toggle
                            checked={o.lightIncludeDimmers !== false}
                            onChange={(v) => set({ lightIncludeDimmers: v })}
                            label={'Dimmer in Funktion „Licht“ mitzählen (an ab 1 %, mit Helligkeit)'}
                        />
                        {extraField(
                            'lightExtraPatterns',
                            'Zusätzliche Licht-Datenpunkte',
                            'mqtt.0.shelly., /.light.0.on$/',
                            'Für Lampen ohne Licht-Rolle, z. B. über MQTT gespiegelte Geräte oder Steckdosen mit Stehlampe. Kommagetrennt; jeder Treffer zählt als Licht: boolesch = an/aus, Zahl = Helligkeit (an ab 1 %).',
                        )}
                    </>
                );
            case 'alarm':
                return (
                    <>
                        <CatColor cat="alarm" />
                        {extraField(
                            'alarmExtraPatterns',
                            'Zusätzliche Alarm-Datenpunkte',
                            '/.sensor.flood$/',
                            'Für Rauch- oder Wassermelder ohne Alarm-Rolle, z. B. über MQTT gespiegelte Geräte. Kommagetrennt; jeder Treffer zählt als Alarm, ausgelöst bei true bzw. 1.',
                        )}
                        {latchToggle('alarm')}
                    </>
                );
            case 'unreach':
                return (
                    <>
                        <CatColor cat="unreach" />
                        <p className={hintCls} style={hintStyle}>
                            UNREACH/offline/reachable/connected werden automatisch erkannt (STICKY_UNREACH wird
                            ignoriert). Nur für Sonderfälle: zusätzliche Offline-Datenpunkte.
                        </p>
                        {patternField({
                            attr: { 'data-extra-patterns': 'offlineExtraPatterns' },
                            label: 'Zusätzliche Offline-Datenpunkte (Muster, Text oder /regex/) · gilt für alle Widgets',
                            value: offlineExtraPatterns,
                            onChange: (v) => updateFrontend({ offlineExtraPatterns: v }),
                            placeholder: '.UNREACHABLE, /\\.offline$/',
                        })}
                        <Toggle
                            checked={offlineInvert}
                            onChange={(v) => updateFrontend({ offlineInvert: v })}
                            label="Bei diesen Mustern bedeutet FALSE = offline (gilt für alle Widgets)"
                        />
                        {latchToggle('unreach')}
                    </>
                );
        }
    };

    const categoriesTab = (goTo: (key: string) => void) => (
        <div className="flex flex-wrap gap-3 items-start">
            <div className="w-[230px] max-w-full shrink-0 space-y-1" data-status-cat-list>
                {CATEGORY_ORDER.map((cat) => {
                    const on = catEnabled(cat);
                    const sel = cat === selCat;
                    return (
                        <div
                            key={cat}
                            data-status-cat={cat}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                            style={{
                                background: sel ? 'var(--accent)' : 'var(--app-bg)',
                                border: `1px solid ${sel ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{
                                    background: o.categoryColors?.[cat] || DEFAULT_CAT_HEX[cat],
                                    opacity: on ? 1 : 0.35,
                                    boxShadow: sel ? '0 0 0 1px #fff' : undefined,
                                }}
                            />
                            <button
                                onClick={() => setSelCat(cat)}
                                className="flex-1 min-w-0 text-left text-xs truncate"
                                style={{ color: sel ? '#fff' : 'var(--text-primary)', opacity: on || sel ? 1 : 0.6 }}
                            >
                                {CAT_LABEL[cat]}
                            </button>
                            <Switch
                                checked={on}
                                onChange={(v) => set({ [CAT_OPTION[cat]]: v })}
                                label={`${CAT_LABEL[cat]} ${on ? 'ausschalten' : 'einschalten'}`}
                                onAccent={sel}
                            />
                        </div>
                    );
                })}
            </div>
            <div
                className="flex-1 min-w-[280px] rounded-lg p-3 space-y-2.5"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                data-status-cat-detail={selCat}
            >
                {/* Switched in the list on the left - here only the name, no second switch. */}
                <h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {CAT_LABEL[selCat]}
                </h3>
                <Unavailable reason={catEnabled(selCat) ? undefined : 'Kategorie ist ausgeschaltet'}>
                    <div className="space-y-2.5" style={catEnabled(selCat) ? undefined : { pointerEvents: 'none' }}>
                        {catBody(selCat, goTo)}
                    </div>
                </Unavailable>
            </div>
        </div>
    );

    const anyLatch = LATCH_TOGGLES.some(({ cat }) => catOn(cat) && latchOn(cat));
    const merklisteTab = (goTo: (key: string) => void) => (
        <div className="space-y-2.5 aura-status-merkliste">
            <p className={hintCls} style={hintStyle}>
                Ein Hinweis bleibt stehen, bis er erledigt ist – auch wenn das Gerät zwischendurch wieder {'„ok“'}{' '}
                meldet: eine Batterie, deren LOWBAT bei Kälte kurz auf true springt, ein Gerät, das nachts kurz weg war,
                ein Rauchmelder, der ausgelöst hat. Geschlossen wird mit {'„Gewechselt“'} bzw. {'„Quittieren“'} in der
                Zeile, {'„Später“'} stellt zurück. Meldet das Gerät zurzeit nichts, entfernt {'„Verwerfen“'} einen
                veralteten Hinweis ohne Eintrag im Verlauf. Der Adapter führt die Liste für alle Geräte.
            </p>
            <SubGroup title="Gemerkt wird" count={latchSummary}>
                <div className="flex flex-wrap gap-1.5" data-latch-summary>
                    {LATCH_TOGGLES.map(({ cat, short }) => {
                        const on = catOn(cat) && latchOn(cat);
                        return (
                            <button
                                key={cat}
                                data-latch-jump={cat}
                                onClick={() => {
                                    setSelCat(cat);
                                    goTo('categories');
                                    setLatchFlash((f) => ({ cat, n: (f?.n ?? 0) + 1 }));
                                }}
                                className="text-[11px] rounded-full px-2 py-0.5"
                                title={catOn(cat) ? 'In der Kategorie einstellen' : 'Kategorie ist ausgeschaltet'}
                                style={{
                                    background: on ? 'var(--accent)' : 'transparent',
                                    color: on ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                    opacity: catOn(cat) ? 1 : 0.5,
                                }}
                            >
                                {short}: {on ? 'an' : 'aus'} →
                            </button>
                        );
                    })}
                </div>
                <p className={hintCls} style={hintStyle}>
                    Ein- und ausgeschaltet wird die Merkliste in der jeweiligen Kategorie.
                </p>
            </SubGroup>
            <SubGroup title="Gemeinsame Einstellungen">
                <Unavailable reason={anyLatch ? undefined : 'Erst in einer Kategorie die Merkliste einschalten'}>
                    <div className="space-y-2" style={anyLatch ? undefined : { pointerEvents: 'none' }}>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className={labelCls} style={labelStyle}>
                                    {'„Später“'} stellt zurück um (Tage)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={o.latchSnoozeDays ?? 2}
                                    onChange={(e) =>
                                        set({ latchSnoozeDays: e.target.value ? Number(e.target.value) : undefined })
                                    }
                                    className={inputCls}
                                    style={inputStyle}
                                />
                            </div>
                            <div className="flex-1">
                                <label className={labelCls} style={labelStyle}>
                                    Nachkontrolle nach Schließen (Tage)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={90}
                                    value={o.latchRecheckDays ?? 7}
                                    onChange={(e) =>
                                        set({
                                            latchRecheckDays:
                                                e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                    className={inputCls}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                        <p className={hintCls} style={hintStyle}>
                            Meldet ein Gerät in der Nachkontrolle erneut, öffnet sich der Eintrag wieder (
                            {'„trotz Wechsel am …“'}). Es zählt nur eine Meldung, die mindestens 10 Minuten nach dem
                            Schließen kommt.
                        </p>
                        <Toggle
                            checked={o.latchConfirm !== false}
                            onChange={(v) => set({ latchConfirm: v ? undefined : false })}
                            label="Vor „Gewechselt“/„Quittieren“ zweimal tippen"
                        />
                    </div>
                </Unavailable>
            </SubGroup>
            <SubGroup title="Ignorieren">
                <div className="space-y-2" data-ignore-settings>
                    <Toggle
                        checked={!!o.latchIgnore}
                        onChange={(v) => set({ latchIgnore: v || undefined })}
                        label="Knopf „Ignorieren“ in der Zeile"
                    />
                    <p className={hintCls} style={hintStyle}>
                        Für Fehlalarme, die nie von selbst verschwinden (z. B. eine leere Wallbox mit 0 %). Der Adapter
                        merkt den Datenpunkt nie mehr, und keine Statusübersicht zeigt ihn – fragt vorher nach. Wirkt
                        auch ohne Merkliste.
                    </p>
                    <Toggle
                        checked={!!o.showIgnored}
                        onChange={(v) => set({ showIgnored: v || undefined })}
                        label="Ignorierte anzeigen (mit „Aufnehmen“)"
                    />
                </div>
            </SubGroup>
            <SubGroup title="Farbe der Knöpfe (Text und Rahmen)">
                <div className="flex flex-wrap gap-4" data-latch-action-colors>
                    {LATCH_ACTION_COLOR_FIELDS.map(({ key, label, fallback }) => {
                        const custom = o.latchActionColors?.[key];
                        return (
                            <div key={key}>
                                <span className="block text-[11px] mb-0.5" style={labelStyle}>
                                    {label}
                                </span>
                                <div className="flex items-center gap-2">
                                    <ColorPicker
                                        value={custom || fallback}
                                        onChange={(v) => setLatchActionColor(key, v)}
                                        className="w-8 h-7 rounded cursor-pointer p-0.5"
                                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                    />
                                    {custom ? (
                                        <button
                                            onClick={() => setLatchActionColor(key, null)}
                                            className="text-[11px] hover:opacity-80"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            ↩ Standard
                                        </button>
                                    ) : (
                                        <span
                                            className="text-[11px]"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            Standard
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SubGroup>
        </div>
    );

    const filterField = (
        key: 'filterRooms' | 'filterFuncs' | 'filterAdapters' | 'excludeIdPatterns',
        label: string,
        placeholder: string,
    ) => (
        <div>
            <label className={labelCls} style={labelStyle}>
                {label}
            </label>
            <input
                type="text"
                value={o[key] ?? ''}
                onChange={(e) => set({ [key]: e.target.value || undefined })}
                placeholder={placeholder}
                className={inputCls}
                style={inputStyle}
            />
        </div>
    );
    const datapointsTab = (
        <>
            <SubGroup title="Einschränkung (optional)">
                <div className="grid gap-2 sm:grid-cols-2">
                    {filterField('filterRooms', 'Räume (Komma-getrennt, leer = alle)', 'z. B. Wohnzimmer, Küche')}
                    {filterField('filterFuncs', 'Funktionen (Komma-getrennt)', 'z. B. Licht, Fenster')}
                    {filterField(
                        'filterAdapters',
                        'Nur diese Adapter (Komma-getrennt, leer = alle)',
                        'zigbee.0, hm-rpc.0',
                    )}
                    {filterField(
                        'excludeIdPatterns',
                        'Ausschluss-Muster (Text oder /regex/, z. B. homee.0. blendet einen Adapter aus)',
                        'homee.0., .info., _REMOTE_',
                    )}
                </div>
            </SubGroup>
            <SubGroup title="Erkannte Datenpunkte" count={excludedCount ? `${excludedCount} ausgeblendet` : undefined}>
                <p className={hintCls} style={hintStyle}>
                    Alle gefundenen Datenpunkte mit Haken; doppelte über Alias und Original werden markiert.
                </p>
                <StatusDatapointsEditor
                    found={found}
                    excludeIds={o.excludeIds}
                    onChange={(v) => set({ excludeIds: v })}
                />
            </SubGroup>
        </>
    );

    const rowsTab = (
        <SubGroup title="Zeilenaufbau" className="aura-status-rowparts">
            <StatusRowPartsEditor opts={o} layout={config.layout ?? 'default'} set={set} />
        </SubGroup>
    );

    const actionsTab = (
        <>
            <SubGroup
                title="Zeilen-Aktionen"
                count={rowActionCount ? `${rowActionCount} ${rowActionCount === 1 ? 'Knopf' : 'Knöpfe'}` : 'keine'}
                className="aura-status-row-actions"
            >
                <p className={hintCls} style={hintStyle}>
                    Eigene Knöpfe am Zeilenende (Layouts Standard und Kompakt), die einen Wert in einen Datenpunkt
                    schreiben – z. B. {'„Aus“'} bei einem eingeschalteten Licht oder eine Meldung an ein Skript.
                    Unabhängig von der Merkliste.
                </p>
                <StatusRowActionsEditor actions={o.rowActions ?? []} onChange={(v) => set({ rowActions: v })} />
            </SubGroup>
            <SubGroup title="Klick auf Zeile" className="aura-status-row-click">
                <RowClickSection config={config} opts={o} onChange={set} bare />
            </SubGroup>
        </>
    );

    // Three ways to change a name, laid out general → specific with one shared preview on top.
    const ruleCount = o.nameFilters?.length ?? 0;
    const detectedNames = Object.fromEntries(samples.map((s) => [s.id, s.name]));
    const namesTab = (
        <>
            <div
                className="rounded-lg p-2.5 space-y-1.5"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            >
                <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold" style={labelStyle}>
                    <span>Erkannt</span>
                    <span>Angezeigt</span>
                </div>
                <NamePreview
                    samples={namedSamples}
                    sampleTotal={sampleTotal}
                    pattern={o.namePattern}
                    rules={o.nameFilters}
                    detected={detectedNames}
                />
            </div>
            <NameStep n={1} title="Aufbau" text="Setzt den Namen aus Platzhaltern zusammen. Gilt für alle Geräte.">
                <NamePatternField pattern={o.namePattern} onChange={set} />
            </NameStep>
            <NameStep
                n={2}
                title="Bereinigen"
                count={ruleCount ? `${ruleCount} ${ruleCount === 1 ? 'Regel' : 'Regeln'}` : 'keine Regeln'}
                text="Schneidet die Texte der Platzhalter zurecht, z. B. „:1“ weg oder „ACTUAL_TEMPERATURE“ → „Temperatur“. Gilt für alle Geräte."
                foldable
                defaultOpen={ruleCount > 0}
            >
                <Suspense
                    fallback={
                        <div className="text-xs" style={labelStyle}>
                            Lädt …
                        </div>
                    }
                >
                    <NameFilterEditor
                        rules={o.nameFilters ?? []}
                        pattern={o.namePattern}
                        samples={namedSamples}
                        sampleTotal={sampleTotal}
                        onChange={(next) => set({ nameFilters: next.length ? next : undefined })}
                        hidePreview
                    />
                </Suspense>
            </NameStep>
            <NameStep
                n={3}
                title="Ausnahmen"
                count={namedCount ? `${namedCount} ${namedCount === 1 ? 'Gerät' : 'Geräte'}` : undefined}
                text="Eigener Name für einzelne Geräte. Er tritt an die Stelle des erkannten Gerätenamens – Aufbau und Bereinigen gelten auch für ihn. Gilt für alle Zeilen des Geräts (Batterie, Fenster, offline)."
            >
                <DeviceNamesEditor devices={devices} names={o.deviceNames} onChange={(v) => set({ deviceNames: v })} />
            </NameStep>
        </>
    );

    const tabs: TabbedConfigTab[] = [
        { key: 'categories', label: `Kategorien (${activeCatCount})`, node: categoriesTab },
        { key: 'datapoints', label: 'Datenpunkte', node: datapointsTab },
        { key: 'latch', label: 'Merkliste', node: merklisteTab },
        { key: 'rows', label: 'Zeilenaufbau', node: rowsTab },
        {
            key: 'actions',
            label: rowActionCount ? `Zeilen-Aktionen (${rowActionCount})` : 'Zeilen-Aktionen',
            node: actionsTab,
        },
        { key: 'names', label: 'Namen', node: namesTab },
    ];
    if (o.catBattery !== false)
        tabs.push({
            key: 'batteries',
            label: 'Batterietypen',
            node: (
                <Suspense
                    fallback={
                        <div className="p-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Lädt …
                        </div>
                    }
                >
                    <AdminBatteries />
                </Suspense>
            ),
        });

    const cfgSummary = [
        `${activeCatCount} von ${CATEGORY_ORDER.length} Kategorien`,
        excludedCount ? `${excludedCount} ausgeblendet` : null,
        `Merkliste ${latchSummary}`,
        rowActionCount ? `${rowActionCount} ${rowActionCount === 1 ? 'Knopf' : 'Knöpfe'}` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="space-y-2.5">
            {pickExtra && (
                <DatapointPicker
                    currentValue=""
                    multiSelect
                    onMultiSelect={(picks) => {
                        pickExtra.apply(
                            appendPatternIds(
                                pickExtra.value,
                                picks.map((d) => d.id),
                            ),
                        );
                        setPickExtra(null);
                    }}
                    onSelect={(id) => {
                        pickExtra.apply(appendPatternIds(pickExtra.value, [id]));
                        setPickExtra(null);
                    }}
                    onClose={() => setPickExtra(null)}
                />
            )}
            <VisibleFieldsSection fields={visibleFields} values={o as Record<string, unknown>} onChange={setVisible} />
            <ConfigSection title={t('cfg.section.settings')} sectionKey="settings">
                <div>
                    <button
                        ref={cfgBtnRef}
                        onClick={() => openConfig()}
                        data-status-config-open
                        className="w-full flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <SlidersHorizontal size={13} /> Statusübersicht konfigurieren
                    </button>
                    <p className={`${hintCls} mt-1`} style={hintStyle} data-status-config-summary>
                        {cfgSummary}
                    </p>
                    <p className={`${hintCls} mt-1`} style={hintStyle}>
                        Kategorien, Datenpunkte, Merkliste, Zeilen und Gerätenamen.
                    </p>
                </div>
                <SubGroup title="Veröffentlichen">
                    <PublishSection widgetId={config.id} opts={o} setOpts={set} kind="status" />
                </SubGroup>
            </ConfigSection>
            <ConfigSection title={t('cfg.section.look')} sectionKey="look">
                <div className="space-y-2 mt-2">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Textausrichtung
                        </label>
                        <select
                            value={o.contentAlign ?? 'left'}
                            onChange={(e) =>
                                set({
                                    contentAlign:
                                        e.target.value === 'left' ? undefined : (e.target.value as 'center' | 'right'),
                                })
                            }
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="left">Linksbündig</option>
                            <option value="center">Mittig</option>
                            <option value="right">Rechtsbündig</option>
                        </select>
                    </div>
                    {config.layout === 'card' && (
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Kartengröße (min. Breite in px)
                            </label>
                            <input
                                type="number"
                                min={60}
                                max={400}
                                step={10}
                                value={o.cardMinWidth ?? 96}
                                onChange={(e) =>
                                    set({ cardMinWidth: e.target.value ? Number(e.target.value) : undefined })
                                }
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    )}
                    {config.layout === 'card' && (
                        <div data-card-text-wrap>
                            <Toggle
                                checked={o.cardTextWrap === true}
                                onChange={(v) => set({ cardTextWrap: v || undefined })}
                                label="Lange Werte umbrechen (statt mit „…“ abzuschneiden)"
                            />
                        </div>
                    )}
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Welche Geräte anzeigen
                        </label>
                        <select
                            value={o.valueFilter ?? 'alerts'}
                            onChange={(e) => set({ valueFilter: e.target.value as 'alerts' | 'all' })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="alerts">Nur Auffällige (z. B. schwache Batterie)</option>
                            <option value="all">Alle gefundenen Geräte</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Höchstzahl angezeigter Zeilen (0 = alle)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={o.maxRows ?? 0}
                            onChange={(e) => set({ maxRows: Number(e.target.value) || undefined })}
                            className={inputCls}
                            style={inputStyle}
                        />
                        <p className={`${hintCls} mt-1`} style={hintStyle}>
                            Die Zeilen entstehen erst zur Laufzeit, die Höhe ist damit nicht planbar. Mit einer
                            Obergrenze passt das Widget verlässlich auf den Bildschirm; die Sortierung entscheidet,
                            welche Zeilen bleiben.
                        </p>
                    </div>
                    {config.layout === 'history' && (
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Nur Wechsel der letzten … Tage (0 = alle)
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={3650}
                                step={1}
                                value={o.maxAgeDays ?? 0}
                                onChange={(e) => set({ maxAgeDays: Number(e.target.value) || undefined })}
                                className={inputCls}
                                style={inputStyle}
                            />
                            <p className={`${hintCls} mt-1`} style={hintStyle}>
                                „Zuletzt gewechselt“ liest den Verlauf des Adapters (aura.0.status.battery.history). Die
                                Merkliste-Optionen gehören an die Live-Übersicht daneben, nicht hierher.
                            </p>
                        </div>
                    )}
                    {config.layout !== 'history' && (
                        <Unavailable
                            reason={
                                ['count', 'compact', 'card', 'minimal'].includes(config.layout ?? 'default')
                                    ? 'Nur in den Layouts mit Kategorie-Überschriften: Standard, Zweizeilig und Tabelle (ab zwei Kategorien).'
                                    : undefined
                            }
                        >
                            <label className={labelCls} style={labelStyle}>
                                Zahl in der Kategorie-Überschrift
                            </label>
                            <select
                                value={o.categoryCount ?? 'hints'}
                                onChange={(e) =>
                                    set({
                                        categoryCount:
                                            e.target.value === 'hints'
                                                ? undefined
                                                : (e.target.value as 'devices' | 'both'),
                                    })
                                }
                                className={inputCls}
                                style={inputStyle}
                                data-status-category-count
                            >
                                <option value="hints">Hinweise</option>
                                <option value="devices">Geräte gesamt</option>
                                <option value="both">Hinweise / Geräte</option>
                            </select>
                            <p className={`${hintCls} mt-1`} style={hintStyle}>
                                „Batterien 3 / 10“: 3 Hinweise von 10 Geräten. Alle Zahlen gibt es auch als Wert für die
                                Kopfzeile (Kopfzeile → Quelle „Widget-Wert“ oder Text mit {'{hints}'}, {'{devices}'},{' '}
                                {'{battery_hints}'} …).
                            </p>
                        </Unavailable>
                    )}
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Sortierung
                        </label>
                        <select
                            value={o.sortBy ?? 'severity'}
                            onChange={(e) => set({ sortBy: e.target.value as 'severity' | 'room' })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="severity">Nach Dringlichkeit</option>
                            <option value="room">Nach Raum</option>
                        </select>
                        <p className={`${hintCls} mt-1`} style={hintStyle}>
                            Dringlichkeit: kritisch zuerst (offene Fenster, Rauch/Wasser), dann Warnungen (schwache
                            Batterien, Lichter, offline), dann OK.
                        </p>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Danach sortieren
                        </label>
                        <select
                            value={o.sortThen && o.sortThen !== (o.sortBy ?? 'severity') ? o.sortThen : 'name'}
                            onChange={(e) => set({ sortThen: e.target.value as StatusSortThen })}
                            className={inputCls}
                            style={inputStyle}
                            data-status-sort-then
                        >
                            <option value="name">Nach Name</option>
                            {(o.sortBy ?? 'severity') !== 'room' && <option value="room">Nach Raum</option>}
                            {o.sortBy === 'room' && <option value="severity">Nach Dringlichkeit</option>}
                        </select>
                        <p className={`${hintCls} mt-1`} style={hintStyle}>
                            Reihenfolge bei Gleichstand der ersten Regel, z. B. Dringlichkeit, dann Raum. Zuletzt
                            entscheidet immer der Name.
                        </p>
                    </div>
                    <button onClick={() => openConfig('rows')} className={jumpBtnCls} style={jumpBtnStyle}>
                        Zeilenaufbau →
                    </button>
                    <button
                        onClick={() => openConfig('actions')}
                        className={`${jumpBtnCls} ml-1.5`}
                        style={jumpBtnStyle}
                    >
                        Zeilen-Aktionen →
                    </button>
                    <button onClick={() => openConfig('names')} className={`${jumpBtnCls} ml-1.5`} style={jumpBtnStyle}>
                        Gerätenamen{namedCount ? ` (${namedCount})` : ''} →
                    </button>
                </div>
            </ConfigSection>

            {cfgTab && (
                <TabbedConfigModal
                    title="Statusübersicht konfigurieren"
                    storageKey="aura-status-config-modal"
                    tabs={tabs}
                    active={tabs.some((tb) => tb.key === cfgTab) ? cfgTab : 'categories'}
                    onActiveChange={(k) => setCfgTab(k as StatusTab)}
                    onClose={() => {
                        setCfgTab(null);
                        // The dialog portals out of the panel - hand the focus back to the trigger.
                        cfgBtnRef.current?.focus();
                    }}
                />
            )}
        </div>
    );
}
