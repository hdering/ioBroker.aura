/**
 * Die Werte des Raumklima-Widgets.
 *
 * Temperatur, Feuchte, Luftdruck und Soll-Temperatur haben eigene Optionen, weil
 * es sie gab, bevor es die Liste gab. Jeder weitere Wert — CO₂, VOC, Taupunkt,
 * Helligkeit, Bewegung … — ist ein Eintrag in `options.metrics`, damit ein neuer
 * Messwert keine neue Option braucht (Issue #698).
 *
 * `resolveClimateMetrics` übersetzt die Altoptionen beim LESEN in dieselbe Form.
 * Die gespeicherte Konfiguration eines bestehenden Widgets wird dabei nie
 * angefasst: das Widget rendert nur noch eine Liste, alte Dashboards, die
 * Geräteerkennung und `aura_write` sehen weiter ihre gewohnten Schlüssel.
 */

import type { ClimateMetric, ClimateMetricSlot } from '../types';
import type { ColorThreshold } from './colorThresholds';
import { getThresholdColor } from './colorThresholds';
import { formatNum, type NumberFormat } from './formatValue';

/** Ein aufgelöster Wert — wie `ClimateMetric`, aber mit gefüllten Vorgaben. */
export interface ResolvedClimateMetric extends ClimateMetric {
    slot: ClimateMetricSlot;
    /** Kommt aus einer der Altoptionen und nicht aus `metrics`. */
    legacy?: boolean;
}

/** Was das Widget an Werten kennt, wenn ein abgeleiteter Wert gerechnet wird. */
export interface ClimateContext {
    temperature: number | null;
    humidity: number | null;
}

// ── Abgeleitete Werte ────────────────────────────────────────────────────────

/**
 * Taupunkt in °C nach Magnus (Koeffizienten für Wasser über 0 °C, Fehler < 0,1 K
 * zwischen −45 und +60 °C). Unter 1 % r. F. rechnet die Formel gegen −∞, deshalb
 * die untere Schranke.
 */
export function dewPoint(tempC: number | null, humidityPct: number | null): number | null {
    if (tempC === null || humidityPct === null) return null;
    const rh = Math.min(100, Math.max(1, humidityPct));
    const a = 17.62;
    const b = 243.12;
    const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
    const dp = (b * gamma) / (a - gamma);
    return Number.isFinite(dp) ? dp : null;
}

/**
 * Absolute Feuchte in g/m³ — wie viel Wasser wirklich in der Luft steht. Beim
 * Lüften im Winter die aussagekräftigere Zahl als die relative Feuchte.
 */
export function absoluteHumidity(tempC: number | null, humidityPct: number | null): number | null {
    if (tempC === null || humidityPct === null) return null;
    const rh = Math.min(100, Math.max(0, humidityPct));
    // Sättigungsdampfdruck (hPa) nach Magnus, dann ideales Gasgesetz.
    const es = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
    const e = (rh / 100) * es;
    const ah = (216.687 * e) / (tempC + 273.15);
    return Number.isFinite(ah) ? ah : null;
}

/**
 * Behaglichkeit als Stufe: 2 = behaglich, 1 = geht noch, 0 = unbehaglich.
 *
 * Dieselben Grenzen wie das bisherige Komfort-Abzeichen (18–24 °C, 40–60 % r. F.),
 * nur mit einer Zwischenstufe, damit die Skala zu der passt, die KNX-Multisensoren
 * selbst melden.
 */
export function comfortLevel(tempC: number | null, humidityPct: number | null): number | null {
    if (tempC === null && humidityPct === null) return null;
    const rate = (v: number | null, good: [number, number], ok: [number, number]): number => {
        if (v === null) return 1;
        if (v >= good[0] && v <= good[1]) return 2;
        if (v >= ok[0] && v <= ok[1]) return 1;
        return 0;
    };
    return Math.min(rate(tempC, [18, 24], [16, 27]), rate(humidityPct, [40, 60], [30, 70]));
}

