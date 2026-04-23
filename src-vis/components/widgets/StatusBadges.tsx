import { Battery, BatteryLow, Lock, LockOpen, Wifi, WifiOff } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetConfig } from '../../types';

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
//   showStatusBadges    – boolean, default true
//   statusBadgesAlertOnly – boolean, only show when something is wrong

function matchesValues(value: unknown, valList: string): boolean {
  if (!valList.trim()) return false;
  const str = String(value ?? '').toLowerCase().trim();
  return valList.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).some(v => v === str);
}

interface Props {
  config: WidgetConfig;
}

export function StatusBadges({ config }: Props) {
  const opts = config.options ?? {};
  const show      = opts.showStatusBadges !== false;
  const alertOnly = opts.statusBadgesAlertOnly === true;

  const battDpId    = (opts.batteryDp as string) ?? '';
  const unreachDpId = (opts.unreachDp as string) ?? '';
  const lockDpId    = (opts.lockDp    as string) ?? '';

  const { value: battVal    } = useDatapoint(battDpId);
  const { value: unreachVal } = useDatapoint(unreachDpId);
  const { value: lockVal    } = useDatapoint(lockDpId);

  if (!show) return null;
  if (!battDpId && !unreachDpId && !lockDpId) return null;

  // ── battery ────────────────────────────────────────────────────────────────
  const battMode      = (opts.batteryMode as 'boolean' | 'percent') ?? 'boolean';
  const battInvert    = opts.batteryInvert === true;
  const battThreshold = (opts.batteryLowThreshold as number) ?? 20;
  let isBattLow    = false;
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
  const reachMode       = (opts.reachMode as 'unreachable' | 'available') ?? 'unreachable';
  const reachTrueValues = (opts.reachTrueValues as string) ?? 'true,1';
  let isUnreach = false;
  if (unreachDpId) {
    const rawBool = matchesValues(unreachVal, reachTrueValues);
    isUnreach = reachMode === 'unreachable' ? rawBool : !rawBool;
  }

  // ── lock ───────────────────────────────────────────────────────────────────
  const lockLockedValues = (opts.lockLockedValues as string) ?? 'true,1';
  const isLocked = lockDpId ? matchesValues(lockVal, lockLockedValues) : null;

  if (alertOnly && !isBattLow && !isUnreach) return null;

  const green  = 'var(--accent-green, #22c55e)';
  const orange = '#f59e0b';
  const red    = 'var(--accent-red, #ef4444)';
  const blue   = 'var(--accent, #3b82f6)';

  const battColor  = isBattLow   ? orange : green;
  const reachColor = isUnreach   ? red    : green;
  const lockColor  = isLocked    ? blue   : green;

  const battTitle = battDpId
    ? battMode === 'percent' && battPercent !== null
      ? `Batterie: ${Math.round(battPercent)}%`
      : isBattLow ? 'Batterie schwach' : 'Batterie OK'
    : '';

  return (
    <div
      className="absolute bottom-0 right-0 flex items-center gap-0.5 pointer-events-none"
      style={{ zIndex: 2 }}>
      {battDpId && (
        <span
          title={battTitle}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 18, height: 18,
            background: `color-mix(in srgb, ${battColor} 20%, var(--app-surface))`,
            border: `1px solid color-mix(in srgb, ${battColor} 50%, transparent)`,
          }}>
          {isBattLow
            ? <BatteryLow size={10} style={{ color: battColor }} />
            : <Battery    size={10} style={{ color: battColor }} />
          }
        </span>
      )}
      {unreachDpId && (
        <span
          title={isUnreach ? 'Gerät nicht erreichbar' : 'Gerät erreichbar'}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 18, height: 18,
            background: `color-mix(in srgb, ${reachColor} 20%, var(--app-surface))`,
            border: `1px solid color-mix(in srgb, ${reachColor} 50%, transparent)`,
          }}>
          {isUnreach
            ? <WifiOff size={10} style={{ color: reachColor }} />
            : <Wifi    size={10} style={{ color: reachColor }} />
          }
        </span>
      )}
      {lockDpId && isLocked !== null && (
        <span
          title={isLocked ? 'Abgeschlossen' : 'Nicht abgeschlossen'}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 18, height: 18,
            background: `color-mix(in srgb, ${lockColor} 20%, var(--app-surface))`,
            border: `1px solid color-mix(in srgb, ${lockColor} 50%, transparent)`,
          }}>
          {isLocked
            ? <Lock     size={10} style={{ color: lockColor }} />
            : <LockOpen size={10} style={{ color: lockColor }} />
          }
        </span>
      )}
    </div>
  );
}
