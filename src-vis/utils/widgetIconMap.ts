/**
 * Widget icon resolution – handles both legacy PascalCase Lucide names and
 * full Iconify IDs (e.g. "mdi:garage", "lucide:zap").
 *
 * Returns a React component compatible with the LucideIcon signature
 * (accepts `size`, `style`, `className`), so all existing call sites work
 * without modification.
 *
 * Missing icons (typo, removed from Iconify) fall back to the caller-
 * provided Lucide fallback after the load attempt fails, so a stale stored
 * icon ID never leaves the widget visually blank.
 */
import React, { useEffect, useState } from 'react';
import { Icon, iconLoaded, loadIcon } from '@iconify/react';
import { lucidePascalToIconify } from './iconifyLoader';
import type { LucideIcon } from 'lucide-react';

const _iconComponentCache = new Map<string, LucideIcon>();
const _failedIcons = new Set<string>();

function fallbackKey(fb: LucideIcon | null | undefined): string {
  if (!fb) return '__none__';
  const obj = fb as unknown as { displayName?: string; name?: string };
  return obj.displayName ?? obj.name ?? 'fallback';
}

/** Wrap an Iconify icon ID into a component that mimics the LucideIcon API.
 *  Cached by iconId+fallback so React sees a stable component reference. */
function makeIconComponent(iconId: string, Fallback: LucideIcon | null): LucideIcon {
  const cacheKey = `${iconId}|${fallbackKey(Fallback)}`;
  const cached = _iconComponentCache.get(cacheKey);
  if (cached) return cached;
  function IconifyWrapper({
    size = 16,
    style,
    className,
  }: {
    size?: number;
    style?: React.CSSProperties;
    className?: string;
  }) {
    // Only track the failure path with state. The previous 3-state machine
    // ('pending' | 'ok' | 'fail') fired setStatus('ok') on every successful
    // load, which compounded badly with Iconify's internal IconComponent
    // re-rendering on its own load callback — under rapid remounts (e.g.
    // when a widget with hide-on-condition first paints) the combined churn
    // tripped React's max-update-depth guard. Successful loads now leave
    // <Icon> to render itself; we only re-render to swap in the Fallback
    // when the icon truly cannot be loaded.
    const [failed, setFailed] = useState<boolean>(() => _failedIcons.has(iconId));
    useEffect(() => {
      if (failed || iconLoaded(iconId)) return;
      let cancelled = false;
      loadIcon(iconId).catch(() => {
        _failedIcons.add(iconId);
        if (!cancelled) setFailed(true);
      });
      return () => { cancelled = true; };
    }, [failed]);
    if (failed) {
      // No fallback provided (preview / picker contexts) → render nothing.
      if (!Fallback) return null;
      return React.createElement(Fallback, { size, style, className });
    }
    return React.createElement(Icon, { icon: iconId, width: size, height: size, style, className });
  }
  const comp = IconifyWrapper as unknown as LucideIcon;
  _iconComponentCache.set(cacheKey, comp);
  return comp;
}

/** Resolve a stored icon name/ID to a render-ready component.
 *  - Iconify ID (contains ":") → used directly
 *  - PascalCase legacy name (e.g. "ZapOff") → converted to "lucide:zap-off"
 *  - Empty / undefined → returns the fallback Lucide component unchanged */
export function getWidgetIcon(name: string | undefined, fallback: LucideIcon | null): LucideIcon {
  if (!name) return fallback as LucideIcon;
  const iconId = name.includes(':') ? name : lucidePascalToIconify(name);
  return makeIconComponent(iconId, fallback);
}

/** Curated list of Iconify IDs for the inline tab/widget icon picker.
 *  Covers the most common home-automation use cases. */
export const CURATED_ICON_IDS: string[] = [
  // Home & rooms
  'lucide:home','lucide:sofa','lucide:bed-double','lucide:bath','lucide:cooking-pot',
  'lucide:tree-pine','mdi:garage','mdi:garage-open','mdi:door-closed','mdi:door',
  // Lights & switches
  'lucide:lightbulb','lucide:lightbulb-off','lucide:lamp','lucide:sun','lucide:moon',
  'lucide:toggle-right','lucide:plug','lucide:zap','lucide:power',
  // Climate
  'lucide:thermometer','lucide:flame','lucide:snowflake','lucide:wind','lucide:droplets',
  'lucide:fan','mdi:radiator','mdi:heat-pump','mdi:air-conditioner',
  // Security
  'lucide:lock','lucide:lock-open','lucide:shield','lucide:bell','lucide:eye',
  'mdi:motion-sensor','mdi:smoke-detector','mdi:alarm',
  // Energy
  'lucide:battery','lucide:gauge','mdi:solar-panel','mdi:lightning-bolt','mdi:meter-electric',
  // Transport / Garage
  'lucide:car','mdi:car-electric','mdi:car-key',
  // Media
  'lucide:tv','lucide:speaker','lucide:music','lucide:volume-2',
  // Misc
  'lucide:star','lucide:heart','lucide:activity','lucide:bar-chart-2','lucide:calendar-days',
  'lucide:clock','lucide:settings','lucide:layers-2','lucide:cloud','lucide:wifi',
];