// ── Vorlagen ─────────────────────────────────────────────────────────────────

export interface ClimateMetricTemplate {
    key: string;
    /** Name im Auswahlmenü. */
    label: string;
    /** Erklärung unter dem Namen. */
    hint?: string;
    /** Datenpunkt-Namen, an denen „Auto-Erkennen" den Wert bei den Geschwistern findet. */
    siblingNames?: string[];
    metric: Omit<ClimateMetric, 'id'>;
}

const GREEN = 'var(--accent-green)';
const YELLOW = 'var(--accent-yellow)';
const RED = 'var(--accent-red)';

/**
 * Fertig vorbelegte Werte. Die Vorlage ist nur ein Startwert — nach dem Anlegen
 * ist jedes Feld frei editierbar.
 */
export const CLIMATE_METRIC_TEMPLATES: ClimateMetricTemplate[] = [
    {
        key: 'co2',
        label: 'CO₂',
        hint: 'Kohlendioxid in ppm, mit Ampel ab 800 / 1400 ppm',
        siblingNames: ['CO2', 'co2', 'Co2', 'CO2_VALUE', 'carbonDioxide', 'CARBON_DIOXIDE', 'ppm'],
        metric: {
            source: 'datapoint',
            label: 'CO₂',
            icon: 'Wind',
            unit: 'ppm',
            decimals: 0,
            thresholds: [
                [800, GREEN],
                [1400, YELLOW],
                [2000, RED],
            ],
        },
    },
    {
        key: 'eco2',
        label: 'CO₂-VOC (eCO₂)',
        hint: 'Aus dem VOC-Wert gerechnetes CO₂-Äquivalent',
        siblingNames: ['eCO2', 'ECO2', 'CO2_VOC', 'co2Voc', 'VOC_CO2', 'equivalentCO2'],
        metric: {
            source: 'datapoint',
            label: 'CO₂-VOC',
            icon: 'Wind',
            unit: 'ppm',
            decimals: 0,
            thresholds: [
                [1000, GREEN],
                [1600, YELLOW],
                [2200, RED],
            ],
        },
    },
    {
        key: 'voc',
        label: 'VOC',
        hint: 'Flüchtige organische Verbindungen',
        siblingNames: ['VOC', 'voc', 'TVOC', 'tvoc', 'VOC_VALUE', 'airQualityVoc'],
        metric: {
            source: 'datapoint',
            label: 'VOC',
            icon: 'Waves',
            unit: 'ppb',
            decimals: 0,
            thresholds: [
                [100, GREEN],
                [300, YELLOW],
                [500, RED],
            ],
        },
    },
    {
        key: 'dewpoint',
        label: 'Taupunkt',
        hint: 'Aus Temperatur und Feuchte gerechnet — kein Datenpunkt nötig',
        siblingNames: ['DEWPOINT', 'DEW_POINT', 'dewpoint', 'dewPoint', 'Taupunkt', 'TAUPUNKT'],
        metric: { source: 'dewpoint', label: 'Taupunkt', icon: 'Droplet', unit: '°C', decimals: 1 },
    },
    {
        key: 'absoluteHumidity',
        label: 'Absolute Feuchte',
        hint: 'g Wasser je m³ Luft, aus Temperatur und Feuchte gerechnet',
        metric: { source: 'absoluteHumidity', label: 'abs. Feuchte', icon: 'Droplets', unit: 'g/m³', decimals: 1 },
    },
    {
        key: 'comfort',
        label: 'Behaglichkeit',
        hint: '0 unbehaglich · 1 geht noch · 2 behaglich',
        siblingNames: ['COMFORT', 'comfort', 'Behaglichkeit', 'BEHAGLICHKEIT', 'comfortLevel'],
        metric: {
            source: 'comfort',
            label: 'Behaglichkeit',
            icon: 'Smile',
            display: 'badge',
            valueMap: [
                { v: 0, label: 'unbehaglich', color: RED },
                { v: 1, label: 'geht noch', color: YELLOW },
                { v: 2, label: 'behaglich', color: GREEN },
            ],
        },
    },
    {
        key: 'airQuality',
        label: 'Luftqualität (Schulnote)',
        hint: 'Note 1 bis 6 als Text',
        siblingNames: ['AIR_QUALITY', 'airQuality', 'AQI', 'aqi', 'Luftqualitaet', 'LUFTQUALITAET'],
        metric: {
            source: 'datapoint',
            label: 'Luftqualität',
            icon: 'Gauge',
            display: 'badge',
            valueMap: [
                { v: 1, label: 'sehr gut', color: GREEN },
                { v: 2, label: 'gut', color: GREEN },
                { v: 3, label: 'befriedigend', color: YELLOW },
                { v: 4, label: 'ausreichend', color: YELLOW },
                { v: 5, label: 'mangelhaft', color: RED },
                { v: 6, label: 'ungenügend', color: RED },
            ],
        },
    },
    {
        key: 'lux',
        label: 'Helligkeit',
        hint: 'Beleuchtungsstärke in Lux',
        siblingNames: ['LUX', 'lux', 'ILLUMINANCE', 'illuminance', 'BRIGHTNESS', 'brightness', 'Helligkeit'],
        metric: { source: 'datapoint', label: 'Helligkeit', icon: 'Sun', unit: 'lx', decimals: 0 },
    },
    {
        key: 'motion',
        label: 'Bewegung',
        hint: 'Präsenz als Punkt — an, solange der Melder meldet',
        siblingNames: ['MOTION', 'motion', 'PRESENCE', 'presence', 'OCCUPANCY', 'occupancy', 'Bewegung'],
        metric: {
            source: 'datapoint',
            label: 'Bewegung',
            icon: 'Activity',
            display: 'dot',
            valueMap: [
                { v: true, label: 'Bewegung', color: GREEN },
                { v: false, label: 'ruhig' },
            ],
        },
    },
    {
        key: 'noise',
        label: 'Lautstärke',
        hint: 'Schallpegel in dB',
        siblingNames: ['NOISE', 'noise', 'SOUND', 'sound', 'DECIBEL', 'Lautstaerke'],
        metric: { source: 'datapoint', label: 'Lautstärke', icon: 'Volume2', unit: 'dB', decimals: 0 },
    },
    {
        key: 'custom',
        label: 'Freier Wert',
        hint: 'Beliebiger Datenpunkt, alles selbst einstellen',
        metric: { source: 'datapoint' },
    },
];

