import { useEffect, useMemo, useState } from 'react';
import {
    ShieldCheck,
    TriangleAlert,
    BatteryLow,
    Battery,
    DoorOpen,
    Lightbulb,
    WifiOff,
    Siren,
    ShoppingCart,
    HelpCircle,
    type LucideIcon,
} from 'lucide-react';
import type { WidgetProps, ioBrokerState } from '../../types';
import { useIoBroker } from '../../hooks/useIoBroker';
import { ensureDatapointCache, type DatapointEntry } from '../../hooks/useDatapointList';
import { useDashboardStore } from '../../store/dashboardStore';
import { useNavigationStore } from '../../store/navigationStore';
import { useConfigStore } from '../../store/configStore';
import {
    loadDeviceModelIndex,
    loadBatteryLibrary,
    resolveBatteryType,
    type BatteryResolution,
} from '../../utils/batteryLibrary';
import {
    categoryOf,
    passesScope,
    evaluateItem,
    compareItems,
    CATEGORY_ORDER,
    SEVERITY_COLOR,
    type CategoryKey,
    type StatusItem,
    type StatusOverviewOptions,
} from '../../utils/statusOverview';

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

/** Candidate = a datapoint that structurally belongs to a category; alert state is decided live. */
interface Candidate {
    dp: DatapointEntry;
    cat: CategoryKey;
}

/** Finds the first dashboard widget bound to `dpId` and navigates + pulse-highlights it. */
function jumpToWidgetForDp(dpId: string): void {
    const layouts = useDashboardStore.getState().layouts;
    for (const l of layouts) {
        for (const tab of l.tabs) {
            const w = tab.widgets.find((wg) => wg.datapoint === dpId);
            if (w) {
                useNavigationStore.getState().navigateTo(l.id, tab.id, w.id);
                return;
            }
        }
    }
}

