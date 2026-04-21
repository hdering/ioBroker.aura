import type { DatapointEntry } from '../hooks/useDatapointList';
import type { WidgetType } from '../types';

export interface DetectedWidget {
  datapoint: DatapointEntry;
  type: WidgetType;
  title: string;
  unit?: string;
  score: number;
}

// ── widget type detection ──────────────────────────────────────────────────

export function detectType(dp: DatapointEntry): { type: WidgetType; unit?: string } {
  const role = (dp.role ?? '').toLowerCase();
  const name = dp.name.toLowerCase();
  const unit = dp.unit ?? '';

  // Thermostat – writable temperature setpoint
  if (role.includes('thermostat') || role.includes('temp.set') || name.includes('solltemp') || name.includes('setpoint'))
    return { type: 'thermostat' };

  // Temperature sensor
  if (role.includes('temperature') || name.includes('temperatur') || unit === '°C')
    return { type: 'value', unit: unit || '°C' };

  // Roller shutter – dedicated shutter widget
  if (
    role.includes('level.blind') || role.includes('level.roller') || role === 'blind' || role === 'roller' ||
    (unit === '%' && (name.includes('rollade') || name.includes('rollo') || name.includes('jalousie') || name.includes('shutter') || name.includes('blind')))
  )
    return { type: 'shutter', unit: '%' };

  // Dimmer / brightness level
  if (role.includes('level.dimmer') || role.includes('level.brightness') || name.includes('dimmer') || name.includes('helligkeit'))
    return { type: 'dimmer' };

  // Power / energy
  if (unit === 'W' || unit === 'VA' || role.includes('value.power'))
    return { type: 'value', unit };
  if (unit === 'kWh' || unit === 'Wh' || role.includes('value.energy'))
    return { type: 'value', unit };

  // Humidity
  if (unit === '%' && (role.includes('humid') || name.includes('feuchte') || name.includes('feuchtigkeit')))
    return { type: 'value', unit: '%' };

  // Battery percentage value
  if (role.includes('value.battery') || (role.includes('battery') && dp.type === 'number'))
    return { type: 'value', unit: unit || '%' };

  // Window / door contact sensor
  if (role.includes('sensor.window') || role.includes('sensor.door'))
    return { type: 'windowcontact' };

  // Read-only binary indicators: lowbat, maintenance, motion, alarm, lock, …
  if (
    role.startsWith('indicator') ||
    role.includes('sensor.motion') || role === 'motion' ||
    role.includes('sensor.alarm') || role.includes('sensor.lock') ||
    role.includes('lowbat')
  )
    return { type: 'binarysensor' };

  // Any other read-only boolean → binary sensor
  if (dp.write === false && dp.type === 'boolean')
    return { type: 'binarysensor' };

  // Writable boolean / explicit switch/button role
  if (dp.type === 'boolean' || role.includes('switch') || role.includes('button'))
    return { type: 'switch' };

  // Generic numeric value
  if (dp.type === 'number')
    return { type: 'value', unit: unit || undefined };

  return { type: 'value' };
}

// ── normalisation ──────────────────────────────────────────────────────────

