/**
 * StatusBadges – small overlay shown inside a widget when battery is low
 * or the device is unreachable.
 *
 * Usage:
 *   <div style={{ position: 'relative' }}>
 *     {/* widget content *\/}
 *     <StatusBadges config={config} />
 *   </div>
 *
 * Options read from config.options:
 *   batteryDp  – ioBroker DP ID (boolean true = low)
 *   unreachDp  – ioBroker DP ID (boolean true = unreachable)
 *   showStatusBadges – boolean, default true
 */
import { BatteryLow, WifiOff } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetConfig } from '../../types';

interface Props {
  config: WidgetConfig;
}

export function StatusBadges({ config }: Props) {
  const opts = config.options ?? {};
  const show = opts.showStatusBadges !== false; // default: visible

  const battDpId    = (opts.batteryDp as string) ?? '';
  const unreachDpId = (opts.unreachDp as string) ?? '';

  const { value: battVal }    = useDatapoint(battDpId);
  const { value: unreachVal } = useDatapoint(unreachDpId);

  if (!show) return null;

  const hasBatt   = !!battDpId;
  const hasUnreach = !!unreachDpId;

  if (!hasBatt && !hasUnreach) return null;

  const isBattLow = hasBatt && (battVal === true || battVal === 1 || battVal === '1' || battVal === 'true');
  const isUnreach = hasUnreach && (unreachVal === true || unreachVal === 1 || unreachVal === '1' || unreachVal === 'true');

  const green = 'var(--accent-green, #22c55e)';
  const orange = '#f59e0b';
  const red = 'var(--accent-red, #ef4444)';
  const battColor   = isBattLow ? orange : green;
  const reachColor  = isUnreach ? red    : green;

  return (
    <div
      className="absolute bottom-1 right-1 flex items-center gap-0.5 pointer-events-none"
      style={{ zIndex: 2 }}>
      {hasBatt && (
        <span
          title={isBattLow ? 'Batterie schwach' : 'Batterie OK'}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 18, height: 18,
            background: `color-mix(in srgb, ${battColor} 20%, var(--app-surface))`,
            border: `1px solid color-mix(in srgb, ${battColor} 50%, transparent)`,
          }}>
          <BatteryLow size={10} style={{ color: battColor }} />
        </span>
      )}
      {hasUnreach && (
        <span
          title={isUnreach ? 'Gerät nicht erreichbar' : 'Gerät erreichbar'}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 18, height: 18,
            background: `color-mix(in srgb, ${reachColor} 20%, var(--app-surface))`,
            border: `1px solid color-mix(in srgb, ${reachColor} 50%, transparent)`,
          }}>
          <WifiOff size={10} style={{ color: reachColor }} />
        </span>
      )}
    </div>
  );
}