/** Eine Vorlage in einen fertigen Eintrag mit eigener Id verwandeln. */
export function metricFromTemplate(key: string, existing: readonly ClimateMetric[] = []): ClimateMetric {
    const tpl = CLIMATE_METRIC_TEMPLATES.find((t) => t.key === key) ?? CLIMATE_METRIC_TEMPLATES[0];
    const used = new Set(existing.map((m) => m.id));
    let id = tpl.key;
    let n = 2;
    while (used.has(id)) id = `${tpl.key}${n++}`;
    return { id, slot: 'grid', ...structuredClone(tpl.metric) };
}

// ── Auflösung ────────────────────────────────────────────────────────────────

/** Vorgabe-Schriftgröße je Platz, in px bei Skalierung 1. */
export const SLOT_FONT_SIZE: Record<ClimateMetricSlot, number> = { primary: 22, secondary: 13, grid: 12 };

/** Die Altoptionen, die es schon vor der Liste gab — so, wie das Widget sie liest. */
export interface ClimateLegacyOptions {
    showTargetTemp: boolean;
    targetDatapoint: string;
    unit: string;
    showHumidity: boolean;
    humidityDatapoint: string;
    humidityIcon?: string;
    humidityUnit: string;
    showPressure: boolean;
    pressureDatapoint: string;
    pressureIcon?: string;
    pressureUnit: string;
    pressureDecimals: number;
}