/** Lowercase + German umlaut → ascii so 'Rolläden' = 'rollaeden' etc. */
function norm(s: string): string {
  return s.toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

// ── scoring constants (pre-normalised at module load) ──────────────────────

/**
 * ioBroker role (normalised) → topic tokens this role belongs to.
 * Pre-computed once so inner loops stay cheap.
 */
const ROLE_TOPIC_MAP_NORM: Array<[string, string[]]> = [
  ['level.blind',       ['rollaeden', 'shutter', 'blind', 'jalousie', 'rollo', 'beschattung', 'markise']],
  ['level.roller',      ['rollaeden', 'shutter', 'blind', 'rollo']],
  ['blind',             ['rollaeden', 'shutter', 'blind']],
  ['level.dimmer',      ['licht', 'dimmer', 'helligkeit']],
  ['level.brightness',  ['licht', 'dimmer', 'hell']],
  ['switch',            ['licht', 'steckdose', 'steckdosen', 'schalter']],
  ['sensor.window',     ['sicherheit', 'fenster', 'window']],
  ['sensor.door',       ['sicherheit', 'tuer', 'door']],
  ['motion',            ['sicherheit', 'bewegung']],
  ['sensor.motion',     ['sicherheit', 'bewegung']],
  ['sensor.alarm',      ['sicherheit', 'alarm']],
  ['value.temperature', ['temperatur', 'heizung', 'klima']],
  ['temperature',       ['temperatur', 'heizung', 'klima']],
  ['thermostat',        ['heizung', 'temperatur']],
  ['value.power',       ['energie', 'verbrauch', 'strom']],
  ['value.energy',      ['energie', 'verbrauch', 'strom']],
  ['value.humidity',    ['klima', 'feuchte', 'luftfeuchtigkeit']],
];

/** topic key (normalised) → synonyms (normalised) to search in name/role/id */
const KEYWORDS_NORM: Array<[string, string[]]> = [
  ['licht',       ['light', 'lamp', 'lampe', 'led', 'leuchte', 'beleuchtung', 'dimmer', 'bulb', 'switch']],
  ['heizung',     ['heiz', 'heat', 'thermostat', 'radiator', 'boiler', 'solltemp', 'setpoint', 'warmwasser']],
  ['temperatur',  ['temp', 'temperature', 'celsius', 'grad']],
  ['steckdose',   ['socket', 'outlet', 'plug', 'stecker', 'dose', 'schuko']],
  ['rollaeden',   ['shutter', 'blind', 'rolladen', 'rollaeden', 'rollo', 'jalousie', 'vorhang', 'curtain', 'markise', 'beschattung']],
  ['energie',     ['energy', 'power', 'strom', 'verbrauch', 'watt', 'kwh', 'leistung', 'zaehler', 'meter']],
  ['sicherheit',  ['security', 'alarm', 'door', 'window', 'motion', 'contact', 'tuer', 'fenster', 'bewegung', 'rauch', 'smoke']],
  ['klima',       ['climate', 'ac', 'klima', 'luft', 'humidity', 'feuchte', 'lueftung', 'ventil', 'luftfeuchtigkeit']],
];

// ── per-dp scoring (all inputs already normalised) ─────────────────────────

function scoreNorm(
  nt: string,         // normalised topic
  funcs: string[],
  rooms: string[],
  nn: string,         // norm(dp.name)
  ni: string,         // norm(dp.id)
  nr: string,         // norm(dp.role)
): number {
  // 1. Function enum – highest confidence
  for (const f of funcs) {
    const l = norm(f);
    if (l === nt) return 1.0;
    if (l.includes(nt) || nt.includes(l)) return 0.85;
  }
  // 2. Room enum
  for (const r of rooms) {
    const l = norm(r);
    if (l === nt) return 1.0;
    if (l.includes(nt) || nt.includes(l)) return 0.85;
  }
  // 3. Direct match in name or role
  if (nn.includes(nt) || nr.includes(nt)) return 0.75;
  // 4. Match in id segments
  if (ni.split('.').some((seg) => seg === nt)) return 0.7;
  if (ni.includes(nt)) return 0.6;
  // 5. Role-based topic matching
  for (const [rp, topics] of ROLE_TOPIC_MAP_NORM) {
    if (nr.includes(rp)) {
      for (const tp of topics) {
        if (nt === tp || nt.startsWith(tp) || tp.startsWith(nt)) return 0.7;
      }
    }
  }
  // 6. Synonym lookup (prefix-match topic against keyword keys)
  let syns: string[] | undefined;
  for (const [key, s] of KEYWORDS_NORM) {
    if (key === nt || nt.startsWith(key) || key.startsWith(nt)) { syns = s; break; }
  }
  if (syns) {
    for (const s of syns) {
      if (nn.includes(s) || nr.includes(s) || ni.includes(s)) return 0.65;
    }
  }
  // 7. Reverse synonym lookup
  for (const [, normSyns] of KEYWORDS_NORM) {
    if (normSyns.some((s) => nt === s || nt.startsWith(s) || s.startsWith(nt))) {
      if (normSyns.some((s) => nn.includes(s) || nr.includes(s) || ni.includes(s))) return 0.5;
    }
  }
  return 0;
}

// ── public API ─────────────────────────────────────────────────────────────

export function scoreDatapoint(dp: DatapointEntry, topic: string): number {
  return scoreNorm(
    norm(topic),
    dp.funcs, dp.rooms,
    norm(dp.name), norm(dp.id), norm(dp.role ?? ''),
  );
}

export function cleanTitle(dp: DatapointEntry): string {
  if (dp.name && dp.name !== dp.id.split('.').pop()) return dp.name;
  const segs = dp.id.split('.');
  return segs.slice(-2).join(' › ');
}

export function detectWidgets(
  datapoints: DatapointEntry[],
  topic: string,
  maxItems = 500,
): DetectedWidget[] {
  const nt = norm(topic);
  const results: DetectedWidget[] = [];
  for (const dp of datapoints) {
    // Normalise each DP's fields once, reuse across all scoring steps
    const score = scoreNorm(nt, dp.funcs, dp.rooms, norm(dp.name), norm(dp.id), norm(dp.role ?? ''));
    if (score === 0) continue;
    const { type, unit } = detectType(dp);
    results.push({ datapoint: dp, type, title: cleanTitle(dp), unit, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, maxItems);
}

// ── homepage auto-detection ────────────────────────────────────────────────

const HOMEPAGE_CATEGORIES = [
  { topic: 'temperatur', max: 4, label: 'Temperatur' },
  { topic: 'licht',      max: 5, label: 'Licht' },
  { topic: 'energie',    max: 3, label: 'Energie' },
  { topic: 'heizung',    max: 3, label: 'Heizung' },
  { topic: 'klima',      max: 2, label: 'Klima' },
  { topic: 'rollaeden',  max: 3, label: 'Rolläden' },
  { topic: 'sicherheit', max: 3, label: 'Sicherheit' },
];

export interface HomepageCategory {
  label: string;
  widgets: DetectedWidget[];
}

export function detectHomepage(datapoints: DatapointEntry[]): {
  sections: HomepageCategory[];
  allWidgets: DetectedWidget[];
} {
  const seen = new Set<string>();
  const sections: HomepageCategory[] = [];

  const clockWidget: DetectedWidget = {
    datapoint: { id: '__clock__', name: 'Uhrzeit', rooms: [], funcs: [], logging: [] },
    type: 'clock', title: 'Uhrzeit', score: 1,
  };
  sections.push({ label: 'Uhrzeit', widgets: [clockWidget] });
  seen.add('__clock__');

  for (const { topic, max, label } of HOMEPAGE_CATEGORIES) {
    const found = detectWidgets(datapoints, topic, max * 10)
      .filter((w) => !seen.has(w.datapoint.id))
      .slice(0, max);
    if (found.length === 0) continue;
    found.forEach((w) => seen.add(w.datapoint.id));
    sections.push({ label, widgets: found });
  }

  return { sections, allWidgets: sections.flatMap((s) => s.widgets) };
}
