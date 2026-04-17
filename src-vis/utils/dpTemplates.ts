import type { WidgetType } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Role → WidgetType detection
// Based on ioBroker STATE_ROLES and Jarvis device-type patterns.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects the most suitable widget type from an ioBroker state's role and
 * value type. Returns null if no specific type can be determined.
 */
export function detectWidgetTypeFromRole(role?: string, valueType?: string): WidgetType | null {
  const r = (role ?? '').toLowerCase();

  // ── SHUTTER / BLIND ───────────────────────────────────────────────────────
  if (
    r === 'level.blind' || r === 'level.curtain' ||
    r.includes('blind') || r.includes('shutter') ||
    r.includes('cover') || r.includes('awning')
  ) return 'shutter';

  // ── THERMOSTAT / HEATING ──────────────────────────────────────────────────
  if (
    r === 'level.temperature' ||
    r.startsWith('heating') ||
    (r.includes('temperature') && r.includes('level'))
  ) return 'thermostat';

  // ── DIMMER / LEVEL CONTROL ────────────────────────────────────────────────
  if (
    r === 'level.dimmer' || r === 'level.brightness' ||
    r === 'level.volume'  || r === 'media.volume'   ||
    r.startsWith('level.color')
  ) return 'dimmer';
  if (r.includes('dimmer') || r.includes('brightness')) return 'dimmer';
  if (r.startsWith('level.')) return 'dimmer';   // catch-all for other level.* roles
  if (r === 'level') return 'dimmer';

  // ── SWITCH / BUTTON / SENSOR / INDICATOR ──────────────────────────────────
  if (r === 'switch' || r.startsWith('switch.')) return 'switch';
  if (r === 'button') return 'switch';
  if (r.startsWith('indicator.')) return 'switch';
  if (r.startsWith('sensor.')) return 'switch';
  if (r === 'motion' || r === 'alarm') return 'switch';
  // media controls other than volume (play, pause, stop, mute …)
  if (r.startsWith('media.') && r !== 'media.volume') return 'switch';
  if (valueType === 'boolean') return 'switch';

  // ── VALUE / MEASUREMENT ───────────────────────────────────────────────────
  if (r.startsWith('value.') || r === 'value') return 'value';
  if (valueType === 'number') return 'value';

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template categories
// ─────────────────────────────────────────────────────────────────────────────

export interface DpTemplateCategory {
  id: string;
  label: string;
}

export const DP_TEMPLATE_CATEGORIES: DpTemplateCategory[] = [
  { id: 'shading',   label: 'Beschattung'       },
  { id: 'climate',   label: 'Klima'             },
  { id: 'lighting',  label: 'Licht'             },
  { id: 'switching', label: 'Schalten'          },
  { id: 'security',  label: 'Sicherheit'        },
  { id: 'energy',    label: 'Energie'           },
  { id: 'sensor',    label: 'Messwerte'         },
];

// ─────────────────────────────────────────────────────────────────────────────
// Template definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface DpTemplate {
  id: string;
  label: string;
  widgetType: WidgetType;
  category: string;
  /** Sibling DP name patterns to try auto-filling (in order of preference) */
  secondaryDps: {
    optionKey: string;
    siblingNames: string[];
  }[];
}

