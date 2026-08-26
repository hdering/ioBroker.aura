import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useIoBroker } from '../../hooks/useIoBroker';
import { ensureDatapointCache, type DatapointEntry } from '../../hooks/useDatapointList';
import { useConfigStore } from '../../store/configStore';
import { useAutoHeightStore } from '../../store/autoHeightStore';
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
    type CategoryKey,
    type StatusItem,
    type StatusOverviewOptions,
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
    ]);
    useEffect(() => {
        let cancelled = false;
        setDiscovered(false);
        ensureDatapointCache().then((cache) => {
            if (cancelled) return;
            const hmBatterySerials = collectHmBatterySerials(cache);
            const found: Candidate[] = [];
            for (const dp of cache) {
                const cat = categoryOf(dp, opts, hmBatterySerials);
                if (!cat) continue;
                if (!passesScope(dp, opts)) continue;
                found.push({ dp, cat });
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
    // Device-id resolution is also needed (without the library) when devices are hidden.
    const needBatteryMeta = wantBatteryTypes || hiddenDevices.length > 0;
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

    // ── Evaluate → attention items ─────────────────────────────────────────────
    const sortBy = opts.sortBy ?? 'severity';
    const showAll = opts.valueFilter === 'all';
    const items = useMemo<StatusItem[]>(() => {
        const out: StatusItem[] = [];
        for (const c of candidates) {
            const s = states[c.dp.id];
            if (s === undefined) continue; // not loaded yet
            const item = evaluateItem(c.dp, s?.val ?? null, c.cat, opts, s?.lc && s.lc > 0 ? s.lc : s?.ts, showAll);
            if (!item) continue;
            // Hidden battery devices never appear.
            if (c.cat === 'battery') {
                const did = batteryInfo[c.dp.id]?.deviceId;
                if (did && hiddenSet.has(did)) continue;
            }
            out.push(item);
        }
        out.sort((a, b) => compareItems(a, b, sortBy));
        return out;
    }, [candidates, states, opts, sortBy, showAll, batteryInfo, hiddenSet]);

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
    const total = items.reduce((n, i) => (i.severity !== 'ok' ? n + 1 : n), 0);
    const hasCrit = items.some((i) => i.severity === 'crit');
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
    // Auto-height: size to content (used in the stacked/mobile view). Drops the
    // fixed-box fill (h-full/flex-1/overflow) so the widget grows with its content.
    const autoHeight = opts.autoHeight === true;
    const rootCls = autoHeight ? 'w-full flex flex-col' : 'h-full w-full flex flex-col min-h-0';
    // overflow-x-hidden is required, not cosmetic: with only overflow-y set, CSS
    // promotes the other axis from `visible` to `auto`, so the rows' -mx-1 bleed
    // (and a wide card minmax) produced a stray horizontal scrollbar.
    const scrollCls = autoHeight ? 'overflow-visible' : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden';

    // Auto-height: measure the rendered content and publish it so the Dashboard can
    // size the grid item to fit (desktop grid) instead of using the stored height.
    const widgetId = config.id;
    const roRef = useRef<ResizeObserver | null>(null);
    const measureRef = useCallback(
        (el: HTMLDivElement | null) => {
            if (roRef.current) {
                roRef.current.disconnect();
                roRef.current = null;
            }
            if (!el || !autoHeight) {
                useAutoHeightStore.getState().clear(widgetId);
                return;
            }
            const report = () => useAutoHeightStore.getState().setHeight(widgetId, el.offsetHeight);
            report();
            const ro = new ResizeObserver(report);
            ro.observe(el);
            roRef.current = ro;
        },
        [autoHeight, widgetId],
    );
    // No unmount effect on top of this: React calls the ref with null when the widget
    // goes away (disconnect + clear above), and a second clear from an effect cleanup
    // would wipe a height that the re-attached ref had just reported (StrictMode
    // double-invoke), which left the grid item at its stored height in dev.
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
                        style={{ color: 'var(--text-secondary)' }}
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

    const Row = ({ item }: { item: StatusItem }) => {
        const batteryLabel = batteryLabelFor(item);
        const color = alertColorFor(item);
        const customBg = alertBgFor(item);
        const alert = item.severity !== 'ok';
        const { Icon } = CATEGORY_META[item.category];
        const sub = [
            opts.showRoom !== false ? item.room : null,
            opts.showSince !== false && item.category === 'window' && item.lc ? formatSince(item.lc) : null,
        ]
            .filter(Boolean)
            .join(' · ');
        const rowProps = rowPopup.row(item.id, labelFor(item));
        return (
            <div
                className="flex items-center gap-2 py-1 px-1 -mx-1 rounded-md min-w-0"
                style={{
                    ...(alert
                        ? { background: customBg ?? `color-mix(in srgb, ${color} 12%, transparent)` }
                        : undefined),
                    // Left (default) keeps name and value pushed apart; centring/right-aligning
                    // only works once the label stops eating the free space (flex-1 below).
                    justifyContent: alignFlex,
                    cursor: rowProps ? 'pointer' : undefined,
                }}
                {...rowProps}
            >
                <Icon size={14} className="shrink-0" style={{ color }} />
                <span
                    className={`${isAligned ? '' : 'flex-1 '}min-w-0 truncate text-xs`}
                    style={{ color: 'var(--text-primary)' }}
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
            </div>
        );
    };

    const header = (
        <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
            {showTitle ? (
                <p
                    className="aura-widget-title text-xs font-semibold truncate"
                    style={{ color: 'var(--text-secondary)' }}
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
    const allClear = total === 0 && !showAll && !opts.showOkCategories && !loading;
    const allClearBlock =
        opts.showAllClear === false ? null : (
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
                                }}
                                {...rowProps}
                            >
                                <span
                                    className="flex items-start gap-1 text-[10px] leading-tight"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Icon size={11} className="shrink-0 mt-px" style={{ color }} />
                                    {/* Names wrap instead of truncating — a tile is the only place
                                        the device name appears, so it must stay fully readable. */}
                                    <span className="min-w-0 break-words">{labelFor(item)}</span>
                                </span>
                                <span className="text-sm font-bold leading-none" style={{ color }}>
                                    {item.label}
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
                    {layout === 'compact'
                        ? items.map((item) => <Row key={item.id} item={item} />)
                        : // default: grouped by category
                          enabledCats.map((cat) => {
                              const catItems = items.filter((i) => i.category === cat);
                              if (catItems.length === 0 && !opts.showOkCategories) return null;
                              const catAlerts = catItems.reduce((n, i) => (i.severity !== 'ok' ? n + 1 : n), 0);
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
                                      {catItems.map((item) => (
                                          <Row key={item.id} item={item} />
                                      ))}
                                  </div>
                              );
                          })}
                </div>
            )}
            {editMode && discovered && candidates.length === 0 && (
                <p className="text-[10px] mt-1 shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Keine passenden Datenpunkte gefunden – Kategorien/Filter prüfen.
                </p>
            )}
        </div>
    );
}
