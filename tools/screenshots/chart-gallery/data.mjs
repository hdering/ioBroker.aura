// Fabricated data for the chart gallery (tools/screenshots/chart-gallery.mjs).
//
// One household, deterministic: the PV plant, battery, grid and house load come from
// demo-energy.mjs (the same plant the other chart docs show), plus what the gallery
// needs on top — day counters that reset at midnight, a gas meter, outdoor and boiler
// temperatures, a burner on/off state and the JSON datapoints scripts and adapters write.
//
// The page clock is pinned to `NOW` (13:40 today), so every shot reads the same numbers.
import {
    HOUR,
    DAY,
    mulberry32,
    makeWeather,
    houseLoadAt,
    batteryPowerAt,
    simulateEnergyFlow,
} from '../demo-energy.mjs';

export { HOUR, DAY };

export const NOW = (() => {
    const d = new Date();
    d.setHours(13, 40, 0, 0);
    return d.getTime();
})();

// Four and a half years of history — enough for the "Gesamt" range to show four full years.
const anchorDate = new Date(NOW - 1660 * DAY);
anchorDate.setHours(0, 0, 0, 0);
export const ANCHOR = anchorDate.getTime();
const TOTAL_DAYS = Math.ceil((NOW - ANCHOR) / DAY) + 2;

const weather = makeWeather(TOTAL_DAYS);
const flow = simulateEnergyFlow({ anchor: ANCHOR, end: NOW, weather });

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function grid(from, to, step, fn) {
    const out = [];
    for (let ts = Math.ceil(from / step) * step; ts <= to; ts += step) out.push([ts, fn(ts)]);
    return out;
}

const midnight = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

// ── energy counters ───────────────────────────────────────────────────────────
/** Meter reading in kWh. `pvDirect` = PV the house used straight away (load not met by grid or battery). */
function reading(counter, ts) {
    if (counter === 'pvDirect') {
        const r = (c) => flow.readingAt(c, ts);
        return 6_120 + r('home') + r('ev') - r('gridIn') - r('battDischarge') - (21_860 + 2_740 - 8_320 - 3_390);
    }
    return flow.readingAt(counter, ts);
}
/** Rising meter reading in kWh: pv, home, ev, battCharge, battDischarge, gridIn, gridOut, pvDirect. */
export const totalAt = (counter, ts) => reading(counter, ts);
/** Day counter in kWh — what an inverter's `lastDayData` logs: back to 0 at 00:00. */
export const dayAt = (counter, ts) => reading(counter, ts) - reading(counter, midnight(ts));

export const totalSeries = (counter, from, to, step) => grid(from, to, step, (ts) => round(totalAt(counter, ts)));
export const daySeries = (counter, from, to, step) => grid(from, to, step, (ts) => round(dayAt(counter, ts), 2));

// ── house load in W ──────────────────────────────────────────────────────────
export const loadAt = (ts) => houseLoadAt(ts, ANCHOR);
export const loadSeries = (from, to, step) => grid(from, to, step, loadAt);
/** The same load split into what the battery covers (evenings) and what comes from the grid. */
export const batteryCoverSeries = (from, to, step) =>
    grid(from, to, step, (ts) => Math.min(loadAt(ts), batteryPowerAt(ts)));
export const gridCoverSeries = (from, to, step) =>
    grid(from, to, step, (ts) => Math.max(0, loadAt(ts) - batteryPowerAt(ts)));

// ── outdoor temperature: yearly swing plus a day/night cycle ─────────────────
export function outdoorAt(ts) {
    const d = new Date(ts);
    const doy = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY;
    const h = d.getHours() + d.getMinutes() / 60;
    const seasonal = 0.5 * (1 + Math.cos((2 * Math.PI * (doy - 200)) / 365)); // warmest ~19 July
    const w = weather[Math.min(weather.length - 1, Math.max(0, Math.floor((ts - ANCHOR) / DAY)))];
    const mean = 1.5 + 17 * seasonal + (w - 0.6) * 5;
    const swing = (2.2 + 5.5 * seasonal) * (0.55 + 0.7 * w);
    const rnd = mulberry32(0x7e11 + Math.floor((ts - ANCHOR) / (30 * 60_000)));
    return round(mean + swing * -Math.cos((2 * Math.PI * (h - 15)) / 24) + (rnd() - 0.5) * 0.8);
}
export const outdoorSeries = (from, to, step) => grid(from, to, step, outdoorAt);

