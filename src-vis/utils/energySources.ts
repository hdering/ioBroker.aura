/**
 * Finding the datapoints of a PV system, whatever adapter it comes from.
 *
 * The flow widget needs five numbers: production, house consumption, grid,
 * battery charge level and battery power. evcc publishes them under fixed paths,
 * so for evcc a prefix is enough. Every other adapter names them its own way —
 * `sma.0.…`, `fronius.0.…`, `e3dc.0.…` all differ, and they differ again per
 * inverter model and adapter version. Hard-coding paths per adapter would be a
 * table that is wrong the moment someone runs a device we never saw.
 *
 * So instead of knowing the paths, we look at what the instance actually
 * publishes and score each state against the five slots, using the things
 * ioBroker adapters do agree on: `common.role`, `common.unit`, `common.type`
 * and the words in the id. The result is a SUGGESTION — it is written into the
 * five datapoint fields of the config panel, where it is visible and can be
 * corrected. Nothing here decides anything behind the user's back.
 */

export type EnergySlot = 'pv' | 'home' | 'grid' | 'batterySoc' | 'batteryPower';

export const ENERGY_SLOTS: EnergySlot[] = ['pv', 'home', 'grid', 'batterySoc', 'batteryPower'];

/** The config option each slot writes into. */
export const SLOT_OPTION: Record<EnergySlot, string> = {
    pv: 'pvPowerDatapoint',
    home: 'homePowerDatapoint',
    grid: 'gridPowerDatapoint',
    batterySoc: 'batterySocDatapoint',
    batteryPower: 'batteryPowerDatapoint',
};

/**
 * Adapters worth offering as a data source.
 *
 * Only used to keep the dropdown short — a typical ioBroker runs 30+ instances
 * and listing them all would bury the two that matter. Anything missing here is
 * still reachable: "manual" takes any datapoint from any adapter.
 */
export const ENERGY_ADAPTERS: { name: string; label: string }[] = [
    { name: 'evcc', label: 'evcc' },
    { name: 'sma-em', label: 'SMA Energy Meter' },
    { name: 'sma', label: 'SMA' },
    { name: 'smaevcharger', label: 'SMA EV Charger' },
    { name: 'fronius', label: 'Fronius' },
    { name: 'e3dc', label: 'E3/DC' },
    { name: 'e3dc-rscp', label: 'E3/DC (RSCP)' },
    { name: 'solaredge', label: 'SolarEdge' },
    { name: 'kostal', label: 'Kostal' },
    { name: 'kostalpiko', label: 'Kostal PIKO' },
    { name: 'senec', label: 'SENEC' },
    { name: 'sonnen', label: 'sonnen' },
    { name: 'growatt', label: 'Growatt' },
    { name: 'goodwe', label: 'GoodWe' },
    { name: 'huawei-solar', label: 'Huawei Solar' },
    { name: 'solarmanager', label: 'Solar Manager' },
    { name: 'solarwetter', label: 'Solarwetter' },
    { name: 'victron', label: 'Victron' },
    { name: 'victronenergy', label: 'Victron Energy' },
    { name: 'tibberlink', label: 'Tibber' },
    { name: 'shelly', label: 'Shelly' },
    { name: 'modbus', label: 'Modbus' },
];

const ADAPTER_LABEL = new Map(ENERGY_ADAPTERS.map((a) => [a.name, a.label]));

/** "sma.0" → "SMA (sma.0)"; an unknown adapter keeps its own id. */
export function instanceLabel(instance: string): string {
    const adapter = instance.replace(/\.\d+$/, '');
    const label = ADAPTER_LABEL.get(adapter);
    return label ? `${label} (${instance})` : instance;
}

/** Whether this instance is the one adapter we can drive by prefix alone. */
export function isEvccInstance(instance: string): boolean {
    return /^evcc\.\d+$/.test(instance);
}

// ── unit handling ─────────────────────────────────────────────────────────────

/**
 * What to multiply a value by to get watts.
 *
 * Adapters publish power in W, kW or occasionally mW, and the widget's whole
 * display — including the 10 W "is anything flowing" threshold — assumes watts.
 * Without this an SMA reading of 4.2 kW renders as "0.00 kW" and the flow line
 * stays dead, which looks exactly like a wrong datapoint.
 *
 * An unknown or missing unit yields 1: guessing a factor for something we do not
 * recognise would be worse than showing the raw number.
 */
export function powerUnitFactor(unit: string | undefined): number {
    const u = (unit ?? '').trim().toLowerCase();
    if (u === 'kw') return 1000;
    if (u === 'mw') return 1_000_000;
    if (u === 'w' || u === '') return 1;
    return 1;
}

// ── scoring ───────────────────────────────────────────────────────────────────

/** The bits of an ioBroker state object the scoring looks at. */
export interface CandidateState {
    id: string;
    role?: string;
    unit?: string;
    type?: string;
    name?: string;
    read?: boolean;
    min?: number;
    max?: number;
}

// Anything cumulative. These outnumber the live values in most adapters —
// `sma.0.…pvPowerDay`, `…energyToday`, `…totalYield` — and picking one would
// show a number that only ever grows.
const CUMULATIVE =
    /(today|yesterday|daily|day|week|month|year|total|sum|energy|kwh|counter|z(?:ae|ä)hler|yield|ertrag|forecast|prognose)/;
