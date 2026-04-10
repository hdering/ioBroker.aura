/**
 * Curated icon map for widget icon picker + dynamic icon rendering.
 *
 * Icon name strings stored in config.options.icon are resolved here.
 * Only icons already imported across the widget bundle are included,
 * so this adds zero extra bytes to the build.
 */
import {
  // Registry icons
  Zap, TrendingUp, SlidersHorizontal, Thermometer, BarChart2, List,
  Clock, CalendarDays, Heading2, Layers2, Cloud, Gauge, Camera,
  // Widget-component icons
  Lightbulb, Power, ToggleRight, Sun, SunDim, Activity, Hash,
  // Common home-automation icons
  Home, Bell, Wifi, Battery, Plug, Fan, Droplets, Flame, Car, Lock, Star,
  type LucideIcon,
} from 'lucide-react';

export const WIDGET_ICON_MAP: Record<string, LucideIcon> = {
  // Registry
  Zap, TrendingUp, SlidersHorizontal, Thermometer, BarChart2, List,
  Clock, CalendarDays, Heading2, Layers2, Cloud, Gauge, Camera,
  // Widget components
  Lightbulb, Power, ToggleRight, Sun, SunDim, Activity, Hash,
  // Home automation
  Home, Bell, Wifi, Battery, Plug, Fan, Droplets, Flame, Car, Lock, Star,
};

/** All entries for the icon picker UI */
export const ICON_PICKER_ENTRIES = Object.entries(WIDGET_ICON_MAP) as [string, LucideIcon][];

/** Resolve an icon name string to a LucideIcon component, with optional fallback */
export function getWidgetIcon(name: string | undefined, fallback: LucideIcon): LucideIcon {
  if (!name) return fallback;
  return WIDGET_ICON_MAP[name] ?? fallback;
}
