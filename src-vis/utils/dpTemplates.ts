import type { WidgetType } from '../types';

/**
 * Detects the most suitable widget type from an ioBroker state's role and value type.
 * Returns null if no specific type can be determined.
 */
export function detectWidgetTypeFromRole(role?: string, valueType?: string): WidgetType | null {
  const r = (role ?? '').toLowerCase();
  if (r.includes('blind') || r.includes('shutter') || r === 'level.blind' || r.includes('cover')) return 'shutter';
  if (r === 'level.temperature' || (r.includes('temperature') && r.includes('level'))) return 'thermostat';
  if (r.includes('dimmer') || r.includes('brightness') || r.startsWith('level.')) return 'dimmer';
  if (r === 'level') return 'dimmer';
  if (r === 'switch' || r.startsWith('switch.') || r === 'button' || r === 'indicator') return 'switch';
  if (valueType === 'boolean') return 'switch';
  if (valueType === 'number' || r.startsWith('value.')) return 'value';
  return null;
}

export interface DpTemplate {
  id: string;
  label: string;
  widgetType: WidgetType;
  /** Sibling DP name patterns to try auto-filling (in order of preference) */
  secondaryDps: {
    optionKey: string;
    siblingNames: string[];
  }[];
}

export const DP_TEMPLATES: DpTemplate[] = [
  {
    id: 'shutter',
    label: 'Rollladen',
    widgetType: 'shutter',
    secondaryDps: [
      { optionKey: 'activityDp',  siblingNames: ['WORKING', 'working', 'moving', 'activity'] },
      { optionKey: 'directionDp', siblingNames: ['DIRECTION', 'direction'] },
      { optionKey: 'stopDp',      siblingNames: ['STOP', 'stop'] },
    ],
  },
  {
    id: 'thermostat',
    label: 'Thermostat',
    widgetType: 'thermostat',
    secondaryDps: [
      { optionKey: 'actualDatapoint', siblingNames: ['ACTUAL', 'actual', 'ACTUAL_TEMPERATURE', 'ACTUAL_TEMP', 'TEMPERATURE', 'temperature', 'TEMP', 'temp', 'MEASURED_TEMPERATURE'] },
    ],
  },
  {
    id: 'dimmer',
    label: 'Dimmer',
    widgetType: 'dimmer',
    secondaryDps: [],
  },
  {
    id: 'switch_light',
    label: 'Lichtschalter',
    widgetType: 'switch',
    secondaryDps: [],
  },
  {
    id: 'switch',
    label: 'Schalter',
    widgetType: 'switch',
    secondaryDps: [],
  },
  {
    id: 'value',
    label: 'Messwert',
    widgetType: 'value',
    secondaryDps: [],
  },
];
