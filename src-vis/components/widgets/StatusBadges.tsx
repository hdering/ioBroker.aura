import { Battery, BatteryLow, Lock, LockOpen, Wifi, WifiOff } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetConfig } from '../../types';

/** Values of `windowDp` that mean "open" unless `windowOpenValues` says otherwise —
 *  covers booleans (WINDOW_OPEN_REPORTING), HmIP WINDOW_STATE (1 = open on a TRV,
 *  1/2 = tilted/open on rotary handles) and string states (OPEN / TILTED). */
export const WINDOW_OPEN_DEFAULT = 'true,1,2,open,tilted';

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
//   batteryInvert       – boolean, inverts boolean mode (true=OK instead of true=low)
//   batteryLowThreshold – number, percent threshold for 'percent' mode (default 20)
//   unreachDp           – DP ID
//   reachMode           – 'unreachable' (default) | 'available'
//   reachTrueValues     – comma-separated values meaning the "true" state (default 'true,1')
//   lockDp              – DP ID (optional)
//   lockLockedValues    – comma-separated values meaning "locked" (default 'true,1')
//   windowDp            – DP ID (optional), e.g. WINDOW_OPEN_REPORTING / WINDOW_STATE
//   windowOpenValues    – comma-separated values meaning "open" (default WINDOW_OPEN_DEFAULT)
//   batteryColor / reachColor / windowColor – alarm colour per badge (default STATUS_BADGE_COLORS)
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

interface Props {
    config: WidgetConfig;
}

export function StatusBadges({ config }: Props) {
    const opts = config.options ?? {};
    const show = opts.showStatusBadges !== false;
    const alertOnly = opts.statusBadgesAlertOnly === true;

    const battDpId = (opts.batteryDp as string) ?? '';
    const unreachDpId = (opts.unreachDp as string) ?? '';
    const lockDpId = (opts.lockDp as string) ?? '';
    const windowDpId = (opts.windowDp as string) ?? '';

    const { value: battVal } = useDatapoint(battDpId);
    const { value: unreachVal } = useDatapoint(unreachDpId);
    const { value: lockVal } = useDatapoint(lockDpId);
    const { value: windowVal } = useDatapoint(windowDpId);

    if (!show) return null;
    if (!battDpId && !unreachDpId && !lockDpId && !windowDpId) return null;

    // ── battery ────────────────────────────────────────────────────────────────
    const battMode = (opts.batteryMode as 'boolean' | 'percent') ?? 'boolean';
    const battInvert = opts.batteryInvert === true;
    const battThreshold = (opts.batteryLowThreshold as number) ?? 20;
    let isBattLow = false;
    let battPercent: number | null = null;
    if (battDpId) {
        if (battMode === 'percent') {
            const num = typeof battVal === 'number' ? battVal : parseFloat(String(battVal ?? ''));
            battPercent = isNaN(num) ? null : num;
            isBattLow = battPercent !== null && battPercent <= battThreshold;
        } else {
            const raw = matchesValues(battVal, 'true,1');
            isBattLow = battInvert ? !raw : raw;
        }
    }

    // ── reach ──────────────────────────────────────────────────────────────────
    const reachMode = (opts.reachMode as 'unreachable' | 'available') ?? 'unreachable';
    const reachTrueValues = (opts.reachTrueValues as string) ?? 'true,1';
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

    // Alert-only filters per badge: each one shows only while it is itself an alarm —
    // a low battery must not drag a green reach badge along (#767). The lock is never one.
    const showBatt = !!battDpId && (!alertOnly || isBattLow);
    const showReach = !!unreachDpId && (!alertOnly || isUnreach);
    const showWindow = !!windowDpId && (!alertOnly || isWindowOpen);
    const showLock = !!lockDpId && isLocked !== null && !alertOnly;
    if (!showBatt && !showReach && !showWindow && !showLock) return null;

    const green = STATUS_BADGE_OK_COLOR;
    const blue = 'var(--accent, #3b82f6)';

    const battColor = isBattLow ? statusBadgeColor(opts.batteryColor, 'battery') : green;
    const reachColor = isUnreach ? statusBadgeColor(opts.reachColor, 'reach') : green;
    const lockColor = isLocked ? blue : green;
    const windowColor = isWindowOpen ? statusBadgeColor(opts.windowColor, 'window') : green;

    const battTitle = battDpId
        ? battMode === 'percent' && battPercent !== null
            ? `Batterie: ${Math.round(battPercent)}%`
            : isBattLow
              ? 'Batterie schwach'
              : 'Batterie OK'
        : '';

    return (
        <div className="absolute bottom-0 right-0 flex items-center gap-0.5 pointer-events-none" style={{ zIndex: 2 }}>
            {showBatt && (
                <span
                    title={battTitle}
                    className="flex items-center justify-center rounded-full"
                    style={{
                        width: 18,
                        height: 18,
                        background: `color-mix(in srgb, ${battColor} 20%, var(--app-surface))`,
                        border: `1px solid color-mix(in srgb, ${battColor} 50%, transparent)`,
                    }}
                >
                    {isBattLow ? (
                        <BatteryLow size={10} style={{ color: battColor }} />
                    ) : (
                        <Battery size={10} style={{ color: battColor }} />
                    )}
                </span>
            )}
            {showReach && (
                <span
                    title={isUnreach ? 'Gerät nicht erreichbar' : 'Gerät erreichbar'}
                    className="flex items-center justify-center rounded-full"
                    style={{
                        width: 18,
                        height: 18,
                        background: `color-mix(in srgb, ${reachColor} 20%, var(--app-surface))`,
                        border: `1px solid color-mix(in srgb, ${reachColor} 50%, transparent)`,
                    }}
                >
                    {isUnreach ? (
                        <WifiOff size={10} style={{ color: reachColor }} />
                    ) : (
                        <Wifi size={10} style={{ color: reachColor }} />
                    )}
                </span>
            )}
            {showWindow && (
                <span
                    title={isWindowOpen ? 'Fenster offen' : 'Fenster geschlossen'}
                    className="flex items-center justify-center rounded-full"
                    style={{
                        width: 18,
                        height: 18,
                        background: `color-mix(in srgb, ${windowColor} 20%, var(--app-surface))`,
                        border: `1px solid color-mix(in srgb, ${windowColor} 50%, transparent)`,
                    }}
                >
                    <WindowGlyph open={isWindowOpen} size={10} color={windowColor} />
                </span>
            )}
            {showLock && (
                <span
                    title={isLocked ? 'Abgeschlossen' : 'Nicht abgeschlossen'}
                    className="flex items-center justify-center rounded-full"
                    style={{
                        width: 18,
                        height: 18,
                        background: `color-mix(in srgb, ${lockColor} 20%, var(--app-surface))`,
                        border: `1px solid color-mix(in srgb, ${lockColor} 50%, transparent)`,
                    }}
                >
                    {isLocked ? (
                        <Lock size={10} style={{ color: lockColor }} />
                    ) : (
                        <LockOpen size={10} style={{ color: lockColor }} />
                    )}
                </span>
            )}
        </div>
    );
}
