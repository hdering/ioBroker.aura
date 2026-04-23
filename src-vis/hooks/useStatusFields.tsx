import { Battery, BatteryLow, Wifi, WifiOff } from 'lucide-react';
import { useDatapoint } from './useDatapoint';
import type { WidgetConfig } from '../types';
import type React from 'react';

function matchesValues(value: unknown, valList: string): boolean {
  if (!valList.trim()) return false;
  const str = String(value ?? '').toLowerCase().trim();
  return valList.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).some(v => v === str);
}

const BADGE_SIZE = 18;

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: BADGE_SIZE, height: BADGE_SIZE, flexShrink: 0,
        background: `color-mix(in srgb, ${color} 20%, var(--app-surface))`,
        border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`,
      }}>
      {children}
    </span>
  );
}

interface StatusFields {
  battery: string;
  reach: string;
  batteryIcon: React.ReactNode;
  reachIcon: React.ReactNode;
  /** All configured status badge icons in a single flex row. */
  statusBadges: React.ReactNode;
}

/**
 * Computes text strings and badge icon nodes for battery / reach.
 * Text (battery, reach) → use as extraFields in CustomGridView.
 * Icons (batteryIcon, reachIcon) → use as extraComponents in CustomGridView.
 * Both read from the same config.options as StatusBadges.
 */
export function useStatusFields(config: WidgetConfig): StatusFields {
  const opts = config.options ?? {};

  const battDpId  = (opts.batteryDp as string) ?? '';
  const reachDpId = (opts.unreachDp as string) ?? '';
  const { value: battRaw  } = useDatapoint(battDpId);
  const { value: reachRaw } = useDatapoint(reachDpId);

  // ── battery ─────────────────────────────────────────────────────────────────
  const battMode      = (opts.batteryMode as 'percent' | 'boolean') ?? 'boolean';
  const battInvert    = opts.batteryInvert === true;
  const battThreshold = (opts.batteryLowThreshold as number) ?? 20;
  let battery = '';
  let isBattLow = false;
  if (battDpId) {
    if (battMode === 'percent') {
      const num = typeof battRaw === 'number' ? battRaw : parseFloat(String(battRaw ?? ''));
      battery = isNaN(num) ? '–' : `${Math.round(num)}%`;
      isBattLow = !isNaN(num) && num <= battThreshold;
    } else {
      const low = matchesValues(battRaw, 'true,1');
      isBattLow = battInvert ? !low : low;
      battery = isBattLow ? 'Niedrig' : 'OK';
    }
  }

  const green  = 'var(--accent-green, #22c55e)';
  const orange = '#f59e0b';
  const red    = 'var(--accent-red, #ef4444)';

  const battColor = isBattLow ? orange : green;
  const batteryIcon: React.ReactNode = battDpId
    ? <Badge color={battColor}>{isBattLow ? <BatteryLow size={10} style={{ color: battColor }} /> : <Battery size={10} style={{ color: battColor }} />}</Badge>
    : null;

  // ── reach ───────────────────────────────────────────────────────────────────
  const reachMode       = (opts.reachMode as 'unreachable' | 'available') ?? 'unreachable';
  const reachTrueValues = (opts.reachTrueValues as string) ?? 'true,1';
  let reach = '';
  let isUnreach = false;
  if (reachDpId) {
    const rawBool = matchesValues(reachRaw, reachTrueValues);
    isUnreach = reachMode === 'unreachable' ? rawBool : !rawBool;
    reach = isUnreach ? 'Nicht erreichbar' : 'Erreichbar';
  }

  const reachColor = isUnreach ? red : green;
  const reachIcon: React.ReactNode = reachDpId
    ? <Badge color={reachColor}>{isUnreach ? <WifiOff size={10} style={{ color: reachColor }} /> : <Wifi size={10} style={{ color: reachColor }} />}</Badge>
    : null;

  const statusBadges: React.ReactNode = (batteryIcon || reachIcon)
    ? <span className="flex items-center gap-0.5">{batteryIcon}{reachIcon}</span>
    : null;

  return { battery, reach, batteryIcon, reachIcon, statusBadges };
}
