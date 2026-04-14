/**
 * Central widget registry – single source of truth for all widget metadata.
 *
 * To add a new widget type:
 *   1. Add its WidgetType literal to src/types/index.ts
 *   2. Add one entry to WIDGET_REGISTRY below
 *   3. Import the component in WidgetFrame.tsx and add it to WIDGET_COMPONENTS
 *
 * Everything else (dropdowns, dialogs, previews, color labels) is derived
 * automatically from this file.
 */

import {
  Zap, TrendingUp, SlidersHorizontal, Thermometer, BarChart2, List,
  Clock, CalendarDays, Heading2, Layers2, Cloud, Gauge, Camera, ImageIcon, MonitorDot, Droplets, Truck,
  type LucideIcon,
} from 'lucide-react';
import type { WidgetType } from './types';

export type AddMode =
  | 'datapoint'   // requires an ioBroker state ID
  | 'group'       // requires selecting a widget-group (ListWidget)
  | 'free'        // no datapoint / special config (clock, header, …)
  | 'wizard-only' // cannot be added manually (calendar)

export type WidgetGroup = 'control' | 'special' | 'layout';

export interface WidgetMeta {
  type: WidgetType;
  /** Full German name shown in dialogs, admin lists, … */
  label: string;
  /** Short name for compact labels (TabWizard badges) */
  shortLabel: string;
  /** Lucide icon component – render at any size */
  Icon: LucideIcon;
  /** String name of Icon (used to store/restore icon from config.options.icon) */
  iconName: string;
  /** Accent color for UI elements */
  color: string;
  /** Default grid width (columns) */
  defaultW: number;
  /** Default grid height (rows) */
  defaultH: number;
  /** How the widget is added via the "Manuell" dialog */
  addMode: AddMode;
  /** UI grouping in widget pickers */
  widgetGroup: WidgetGroup;
  /** Mock data shown in WidgetPreview thumbnails */
  mock: { t: string; v: string; u?: string; sub?: string };
}

export const WIDGET_GROUPS: { id: WidgetGroup; label: string }[] = [
  { id: 'control', label: 'Steuerung & Anzeige' },
  { id: 'special', label: 'Spezial' },
  { id: 'layout',  label: 'Layout' },
];

