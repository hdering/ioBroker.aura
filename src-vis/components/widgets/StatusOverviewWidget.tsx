import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ShieldCheck,
    TriangleAlert,
    BatteryLow,
    DoorOpen,
    Lightbulb,
    WifiOff,
    Siren,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { useIoBroker, setStateDirect, setStateDirectAsync, getStateDirect } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import { useT } from '../../i18n';
import { ensureDatapointCache, type DatapointEntry } from '../../hooks/useDatapointList';
import { useConfigStore } from '../../store/configStore';
import { useContentAutoHeight } from '../../hooks/useContentAutoHeight';
import {
    loadDeviceModelIndex,
    loadBatteryLibrary,
    resolveBatteryType,
    resolveDeviceIdForDp,
    type BatteryResolution,
} from '../../utils/batteryLibrary';

const EMPTY_HIDDEN: string[] = [];
import {
    categoryOf,
    collectHmBatterySerials,
    passesScope,
    evaluateItem,
    compareItems,
    isStatusLoading,
    CATEGORY_ORDER,
    SEVERITY_COLOR,
    LATCH_CATEGORIES,
    latchEnabled,
    latchKind,
    findBatteryLevelDp,
    parseLatchList,
    applyLatch,
    countsAsHint,
    latchFacts,
    hashString,
    actionsFor,
    fillRowTemplate,
    typedActionValue,
    deviceIdFallback,
    type CategoryKey,
    type LatchEntry,
    type LatchWatch,
    type StatusItem,
    type StatusOverviewOptions,
    type StatusRowAction,
} from '../../utils/statusOverview';
import { formatItemName, finishItemName, hasLiveToken } from '../../utils/nameFilter';
import { useDpTokenResolver } from './DynamicTitle';
import { useRowPopup } from '../../hooks/useRowPopup';

/** Per-category icon + label used in section headers and rows. */
const CATEGORY_META: Record<CategoryKey, { Icon: LucideIcon; label: string }> = {
    alarm: { Icon: Siren, label: 'Rauch & Wasser' },
    window: { Icon: DoorOpen, label: 'Fenster & Türen' },
    unreach: { Icon: WifiOff, label: 'Nicht erreichbar' },
    battery: { Icon: BatteryLow, label: 'Batterien' },
    light: { Icon: Lightbulb, label: 'Lichter' },
};

