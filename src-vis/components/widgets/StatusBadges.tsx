import { Fragment, useRef, useState } from 'react';
import { Battery, BatteryLow, Lock, LockOpen, Wifi, WifiOff } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useTemplateValues } from '../../hooks/useTemplateValues';
import { useWidgetWriteLock } from '../../hooks/widgetWriteLock';
import { splitDpRef } from '../../utils/dpRef';
import { typedActionValue } from '../../utils/statusOverview';
import { AuraIcon } from '../common/AuraIcon';
import { ConfirmOverlay } from './ConfirmOverlay';
import type { StatusItem, WidgetConfig } from '../../types';

/** Values of `windowDp` that mean "open" unless `windowOpenValues` says otherwise —
 *  covers booleans (WINDOW_OPEN_REPORTING), HmIP WINDOW_STATE (1 = open on a TRV,
 *  1/2 = tilted/open on rotary handles) and string states (OPEN / TILTED). */
export const WINDOW_OPEN_DEFAULT = 'true,1,2,open,tilted';

/** Values of `batteryDp` (boolean mode) that mean "low" unless `batteryLowValues` says otherwise. */
export const BATTERY_LOW_DEFAULT = 'true,1';

/** Effective "low" values: own list, else the retired `batteryInvert` switch read as
 *  "false,0" (configs saved before the values field existed), else the default. */
export function batteryLowValues(opts: Record<string, unknown>): string {
    const own = opts.batteryLowValues;
    if (typeof own === 'string' && own.trim()) return own;
    return opts.batteryInvert === true ? 'false,0' : BATTERY_LOW_DEFAULT;
}

/** Alarm colours of the badges unless `batteryColor` / `reachColor` / `windowColor`
 *  override them — theme tokens, so a theme retints every badge at once. */
export const STATUS_BADGE_COLORS = {
    battery: 'var(--badge-warn, #f59e0b)',
    reach: 'var(--badge-crit, var(--accent-red, #ef4444))',
    window: 'var(--badge-warn, #f59e0b)',
} as const;
/** The same defaults as plain hex — what the colour picker shows as preselected
 *  (it only reads bare `var(--x)`, and --badge-warn/-crit exist only when a theme sets them). */
export const STATUS_BADGE_COLOR_HEX: Record<keyof typeof STATUS_BADGE_COLORS, string> = {
    battery: '#f59e0b',
    reach: '#ef4444',
    window: '#f59e0b',
};
export const STATUS_BADGE_OK_COLOR = 'var(--badge-ok, var(--accent-green, #22c55e))';

/** Alarm colour of one badge kind: the widget's own option, else the theme default. */
export function statusBadgeColor(own: unknown, kind: keyof typeof STATUS_BADGE_COLORS): string {
    return typeof own === 'string' && own.trim() ? own : STATUS_BADGE_COLORS[kind];
}

/** Lucide-style window glyph — lucide has no open/closed window pair. */
export function WindowGlyph({ open, size, color }: { open: boolean; size: number; color: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {open ? (
                <>
                    <path d="M12 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" />
                    <path d="M12 3l8 3v15l-8-3z" />
                </>
            ) : (
                <>
                    <rect x="4" y="3" width="16" height="18" rx="1" />
                    <path d="M12 3v18M4 12h16" />
                </>
            )}
        </svg>
    );
}

// Options read from config.options:
//   batteryDp           – DP ID
//   batteryMode         – 'boolean' (default) | 'percent'
//   batteryLowValues    – comma-separated values meaning "low" in boolean mode (default BATTERY_LOW_DEFAULT)
//   batteryInvert       – legacy: true = "false,0" mean low (see batteryLowValues())
//   batteryLowThreshold – number, percent threshold for 'percent' mode (default 20)
//   unreachDp           – DP ID
//   reachMode           – 'unreachable' (default) | 'available'
//   reachTrueValues     – comma-separated values meaning the "true" state (default 'true,1')
//   lockDp              – DP ID (optional)
//   lockLockedValues    – comma-separated values meaning "locked" (default 'true,1')
//   windowDp            – DP ID (optional), e.g. WINDOW_OPEN_REPORTING / WINDOW_STATE
//   windowOpenValues    – comma-separated values meaning "open" (default WINDOW_OPEN_DEFAULT)
//   batteryColor / reachColor / windowColor – alarm colour per badge (default STATUS_BADGE_COLORS)
//   statusItems         – own two-state symbols (StatusItem[], #792)
//   statusOrder         – order of the symbols: fixed keys and statusItems ids
//   showStatusBadges    – boolean, default true
//   statusBadgesAlertOnly – boolean, only show when something is wrong