// Statistics and setpoints, not the current reading.
const NOT_A_READING = /(min|max|avg|average|mittel|limit|target|soll|nominal|peak|capacity|kapazit)/;

const WORDS: Record<EnergySlot, RegExp> = {
    pv: /(pv|solar|photovolt|erzeug|produc|generat|inverter|wechselrichter)/,
    home: /(home|haus|consum|verbrauch|usage)/,
    grid: /(grid|netz|einspeis|feed.?in|bezug|import|export|purchas|utility)/,
    batterySoc: /(batt|akku|speicher|storage)/,
    batteryPower: /(batt|akku|speicher|storage)/,
};

const SOC_WORDS = /(soc|ladestand|charge.?level|charge.?state|percent|prozent|level)/;
const POWER_WORDS = /(power|leistung|watt)/;

/** The last path segment, which is where adapters put the actual value name. */
function leaf(id: string): string {
    const parts = id.split('.');
    return parts[parts.length - 1] ?? '';
}

/** Path segments below the instance — `sma.0.a.b.c` → 3. */
function depth(id: string): number {
    return Math.max(0, id.split('.').length - 2);
}

/**
 * How well `state` fits `slot`, or null if it does not fit at all.
 *
 * Higher is better. The weights encode what actually separates candidates in
 * practice: the exact canonical name beats a fuzzy word match, an explicit role
 * beats a guess from the id, and a shallow path beats a deep one (adapters put
 * the headline values near the root and the per-string/per-phase detail below).
 */
export function scoreCandidate(slot: EnergySlot, state: CandidateState): number | null {
    if (state.type !== undefined && state.type !== 'number') return null;
    if (state.read === false) return null;

    const id = state.id.toLowerCase();
    const name = (state.name ?? '').toLowerCase();
    const hay = `${id} ${name}`;
    const tail = leaf(id);
    const unit = (state.unit ?? '').trim().toLowerCase();
    const isSoc = slot === 'batterySoc';

    // A loadpoint is a consumer of its own, never the house total.
    if (/loadpoint/.test(hay) && slot !== 'batterySoc') return null;
    if (CUMULATIVE.test(hay)) return null;
    // "min"/"max" only disqualify as whole words — "maximal" yes, "eMax" (a product
    // name) as part of a longer word is fine.
    if (NOT_A_READING.test(tail)) return null;
    if (!WORDS[slot].test(hay)) return null;

    if (isSoc) {
        if (!SOC_WORDS.test(hay)) return null;
        if (unit && unit !== '%') return null;
    } else {
        // The three power slots plus battery power: it has to be a power reading.
        const looksLikePower = POWER_WORDS.test(hay) || state.role === 'value.power' || unit === 'w' || unit === 'kw';
        if (!looksLikePower) return null;
        if (unit && unit !== 'w' && unit !== 'kw' && unit !== 'mw') return null;
        if (slot === 'batteryPower' && SOC_WORDS.test(tail)) return null;
    }

    let score = 10;

    // The canonical evcc-ish names, which many adapters copied.
    const canonical: Record<EnergySlot, RegExp> = {
        pv: /^(pvpower|pv_power|solarpower|power_pv|acpower)$/,
        home: /^(homepower|home_power|housepower|consumption)$/,
        grid: /^(gridpower|grid_power|power_grid)$/,
        batterySoc: /^(soc|batterysoc|battery_soc|chargelevel)$/,
        batteryPower: /^(batterypower|battery_power|power_battery)$/,
    };
    if (canonical[slot].test(tail.replace(/[^a-z_]/g, ''))) score += 8;

    if (isSoc) {
        if (state.role === 'value.battery' || state.role === 'value.fill.level') score += 5;
        if (unit === '%') score += 3;
        // A 0..100 range is a strong hint for a percentage.
        if (state.min === 0 && state.max === 100) score += 2;
    } else {
        if (state.role === 'value.power') score += 5;
        if (unit === 'w') score += 3;
        else if (unit === 'kw') score += 2;
        if (POWER_WORDS.test(tail)) score += 2;
    }

    // Shallow wins: `sma.0.gridPower` over `sma.0.strings.1.gridPower`.
    score -= Math.max(0, depth(id) - 1);

    return score;
}

export interface SlotMatch {
    id: string;
    unit?: string;
    score: number;
}

/**
 * Best datapoint per slot out of everything an instance publishes.
 *
 * A datapoint is used for at most one slot: "battery" matches both battery slots
 * by word, and without this the SoC state could end up as the power reading too.
 * The higher score keeps it.
 */
export function mapEnergyDatapoints(states: CandidateState[]): Partial<Record<EnergySlot, SlotMatch>> {
    const scored: { slot: EnergySlot; match: SlotMatch }[] = [];

    for (const slot of ENERGY_SLOTS) {
        for (const state of states) {
            const score = scoreCandidate(slot, state);
            if (score !== null) scored.push({ slot, match: { id: state.id, unit: state.unit, score } });
        }
    }

    // Strongest pairings first, then take each slot and each datapoint once.
    scored.sort((a, b) => b.match.score - a.match.score || a.match.id.localeCompare(b.match.id));

    const out: Partial<Record<EnergySlot, SlotMatch>> = {};
    const usedIds = new Set<string>();
    for (const { slot, match } of scored) {
        if (out[slot] || usedIds.has(match.id)) continue;
        out[slot] = match;
        usedIds.add(match.id);
    }
    return out;
}