export const DP_TEMPLATES: DpTemplate[] = [

  // ── BESCHATTUNG ───────────────────────────────────────────────────────────
  {
    id: 'shutter',
    label: 'Rollladen',
    widgetType: 'shutter',
    category: 'shading',
    secondaryDps: [
      { optionKey: 'activityDp',  siblingNames: ['WORKING', 'working', 'moving', 'activity', 'ACTIVITY'] },
      { optionKey: 'directionDp', siblingNames: ['DIRECTION', 'direction'] },
      { optionKey: 'stopDp',      siblingNames: ['STOP', 'stop'] },
    ],
  },
  {
    id: 'awning',
    label: 'Markise',
    widgetType: 'shutter',
    category: 'shading',
    secondaryDps: [
      { optionKey: 'activityDp',  siblingNames: ['WORKING', 'working', 'moving', 'activity', 'ACTIVITY'] },
      { optionKey: 'directionDp', siblingNames: ['DIRECTION', 'direction'] },
      { optionKey: 'stopDp',      siblingNames: ['STOP', 'stop'] },
    ],
  },

  // ── KLIMA ────────────────────────────────────────────────────────────────
  {
    id: 'thermostat',
    label: 'Thermostat',
    widgetType: 'thermostat',
    category: 'climate',
    secondaryDps: [
      {
        optionKey: 'actualDatapoint',
        siblingNames: [
          'ACTUAL', 'actual',
          'ACTUAL_TEMPERATURE', 'ACTUAL_TEMP',
          'TEMPERATURE', 'temperature',
          'TEMP', 'temp',
          'MEASURED_TEMPERATURE',
        ],
      },
    ],
  },

  // ── LICHT ────────────────────────────────────────────────────────────────
  {
    id: 'dimmer',
    label: 'Dimmer',
    widgetType: 'dimmer',
    category: 'lighting',
    secondaryDps: [],
  },
  {
    id: 'switch_light',
    label: 'Lichtschalter',
    widgetType: 'switch',
    category: 'lighting',
    secondaryDps: [],
  },

  // ── SCHALTEN ─────────────────────────────────────────────────────────────
  {
    id: 'switch',
    label: 'Schalter',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [],
  },
  {
    id: 'socket',
    label: 'Steckdose',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [],
  },
  {
    id: 'fan',
    label: 'Ventilator',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [],
  },

  // ── SICHERHEIT ───────────────────────────────────────────────────────────
  {
    id: 'sensor_door',
    label: 'Tür',
    widgetType: 'switch',
    category: 'security',
    secondaryDps: [],
  },
  {
    id: 'sensor_window',
    label: 'Fenster',
    widgetType: 'switch',
    category: 'security',
    secondaryDps: [],
  },
  {
    id: 'sensor_motion',
    label: 'Bewegungsmelder',
    widgetType: 'switch',
    category: 'security',
    secondaryDps: [],
  },
  {
    id: 'sensor_smoke',
    label: 'Rauchmelder',
    widgetType: 'switch',
    category: 'security',
    secondaryDps: [],
  },

  // ── ENERGIE ──────────────────────────────────────────────────────────────
  {
    id: 'value_power',
    label: 'Leistung (W)',
    widgetType: 'value',
    category: 'energy',
    secondaryDps: [],
  },
  {
    id: 'value_energy',
    label: 'Energie (kWh)',
    widgetType: 'value',
    category: 'energy',
    secondaryDps: [],
  },

  // ── MESSWERTE ────────────────────────────────────────────────────────────
  {
    id: 'value_temperature',
    label: 'Temperatur',
    widgetType: 'value',
    category: 'sensor',
    secondaryDps: [],
  },
  {
    id: 'value_humidity',
    label: 'Luftfeuchte',
    widgetType: 'value',
    category: 'sensor',
    secondaryDps: [],
  },
  {
    id: 'value',
    label: 'Messwert',
    widgetType: 'value',
    category: 'sensor',
    secondaryDps: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Role → Template matching (more specific than detectWidgetTypeFromRole)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most specific DpTemplate that matches the given role/valueType,
 * or null if none matches. Use this to pre-select a template chip.
 */
export function findTemplateByRole(role?: string, valueType?: string): DpTemplate | null {
  const r = (role ?? '').toLowerCase();

  // Shading
  if (r === 'level.blind' || r === 'level.curtain' || r.includes('blind') || r.includes('shutter') || r.includes('cover'))
    return DP_TEMPLATES.find((t) => t.id === 'shutter')!;
  if (r.includes('awning'))
    return DP_TEMPLATES.find((t) => t.id === 'awning')!;

  // Climate
  if (r === 'level.temperature' || r.startsWith('heating') || (r.includes('temperature') && r.includes('level')))
    return DP_TEMPLATES.find((t) => t.id === 'thermostat')!;

  // Dimmer
  if (r === 'level.dimmer' || r === 'level.brightness' || r.includes('dimmer') || r.includes('brightness') || r.startsWith('level.color'))
    return DP_TEMPLATES.find((t) => t.id === 'dimmer')!;
  if (r === 'level.volume' || r === 'media.volume')
    return DP_TEMPLATES.find((t) => t.id === 'dimmer')!;
  if (r.startsWith('level.') || r === 'level')
    return DP_TEMPLATES.find((t) => t.id === 'dimmer')!;

  // Security sensors
  if (r.startsWith('sensor.door') || r === 'door')
    return DP_TEMPLATES.find((t) => t.id === 'sensor_door')!;
  if (r.startsWith('sensor.window') || r === 'window')
    return DP_TEMPLATES.find((t) => t.id === 'sensor_window')!;
  if (r.startsWith('sensor.motion') || r === 'motion' || r.includes('presence'))
    return DP_TEMPLATES.find((t) => t.id === 'sensor_motion')!;
  if (r.startsWith('sensor.smoke') || r.includes('smoke') || r.includes('alarm.fire'))
    return DP_TEMPLATES.find((t) => t.id === 'sensor_smoke')!;

  // Switch sub-types
  if (r === 'switch.light')
    return DP_TEMPLATES.find((t) => t.id === 'switch_light')!;
  if (r === 'switch.power' || r.startsWith('socket') || r === 'indicator.power')
    return DP_TEMPLATES.find((t) => t.id === 'socket')!;
  if (r === 'switch' || r.startsWith('switch.') || r === 'button' || r.startsWith('indicator.') || r.startsWith('sensor.') || valueType === 'boolean')
    return DP_TEMPLATES.find((t) => t.id === 'switch')!;

  // Value sub-types
  if (r === 'value.temperature' || r === 'temperature')
    return DP_TEMPLATES.find((t) => t.id === 'value_temperature')!;
  if (r === 'value.humidity' || r === 'humidity')
    return DP_TEMPLATES.find((t) => t.id === 'value_humidity')!;
  if (r === 'value.power' || r === 'value.power.consumption' || r.includes('energy'))
    return DP_TEMPLATES.find((t) => t.id === 'value_energy')!;
  if (r.startsWith('value.') || r === 'value' || valueType === 'number')
    return DP_TEMPLATES.find((t) => t.id === 'value')!;

  return null;
}