export function matchesValues(value: unknown, valList: string): boolean {
    if (!valList.trim()) return false;
    const str = String(value ?? '')
        .toLowerCase()
        .trim();
    return valList
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
        .some((v) => v === str);
}

// ── Order ─────────────────────────────────────────────────────────────────────

/** The built-in symbols, in their historic order. */
export const STATUS_FIXED_KEYS = ['battery', 'reach', 'window', 'lock'] as const;
export type StatusFixedKey = (typeof STATUS_FIXED_KEYS)[number];

/** componentKey of a custom-grid cell that shows one own symbol: prefix + StatusItem.id. */
export const STATUS_ITEM_CELL_PREFIX = 'status-item:';

/** Own symbols that can show at all — an entry without a datapoint is a draft. */
export function statusItemsOf(raw: unknown): StatusItem[] {
    if (!Array.isArray(raw)) return [];
    return (raw as StatusItem[]).filter((it) => it && typeof it.id === 'string' && typeof it.dp === 'string' && it.dp);
}

/**
 * Display order of every symbol key: `statusOrder` first (unknown keys dropped),
 * then whatever it does not name — own symbols ahead of the built-in ones, which
 * is also the order without any `statusOrder`.
 */
export function orderedStatusKeys(statusOrder: unknown, itemIds: string[]): string[] {
    const known = new Set<string>([...itemIds, ...STATUS_FIXED_KEYS]);
    const out: string[] = [];
    const add = (k: string) => {
        if (known.has(k) && !out.includes(k)) out.push(k);
    };
    if (Array.isArray(statusOrder)) for (const k of statusOrder as unknown[]) add(String(k));
    itemIds.forEach(add);
    STATUS_FIXED_KEYS.forEach(add);
    return out;
}

// ── Symbol ────────────────────────────────────────────────────────────────────

const DOT_SIZE = 18;

