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
  Clock, CalendarDays, Heading2, Layers2, Cloud, Gauge, Camera,
  type LucideIcon,
} from 'lucide-react';
import type { WidgetType } from './types';

export type AddMode =
  | 'datapoint'   // requires an ioBroker state ID
  | 'group'       // requires selecting a widget-group (ListWidget)
  | 'free'        // no datapoint / special config (clock, header, …)
  | 'wizard-only' // cannot be added manually (calendar)

export interface WidgetMeta {
  type: WidgetType;
  /** Full German name shown in dialogs, admin lists, … */
  label: string;
  /** Short name for compact labels (TabWizard badges) */
  shortLabel: string;
  /** Lucide icon component – render at any size */
  Icon: LucideIcon;
  /** Accent color for UI elements */
  color: string;
  /** Default grid width (columns) */
  defaultW: number;
  /** Default grid height (rows) */
  defaultH: number;
  /** How the widget is added via the "Manuell" dialog */
  addMode: AddMode;
  /** Mock data shown in WidgetPreview thumbnails */
  mock: { t: string; v: string; u?: string; sub?: string };
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  {
    type: 'switch',
    label: 'Schalter',      shortLabel: 'Schalter',
    Icon: Zap,              color: '#22c55e',
    defaultW: 2,            defaultH: 2,
    addMode: 'datapoint',
    mock: { t: 'Wohnzimmer', v: 'AN' },
  },
  {
    type: 'value',
    label: 'Wert-Anzeige',  shortLabel: 'Wert',
    Icon: TrendingUp,       color: '#3b82f6',
    defaultW: 3,            defaultH: 2,
    addMode: 'datapoint',
    mock: { t: 'Temperatur', v: '21.5', u: '°C' },
  },
  {
    type: 'dimmer',
    label: 'Dimmer',        shortLabel: 'Dimmer',
    Icon: SlidersHorizontal, color: '#f59e0b',
    defaultW: 3,            defaultH: 2,
    addMode: 'datapoint',
    mock: { t: 'Licht', v: '75', u: '%' },
  },
  {
    type: 'thermostat',
    label: 'Thermostat',    shortLabel: 'Thermostat',
    Icon: Thermometer,      color: '#ef4444',
    defaultW: 3,            defaultH: 3,
    addMode: 'datapoint',
    mock: { t: 'Heizung', v: '21.0', sub: 'Ist: 19.5°' },
  },
  {
    type: 'chart',
    label: 'Diagramm',      shortLabel: 'Diagramm',
    Icon: BarChart2,        color: '#8b5cf6',
    defaultW: 4,            defaultH: 3,
    addMode: 'datapoint',
    mock: { t: 'Verbrauch', v: '245', u: 'W' },
  },
  {
    type: 'echart',
    label: 'EChart',        shortLabel: 'EChart',
    Icon: BarChart2,        color: '#10b981',
    defaultW: 4,            defaultH: 3,
    addMode: 'datapoint',
    mock: { t: 'EChart', v: '' },
  },
  {
    type: 'gauge',
    label: 'Gauge',         shortLabel: 'Gauge',
    Icon: Gauge,            color: '#f97316',
    defaultW: 2,            defaultH: 3,
    addMode: 'datapoint',
    mock: { t: 'Gauge', v: '72', u: 'kW' },
  },
  {
    type: 'list',
    label: 'Gruppenliste',  shortLabel: 'Liste',
    Icon: List,             color: '#06b6d4',
    defaultW: 3,            defaultH: 4,
    addMode: 'group',
    mock: { t: 'Alle Geräte', v: '' },
  },
  {
    type: 'autolist',
    label: 'Auto-Liste',    shortLabel: 'Auto-Liste',
    Icon: List,             color: '#14b8a6',
    defaultW: 3,            defaultH: 5,
    addMode: 'free',
    mock: { t: 'Auto-Liste', v: '' },
  },
  {
    type: 'clock',
    label: 'Uhrzeit',       shortLabel: 'Uhr',
    Icon: Clock,            color: '#ec4899',
    defaultW: 2,            defaultH: 2,
    addMode: 'free',
    mock: { t: 'Uhrzeit', v: '12:34' },
  },
  {
    type: 'calendar',
    label: 'Kalender',      shortLabel: 'Kalender',
    Icon: CalendarDays,     color: '#f97316',
    defaultW: 4,            defaultH: 4,
    addMode: 'wizard-only',
    mock: { t: 'Kalender', v: '3' },
  },
  {
    type: 'weather',
    label: 'Wetter',        shortLabel: 'Wetter',
    Icon: Cloud,            color: '#0ea5e9',
    defaultW: 3,            defaultH: 3,
    addMode: 'free',
    mock: { t: 'Wetter', v: '18°', sub: '⛅ Bewölkt' },
  },
  {
    type: 'evcc',
    label: 'evcc',          shortLabel: 'evcc',
    Icon: Zap,              color: '#6366f1',
    defaultW: 4,            defaultH: 4,
    addMode: 'free',
    mock: { t: 'evcc', v: '' },
  },
  {
    type: 'camera',
    label: 'Kamera',        shortLabel: 'Kamera',
    Icon: Camera,           color: '#6b7280',
    defaultW: 3,            defaultH: 3,
    addMode: 'free',
    mock: { t: 'Kamera', v: '' },
  },
  {
    type: 'header',
    label: 'Abschnittstitel', shortLabel: 'Abschnitt',
    Icon: Heading2,         color: '#94a3b8',
    defaultW: 12,           defaultH: 1,
    addMode: 'free',
    mock: { t: 'Abschnitt', v: '' },
  },
  {
    type: 'group',
    label: 'Gruppe',        shortLabel: 'Gruppe',
    Icon: Layers2,          color: '#a78bfa',
    defaultW: 4,            defaultH: 4,
    addMode: 'free',
    mock: { t: 'Gruppe', v: '' },
  },
];

/** Fast lookup by type */
export const WIDGET_BY_TYPE = Object.fromEntries(
  WIDGET_REGISTRY.map((m) => [m.type, m]),
) as Record<WidgetType, WidgetMeta>;