/** Ids der drei Altwerte — für Sonderfälle beim Zeichnen. */
export const LEGACY_TARGET = '__target';
export const LEGACY_HUMIDITY = '__humidity';
export const LEGACY_PRESSURE = '__pressure';

/**
 * Die Werte, die das Widget zeichnet — Altoptionen zuerst, danach `metrics`.
 *
 * Die drei Altwerte behalten Reihenfolge, Platz und Schriftgröße von vor der
 * Liste, damit ein bestehendes Widget pixelgleich bleibt.
 */
export function resolveClimateMetrics(
    legacy: ClimateLegacyOptions,
    metrics: readonly ClimateMetric[] | undefined,
): ResolvedClimateMetric[] {
    const out: ResolvedClimateMetric[] = [];

    if (legacy.showTargetTemp && legacy.targetDatapoint) {
        out.push({
            id: LEGACY_TARGET,
            legacy: true,
            source: 'datapoint',
            datapoint: legacy.targetDatapoint,
            label: '↑',
            unit: legacy.unit,
            display: 'badge',
            slot: 'secondary',
            fontSize: 11,
        });
    }

    if (legacy.showHumidity) {
        out.push({
            id: LEGACY_HUMIDITY,
            legacy: true,
            source: 'datapoint',
            datapoint: legacy.humidityDatapoint,
            icon: legacy.humidityIcon || 'Droplets',
            unit: legacy.humidityUnit,
            slot: 'secondary',
            fontSize: 14,
        });
    }

    if (legacy.showPressure && legacy.pressureDatapoint) {
        out.push({
            id: LEGACY_PRESSURE,
            legacy: true,
            source: 'datapoint',
            datapoint: legacy.pressureDatapoint,
            icon: legacy.pressureIcon || 'Gauge',
            unit: legacy.pressureUnit,
            decimals: legacy.pressureDecimals,
            slot: 'secondary',
            fontSize: 13,
        });
    }

    for (const m of metrics ?? []) {
        if (!m || typeof m !== 'object' || m.hidden) continue;
        out.push({ ...m, slot: m.slot ?? 'grid' });
    }
    return out;
}

/** Die Datenpunkte, die für eine Liste abonniert werden müssen. */
export function climateMetricRefs(metrics: readonly ResolvedClimateMetric[]): string[] {
    const ids = new Set<string>();
    for (const m of metrics) {
        if ((m.source ?? 'datapoint') === 'datapoint' && m.datapoint) ids.add(m.datapoint);
    }
    return [...ids].sort();
}

/** Der rohe Zahlenwert eines Eintrags, vor Faktor und Versatz. */
export function rawMetricValue(
    metric: ResolvedClimateMetric,
    values: Record<string, unknown>,
    ctx: ClimateContext,
): number | boolean | string | null {
    switch (metric.source ?? 'datapoint') {
        case 'dewpoint':
            return dewPoint(ctx.temperature, ctx.humidity);
        case 'absoluteHumidity':
            return absoluteHumidity(ctx.temperature, ctx.humidity);
        case 'comfort':
            return comfortLevel(ctx.temperature, ctx.humidity);
        default: {
            if (!metric.datapoint) return null;
            const v = values[metric.datapoint];
            if (v === undefined || v === null) return null;
            return v as number | boolean | string;
        }
    }
}

/** Faktor und Versatz anwenden — nur auf Zahlen, ein Schalter bleibt ein Schalter. */
export function scaleMetricValue(
    metric: ResolvedClimateMetric,
    raw: number | boolean | string | null,
): number | boolean | string | null {
    if (typeof raw !== 'number') return raw;
    const factor = metric.valueFactor ?? 1;
    const offset = metric.valueOffset ?? 0;
    return raw * factor + offset;
}