/** Compact "how long ago" for open windows, e.g. "gerade", "seit 5 min", "seit 2 h". */
function formatSince(lc: number): string {
    const sec = Math.round((Date.now() - lc) / 1000);
    if (sec < 60) return 'gerade';
    const min = Math.round(sec / 60);
    if (min < 60) return `seit ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `seit ${h} h`;
    const d = Math.round(h / 24);
    return `seit ${d} d`;
}

/**
 * How long the widget waits for the last datapoint values before it shows what it has.
 * A getState round-trip has no timeout of its own, so a request lost on a dropped socket
 * would otherwise keep the widget spinning forever.
 */
const LOADING_GRACE_MS = 20000;

/** Candidate = a datapoint that structurally belongs to a category; alert state is decided live. */
interface Candidate {
    dp: DatapointEntry;
    cat: CategoryKey;
    /** Voltage/percent datapoint next to a boolean low-battery flag (for the latch's auto-close). */
    level?: { id: string; unit: 'V' | '%' } | null;
}

/** Registrations already sent in this page, per widget+category → hash (no repeat writes). */
const sentRegistrations = new Map<string, string>();
/** A registration older than this is renewed, so the adapter does not age it out. */
const REGISTRATION_REFRESH_MS = 24 * 3600 * 1000;

/** status.<cat>.sources → { [widgetId]: { hash, ts } } (garbage → {}). */
function parseSources(val: unknown): Record<string, { hash?: string; ts?: number }> {
    if (typeof val !== 'string' || !val) return {};
    try {
        const o = JSON.parse(val);
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
        return {};
    }
}

/** How long an armed button waits for the confirming second tap. */
const ARM_MS = 3000;

/**
 * A small button at the end of a row. With `confirm` the first tap only arms it
 * (label turns into "Wirklich?") and a second tap within 3 s runs it — touch-friendly,
 * and no window.confirm, which would block the whole page (and a wall tablet's kiosk).
 */
function RowButton({
    label,
    title,
    confirm,
    confirmLabel,
    color,
    disabled,
    onRun,
}: {
    label: string;
    title?: string;
    confirm?: boolean;
    confirmLabel?: string;
    color: string;
    disabled?: boolean;
    onRun: () => void;
}) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), ARM_MS);
        return () => clearTimeout(t);
    }, [armed]);
    return (
        <button
            type="button"
            className="aura-status-action shrink-0 rounded px-1.5 text-[10px] font-semibold leading-[14px] border transition-colors"
            title={title}
            disabled={disabled}
            style={{
                color: armed ? 'var(--widget-bg, var(--app-surface))' : color,
                background: armed ? color : 'transparent',
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                opacity: disabled ? 0.5 : undefined,
                pointerEvents: disabled ? 'none' : undefined,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                if (confirm && !armed) {
                    setArmed(true);
                    return;
                }
                setArmed(false);
                onRun();
            }}
        >
            {armed ? confirmLabel || 'Wirklich?' : label}
        </button>
    );
}

/** How long an armed button of the two-line row waits for the second tap. */
const ARM_MS_TWO_LINE = 4000;
/** A close that the adapter never answers gives the button back after this. */
const BUSY_MAX_MS = 6000;

/**
 * The touch-sized button of the two-line layout (`twoline`). `tone` 'confirm'
 * is the green "Gewechselt"/"Quittieren"; armed it fills green and asks once more.
 * While the write is out it is disabled and shows "…" — the row then disappears
 * with the adapter's updated list, in every open browser at once.
 */
function TwoLineButton({
    label,
    title,
    confirm,
    confirmLabel,
    tone,
    disabled,
    onRun,
}: {
    label: string;
    title?: string;
    confirm?: boolean;
    confirmLabel?: string;
    tone: 'neutral' | 'confirm';
    disabled?: boolean;
    onRun: () => void | Promise<void>;
}) {
    const [armed, setArmed] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), ARM_MS_TWO_LINE);
        return () => clearTimeout(t);
    }, [armed]);
    useEffect(() => {
        if (!busy) return;
        const t = setTimeout(() => setBusy(false), BUSY_MAX_MS);
        return () => clearTimeout(t);
    }, [busy]);
    const strong = tone === 'confirm' ? 'var(--accent-green, #22c55e)' : 'var(--accent, var(--text-primary))';
    const off = disabled || busy;
    return (
        <button
            type="button"
            className="aura-status-action aura-status-action-lg shrink-0 text-sm leading-tight border transition-colors"
            title={title}
            disabled={off}
            style={{
                padding: '7px 12px',
                minHeight: 32,
                borderRadius: 8,
                fontWeight: tone === 'confirm' ? 600 : 500,
                whiteSpace: 'nowrap',
                color: armed ? '#fff' : tone === 'confirm' ? strong : 'var(--text-primary)',
                background: armed ? strong : 'transparent',
                borderColor: armed || tone === 'confirm' ? strong : 'var(--widget-border)',
                opacity: off ? 0.5 : undefined,
                pointerEvents: off ? 'none' : undefined,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                if (confirm && !armed) {
                    setArmed(true);
                    return;
                }
                setArmed(false);
                const r = onRun();
                if (r && typeof (r as Promise<void>).then === 'function') setBusy(true);
            }}
        >
            {busy ? '…' : armed ? confirmLabel || 'Wirklich?' : label}
        </button>
    );
}

/** "1,2 V" — the remembered level in the German number format. */
function formatLevel(level: number, unit: string): string {
    const n = level.toLocaleString('de-DE', { maximumFractionDigits: unit === '%' ? 0 : 2 });
    return `${n} ${unit}`;
}

/** Line 2 starts with the reading: "Batterie schwach (1,2 V)", "Batterie bei 3 %", "Geöffnet". */
function readingFor(item: StatusItem): string {
    if (item.category !== 'battery' || item.severity === 'ok') return item.label;
    if (/%$/.test(item.label)) return `Batterie bei ${item.label}`;
    const l = item.latch;
    return l?.level !== undefined && l.unit ? `Batterie schwach (${formatLevel(l.level, l.unit)})` : 'Batterie schwach';
}

export function StatusOverviewWidget({ config, editMode }: WidgetProps) {
    const { subscribe, getState } = useIoBroker();
    const overrides = useConfigStore((s) => s.frontend.batteryTypeOverrides);
    const hiddenDevices = useConfigStore((s) => s.frontend.batteryHiddenDevices) ?? EMPTY_HIDDEN;
    // Global reachability escape hatch — merged into the effective options.
    const offlineExtraPatterns = useConfigStore((s) => s.frontend.offlineExtraPatterns);
    const offlineInvert = useConfigStore((s) => s.frontend.offlineInvert);
    const opts = useMemo(
        () => ({ ...((config.options ?? {}) as StatusOverviewOptions), offlineExtraPatterns, offlineInvert }),
        [config.options, offlineExtraPatterns, offlineInvert],
    );
    const layout = config.layout ?? 'default';
    // Row click -> detail popup for that datapoint (issue #524). StatusItem carries no
    // role, so the resolver looks it up in the datapoint cache this widget already loads.
    const rowPopup = useRowPopup(config, opts, editMode);
    const hiddenKey = hiddenDevices.join(',');
    const hiddenSet = useMemo(() => new Set(hiddenDevices), [hiddenKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
    // Discovery finished (the datapoint cache is in) — see the loading block below.
    const [discovered, setDiscovered] = useState(false);
    // Grace period for the outstanding values expired (LOADING_GRACE_MS).
    const [settled, setSettled] = useState(false);
    const [batteryInfo, setBatteryInfo] = useState<
        Record<
            string,
            {
                deviceId: string;
                type: string | null;
                quantity: number;
                deviceName: string;
                source: BatteryResolution['source'];
            }
        >
    >({});

    // ── Discovery ────────────────────────────────────────────────────────────
    // Re-run only when the scope-relevant options change (not on every render).
    const scopeKey = JSON.stringify([
        opts.catBattery,
        opts.catWindow,
        opts.catLight,
        opts.catUnreach,
        opts.catAlarm,
        opts.includeLowbatBoolean,
        opts.lightRoleScope,
        opts.lightsOnlyFunction,
        opts.filterRooms,
        opts.filterFuncs,
        opts.filterAdapters,
        opts.excludeIds,
        opts.excludeIdPatterns,
        opts.offlineExtraPatterns,
        opts.offlineInvert,
        // Only decides whether the voltage neighbours are looked up — unset leaves
        // the key exactly as it was for every existing widget.
        ...(opts.latchBattery ? [true] : []),
    ]);
    useEffect(() => {
        let cancelled = false;
        setDiscovered(false);
        ensureDatapointCache().then((cache) => {
            if (cancelled) return;
            const hmBatterySerials = collectHmBatterySerials(cache);
            const found: Candidate[] = [];
            const wantLevel = latchEnabled(opts, 'battery');
            for (const dp of cache) {
                const cat = categoryOf(dp, opts, hmBatterySerials);
                if (!cat) continue;
                if (!passesScope(dp, opts)) continue;
                found.push({
                    dp,
                    cat,
                    ...(wantLevel && cat === 'battery' ? { level: findBatteryLevelDp(dp, cache) } : {}),
                });
            }
            setCandidates(found);
            setDiscovered(true);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    // ── Live subscriptions on the matched datapoints ───────────────────────────
    const candidateKey = candidates.map((c) => c.dp.id).join(',');
    useEffect(() => {
        if (candidates.length === 0) {
            setStates({});
            return;
        }
        candidates.forEach((c) => getState(c.dp.id).then((s) => setStates((prev) => ({ ...prev, [c.dp.id]: s }))));
        const unsubs = candidates.map((c) =>
            subscribe(c.dp.id, (s) => setStates((prev) => ({ ...prev, [c.dp.id]: s }))),
        );
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidateKey]);

    // Safety valve for the loading state: getState has no timeout of its own, so a
    // reply lost on a flaky connection would leave the widget spinning for good.
    useEffect(() => {
        setSettled(false);
        if (!discovered) return;
        const t = setTimeout(() => setSettled(true), LOADING_GRACE_MS);
        return () => clearTimeout(t);
    }, [discovered, candidateKey]);

    // ── Battery type resolution (device model → library, manual override first) ──
    const batteryCandidates = useMemo(() => candidates.filter((c) => c.cat === 'battery'), [candidates]);
    // Show battery type/quantity next to low batteries by default; opt out with batteryTypeEnabled=false.
    const wantBatteryTypes = opts.batteryTypeEnabled !== false;
    // Device-id resolution is also needed (without the library) when devices are hidden,
    // and for the remembered batteries: the adapter's list and its events name the
    // device ("Garage Oeffner Golf"), not the LOW_BAT datapoint.
    const needBatteryMeta = wantBatteryTypes || hiddenDevices.length > 0 || latchEnabled(opts, 'battery');
    const batteryCandKey = batteryCandidates.map((c) => c.dp.id).join(',');
    const overridesKey = JSON.stringify(overrides ?? {});
    useEffect(() => {
        if (!needBatteryMeta || batteryCandidates.length === 0) {
            setBatteryInfo({});
            return;
        }
        let cancelled = false;
        Promise.all([loadDeviceModelIndex(), wantBatteryTypes ? loadBatteryLibrary() : Promise.resolve(null)]).then(
            ([index, lib]) => {
                if (cancelled) return;
                const info: Record<
                    string,
                    {
                        deviceId: string;
                        type: string | null;
                        quantity: number;
                        deviceName: string;
                        source: BatteryResolution['source'];
                    }
                > = {};
                for (const c of batteryCandidates) {
                    if (lib) {
                        const r = resolveBatteryType(c.dp.id, index, lib, overrides);
                        info[c.dp.id] = {
                            deviceId: r.deviceId,
                            type: r.type,
                            quantity: r.quantity,
                            deviceName: index.get(r.deviceId)?.name || c.dp.name,
                            source: r.source,
                        };
                    } else {
                        const deviceId = resolveDeviceIdForDp(c.dp.id, index);
                        info[c.dp.id] = {
                            deviceId,
                            type: null,
                            quantity: 1,
                            deviceName: index.get(deviceId)?.name || c.dp.name,
                            source: null,
                        };
                    }
                }
                setBatteryInfo(info);
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batteryCandKey, needBatteryMeta, wantBatteryTypes, overridesKey]);

    // ── Remembered hints (latch) ───────────────────────────────────────────────
    // The adapter keeps the entries (lib/statusLatch.js), so every browser shows the
    // same list and a closed entry disappears everywhere at once. Nothing here runs
    // unless latchBattery/latchUnreach/latchAlarm is switched on.
    const latchCats = useMemo(() => LATCH_CATEGORIES.filter((c) => latchEnabled(opts, c)), [opts]);
    const latchCatKey = latchCats.join(',');
    const [latchLists, setLatchLists] = useState<Partial<Record<CategoryKey, Map<string, LatchEntry>>>>({});
    useEffect(() => {
        if (latchCats.length === 0) {
            setLatchLists({});
            return;
        }
        const unsubs = latchCats.map((cat) => {
            const id = `${NS}.status.${cat}.list`;
            const apply = (s: ioBrokerState | null) =>
                setLatchLists((prev) => ({ ...prev, [cat]: parseLatchList(s?.val) }));
            getState(id).then(apply);
            return subscribe(id, apply);
        });
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latchCatKey]);

    // Tell the adapter which datapoints this widget watches, so it remembers them
    // while no browser is open. Sent only when it changed (or once a day, so the
    // adapter does not forget a widget that is still there).
    const prevLatchCats = useRef<string[]>([]);
    const batteryInfoReady = !needBatteryMeta || batteryCandidates.length === 0 || Object.keys(batteryInfo).length > 0;
    useEffect(() => {
        if (!discovered || !batteryInfoReady) return;
        const source = config.id;
        if (!source) return;
        const send = (cat: CategoryKey, watch: LatchWatch[]) => {
            const payload = {
                source,
                cat,
                settings: { recheckDays: opts.latchRecheckDays ?? 7, autoClose: opts.latchAutoClose === true },
                watch,
            };
            const hash = hashString(JSON.stringify(payload));
            const key = `${source}:${cat}`;
            if (sentRegistrations.get(key) === hash) return;
            sentRegistrations.set(key, hash);
            const write = () => setStateDirect(`${NS}.status.register`, JSON.stringify({ ...payload, hash }), false);
            if (watch.length === 0) {
                write();
                return;
            }
            // Another browser (or an earlier visit) may already have sent the same.
            getStateDirect(`${NS}.status.${cat}.sources`)
                .then((s) => {
                    const known = parseSources(s?.val)[source];
                    if (known?.hash === hash && Date.now() - (known.ts ?? 0) < REGISTRATION_REFRESH_MS) return;
                    write();
                })
                .catch(write);
        };
        for (const cat of latchCats) {
            const watch: LatchWatch[] = [];
            for (const c of candidates) {
                if (c.cat !== cat) continue;
                const bi = cat === 'battery' ? batteryInfo[c.dp.id] : undefined;
                if (bi?.deviceId && hiddenSet.has(bi.deviceId)) continue;
                const kind = latchKind(c.dp, cat, opts);
                watch.push({
                    id: c.dp.id,
                    kind,
                    ...(kind === 'pct' ? { threshold: opts.batteryThreshold ?? 20 } : {}),
                    name: bi?.deviceName || c.dp.name,
                    ...(c.dp.rooms[0] ? { room: c.dp.rooms[0] } : {}),
                    ...(c.level ? { levelId: c.level.id, levelUnit: c.level.unit } : {}),
                });
            }
            send(cat, watch);
        }
        // Switched off while this page was open → withdraw the registration.
        for (const cat of prevLatchCats.current) {
            if (!latchCats.includes(cat as CategoryKey)) send(cat as CategoryKey, []);
        }
        prevLatchCats.current = latchCats;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        discovered,
        batteryInfoReady,
        latchCatKey,
        candidateKey,
        batteryInfo,
        hiddenKey,
        opts.batteryThreshold,
        opts.latchRecheckDays,
        opts.latchAutoClose,
        config.id,
    ]);

    // Device ids for the {device}/{serial} placeholders of the row actions. The device
    // index is shared and cached; it is only loaded when a widget has row actions.
    const hasRowActions = (opts.rowActions?.length ?? 0) > 0;
    const [deviceIndex, setDeviceIndex] = useState<Awaited<ReturnType<typeof loadDeviceModelIndex>> | null>(null);
    useEffect(() => {
        if (!hasRowActions) return;
        let cancelled = false;
        loadDeviceModelIndex().then((idx) => {
            if (!cancelled) setDeviceIndex(idx);
        });
        return () => {
            cancelled = true;
        };
    }, [hasRowActions]);

    // ── Evaluate → attention items ─────────────────────────────────────────────
    const sortBy = opts.sortBy ?? 'severity';
    const showAll = opts.valueFilter === 'all';
    const t = useT();
    const allItems = useMemo<StatusItem[]>(() => {
        const out: StatusItem[] = [];
        const now = Date.now();
        for (const c of candidates) {
            const s = states[c.dp.id];
            if (s === undefined) continue; // not loaded yet
            // Hidden battery devices never appear.
            if (c.cat === 'battery') {
                const did = batteryInfo[c.dp.id]?.deviceId;
                if (did && hiddenSet.has(did)) continue;
            }
            const lc = s?.lc && s.lc > 0 ? s.lc : s?.ts;
            const latchList = latchLists[c.cat];
            if (latchList) {
                // The healthy row is needed too: a remembered entry whose datapoint
                // went quiet still shows.
                const live = evaluateItem(c.dp, s?.val ?? null, c.cat, opts, lc, true);
                const item = applyLatch(
                    live,
                    latchList.get(c.dp.id),
                    { id: c.dp.id, name: c.dp.name, room: c.dp.rooms[0], category: c.cat },
                    showAll,
                    now,
                );
                if (item) out.push(item);
                continue;
            }
            const item = evaluateItem(c.dp, s?.val ?? null, c.cat, opts, lc, showAll);
            if (!item) continue;
            out.push(item);
        }
        out.sort((a, b) => compareItems(a, b, sortBy));
        return out;
    }, [candidates, states, opts, sortBy, showAll, batteryInfo, hiddenSet, latchLists]);

    // ── Row cap ────────────────────────────────────────────────────────────────
    // The rows of this widget appear at runtime out of the discovered datapoints,
    // so its height could not be planned at all — on a dashboard that must not
    // scroll it had to be left out. `maxRows` bounds it; what is cut off is said
    // out loud by the "+N weitere" row rather than dropped in silence. The alert
    // count and the all-clear keep looking at ALL items: a chip that counts only
    // the visible slice would hide exactly the problem it exists to report.
    const maxRows = Number.isFinite(opts.maxRows) && (opts.maxRows as number) > 0 ? Math.floor(opts.maxRows!) : 0;
    const items = useMemo(() => (maxRows ? allItems.slice(0, maxRows) : allItems), [allItems, maxRows]);
    const hiddenCount = allItems.length - items.length;
    const moreRow =
        hiddenCount > 0 && opts.showMore !== false ? (
            <p className="shrink-0 pt-1" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {t('calendar.more', { count: hiddenCount })}
            </p>
        ) : null;

    // ── Loading ────────────────────────────────────────────────────────────────
    // Over a slow (external) connection the datapoint discovery and the first value
    // round-trips take a moment. Until they are in, "Alles in Ordnung" would be a lie —
    // the widget says it is still loading and shows the verdict only once the data is in.
    const loadedStates = candidates.reduce((n, c) => (states[c.dp.id] === undefined ? n : n + 1), 0);
    const loading = isStatusLoading({ discovered, settled, loaded: loadedStates, expected: candidates.length });

    // Label pipeline: name pattern (incl. the `{{parent}}` variables) → live `[[dp]]`
    // values. The resolver is a hook, so it has to run above the layout branches below —
    // it collects the raw labels of every item and subscribes to them in one go.
    const rawLabel = (item: StatusItem) => formatItemName(item, opts.namePattern, opts.nameFilters);
    const resolveDpTokens = useDpTokenResolver(items.map(rawLabel));
    const labelFor = (item: StatusItem) => {
        const raw = rawLabel(item);
        if (!hasLiveToken(raw)) return raw;
        // 'Ergebnis' rules were deferred until the value was in — see finishItemName.
        return finishItemName(resolveDpTokens(raw, item.name), opts.nameFilters, item.name);
    };

    // Alerts drive the chip / all-clear; "all" mode additionally lists healthy devices.
    // An entry put back with "Später" stays listed but stops counting — the chip is
    // what says "something needs doing now".
    const total = allItems.reduce((n, i) => (countsAsHint(i) ? n + 1 : n), 0);
    const anyHint = total > 0 || allItems.some((i) => i.severity !== 'ok');
    const hasCrit = allItems.some((i) => i.severity === 'crit');
    // Highlight colour for a device in an attention state (per-category, else per-severity).
    const alertColorFor = (item: StatusItem) =>
        item.severity !== 'ok' ? opts.categoryColors?.[item.category] || item.color : item.color;
    // Free-choice background for an attention row/tile (solid), else undefined → default tint.
    const alertBgFor = (item: StatusItem) =>
        item.severity !== 'ok' ? opts.categoryBgColors?.[item.category] : undefined;
    const enabledCats = CATEGORY_ORDER.filter(
        (c) =>
            (c === 'battery' && opts.catBattery !== false) ||
            (c === 'window' && opts.catWindow !== false) ||
            (c === 'light' && opts.catLight !== false) ||
            (c === 'unreach' && opts.catUnreach !== false) ||
            (c === 'alarm' && opts.catAlarm !== false),
    );

    const showTitle = opts.showTitle !== false && !!config.title;
    const showCount = opts.showCount !== false;
    // Horizontal alignment of the content (rows, tiles, pills). Default 'left' keeps
    // every layout exactly as before; 'center'/'right' mainly matter for the Minimal
    // layout, where the wrapped pills otherwise always stick to the left edge.
    const contentAlign = opts.contentAlign ?? 'left';
    const alignFlex = contentAlign === 'center' ? 'center' : contentAlign === 'right' ? 'flex-end' : 'flex-start';
    const isAligned = contentAlign !== 'left';
    // Auto-height (Darstellung → "Höhe automatisch an Inhalt anpassen"): drops the
    // fixed-box fill (h-full/flex-1/overflow) so the widget grows with its content,
    // and measureRef publishes that height so the Dashboard sizes the grid item.
    const { fit: autoHeight, measureRef } = useContentAutoHeight(config);
    const rootCls = autoHeight ? 'w-full flex flex-col' : 'h-full w-full flex flex-col min-h-0';
    // overflow-x-hidden is required, not cosmetic: with only overflow-y set, CSS
    // promotes the other axis from `visible` to `auto`, so the rows' -mx-1 bleed
    // (and a wide card minmax) produced a stray horizontal scrollbar.
    const scrollCls = autoHeight ? 'overflow-visible' : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden';

    // ── Attention chip (the one "loud" element) ────────────────────────────────
    // While loading it stays neutral: a green "OK" would claim a verdict the widget
    // does not have yet. Already known hints are counted, the count can still grow.
    const chip = loading ? (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shrink-0"
            style={{
                color: 'var(--text-secondary)',
                background: 'color-mix(in srgb, var(--text-secondary) 12%, var(--widget-bg, var(--app-surface)))',
            }}
        >
            <RefreshCw size={12} className="animate-spin" />
            {total > 0 ? `${total} …` : 'Lädt…'}
        </span>
    ) : (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 transition-colors"
            style={
                total > 0
                    ? {
                          color: hasCrit ? SEVERITY_COLOR.crit : SEVERITY_COLOR.warn,
                          background: `color-mix(in srgb, ${hasCrit ? SEVERITY_COLOR.crit : SEVERITY_COLOR.warn} 15%, var(--widget-bg, var(--app-surface)))`,
                      }
                    : {
                          color: SEVERITY_COLOR.ok,
                          background: `color-mix(in srgb, ${SEVERITY_COLOR.ok} 12%, var(--widget-bg, var(--app-surface)))`,
                      }
            }
        >
            {total > 0 ? <TriangleAlert size={12} /> : <ShieldCheck size={12} />}
            {total > 0 ? `${total} ${total === 1 ? 'Hinweis' : 'Hinweise'}` : 'OK'}
        </span>
    );

    // ── count layout: just the chip, centered ──────────────────────────────────
    if (layout === 'count') {
        return (
            <div
                ref={measureRef}
                className={`${autoHeight ? 'w-full py-2' : 'h-full w-full'} flex flex-col items-center justify-center gap-1`}
            >
                {showTitle && (
                    <p
                        className="aura-widget-title text-xs font-semibold truncate"
                        style={{ '--aura-title-color': 'var(--text-secondary)' }}
                    >
                        {config.title}
                    </p>
                )}
                {chip}
            </div>
        );
    }

    const batteryLabelFor = (item: StatusItem) => {
        const bi = item.category === 'battery' ? batteryInfo[item.id] : undefined;
        return bi?.type ? `${bi.quantity > 1 ? `${bi.quantity}× ` : ''}${bi.type}` : null;
    };

    // "seit …" for live rows: windows by default, batteries/reachability on request.
    const sinceCats = opts.sinceCategories ?? ['window'];
    const showSince = opts.showSince !== false;

    /** The placeholder values of one row ({id} {device} {serial} {name} {room}). */
    const templateCtx = (item: StatusItem) => ({
        id: item.id,
        device:
            batteryInfo[item.id]?.deviceId ||
            (deviceIndex ? resolveDeviceIdForDp(item.id, deviceIndex) : deviceIdFallback(item.id)),
        name: labelFor(item),
        room: item.room,
    });
    const runRowAction = (a: StatusRowAction, item: StatusItem) => {
        const ctx = templateCtx(item);
        const dp = fillRowTemplate(a.targetDp, ctx).trim();
        if (!dp) return;
        setStateDirect(dp, typedActionValue(fillRowTemplate(a.value ?? '', ctx)), false);
    };
    const latchCmd = (item: StatusItem, cmd: string) =>
        setStateDirect(`${NS}.status.${item.category}.cmd`, `${cmd}:${item.id}`, false);

    /** Buttons at the end of a row: the latch's close/snooze, then the configured actions. */
    const rowButtons = (item: StatusItem, color: string) => {
        const buttons: React.ReactNode[] = [];
        const latching = !!latchLists[item.category];
        if (latching && (item.latch || item.severity !== 'ok')) {
            const isBattery = item.category === 'battery';
            const snoozeDays = opts.latchSnoozeDays ?? 2;
            buttons.push(
                <RowButton
                    key="latch-ack"
                    label={isBattery ? 'Gewechselt' : 'Quittieren'}
                    title={isBattery ? 'Batterie gewechselt – Hinweis schließen' : 'Hinweis schließen'}
                    confirm={opts.latchConfirm !== false}
                    color={color}
                    disabled={editMode}
                    onRun={() => latchCmd(item, 'ack')}
                />,
            );
            if (item.latch && !item.latch.snoozedUntil) {
                buttons.push(
                    <RowButton
                        key="latch-snooze"
                        label="Später"
                        title={`Zurückstellen um ${snoozeDays} ${snoozeDays === 1 ? 'Tag' : 'Tage'}`}
                        color="var(--text-secondary)"
                        disabled={editMode}
                        onRun={() => latchCmd(item, `snooze`)}
                    />,
                );
            }
        }
        actionsFor(opts.rowActions, item.category).forEach((a, i) =>
            buttons.push(
                <RowButton
                    key={`a${i}`}
                    label={a.label}
                    confirm={a.confirm}
                    confirmLabel={a.confirmLabel}
                    color={color}
                    disabled={editMode}
                    onRun={() => runRowAction(a, item)}
                />,
            ),
        );
        return buttons;
    };

    /** Remembered, but quiet right now or put back — shown muted in every layout. */
    const isMuted = (item: StatusItem) => !!item.latch && (!item.latch.active || !!item.latch.snoozedUntil);

    // A plain function, not a component: an inline component is a new type on every
    // render, and the remount would drop an armed confirm button mid-tap.
    const renderRow = (item: StatusItem) => {
        const batteryLabel = batteryLabelFor(item);
        const color = alertColorFor(item);
        const customBg = alertBgFor(item);
        const alert = item.severity !== 'ok';
        const { Icon } = CATEGORY_META[item.category];
        const sub = [
            opts.showRoom !== false ? item.room : null,
            !item.latch && showSince && sinceCats.includes(item.category) && item.lc ? formatSince(item.lc) : null,
            ...latchFacts(item, showSince),
        ]
            .filter(Boolean)
            .join(' · ');
        const rowProps = rowPopup.row(item.id, labelFor(item));
        // A remembered entry that reports nothing right now, or one put back with
        // "Später", stays in the list — muted, so the live problems stand out.
        const muted = isMuted(item);
        const buttons = rowButtons(item, color);
        return (
            <div
                key={item.id}
                className={`flex items-center gap-2 py-1 px-1 -mx-1 rounded-md min-w-0${buttons.length ? ' flex-wrap' : ''}`}
                data-latch={item.latch ? (muted ? 'muted' : 'active') : undefined}
                style={{
                    ...(alert
                        ? {
                              background: muted
                                  ? `color-mix(in srgb, ${color} 5%, transparent)`
                                  : (customBg ?? `color-mix(in srgb, ${color} 12%, transparent)`),
                          }
                        : undefined),
                    // Left (default) keeps name and value pushed apart; centring/right-aligning
                    // only works once the label stops eating the free space (flex-1 below).
                    justifyContent: alignFlex,
                    cursor: rowProps ? 'pointer' : undefined,
                    opacity: muted ? 0.65 : undefined,
                    // Buttons: when the row is too narrow they wrap to a line of their own
                    // instead of squeezing the device name out of the row.
                    rowGap: buttons.length ? 2 : undefined,
                }}
                {...rowProps}
            >
                <Icon size={14} className="shrink-0" style={{ color }} />
                <span
                    className={`${isAligned ? '' : 'flex-1 '}min-w-0 truncate text-xs`}
                    style={{
                        color: 'var(--text-primary)',
                        // The name keeps ~8rem before the buttons give way (flex-wrap above).
                        ...(buttons.length && !isAligned ? { flex: '1 1 8rem' } : {}),
                    }}
                    title={item.latch && sub ? `${labelFor(item)} · ${sub}` : undefined}
                >
                    {labelFor(item)}
                    {sub && <span className="ml-1 opacity-50">· {sub}</span>}
                </span>
                <span className="text-xs font-semibold shrink-0" style={{ color }}>
                    {item.label}
                    {batteryLabel && (
                        <span className="ml-1 font-normal opacity-60" style={{ color: 'var(--text-secondary)' }}>
                            · {batteryLabel}
                        </span>
                    )}
                </span>
                {buttons.length > 0 && <span className="flex items-center gap-1 shrink-0 ml-auto">{buttons}</span>}
            </div>
        );
    };

    // ── Two-line row (layout 'twoline') ───────────────────────────────────────────
    // Dot · name on line 1 · reading and facts muted on line 2 · touch buttons on the
    // right. No tinted background and no muting of quiet entries: line 2 says it.
    const twoLine = layout === 'twoline';
    const dotColorFor = (item: StatusItem) => {
        if (item.severity === 'ok') return 'var(--accent-green, #22c55e)';
        const own = opts.categoryColors?.[item.category];
        if (own) return own;
        // A window row can carry the colour of its readable state (rd.color).
        if (item.color !== SEVERITY_COLOR.crit && item.color !== SEVERITY_COLOR.warn) return item.color;
        return item.severity === 'crit' ? 'var(--accent-red, #ef4444)' : 'var(--accent-yellow, #f59e0b)';
    };
    const twoLineButtons = (item: StatusItem) => {
        const buttons: React.ReactNode[] = [];
        actionsFor(opts.rowActions, item.category).forEach((a, i) =>
            buttons.push(
                <TwoLineButton
                    key={`a${i}`}
                    label={a.label}
                    confirm={a.confirm}
                    confirmLabel={a.confirmLabel}
                    tone="neutral"
                    disabled={editMode}
                    onRun={() => runRowAction(a, item)}
                />,
            ),
        );
        if (latchLists[item.category] && (item.latch || item.severity !== 'ok')) {
            const isBattery = item.category === 'battery';
            const snoozeDays = opts.latchSnoozeDays ?? 2;
            if (item.latch && !item.latch.snoozedUntil) {
                buttons.push(
                    <TwoLineButton
                        key="latch-snooze"
                        label={`${snoozeDays} ${snoozeDays === 1 ? 'Tag' : 'Tage'} später`}
                        title={`Zurückstellen um ${snoozeDays} ${snoozeDays === 1 ? 'Tag' : 'Tage'}`}
                        tone="neutral"
                        disabled={editMode}
                        onRun={() => setStateDirectAsync(`${NS}.status.${item.category}.cmd`, `snooze:${item.id}`)}
                    />,
                );
            }
            buttons.push(
                <TwoLineButton
                    key="latch-ack"
                    label={isBattery ? 'Gewechselt' : 'Quittieren'}
                    title={isBattery ? 'Batterie gewechselt – Hinweis schließen' : 'Hinweis schließen'}
                    confirm={opts.latchConfirm !== false}
                    confirmLabel={isBattery ? 'Wirklich gewechselt?' : 'Wirklich quittieren?'}
                    tone="confirm"
                    disabled={editMode}
                    onRun={() => setStateDirectAsync(`${NS}.status.${item.category}.cmd`, `ack:${item.id}`)}
                />,
            );
        }
        return buttons;
    };
    const renderTwoLineRow = (item: StatusItem, first: boolean) => {
        const batteryLabel = batteryLabelFor(item);
        const sub = [
            readingFor(item),
            batteryLabel,
            opts.showRoom !== false ? item.room : null,
            !item.latch && showSince && sinceCats.includes(item.category) && item.lc ? formatSince(item.lc) : null,
            ...latchFacts(item, showSince, true),
        ]
            .filter(Boolean)
            .join(' · ');
        const rowProps = rowPopup.row(item.id, labelFor(item));
        const buttons = twoLineButtons(item);
        return (
            <div
                key={item.id}
                className="aura-status-row-2l flex items-center gap-x-3 gap-y-2 flex-wrap min-w-0"
                data-latch={item.latch ? (isMuted(item) ? 'muted' : 'active') : undefined}
                style={{
                    padding: '10px 0',
                    borderTop: first ? undefined : '1px solid var(--widget-border)',
                    cursor: rowProps ? 'pointer' : undefined,
                }}
                {...rowProps}
            >
                <span
                    className="shrink-0 rounded-full"
                    style={{ width: 10, height: 10, background: dotColorFor(item) }}
                    aria-hidden
                />
                <div className="min-w-0" style={{ flex: '1 1 10rem' }}>
                    <div
                        className="text-base leading-snug font-semibold break-words"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {labelFor(item)}
                    </div>
                    {sub && (
                        <div
                            className="break-words"
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: 'calc(0.8125rem * var(--font-scale, 1))',
                                lineHeight: 1.35,
                                marginTop: 2,
                            }}
                        >
                            {sub}
                        </div>
                    )}
                </div>
                {buttons.length > 0 && (
                    <span className="flex items-center gap-2 shrink-0 ml-auto flex-wrap justify-end">{buttons}</span>
                )}
            </div>
        );
    };
    const rowsOf = (list: StatusItem[]) =>
        twoLine ? list.map((item, i) => renderTwoLineRow(item, i === 0)) : list.map((item) => renderRow(item));

    const header = (
        <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
            {showTitle ? (
                <p
                    className="aura-widget-title text-xs font-semibold truncate"
                    style={{ '--aura-title-color': 'var(--text-secondary)' }}
                >
                    {config.title}
                </p>
            ) : (
                <span />
            )}
            {showCount && chip}
        </div>
    );

    // ── all-clear (the intended normal state) — only when filtering to alerts ────
    // Defined before the layout branches so every layout can show it instead of an
    // empty body when there is nothing to report.
    const allClear = !anyHint && !showAll && !opts.showOkCategories && !loading;
    const allClearBlock =
        opts.showAllClear === false ? null : twoLine ? (
            <div
                className={`${autoHeight ? 'py-6' : 'flex-1 min-h-0'} flex flex-col items-center justify-center text-center px-2`}
            >
                <p className="text-base font-semibold" style={{ color: 'var(--accent-green, #22c55e)' }}>
                    {opts.allClearText ||
                        (enabledCats.length === 1 && enabledCats[0] === 'battery'
                            ? 'Alle Batterien in Ordnung'
                            : 'Alles in Ordnung')}
                </p>
            </div>
        ) : (
            <div
                className={`${autoHeight ? 'py-6' : 'flex-1 min-h-0'} flex flex-col items-center justify-center gap-1.5 text-center px-2`}
            >
                <ShieldCheck size={22} style={{ color: SEVERITY_COLOR.ok }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {opts.allClearText || 'Alles in Ordnung'}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {enabledCats.map((c) => CATEGORY_META[c].label).join(' · ')} überwacht
                </p>
            </div>
        );

    // Still loading and nothing to show yet: the same slot as the all-clear panel, so
    // the widget looks busy instead of reporting a verdict it cannot have yet. Hints
    // that are already in are listed right away (with the spinner in the header).
    const showLoading = loading && items.length === 0;
    const loadingBlock = (
        <div
            className={`${autoHeight ? 'py-6' : 'flex-1 min-h-0'} flex flex-col items-center justify-center gap-1.5 text-center px-2`}
        >
            <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Daten werden geladen…
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {discovered ? `${loadedStates} von ${candidates.length} Datenpunkten` : 'Datenpunkte werden gesucht'}
            </p>
        </div>
    );

    // Card and minimal render a bare item container, so an empty one would show
    // nothing at all — hand those layouts the all-clear (or loading) block instead.
    if ((showLoading || allClear) && (layout === 'card' || layout === 'minimal')) {
        return (
            <div ref={measureRef} className={rootCls}>
                {header}
                {showLoading ? loadingBlock : allClearBlock}
            </div>
        );
    }

    // ── card layout: grid of tiles (mirrors the static-list card layout) ─────────
    if (layout === 'card') {
        return (
            <div ref={measureRef} className={rootCls}>
                {header}
                {rowPopup.node}
                <div
                    className={scrollCls}
                    style={{
                        display: 'grid',
                        // min(…, 100%) so a card minimum wider than the widget shrinks
                        // instead of overflowing the row horizontally.
                        gridTemplateColumns: `repeat(auto-fill, minmax(min(${opts.cardMinWidth ?? 96}px, 100%), 1fr))`,
                        gap: 6,
                        alignContent: 'start',
                    }}
                >
                    {items.map((item) => {
                        const color = alertColorFor(item);
                        const customBg = alertBgFor(item);
                        const alert = item.severity !== 'ok';
                        const { Icon } = CATEGORY_META[item.category];
                        const batteryLabel = batteryLabelFor(item);
                        const rowProps = rowPopup.row(item.id, labelFor(item));
                        return (
                            <div
                                key={item.id}
                                className="rounded-xl p-2 flex flex-col gap-1"
                                style={{
                                    alignItems: alignFlex,
                                    textAlign: contentAlign,
                                    background: alert
                                        ? (customBg ??
                                          `color-mix(in srgb, ${color} 14%, var(--widget-bg, var(--app-surface)))`)
                                        : 'var(--app-bg)',
                                    border: `1px solid ${alert ? `color-mix(in srgb, ${color} 40%, transparent)` : 'var(--widget-border)'}`,
                                    cursor: rowProps ? 'pointer' : undefined,
                                    opacity: isMuted(item) ? 0.65 : undefined,
                                }}
                                {...rowProps}
                            >
                                {/* State first, device second: the tile answers "what happened"
                                    before "where", which is how the list is scanned. */}
                                <span className="text-sm font-bold leading-none" style={{ color }}>
                                    {item.label}
                                </span>
                                <span
                                    className="flex items-start gap-1 text-[10px] leading-tight"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Icon size={11} className="shrink-0 mt-px" style={{ color }} />
                                    {/* Names wrap instead of truncating — a tile is the only place
                                        the device name appears, so it must stay fully readable. */}
                                    <span className="min-w-0 break-words">{labelFor(item)}</span>
                                </span>
                                {batteryLabel && (
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        {batteryLabel}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
                {moreRow}
            </div>
        );
    }

    // ── minimal layout: inline pills (mirrors the static-list badges layout) ─────
    if (layout === 'minimal') {
        return (
            <div ref={measureRef} className={rootCls}>
                {header}
                {rowPopup.node}
                <div
                    className={`${scrollCls} flex flex-wrap gap-1.5 content-start`}
                    style={{ justifyContent: alignFlex }}
                >
                    {items.map((item) => {
                        const color = alertColorFor(item);
                        const customBg = alertBgFor(item);
                        const alert = item.severity !== 'ok';
                        const { Icon } = CATEGORY_META[item.category];
                        const batteryLabel = batteryLabelFor(item);
                        const rowProps = rowPopup.row(item.id, labelFor(item));
                        return (
                            <span
                                key={item.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium max-w-full"
                                style={{
                                    background: alert
                                        ? (customBg ?? `color-mix(in srgb, ${color} 14%, transparent)`)
                                        : 'var(--app-bg)',
                                    color: alert ? color : 'var(--text-primary)',
                                    border: `1px solid ${alert ? `color-mix(in srgb, ${color} 34%, transparent)` : 'var(--widget-border)'}`,
                                    cursor: rowProps ? 'pointer' : undefined,
                                    opacity: isMuted(item) ? 0.65 : undefined,
                                }}
                                {...rowProps}
                            >
                                <Icon size={11} className="shrink-0" style={{ color }} />
                                {/* Full name, wrapped if needed — the pill grows with its label and
                                    is capped at the container width (max-w-full above). */}
                                <span className="min-w-0 break-words">{labelFor(item)}</span>
                                <span className="font-semibold" style={{ color }}>
                                    {item.label}
                                    {batteryLabel ? ` · ${batteryLabel}` : ''}
                                </span>
                            </span>
                        );
                    })}
                </div>
                {moreRow}
            </div>
        );
    }

    return (
        <div ref={measureRef} className={rootCls}>
            {header}
            {rowPopup.node}

            {showLoading ? (
                loadingBlock
            ) : allClear ? (
                allClearBlock
            ) : (
                <div className={`${scrollCls} pr-0.5`}>
                    {layout === 'compact' || (twoLine && enabledCats.length === 1)
                        ? // A single category needs no heading in the two-line layout: the chip counts.
                          rowsOf(items)
                        : // default (and twoline with several categories): grouped by category
                          enabledCats.map((cat) => {
                              const catItems = items.filter((i) => i.category === cat);
                              if (catItems.length === 0 && !opts.showOkCategories) return null;
                              const catAlerts = catItems.reduce((n, i) => (countsAsHint(i) ? n + 1 : n), 0);
                              const { Icon, label } = CATEGORY_META[cat];
                              return (
                                  <div key={cat} className="mb-1.5 last:mb-0">
                                      <div
                                          className="flex items-center gap-1.5 mt-1 mb-0.5"
                                          style={{ justifyContent: alignFlex }}
                                      >
                                          <Icon
                                              size={12}
                                              style={{ color: catAlerts ? SEVERITY_COLOR.warn : SEVERITY_COLOR.ok }}
                                          />
                                          <span
                                              className="text-[11px] font-semibold uppercase tracking-wide"
                                              style={{ color: 'var(--text-secondary)' }}
                                          >
                                              {label}
                                          </span>
                                          {catAlerts > 0 ? (
                                              <span
                                                  className="text-[11px] font-semibold"
                                                  style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                              >
                                                  {catAlerts}
                                              </span>
                                          ) : (
                                              <ShieldCheck size={11} style={{ color: SEVERITY_COLOR.ok }} />
                                          )}
                                      </div>
                                      {rowsOf(catItems)}
                                  </div>
                              );
                          })}
                </div>
            )}
            {moreRow}
            {editMode && discovered && candidates.length === 0 && (
                <p className="text-[10px] mt-1 shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Keine passenden Datenpunkte gefunden – Kategorien/Filter prüfen.
                </p>
            )}
        </div>
    );
}