export function StatusOverviewWidget({ config, editMode }: WidgetProps) {
    const opts = useMemo(() => (config.options ?? {}) as StatusOverviewOptions, [config.options]);
    const { subscribe, getState } = useIoBroker();
    const overrides = useConfigStore((s) => s.frontend.batteryTypeOverrides);
    const layout = config.layout ?? 'default';

    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
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
    ]);
    useEffect(() => {
        let cancelled = false;
        ensureDatapointCache().then((cache) => {
            if (cancelled) return;
            const found: Candidate[] = [];
            for (const dp of cache) {
                const cat = categoryOf(dp, opts);
                if (!cat) continue;
                if (!passesScope(dp, opts)) continue;
                found.push({ dp, cat });
            }
            setCandidates(found);
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

    // ── Battery type resolution (device model → library, manual override first) ──
    const batteryCandidates = useMemo(() => candidates.filter((c) => c.cat === 'battery'), [candidates]);
    const wantBatteryTypes = layout === 'inventory' || opts.batteryTypeEnabled === true;
    const batteryCandKey = batteryCandidates.map((c) => c.dp.id).join(',');
    const overridesKey = JSON.stringify(overrides ?? {});
    useEffect(() => {
        if (!wantBatteryTypes || batteryCandidates.length === 0) {
            setBatteryInfo({});
            return;
        }
        let cancelled = false;
        Promise.all([loadDeviceModelIndex(), loadBatteryLibrary()]).then(([index, lib]) => {
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
                const r = resolveBatteryType(c.dp.id, index, lib, overrides);
                info[c.dp.id] = {
                    deviceId: r.deviceId,
                    type: r.type,
                    quantity: r.quantity,
                    deviceName: index.get(r.deviceId)?.name || c.dp.name,
                    source: r.source,
                };
            }
            setBatteryInfo(info);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batteryCandKey, wantBatteryTypes, overridesKey]);

    // ── Evaluate → attention items ─────────────────────────────────────────────
    const sortBy = opts.sortBy ?? 'severity';
    const items = useMemo<StatusItem[]>(() => {
        const out: StatusItem[] = [];
        for (const c of candidates) {
            const s = states[c.dp.id];
            if (s === undefined) continue; // not loaded yet
            const item = evaluateItem(c.dp, s?.val ?? null, c.cat, opts, s?.lc && s.lc > 0 ? s.lc : s?.ts);
            if (item) out.push(item);
        }
        out.sort((a, b) => compareItems(a, b, sortBy));
        return out;
    }, [candidates, states, opts, sortBy]);

    // ── Battery inventory (ALL battery devices, grouped by type) ────────────────
    const inventory = useMemo(() => {
        // De-dupe by device (a device may expose several battery DPs).
        const byDevice = new Map<string, { name: string; type: string | null; quantity: number }>();
        for (const c of batteryCandidates) {
            const info = batteryInfo[c.dp.id];
            const deviceId = info?.deviceId ?? c.dp.id;
            if (byDevice.has(deviceId)) continue;
            byDevice.set(deviceId, {
                name: info?.deviceName ?? c.dp.name,
                type: info?.type ?? null,
                quantity: info?.quantity ?? 1,
            });
        }
        const groups = new Map<string, { type: string | null; devices: string[]; totalQty: number }>();
        for (const d of byDevice.values()) {
            const key = d.type ?? ' unknown';
            let g = groups.get(key);
            if (!g) {
                g = { type: d.type, devices: [], totalQty: 0 };
                groups.set(key, g);
            }
            g.devices.push(d.name);
            g.totalQty += d.quantity;
        }
        const list = [...groups.values()].sort((a, b) => {
            if ((a.type === null) !== (b.type === null)) return a.type === null ? 1 : -1; // unknown last
            return (a.type ?? '').localeCompare(b.type ?? '', 'de');
        });
        list.forEach((g) => g.devices.sort((a, b) => a.localeCompare(b, 'de')));
        const shopping = list
            .filter((g) => g.type)
            .map((g) => `${g.totalQty}× ${g.type}`)
            .join(', ');
        return { list, shopping, deviceCount: byDevice.size };
    }, [batteryCandidates, batteryInfo]);

    const total = items.length;
    const hasCrit = items.some((i) => i.severity === 'crit');
    const enabledCats = CATEGORY_ORDER.filter(
        (c) =>
            (c === 'battery' && opts.catBattery !== false) ||
            (c === 'window' && opts.catWindow !== false) ||
            (c === 'light' && opts.catLight !== false) ||
            (c === 'unreach' && opts.catUnreach !== false) ||
            (c === 'alarm' && opts.catAlarm !== false),
    );

    const showTitle = opts.showTitle !== false && !!config.title;
    const rowClickable = (opts.rowClick ?? 'jump') === 'jump';

    // ── Attention chip (the one "loud" element) ────────────────────────────────
    const chip = (
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
            <div className="h-full w-full flex flex-col items-center justify-center gap-1">
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

    // ── inventory layout: ALL battery devices grouped by type + shopping list ────
    if (layout === 'inventory') {
        const empty = batteryCandidates.length === 0;
        return (
            <div className="h-full w-full flex flex-col min-h-0">
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
                    {!empty && (
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shrink-0"
                            style={{
                                color: 'var(--text-secondary)',
                                background:
                                    'color-mix(in srgb, var(--text-secondary) 12%, var(--widget-bg, var(--app-surface)))',
                            }}
                        >
                            <Battery size={12} />
                            {inventory.deviceCount} {inventory.deviceCount === 1 ? 'Gerät' : 'Geräte'}
                        </span>
                    )}
                </div>

                {empty ? (
                    <div className="flex-1 min-h-0 flex items-center justify-center text-center px-2">
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Keine Batteriegeräte gefunden.
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                        {inventory.list.map((g) => {
                            const known = g.type !== null;
                            const color = known ? SEVERITY_COLOR.warn : 'var(--text-secondary)';
                            return (
                                <div key={g.type ?? '__unknown'} className="mb-2 last:mb-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        {known ? (
                                            <Battery size={13} style={{ color }} />
                                        ) : (
                                            <HelpCircle size={13} style={{ color }} />
                                        )}
                                        <span
                                            className="text-xs font-semibold"
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            {known ? g.type : 'Unbekannt'}
                                        </span>
                                        <span className="text-xs font-semibold" style={{ color }}>
                                            ×{g.totalQty}
                                        </span>
                                        {g.devices.length !== g.totalQty && (
                                            <span
                                                className="text-[11px]"
                                                style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                            >
                                                ({g.devices.length} {g.devices.length === 1 ? 'Gerät' : 'Geräte'})
                                            </span>
                                        )}
                                    </div>
                                    <p
                                        className="text-[11px] leading-snug pl-[19px]"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {known
                                            ? g.devices.join(' · ')
                                            : `${g.devices.join(' · ')} — im Editor zuordnen`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!empty && inventory.shopping && (
                    <div
                        className="shrink-0 mt-1.5 pt-1.5 flex items-center gap-1.5 text-[11px]"
                        style={{ borderTop: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
                    >
                        <ShoppingCart size={12} className="shrink-0" />
                        <span className="min-w-0">
                            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                Nachkaufen:{' '}
                            </span>
                            {inventory.shopping}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    const Row = ({ item }: { item: StatusItem }) => {
        const batteryType = item.category === 'battery' ? batteryInfo[item.id]?.type : null;
        const { Icon } = CATEGORY_META[item.category];
        const sub = [item.room, item.category === 'window' && item.lc ? formatSince(item.lc) : null]
            .filter(Boolean)
            .join(' · ');
        return (
            <div
                className={`flex items-center gap-2 py-1 min-w-0 ${rowClickable ? 'cursor-pointer rounded-md -mx-1 px-1 hover:bg-[var(--app-bg)]' : ''}`}
                onClick={rowClickable ? () => jumpToWidgetForDp(item.id) : undefined}
                data-widget-interactive={rowClickable ? '' : undefined}
                title={rowClickable ? 'Zum Gerät springen' : undefined}
            >
                <Icon size={14} style={{ color: item.color }} />
                <span className="flex-1 min-w-0 truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                    {item.name}
                    {sub && <span className="ml-1 opacity-50">· {sub}</span>}
                </span>
                <span className="text-xs font-semibold shrink-0" style={{ color: item.color }}>
                    {item.label}
                    {batteryType && (
                        <span className="ml-1 font-normal opacity-60" style={{ color: 'var(--text-secondary)' }}>
                            · {batteryType}
                        </span>
                    )}
                </span>
            </div>
        );
    };

    // ── all-clear (the intended normal state) ───────────────────────────────────
    const allClear = total === 0 && !opts.showOkCategories;

    return (
        <div className="h-full w-full flex flex-col min-h-0">
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
                {chip}
            </div>

            {allClear ? (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center px-2">
                    <ShieldCheck size={22} style={{ color: SEVERITY_COLOR.ok }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {opts.allClearText || 'Alles in Ordnung'}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {enabledCats.map((c) => CATEGORY_META[c].label).join(' · ')} überwacht
                    </p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                    {layout === 'compact'
                        ? items.map((item) => <Row key={item.id} item={item} />)
                        : // default: grouped by category
                          enabledCats.map((cat) => {
                              const catItems = items.filter((i) => i.category === cat);
                              if (catItems.length === 0 && !opts.showOkCategories) return null;
                              const { Icon, label } = CATEGORY_META[cat];
                              return (
                                  <div key={cat} className="mb-1.5 last:mb-0">
                                      <div className="flex items-center gap-1.5 mt-1 mb-0.5">
                                          <Icon
                                              size={12}
                                              style={{
                                                  color: catItems.length ? SEVERITY_COLOR.warn : SEVERITY_COLOR.ok,
                                              }}
                                          />
                                          <span
                                              className="text-[11px] font-semibold uppercase tracking-wide"
                                              style={{ color: 'var(--text-secondary)' }}
                                          >
                                              {label}
                                          </span>
                                          {catItems.length > 0 ? (
                                              <span
                                                  className="text-[11px] font-semibold"
                                                  style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                              >
                                                  {catItems.length}
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
            {editMode && candidates.length === 0 && (
                <p className="text-[10px] mt-1 shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Keine passenden Datenpunkte gefunden – Kategorien/Filter prüfen.
                </p>
            )}
        </div>
    );
}