/** Die Zeile der Wertzuordnung, die zu `value` passt. 1, '1' und true gelten als gleich. */
export function matchValueMap(metric: ResolvedClimateMetric, value: number | boolean | string | null) {
    if (!metric.valueMap?.length || value === null) return undefined;
    const norm = (v: unknown) => (typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    const want = norm(value);
    return metric.valueMap.find((e) => norm(e.v) === want);
}

/**
 * Die Einheit so, wie sie hinter den Wert gehört.
 *
 * Grad und Prozent hängen direkt an der Zahl, alles andere bekommt ein
 * schmales Leerzeichen — genau die Schreibweise, die der Luftdruck schon vor der
 * Werteliste hatte ("1013 hPa", aber "52 %" wäre falsch gewesen).
 */
export function unitSuffix(unit: string | undefined): string {
    if (!unit) return '';
    return /^[%°]/.test(unit) ? unit : ` ${unit}`;
}

export interface FormattedMetric {
    /** Was in der Kachel steht — schon mit Einheit, '–' wenn nichts da ist. */
    text: string;
    /** Nur der Zahlenteil, ohne Einheit. */
    value: string;
    /** Die Einheit samt Abstand, oder '' bei Wertzuordnung/Text. */
    unit: string;
    /** Farbe aus Wertzuordnung, Schwelle oder `color` — undefined = Vorgabe des Themes. */
    color?: string;
    /** Für `display: 'dot'`: leuchtet der Punkt? */
    active: boolean;
    /** Kein Wert vorhanden. */
    empty: boolean;
}

/** Wert, Einheit und Farbe eines Eintrags fürs Zeichnen. */
export function formatMetric(
    metric: ResolvedClimateMetric,
    values: Record<string, unknown>,
    ctx: ClimateContext,
    defaults: { decimals: number; numberFormat?: NumberFormat },
): FormattedMetric {
    const value = scaleMetricValue(metric, rawMetricValue(metric, values, ctx));
    const mapped = matchValueMap(metric, value);
    const unit = mapped || metric.display === 'text' ? '' : unitSuffix(metric.unit);

    let text: string;
    let empty = false;
    if (mapped) {
        text = mapped.label;
    } else if (value === null) {
        text = '–';
        empty = true;
    } else if (typeof value === 'number') {
        text = formatNum(value, metric.decimals ?? defaults.decimals, defaults.numberFormat);
    } else if (typeof value === 'boolean') {
        text = value ? 'ja' : 'nein';
    } else {
        text = String(value);
    }

    const thresholdColor =
        typeof value === 'number'
            ? getThresholdColor(value, metric.thresholds as ColorThreshold[] | undefined)
            : undefined;
    const color = mapped?.color || thresholdColor || metric.color || undefined;
    const active = typeof value === 'boolean' ? value : typeof value === 'number' ? value !== 0 : !!value;

    return { text, value: text, unit, color, active, empty };
}

/** Die Einträge eines Platzes, in gespeicherter Reihenfolge. */
export function metricsInSlot(metrics: readonly ResolvedClimateMetric[], slot: ClimateMetricSlot) {
    return metrics.filter((m) => m.slot === slot);
}

/**
 * Mehrere Reihen auf eine gemeinsame Zeitachse legen.
 *
 * Das Diagramm zeichnet seit #698 mehr als die Temperatur, und jede Reihe kommt
 * mit ihren eigenen Zeitstempeln aus der Historie. Recharts braucht dagegen EINE
 * Zeilenliste. Zusammengelegt wird deshalb über den Zeitstempel: jede Zeile hält
 * nur die Reihen, die genau dort einen Punkt haben — die Lücken bleiben Lücken
 * und werden im Diagramm mit connectNulls überbrückt, statt sie hier mit einem
 * erfundenen Zwischenwert zu füllen.
 */
export function mergeChartRows(
    seriesIds: readonly string[],
    data: (id: string) => readonly (readonly [number, number])[] | undefined,
): Record<string, number>[] {
    const byTs = new Map<number, Record<string, number>>();
    for (const id of seriesIds) {
        for (const [t, v] of data(id) ?? []) {
            let row = byTs.get(t);
            if (!row) {
                row = { t };
                byTs.set(t, row);
            }
            row[id] = v;
        }
    }
    return [...byTs.values()].sort((a, b) => a.t - b.t);
}
