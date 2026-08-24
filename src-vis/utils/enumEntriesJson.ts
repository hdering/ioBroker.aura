/**
 * Auswahlfeld-Einträge aus einem JSON-Datenpunkt (Issue #577).
 *
 * Statt die Wert→Label-Paare von Hand zu pflegen, kann das Auswahlfeld seine
 * Liste aus einem Datenpunkt lesen, der JSON hält. Akzeptiert werden die
 * Formen, die in ioBroker üblich sind:
 *
 *   [{ "value": 0, "label": "Aus" }, { "value": 1, "label": "An" }]
 *   [{ "id": 1, "name": "Küche", "color": "#22c55e", "icon": "Lamp" }]
 *   { "0": "Aus", "1": "An" }                     (Map wie common.states)
 *   { "0": { "label": "Aus", "color": "#ef4444" } }
 *   ["Aus", "An"]                                 (Wert = Label)
 *   { "result": [ … ] }                           (Wrapper mit einer Liste)
 *
 * Die Feldnamen werden erkannt (value/val/id/key … bzw. label/name/text …);
 * über `EnumJsonKeys` lässt sich die Erkennung überschreiben, inklusive
 * verschachtelter Pfade wie `attributes.name`.
 */
import type { EnumEntry, EnumRender } from '../components/widgets/EnumWidget';
import { extractJsonPath } from './dpRef';

export interface EnumJsonKeys {
    /** Feld für den DP-Wert (leer = automatisch erkennen). */
    value?: string;
    /** Feld für den angezeigten Text (leer = automatisch erkennen). */
    label?: string;
    /** Feld für die Farbe (leer = automatisch erkennen). */
    color?: string;
    /** Feld für das Icon (leer = automatisch erkennen). */
    icon?: string;
    /** Feld für die Bild-URL (leer = automatisch erkennen). */
    image?: string;
}

const AUTO_VALUE = ['value', 'val', 'id', 'key', 'code', 'state'];
const AUTO_LABEL = ['label', 'name', 'text', 'title', 'caption', 'description'];
const AUTO_COLOR = ['color', 'colour'];
const AUTO_ICON = ['icon'];
const AUTO_IMAGE = ['image', 'img'];

const RENDER_MODES: EnumRender[] = ['text', 'image', 'html', 'icon'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Skalare werden zu Text; Objekte/Arrays haben in einem Feld nichts verloren. */
function toText(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    const t = typeof v;
    if (t === 'string') return v as string;
    if (t === 'number' || t === 'boolean') return String(v);
    return undefined;
}

/**
 * Wert eines Feldes: ein konfigurierter Feldname (auch als Pfad `a.b`) gewinnt,
 * sonst wird der erste Kandidat genommen, den die Zeile kennt — exakt, danach
 * ohne Rücksicht auf Groß-/Kleinschreibung.
 */
function pick(row: Record<string, unknown>, explicit: string | undefined, auto: string[]): unknown {
    const key = (explicit ?? '').trim();
    if (key) return row[key] !== undefined ? row[key] : extractJsonPath(row, key);
    for (const name of auto) {
        if (row[name] !== undefined) return row[name];
    }
    const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
    for (const name of auto) {
        const hit = lower.get(name);
        if (hit !== undefined) return row[hit];
    }
    return undefined;
}

/**
 * Eine Zeile der Liste zu einem Eintrag. `mapKey` ist gesetzt, wenn die Zeile
 * aus einer Map stammt — dann ist der Schlüssel der DP-Wert und das Objekt
 * liefert nur noch Label/Farbe/Icon.
 */
function rowToEntry(row: unknown, keys: EnumJsonKeys, mapKey?: string): EnumEntry | null {
    if (row === null || row === undefined) return mapKey !== undefined ? { value: mapKey, label: mapKey } : null;

    // Skalar: "Aus" → Wert und Label sind dasselbe.
    if (typeof row !== 'object') {
        const s = toText(row);
        if (s === undefined) return null;
        return { value: mapKey ?? s, label: s };
    }

    // Paar-Schreibweise [wert, label].
    if (Array.isArray(row)) {
        const value = mapKey ?? toText(row[0]);
        if (value === undefined) return null;
        return { value, label: toText(row[1]) ?? value };
    }

    const o = row as Record<string, unknown>;
    const label = toText(pick(o, keys.label, AUTO_LABEL));
    const value = mapKey ?? toText(pick(o, keys.value, AUTO_VALUE)) ?? label;
    if (value === undefined) return null;

    const entry: EnumEntry = { value, label: label ?? value };

    const color = toText(pick(o, keys.color, AUTO_COLOR));
    if (color) entry.color = color;
    const icon = toText(pick(o, keys.icon, AUTO_ICON));
    if (icon) entry.icon = icon;
    const image = toText(pick(o, keys.image, AUTO_IMAGE));
    if (image) entry.image = image;

    const size = Number(o.size);
    if (Number.isFinite(size) && size > 0) entry.size = size;

    const render = toText(o.render) as EnumRender | undefined;
    if (render && RENDER_MODES.includes(render)) entry.render = render;
    else if (image) entry.render = 'image';

    return entry;
}

/** Eine Liste aus einem Wrapper-Objekt holen: `{ "result": [ … ] }`. */
function unwrapList(obj: Record<string, unknown>): unknown[] | null {
    const arrays = Object.values(obj).filter(Array.isArray) as unknown[][];
    return arrays.length === 1 && arrays[0].length > 0 ? arrays[0] : null;
}

/**
 * Einträge aus dem Wert eines JSON-Datenpunkts. Der Wert darf ein Objekt/Array
 * oder ein JSON-String sein (ioBroker legt JSON meist als String ab). Kein
 * lesbares JSON → leere Liste, das Widget zeigt dann einfach nichts an.
 */
export function parseEnumEntriesJson(raw: unknown, keys: EnumJsonKeys = {}): EnumEntry[] {
    let data: unknown = raw;

    if (typeof data === 'string') {
        const s = data.trim();
        if (!s) return [];
        try {
            data = JSON.parse(s);
        } catch {
            return [];
        }
    }

    let rows: unknown[] | null = null;
    if (Array.isArray(data)) {
        rows = data;
    } else if (isPlainObject(data)) {
        rows = unwrapList(data);
        if (!rows) {
            // Map-Form: Schlüssel ist der DP-Wert.
            const out: EnumEntry[] = [];
            for (const [k, v] of Object.entries(data)) {
                const entry = rowToEntry(v, keys, k);
                if (entry) out.push(entry);
            }
            return dedupe(out);
        }
    }
    if (!rows) return [];

    const out: EnumEntry[] = [];
    for (const row of rows) {
        const entry = rowToEntry(row, keys);
        if (entry) out.push(entry);
    }
    return dedupe(out);
}

/** Gleiche Werte doppelt gibt es im Dropdown nicht — der erste Eintrag gewinnt. */
function dedupe(entries: EnumEntry[]): EnumEntry[] {
    const seen = new Set<string>();
    return entries.filter((e) => (seen.has(e.value) ? false : (seen.add(e.value), true)));
}