export const WIDGET_REGISTRY: WidgetMeta[] = [
  {
    type: 'switch',
    label: 'Schalter',      shortLabel: 'Schalter',
    Icon: Zap,              iconName: 'Zap',        color: '#22c55e',
    defaultW: 2,            defaultH: 2,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Wohnzimmer', v: 'AN' },
  },
  {
    type: 'dimmer',
    label: 'Dimmer',        shortLabel: 'Dimmer',
    Icon: SlidersHorizontal, iconName: 'SlidersHorizontal', color: '#f59e0b',
    defaultW: 3,            defaultH: 2,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Licht', v: '75', u: '%' },
  },
  {
    type: 'thermostat',
    label: 'Thermostat',    shortLabel: 'Thermostat',
    Icon: Thermometer,      iconName: 'Thermometer', color: '#ef4444',
    defaultW: 3,            defaultH: 3,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Heizung', v: '21.0', sub: 'Ist: 19.5°' },
  },
  {
    type: 'value',
    label: 'Wert-Anzeige',  shortLabel: 'Wert',
    Icon: TrendingUp,       iconName: 'TrendingUp', color: '#3b82f6',
    defaultW: 3,            defaultH: 2,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Temperatur', v: '21.5', u: '°C' },
  },
  {
    type: 'gauge',
    label: 'Gauge',         shortLabel: 'Gauge',
    Icon: Gauge,            iconName: 'Gauge',      color: '#f97316',
    defaultW: 2,            defaultH: 3,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Gauge', v: '72', u: 'kW' },
  },
  {
    type: 'chart',
    label: 'Diagramm (einfach)', shortLabel: 'Diagramm',
    Icon: BarChart2,        iconName: 'BarChart2',  color: '#8b5cf6',
    defaultW: 4,            defaultH: 3,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Verbrauch', v: '245', u: 'W' },
  },
  {
    type: 'echart',
    label: 'Diagramm (erweitert)', shortLabel: 'EChart',
    Icon: BarChart2,        iconName: 'BarChart2',  color: '#10b981',
    defaultW: 4,            defaultH: 3,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'EChart', v: '' },
  },
  {
    type: 'list',
    label: 'Gruppenliste',  shortLabel: 'Liste',
    Icon: List,             iconName: 'List',       color: '#06b6d4',
    defaultW: 3,            defaultH: 4,
    addMode: 'group',       widgetGroup: 'control',
    mock: { t: 'Alle Geräte', v: '' },
  },
  {
    type: 'autolist',
    label: 'Auto-Liste',    shortLabel: 'Auto-Liste',
    Icon: List,             iconName: 'List',       color: '#14b8a6',
    defaultW: 3,            defaultH: 5,
    addMode: 'free',        widgetGroup: 'control',
    mock: { t: 'Auto-Liste', v: '' },
  },
  {
    type: 'clock',
    label: 'Uhrzeit',       shortLabel: 'Uhr',
    Icon: Clock,            iconName: 'Clock',      color: '#ec4899',
    defaultW: 2,            defaultH: 2,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Uhrzeit', v: '12:34' },
  },
  {
    type: 'weather',
    label: 'Wetter',        shortLabel: 'Wetter',
    Icon: Cloud,            iconName: 'Cloud',      color: '#0ea5e9',
    defaultW: 3,            defaultH: 3,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Wetter', v: '18°', sub: '⛅ Bewölkt' },
  },
  {
    type: 'calendar',
    label: 'Kalender',      shortLabel: 'Kalender',
    Icon: CalendarDays,     iconName: 'CalendarDays', color: '#f97316',
    defaultW: 4,            defaultH: 4,
    addMode: 'wizard-only', widgetGroup: 'special',
    mock: { t: 'Kalender', v: '3' },
  },
  {
    type: 'evcc',
    label: 'evcc',          shortLabel: 'evcc',
    Icon: Zap,              iconName: 'Zap',        color: '#6366f1',
    defaultW: 4,            defaultH: 4,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'evcc', v: '' },
  },
  {
    type: 'camera',
    label: 'Kamera',        shortLabel: 'Kamera',
    Icon: Camera,           iconName: 'Camera',     color: '#6b7280',
    defaultW: 3,            defaultH: 3,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Kamera', v: '' },
  },
  {
    type: 'image',
    label: 'Bild',          shortLabel: 'Bild',
    Icon: ImageIcon,        iconName: 'ImageIcon',  color: '#0ea5e9',
    defaultW: 3,            defaultH: 3,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Bild', v: '' },
  },
  {
    type: 'trash',
    label: 'Müllabfuhr',      shortLabel: 'Müll',
    Icon: Truck,              iconName: 'Truck',       color: '#6b7280',
    defaultW: 4,              defaultH: 3,
    addMode: 'free',          widgetGroup: 'special',
    mock: { t: 'Müllabfuhr', v: '' },
  },
  {
    type: 'fill',
    label: 'Füllstandsanzeige', shortLabel: 'Füllstand',
    Icon: Droplets,             iconName: 'Droplets',    color: '#0ea5e9',
    defaultW: 2,                defaultH: 4,
    addMode: 'datapoint',       widgetGroup: 'control',
    mock: { t: 'Wassertank', v: '68', u: '%' },
  },
  {
    type: 'iframe',
    label: 'iFrame',         shortLabel: 'iFrame',
    Icon: MonitorDot,        iconName: 'MonitorDot',  color: '#64748b',
    defaultW: 4,             defaultH: 4,
    addMode: 'free',         widgetGroup: 'special',
    mock: { t: 'iFrame', v: '' },
  },
  {
    type: 'header',
    label: 'Abschnittstitel', shortLabel: 'Abschnitt',
    Icon: Heading2,         iconName: 'Heading2',   color: '#94a3b8',
    defaultW: 12,           defaultH: 1,
    addMode: 'free',        widgetGroup: 'layout',
    mock: { t: 'Abschnitt', v: '' },
  },
  {
    type: 'group',
    label: 'Gruppe',        shortLabel: 'Gruppe',
    Icon: Layers2,          iconName: 'Layers2',    color: '#a78bfa',
    defaultW: 4,            defaultH: 4,
    addMode: 'free',        widgetGroup: 'layout',
    mock: { t: 'Gruppe', v: '' },
  },
];

/** Fast lookup by type */
export const WIDGET_BY_TYPE = Object.fromEntries(
  WIDGET_REGISTRY.map((m) => [m.type, m]),
) as Record<WidgetType, WidgetMeta>;

/**
 * Returns the effective default size for a widget type.
 * Checks user overrides first, falls back to registry defaults.
 */
export function getEffectiveSize(
  type: string,
  overrides: Record<string, { w: number; h: number }>,
): { w: number; h: number } {
  if (overrides[type]) return overrides[type];
  const meta = WIDGET_BY_TYPE[type as WidgetType];
  return meta ? { w: meta.defaultW, h: meta.defaultH } : { w: 2, h: 2 };
}