/** The round symbol all status entries share: tinted fill, tinted rim, glyph inside. */
export function StatusDot({ color, title, children }: { color: string; title?: string; children: React.ReactNode }) {
    return (
        <span
            title={title}
            className="flex items-center justify-center rounded-full"
            style={{
                width: DOT_SIZE,
                height: DOT_SIZE,
                flexShrink: 0,
                background: `color-mix(in srgb, ${color} 20%, var(--app-surface))`,
                border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`,
            }}
        >
            {children}
        </span>
    );
}

const ITEM_ACTIVE_DEFAULT = 'true,1';
const ITEM_ACTIVE_COLOR = 'var(--accent, #3b82f6)';
/** Default colours of an own symbol as plain hex — what the editor's colour picker shows as preselected. */
export const STATUS_ITEM_COLOR_HEX = { active: '#3b82f6', inactive: '#22c55e' } as const;

/** The value a toggle writes: the own setting typed ("true" → true, "1" → 1), else
 *  true/false — or 1/0 when the datapoint currently holds a number. */
export function statusItemWriteValue(item: StatusItem, active: boolean, current: unknown): boolean | number | string {
    const own = active ? item.offValue : item.onValue;
    if (own !== undefined && own.trim() !== '') return typedActionValue(own);
    if (typeof current === 'number') return active ? 0 : 1;
    return !active;
}

function StatusItemSymbol({
    item,
    active,
    current,
    confirm,
    confirmText,
}: {
    item: StatusItem;
    active: boolean;
    current: unknown;
    confirm: boolean;
    confirmText: string;
}) {
    const { setState } = useIoBroker();
    const writeLocked = useWidgetWriteLock();
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [pending, setPending] = useState(false);

    const color = active ? item.color || ITEM_ACTIVE_COLOR : item.colorInactive || STATUS_BADGE_OK_COLOR;
    const icon = active ? item.icon : item.iconInactive || item.icon;
    const title = (active ? item.label : item.labelInactive) || undefined;
    const glyph = icon ? (
        <AuraIcon icon={icon} width={11} height={11} style={{ color }} />
    ) : (
        <span className="rounded-full" style={{ width: 6, height: 6, background: color }} />
    );
    const dot = (
        <StatusDot color={color} title={title}>
            {glyph}
        </StatusDot>
    );
    if (item.action !== 'toggle') return dot;

    const write = () => {
        setState(item.writeDp || splitDpRef(item.dp).id, statusItemWriteValue(item, active, current));
    };
    // The symbol sits on top of a control (a lamp tile switches on a click anywhere):
    // nothing it receives may reach the tile — no click, no long-press start.
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                className="nodrag relative flex rounded-full p-0"
                style={{
                    pointerEvents: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: writeLocked ? 'default' : 'pointer',
                }}
                aria-label={title}
                aria-pressed={active}
                data-aura-status-item={item.id}
                onPointerDown={stop}
                onPointerUp={stop}
                onMouseDown={stop}
                onMouseUp={stop}
                onTouchStart={stop}
                onTouchEnd={stop}
                onDoubleClick={stop}
                onContextMenu={stop}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (writeLocked) return;
                    if (confirm) setPending(true);
                    else write();
                }}
            >
                {/* A finger-sized target around the 18 px symbol. */}
                <span aria-hidden className="absolute" style={{ inset: -7 }} />
                {dot}
            </button>
            {pending && (
                <ConfirmOverlay
                    popup
                    anchorRef={anchorRef}
                    text={confirmText}
                    onConfirm={() => {
                        setPending(false);
                        write();
                    }}
                    onCancel={() => setPending(false)}
                />
            )}
        </>
    );
}

// ── Evaluation ────────────────────────────────────────────────────────────────

export interface StatusSymbol {
    key: string;
    node: React.ReactNode;
}

/** What the built-in entries currently report — text callers word it themselves. */
export interface StatusReadings {
    battDpId: string;
    battMode: 'boolean' | 'percent';
    battPercent: number | null;
    isBattLow: boolean;
    reachDpId: string;
    isUnreach: boolean;
    windowDpId: string;
    isWindowOpen: boolean;
}

const NO_REFS: string[] = [];

/**
 * Every status symbol the widget currently shows, in display order. Shared by
 * the standard layouts (StatusBadges) and the custom grid (useStatusFields), so
 * both rows always agree. `showStatusBadges` is left to the caller.
 */
export function useStatusSymbols(config: WidgetConfig): { symbols: StatusSymbol[]; readings: StatusReadings } {
    const opts = config.options ?? {};
    const alertOnly = opts.statusBadgesAlertOnly === true;

    const battDpId = (opts.batteryDp as string) ?? '';
    const unreachDpId = (opts.unreachDp as string) ?? '';
    const lockDpId = (opts.lockDp as string) ?? '';
    const windowDpId = (opts.windowDp as string) ?? '';

    const { value: battVal } = useDatapoint(battDpId);
    const { value: unreachVal } = useDatapoint(unreachDpId);
    const { value: lockVal } = useDatapoint(lockDpId);
    const { value: windowVal } = useDatapoint(windowDpId);

    const items = statusItemsOf(opts.statusItems as StatusItem[] | undefined);
    const itemRefs = items.length ? [...new Set(items.map((it) => it.dp))] : NO_REFS;
    const itemValues = useTemplateValues(itemRefs);

    // ── battery ────────────────────────────────────────────────────────────────
    const battMode = (opts.batteryMode as 'boolean' | 'percent') ?? 'boolean';
    const battThreshold = (opts.batteryLowThreshold as number) ?? 20;
    let isBattLow = false;
    let battPercent: number | null = null;
    if (battDpId) {
        if (battMode === 'percent') {
            const num = typeof battVal === 'number' ? battVal : parseFloat(String(battVal ?? ''));
            battPercent = isNaN(num) ? null : num;
            isBattLow = battPercent !== null && battPercent <= battThreshold;
        } else {
            isBattLow = matchesValues(battVal, batteryLowValues(opts));
        }
    }

    // ── reach ──────────────────────────────────────────────────────────────────
    const reachMode = (opts.reachMode as 'unreachable' | 'available') ?? 'unreachable';
    const reachTrueValues = (opts.reachTrueValues as string) || 'true,1';
    let isUnreach = false;
    if (unreachDpId) {
        const rawBool = matchesValues(unreachVal, reachTrueValues);
        isUnreach = reachMode === 'unreachable' ? rawBool : !rawBool;
    }

    // ── lock ───────────────────────────────────────────────────────────────────
    const lockLockedValues = (opts.lockLockedValues as string) ?? 'true,1';
    const isLocked = lockDpId ? matchesValues(lockVal, lockLockedValues) : null;

    // ── window ─────────────────────────────────────────────────────────────────
    const windowOpenValues = (opts.windowOpenValues as string) || WINDOW_OPEN_DEFAULT;
    const isWindowOpen = windowDpId ? matchesValues(windowVal, windowOpenValues) : false;

    const readings: StatusReadings = {
        battDpId,
        battMode,
        battPercent,
        isBattLow,
        reachDpId: unreachDpId,
        isUnreach,
        windowDpId,
        isWindowOpen,
    };

    const green = STATUS_BADGE_OK_COLOR;
    const blue = 'var(--accent, #3b82f6)';
    const nodes = new Map<string, React.ReactNode>();

    // Alert-only filters per badge: each one shows only while it is itself an alarm —
    // a low battery must not drag a green reach badge along (#767). The lock is never one.
    if (battDpId && (!alertOnly || isBattLow)) {
        const color = isBattLow ? statusBadgeColor(opts.batteryColor, 'battery') : green;
        const title =
            battMode === 'percent' && battPercent !== null
                ? `Batterie: ${Math.round(battPercent)}%`
                : isBattLow
                  ? 'Batterie schwach'
                  : 'Batterie OK';
        nodes.set(
            'battery',
            <StatusDot color={color} title={title}>
                {isBattLow ? <BatteryLow size={10} style={{ color }} /> : <Battery size={10} style={{ color }} />}
            </StatusDot>,
        );
    }
    if (unreachDpId && (!alertOnly || isUnreach)) {
        const color = isUnreach ? statusBadgeColor(opts.reachColor, 'reach') : green;
        nodes.set(
            'reach',
            <StatusDot color={color} title={isUnreach ? 'Gerät nicht erreichbar' : 'Gerät erreichbar'}>
                {isUnreach ? <WifiOff size={10} style={{ color }} /> : <Wifi size={10} style={{ color }} />}
            </StatusDot>,
        );
    }
    if (windowDpId && (!alertOnly || isWindowOpen)) {
        const color = isWindowOpen ? statusBadgeColor(opts.windowColor, 'window') : green;
        nodes.set(
            'window',
            <StatusDot color={color} title={isWindowOpen ? 'Fenster offen' : 'Fenster geschlossen'}>
                <WindowGlyph open={isWindowOpen} size={10} color={color} />
            </StatusDot>,
        );
    }
    if (lockDpId && isLocked !== null && !alertOnly) {
        const color = isLocked ? blue : green;
        nodes.set(
            'lock',
            <StatusDot color={color} title={isLocked ? 'Abgeschlossen' : 'Nicht abgeschlossen'}>
                {isLocked ? <Lock size={10} style={{ color }} /> : <LockOpen size={10} style={{ color }} />}
            </StatusDot>,
        );
    }

    // ── own symbols ────────────────────────────────────────────────────────────
    const confirm = opts.confirmAction === true;
    const confirmText = (opts.confirmText as string) ?? '';
    for (const it of items) {
        const current = itemValues[it.dp];
        const active = matchesValues(current, it.activeValues?.trim() ? it.activeValues : ITEM_ACTIVE_DEFAULT);
        // "Nur bei Alarm" reads an always-shown own symbol as a warning while active.
        const show = it.show ?? (alertOnly ? 'active' : 'always');
        if ((show === 'active' && !active) || (show === 'inactive' && active)) continue;
        nodes.set(
            it.id,
            <StatusItemSymbol
                key={it.id}
                item={it}
                active={active}
                current={current}
                confirm={confirm}
                confirmText={confirmText}
            />,
        );
    }

    const symbols: StatusSymbol[] = [];
    const order = orderedStatusKeys(
        opts.statusOrder as string[] | undefined,
        items.map((it) => it.id),
    );
    for (const key of order) {
        const node = nodes.get(key);
        if (node) symbols.push({ key, node });
    }
    return { symbols, readings };
}

/** The symbols as one row — what the custom grid's 'status-badges' cell shows. */
export function StatusSymbolRow({ symbols }: { symbols: StatusSymbol[] }) {
    return (
        <span className="flex items-center gap-0.5">
            {symbols.map((s) => (
                <Fragment key={s.key}>{s.node}</Fragment>
            ))}
        </span>
    );
}

interface Props {
    config: WidgetConfig;
}

export function StatusBadges({ config }: Props) {
    const { symbols } = useStatusSymbols(config);
    if (config.options?.showStatusBadges === false || !symbols.length) return null;
    // Only the row is click-through; a switchable own symbol takes its clicks back.
    return (
        <div className="absolute bottom-0 right-0 flex items-center gap-0.5 pointer-events-none" style={{ zIndex: 2 }}>
            {symbols.map((s) => (
                <Fragment key={s.key}>{s.node}</Fragment>
            ))}
        </div>
    );
}
