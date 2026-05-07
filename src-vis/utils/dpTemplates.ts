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
  /**
   * Names of the writable PRIMARY sibling DP (the main datapoint for this widget).
   * When the user selects a DP whose last segment matches a secondaryDps siblingName,
   * the system looks for one of these in the same channel and promotes it to be the
   * main datapoint (e.g. user selects ACTUAL_TEMPERATURE → promotes SET_TEMPERATURE).
   */
  primarySiblingNames?: string[];
  /** Short hint shown in ManualWidgetDialog – when to use this template */
  hint?: string;
}

export const DP_TEMPLATES: DpTemplate[] = [

  // ── BESCHATTUNG ───────────────────────────────────────────────────────────
  {
    id: 'shutter',
    label: 'Rollladen / Markise',
    icon: '🪟',
    widgetType: 'shutter',
    category: 'shading',
    hint: 'Für alle positionsgesteuerten Beschattungsgeräte: Rollladen, Jalousie, Rollo, Markise – Datenpunkt liefert 0–100 %',
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
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow', 'BATTERY_LOW'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'] },
    ],
  },

  // ── KLIMA ────────────────────────────────────────────────────────────────
  {
    id: 'thermostat',
    label: 'Thermostat',
    icon: '🌡',
    widgetType: 'thermostat',
    category: 'climate',
    hint: 'Für Heizkörper-Thermostate (HmIP-eTRV, Zigbee TRV …) – Datenpunkt ist der Soll-Temperatur-Setpoint; Ist-Temperatur wird automatisch erkannt',
    primarySiblingNames: [
      // Homematic classic (HM-CC-RT-DN, HM-TC-IT-WM)
      'SET_TEMPERATURE', 'set_temperature', 'SET_TEMP', 'set_temp',
      // Homematic IP (HmIP-WTH, HmIP-eTRV, HmIP-BWTH)
      'SET_POINT_TEMPERATURE', 'SETPOINT_TEMPERATURE', 'set_point_temperature',
      // German alias
      'SOLLTEMPERATUR', 'solltemperatur', 'Solltemperatur',
      // Generic / zigbee2mqtt / deconz
      'setpoint', 'SETPOINT', 'Setpoint',
      'target_temperature', 'TARGET_TEMPERATURE', 'targetTemperature', 'TARGET_TEMP',
      'occupied_heating_setpoint', 'OCCUPIED_HEATING_SETPOINT',
      // MAX! / eQ-3
      'DESIRED_TEMPERATURE', 'desired_temperature',
    ],
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

  {
    id: 'climate',
    label: 'Raumklima',
    icon: '🌡️',
    widgetType: 'climate',
    category: 'climate',
    hint: 'Für Temperatur- und Luftfeuchtigkeitssensoren – zeigt Ist-Temp, Feuchte und optionalen Verlauf',
    secondaryDps: [
      {
        optionKey: 'humidityDatapoint',
        siblingNames: [
          'HUMIDITY', 'humidity', 'Humidity',
          'RELATIVE_HUMIDITY', 'relative_humidity',
          'relativeHumidity', 'hum', 'HUM',
          'FEUCHTE', 'feuchte',
        ],
      },
    ],
  },

  // ── LICHT ────────────────────────────────────────────────────────────────
  {
    id: 'dimmer',
    label: 'Dimmer',
    icon: '🔆',
    widgetType: 'dimmer',
    category: 'lighting',
    hint: 'Für dimmbare Leuchten – Datenpunkt steuert die Helligkeit (0–100 %); eignet sich auch für Lautstärke und andere Pegelwerte',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow', 'BATTERY_LOW'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'] },
    ],
  },
  // ── SCHALTEN ─────────────────────────────────────────────────────────────
  {
    id: 'switch',
    label: 'Schalter',
    icon: '🔘',
    widgetType: 'switch',
    category: 'switching',
    hint: 'Für alles mit Ein/Aus: Lichtschalter, Steckdose, Ventilator, Szene – Datenpunkt ist ein Boolean (true/false)',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow', 'BATTERY_LOW'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'] },
    ],
  },

  // ── SICHERHEIT ───────────────────────────────────────────────────────────
  {
    id: 'sensor_contact',
    label: 'Fenster / Tür',
    icon: '🚪',
    widgetType: 'windowcontact',
    category: 'security',
    hint: 'Für Reed-Kontakte an Fenstern oder Türen – zeigt offen/geschlossen mit passendem Icon und Statusfarbe',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },
  {
    id: 'sensor_binary',
    label: 'Binärsensor',
    icon: '👁',
    widgetType: 'binarysensor',
    category: 'security',
    hint: 'Für Bewegungsmelder, Rauchmelder, Wassermelder und andere Alarm-/Statussensoren – zeigt aktiv/inaktiv mit konfigurierbarem Icon',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE'] },
    ],
  },

  // ── MESSWERTE ────────────────────────────────────────────────────────────
  {
    id: 'value',
    label: 'Messwert',
    icon: '📊',
    widgetType: 'value',
    category: 'sensor',
    hint: 'Für jeden Zahlenwert: Temperatur, Luftfeuchte, Leistung (W), Energie (kWh), CO₂ oder beliebiger Sensor – nur Anzeige, kein Schreiben',
    secondaryDps: [
      { optionKey: 'batteryDp', siblingNames: ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow', 'BATTERY_LOW'] },
      { optionKey: 'unreachDp', siblingNames: ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'] },
    ],
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
    return DP_TEMPLATES.find((t) => t.id === 'shutter')!;

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
  if (r.startsWith('sensor.door') || r === 'door' || r.startsWith('sensor.window') || r === 'window')
    return DP_TEMPLATES.find((t) => t.id === 'sensor_contact')!;
  if (r.startsWith('sensor.motion') || r === 'motion' || r.includes('presence') || r.startsWith('sensor.smoke') || r.includes('smoke') || r.includes('alarm.fire') || r.includes('alarm'))
    return DP_TEMPLATES.find((t) => t.id === 'sensor_binary')!;

  // Switch sub-types — all map to the single 'switch' template
  if (r === 'switch.light' || r === 'switch.power' || r.startsWith('socket') || r === 'indicator.power' ||
      r === 'switch' || r.startsWith('switch.') || r === 'button' || r.startsWith('indicator.') || r.startsWith('sensor.') || valueType === 'boolean')
    return DP_TEMPLATES.find((t) => t.id === 'switch')!;

  // Value sub-types — all map to the single 'value' template
  if (r === 'value.temperature' || r === 'temperature' || r === 'value.humidity' || r === 'humidity' ||
      r === 'value.power' || r === 'value.power.consumption' || r.includes('energy') ||
      r.startsWith('value.') || r === 'value' || valueType === 'number')
    return DP_TEMPLATES.find((t) => t.id === 'value')!;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse-lookup: selected DP is secondary → find the primary main DP
// ─────────────────────────────────────────────────────────────────────────────

export interface MainDpUpgrade {
  /** The writable primary DP that should become the widget's main datapoint */
  mainDpId: string;
  /** The option key under which the originally selected DP should be stored */
  selectedOptionKey: string;
  template: DpTemplate;
}

/**
 * When the user selects a DP that is a secondary (e.g. ACTUAL_TEMPERATURE) of a
 * template that has a primary sibling (e.g. SET_TEMPERATURE), return upgrade info
 * so the caller can swap the main datapoint and set the correct widget type.
 *
 * Detection is two-stage:
 * 1. Name-based: last segment of the selected DP matches a secondaryDps siblingName,
 *    AND a primarySiblingNames match is found in the same channel.
 * 2. Role-based fallback: selected DP has a read-only temperature role (value.temperature),
 *    AND a sibling with a writable temperature role (level.temperature) exists.
 *
 * Returns null when no upgrade can be determined.
 */
export function findMainDpForSecondary(
  selectedDpId: string,
  entries: Array<{ id: string; role?: string; write?: boolean }>,
): MainDpUpgrade | null {
  const lastSeg  = selectedDpId.split('.').pop() ?? '';
  const parent   = selectedDpId.split('.').slice(0, -1).join('.');
  const parentUp = selectedDpId.split('.').slice(0, -2).join('.');
  const sibs   = entries.filter((e) => e.id.startsWith(parent + '.') && e.id !== selectedDpId);
  const sibsUp = entries.filter((e) => e.id.startsWith(parentUp + '.'));

  const thermostatTpl = DP_TEMPLATES.find((t) => t.id === 'thermostat')!;

  // ── Stage 1: name-based ──────────────────────────────────────────────────
  for (const tpl of DP_TEMPLATES) {
    if (!tpl.primarySiblingNames?.length) continue;
    let matchedOptionKey: string | null = null;
    for (const sdp of tpl.secondaryDps) {
      if (sdp.siblingNames.includes(lastSeg)) { matchedOptionKey = sdp.optionKey; break; }
    }
    if (!matchedOptionKey) continue;
    const mainDpId =
      tpl.primarySiblingNames.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean) ??
      tpl.primarySiblingNames.map((n) => sibsUp.find((e) => e.id === `${parentUp}.0.${n}`)?.id).find(Boolean);
    if (mainDpId) return { mainDpId, selectedOptionKey: matchedOptionKey, template: tpl };
  }

  // ── Stage 2: role-based fallback (covers adapters with non-standard DP names) ──
  const selectedEntry = entries.find((e) => e.id === selectedDpId);
  const selectedRole  = (selectedEntry?.role ?? '').toLowerCase();
  const isActualTemp  = selectedRole === 'value.temperature' || selectedRole === 'temperature';
  if (isActualTemp) {
    // Look for a writable temperature sibling (the setpoint)
    const isWritableSetpoint = (e: { role?: string; write?: boolean }) => {
      const r = (e.role ?? '').toLowerCase();
      return (r === 'level.temperature' || r.includes('temp.set')) && e.write !== false;
    };
    const mainDpId =
      sibs.find(isWritableSetpoint)?.id ??
      sibsUp.find(isWritableSetpoint)?.id;
    if (mainDpId) return { mainDpId, selectedOptionKey: 'actualDatapoint', template: thermostatTpl };
  }

  return null;
}

// ── Generic battery/unreach auto-detection ─────────────────────────────────

const BATTERY_NAMES = ['LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow', 'BATTERY_LOW'];
const UNREACH_NAMES = ['UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline', 'OFFLINE'];

/**
 * Looks for battery and unreach sibling DPs next to dpId.
 * Works for all widget types regardless of template.
 */
export function autoDetectStatusDps(
  dpId: string,
  entries: Array<{ id: string }>,
): { batteryDp?: string; unreachDp?: string } {
  const parts = dpId.split('.');
  const parent   = parts.slice(0, -1).join('.');
  const parentUp = parts.slice(0, -2).join('.');
  const sibs   = entries.filter((e) => e.id.startsWith(parent + '.'));
  const sibsUp = entries.filter((e) => e.id.startsWith(parentUp + '.'));
  const find   = (names: string[]) =>
    names.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean);
  const findUp = (names: string[]) =>
    names.map((n) => sibsUp.find((e) => e.id === `${parentUp}.0.${n}` || e.id === `${parentUp}.${n}`)?.id).find(Boolean);
  const result: { batteryDp?: string; unreachDp?: string } = {};
  const batt    = find(BATTERY_NAMES) ?? findUp(BATTERY_NAMES);
  const unreach = find(UNREACH_NAMES) ?? findUp(UNREACH_NAMES);
  if (batt)    result.batteryDp  = batt;
  if (unreach) result.unreachDp = unreach;
  return result;
}
