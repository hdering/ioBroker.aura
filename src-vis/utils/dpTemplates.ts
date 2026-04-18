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

  // ── WINDOW / DOOR CONTACT ─────────────────────────────────────────────────
  if (r === 'sensor.window' || r === 'window') return 'windowcontact';
  if (r === 'sensor.door' || r === 'door') return 'windowcontact';

  // ── SWITCH / BUTTON / SENSOR / INDICATOR ──────────────────────────────────
  if (r === 'switch' || r.startsWith('switch.')) return 'switch';
  if (r === 'button') return 'switch';
  if (r.startsWith('indicator.')) return 'switch';
  if (r.startsWith('sensor.')) return 'switch';
  if (r === 'motion' || r.startsWith('sensor.motion') || r.includes('presence')) return 'binarysensor';
  if (r.startsWith('sensor.alarm') || r === 'alarm' || r.includes('smoke')) return 'binarysensor';
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
  { id: 'special',   label: 'Sonstiges'         },
];

// ─────────────────────────────────────────────────────────────────────────────
// Template definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface DpTemplate {
  id: string;
  label: string;
  /** Emoji icon shown in the wizard card */
  icon: string;
  widgetType: WidgetType;
  category: string;
  /** Default options merged into the widget on creation */
  defaultOptions?: Record<string, unknown>;
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
    icon: '🪟',
    widgetType: 'shutter',
    category: 'shading',
    secondaryDps: [
      {
        // HomeMatic: WORKING (classic), ACTIVITY_STATE (HmIP), PROCESS (some models)
        // Shelly: state  |  zigbee/deconz: moving
        optionKey: 'activityDp',
        siblingNames: ['WORKING', 'working', 'ACTIVITY_STATE', 'activity_state', 'PROCESS', 'process', 'state', 'moving', 'activity', 'ACTIVITY'],
      },
      {
        // HomeMatic: DIRECTION  |  (Shelly/zigbee have no dedicated direction DP)
        optionKey: 'directionDp',
        siblingNames: ['DIRECTION', 'direction'],
      },
      {
        // HomeMatic: STOP  |  Shelly: Pause
        optionKey: 'stopDp',
        siblingNames: ['STOP', 'stop', 'Pause', 'pause'],
      },
    ],
  },
  {
    id: 'awning',
    label: 'Markise',
    icon: '⛱',
    widgetType: 'shutter',
    category: 'shading',
    secondaryDps: [
      {
        optionKey: 'activityDp',
        siblingNames: ['WORKING', 'working', 'ACTIVITY_STATE', 'activity_state', 'PROCESS', 'process', 'state', 'moving', 'activity', 'ACTIVITY'],
      },
      {
        optionKey: 'directionDp',
        siblingNames: ['DIRECTION', 'direction'],
      },
      {
        optionKey: 'stopDp',
        siblingNames: ['STOP', 'stop', 'Pause', 'pause'],
      },
    ],
  },

  // ── KLIMA ────────────────────────────────────────────────────────────────
  {
    id: 'thermostat',
    label: 'Thermostat',
    icon: '🌡',
    widgetType: 'thermostat',
    category: 'climate',
    secondaryDps: [
      {
        // HomeMatic: ACTUAL_TEMPERATURE  |  generic: ACTUAL, TEMPERATURE
        // Shelly TRV: temperatureC  |  zigbee: local_temperature
        optionKey: 'actualDatapoint',
        siblingNames: [
          'ACTUAL_TEMPERATURE', 'ACTUAL_TEMP',
          'ACTUAL', 'actual',
          'local_temperature', 'localTemperature',
          'temperatureC', 'temperature_c',
          'TEMPERATURE', 'temperature',
          'TEMP', 'temp',
          'MEASURED_TEMPERATURE',
        ],
      },
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },

  // ── LICHT ────────────────────────────────────────────────────────────────
  {
    id: 'dimmer',
    label: 'Dimmer',
    icon: '🔆',
    widgetType: 'dimmer',
    category: 'lighting',
    secondaryDps: [
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'switch_light',
    label: 'Lichtschalter',
    icon: '💡',
    widgetType: 'switch',
    category: 'lighting',
    secondaryDps: [
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },

  // ── SCHALTEN ─────────────────────────────────────────────────────────────
  {
    id: 'switch',
    label: 'Schalter',
    icon: '🔘',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'socket',
    label: 'Steckdose',
    icon: '🔌',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'fan',
    label: 'Ventilator',
    icon: '🌀',
    widgetType: 'switch',
    category: 'switching',
    secondaryDps: [
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },

  // ── SICHERHEIT ───────────────────────────────────────────────────────────
  {
    id: 'sensor_door',
    label: 'Tür',
    icon: '🚪',
    widgetType: 'windowcontact',
    category: 'security',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'sensor_window',
    label: 'Fenster',
    icon: '🪟',
    widgetType: 'windowcontact',
    category: 'security',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'sensor_motion',
    label: 'Bewegung',
    icon: '👁',
    widgetType: 'binarysensor',
    category: 'security',
    defaultOptions: { sensorType: 'motion' },
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'sensor_smoke',
    label: 'Rauchmelder',
    icon: '🚨',
    widgetType: 'binarysensor',
    category: 'security',
    defaultOptions: { sensorType: 'smoke' },
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },

  // ── ENERGIE ──────────────────────────────────────────────────────────────
  {
    id: 'value_power',
    label: 'Leistung (W)',
    icon: '⚡',
    widgetType: 'value',
    category: 'energy',
    secondaryDps: [],
  },
  {
    id: 'value_energy',
    label: 'Energie (kWh)',
    icon: '🔋',
    widgetType: 'value',
    category: 'energy',
    secondaryDps: [],
  },

  // ── MESSWERTE ────────────────────────────────────────────────────────────
  {
    id: 'value_temperature',
    label: 'Temperatur',
    icon: '🌡',
    widgetType: 'value',
    category: 'sensor',
    secondaryDps: [],
  },
  {
    id: 'value_humidity',
    label: 'Luftfeuchte',
    icon: '💧',
    widgetType: 'value',
    category: 'sensor',
    secondaryDps: [],
  },
  {
    id: 'value',
    label: 'Messwert',
    icon: '📊',
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

  // Window / door contacts
  if (r.startsWith('sensor.door') || r === 'door')
    return DP_TEMPLATES.find((t) => t.id === 'sensor_door')!;
  if (r.startsWith('sensor.window') || r === 'window')
    return DP_TEMPLATES.find((t) => t.id === 'sensor_window')!;
  if (r.startsWith('sensor.motion') || r === 'motion' || r.includes('presence'))
    return DP_TEMPLATES.find((t) => t.id === 'sensor_motion')!;
  if (r.startsWith('sensor.smoke') || r.includes('smoke') || r.includes('alarm.fire') || r.includes('alarm'))
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
