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

  if (role.includes('thermostat') || role.includes('temp.set') || name.includes('solltemp') || name.includes('setpoint'))
    return { type: 'thermostat' };
  if (role.includes('temperature') || name.includes('temperatur') || unit === '°C')
    return { type: 'value', unit: unit || '°C' };
  if (role.includes('level.dimmer') || role.includes('level.brightness') || name.includes('dimmer') || name.includes('helligkeit'))
    return { type: 'dimmer' };
  if (unit === 'W' || unit === 'VA' || role.includes('value.power'))
    return { type: 'value', unit };
  if (unit === 'kWh' || role.includes('value.energy'))
    return { type: 'value', unit };
  if (unit === '%' && (role.includes('level') || name.includes('rollade') || name.includes('rollo') || name.includes('jalousie') || name.includes('shutter') || name.includes('blind')))
    return { type: 'dimmer', unit: '%' };
  if (unit === '%' && (role.includes('humid') || name.includes('feuchte')))
    return { type: 'value', unit: '%' };
  if (dp.type === 'boolean' || role.includes('switch') || role.includes('button'))
    return { type: 'switch' };
  if (dp.type === 'number')
    return { type: 'value', unit: unit || undefined };

  return { type: 'value' };
}

// ── scoring ────────────────────────────────────────────────────────────────

// Normalise a search term for comparison
function norm(s: string) { return s.toLowerCase().trim(); }

// Does any of the dp's enum labels match the topic?
function enumScore(labels: string[], topic: string): number {
  const t = norm(topic);
  for (const label of labels) {
    const l = norm(label);
    if (l === t) return 1.0;
    if (l.includes(t) || t.includes(l)) return 0.85;
  }
  return 0;
}

// Role / name / id keyword fallback (kept from original, simplified)
const ROLE_KEYWORDS: Record<string, string[]> = {
  licht:      ['light', 'lamp', 'lampe', 'led', 'leuchte', 'beleuchtung', 'dimmer', 'bulb', 'switch'],
  heizung:    ['heiz', 'heat', 'thermostat', 'radiator', 'boiler', 'solltemp', 'setpoint'],
  temperatur: ['temp', 'temperature', 'celsius', 'klima', 'grad'],
  steckdose:  ['socket', 'outlet', 'plug', 'stecker', 'dose'],
  rollade:    ['shutter', 'blind', 'rolladen', 'jalousie', 'vorhang', 'curtain', 'rollo', 'level'],
  energie:    ['energy', 'power', 'strom', 'verbrauch', 'watt', 'kwh', 'leistung'],
  sicherheit: ['security', 'alarm', 'door', 'window', 'motion', 'contact', 'tür', 'fenster'],
  klima:      ['climate', 'ac', 'klimaanlage', 'luft', 'humidity', 'feuchte', 'lüftung'],
};

function keywordScore(dp: DatapointEntry, topic: string): number {
  const t = norm(topic);
  const name = dp.name.toLowerCase();
  const id = dp.id.toLowerCase();
  const role = (dp.role ?? '').toLowerCase();

  if (name.includes(t) || role.includes(t)) return 0.75;
  if (id.split('.').some((seg) => seg === t)) return 0.7;
  if (id.includes(t)) return 0.6;

  const synonyms = ROLE_KEYWORDS[t] ?? [];
  for (const s of synonyms) {
    if (name.includes(s) || role.includes(s) || id.includes(s)) return 0.65;
  }
  // reverse synonym lookup
  for (const [, syns] of Object.entries(ROLE_KEYWORDS)) {
    if (syns.includes(t)) {
      if (syns.some((s) => name.includes(s) || role.includes(s))) return 0.5;
    }
  }
  return 0;
}

export function scoreDatapoint(dp: DatapointEntry, topic: string): number {
  // 1. Function enum (highest confidence – ioBroker user explicitly tagged it)
  const funcScore = enumScore(dp.funcs, topic);
  if (funcScore > 0) return funcScore;

  // 2. Room enum
  const roomScore = enumScore(dp.rooms, topic);
  if (roomScore > 0) return roomScore;

  // 3. Role / name / id keyword fallback
  return keywordScore(dp, topic);
}

// ── title helper ───────────────────────────────────────────────────────────

function cleanTitle(dp: DatapointEntry): string {
  if (dp.name && dp.name !== dp.id.split('.').pop()) return dp.name;
  const segs = dp.id.split('.');
  return segs.slice(-2).join(' › ');
}

// ── topic search ───────────────────────────────────────────────────────────

export function detectWidgets(
  datapoints: DatapointEntry[],
  topic: string,
  maxItems = 500,
): DetectedWidget[] {
  const results: DetectedWidget[] = [];
  for (const dp of datapoints) {
    const score = scoreDatapoint(dp, topic);
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
  { topic: 'rollade',    max: 3, label: 'Rolläden' },
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
    datapoint: { id: '__clock__', name: 'Uhrzeit', rooms: [], funcs: [] },
    type: 'clock',
    title: 'Uhrzeit',
    score: 1,
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