// ── gas meter in m³: heating follows the outdoor temperature, plus hot water ──
const gasReadings = (() => {
    const hours = Math.ceil((NOW - ANCHOR) / HOUR) + 2;
    const arr = new Float64Array(hours + 1);
    let acc = 18_240;
    for (let i = 0; i <= hours; i++) {
        arr[i] = acc;
        const ts = ANCHOR + i * HOUR + HOUR / 2;
        const h = new Date(ts).getHours();
        const heating = Math.max(0, 15 - outdoorAt(ts)) * 0.03;
        const water = h === 7 || h === 19 ? 0.35 : 0.02;
        acc += heating + water;
    }
    return arr;
})();
export function gasAt(ts) {
    const x = (ts - ANCHOR) / HOUR;
    const i = Math.max(0, Math.min(gasReadings.length - 2, Math.floor(x)));
    return gasReadings[i] + (gasReadings[i + 1] - gasReadings[i]) * Math.max(0, Math.min(1, x - i));
}
export const gasSeries = (from, to, step) => grid(from, to, step, (ts) => round(gasAt(ts), 2));

// ── heating: burner on/off with flow and return temperature ──────────────────
/** Burner cycles: on for a share of every 40 min that grows as it gets colder. */
export function burnerAt(ts) {
    const demand = Math.max(0, Math.min(1, (16 - outdoorAt(ts)) / 18));
    const phase = ((ts - ANCHOR) / (40 * 60_000)) % 1;
    return phase < 0.15 + demand * 0.55 ? 1 : 0;
}
export const burnerSeries = (from, to, step) => {
    // Only the switching moments, the way a history adapter logs a boolean.
    const out = [];
    let last = null;
    for (let ts = Math.ceil(from / step) * step; ts <= to; ts += step) {
        const v = burnerAt(ts);
        if (v !== last) out.push([ts, v]);
        last = v;
    }
    return out;
};
/** Flow temperature rises while the burner runs and decays when it is off. */
export function flowTempSeries(from, to, step) {
    const out = [];
    let t = 38;
    for (let ts = Math.ceil(from / step) * step; ts <= to; ts += step) {
        const target = burnerAt(ts) ? 58 + Math.max(0, 8 - outdoorAt(ts)) : 32;
        t += (target - t) * 0.22;
        out.push([ts, round(t)]);
    }
    return out;
}
export function returnTempSeries(from, to, step) {
    return flowTempSeries(from, to, step).map(([ts, v]) => [ts, round(26 + (v - 30) * 0.45)]);
}

// ── JSON datapoints ───────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Router traffic per month, as a script writes it: [{label, value}] in GB. */
export function trafficJson(kind) {
    const rnd = mulberry32(kind === 'down' ? 0xd0 : 0x0b);
    return JSON.stringify(
        MONTHS.map((label, i) => ({
            label,
            value: round((kind === 'down' ? 310 : 48) * (0.8 + 0.25 * Math.sin(i / 2) + rnd() * 0.3), 2),
        })),
    );
}

/** Rolling list, newest entry first — the shape behind "show the first value" (#549). */
export function rollingTempJson() {
    const out = [];
    for (let i = 0; i < 24; i++) {
        const ts = NOW - i * HOUR;
        const d = new Date(ts);
        out.push({ label: `${String(d.getHours()).padStart(2, '0')}:00`, value: outdoorAt(ts) });
    }
    return JSON.stringify(out);
}

/** Solar forecast for the rest of today and tomorrow in W — like open-meteo's [{ts,val}]. */
export function forecastJson() {
    const out = [];
    const start = Math.ceil(NOW / HOUR) * HOUR;
    for (let ts = start; ts <= midnight(NOW) + 2 * DAY; ts += HOUR) {
        const h = new Date(ts).getHours();
        const bell = h > 6 && h < 20 ? Math.pow(Math.sin((Math.PI * (h - 6)) / 14), 1.4) : 0;
        out.push({ ts: String(ts), val: Math.round(5200 * bell * (ts > midnight(NOW) + DAY ? 0.7 : 1)) });
    }
    return JSON.stringify(out);
}
/** Measured PV power in W up to now — the history half of the forecast example. */
export const pvPowerSeries = (from, to, step) =>
    grid(from, to, step, (ts) =>
        Math.round((flow.readingAt('pv', ts + step / 2) - flow.readingAt('pv', ts - step / 2)) * (HOUR / step) * 1000),
    );

/** Heating curve from a heat pump script: flow temperature per outdoor temperature. */
export function heatingCurveJson() {
    const out = [];
    for (let t = -15; t <= 20; t += 5) out.push({ aussentemperatur: t, vorlauftemperatur: round(35 - 0.55 * t, 1) });
    return JSON.stringify(out);
}

/** A script that ships the y-axis bounds next to the data (#550). */
export function boundedJson() {
    const data = [];
    for (let i = 0; i < 24; i++) {
        const ts = NOW - (23 - i) * HOUR;
        data.push({
            label: `${String(new Date(ts).getHours()).padStart(2, '0')}:00`,
            value: round(40 + 25 * Math.sin(i / 3) + 10 * Math.sin(i), 0),
        });
    }
    return JSON.stringify({ axis: { min: 0, max: 100 }, data });
}
