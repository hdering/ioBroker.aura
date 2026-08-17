// Fabricated household energy data for the documentation screenshots.
//
// Shared by the chart scripts (echart-examples.mjs) and the distribution-widget
// script (verteilung-examples.mjs) so both show the same plant: a ~9 kWp roof, a
// battery, an EV and a base load. Everything is deterministic — the same `anchor`
// gives the same numbers on every run, which is what keeps the images stable.
//
// Nothing here touches ioBroker; the values are served to the frontend through
// `window.__auraShot.mockHistory`.

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** Small deterministic PRNG — same seed, same sequence. */
export function mulberry32(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Daily weather factor (0.24 … 1), smoothed across neighbouring days: cloudy and
 * clear spells last a few days. A flat draw per day would give a comb of
 * alternating bars that no real plant produces.
 */
export function makeWeather(days, seed = 0x5eed01) {
    const rnd = mulberry32(seed);
    const noise = Array.from({ length: days }, () => rnd());
    return noise.map((_, i) => {
        const smooth = (noise[i] * 1 + noise[Math.max(0, i - 1)] * 0.6 + noise[Math.max(0, i - 2)] * 0.35) / 1.95;
        return 0.24 + 0.76 * Math.pow(smooth, 0.85);
    });
}

const dayIndex = (ts, anchor, len) => Math.min(len - 1, Math.max(0, Math.floor((ts - anchor) / DAY)));

/** Instantaneous PV power in kW — seasonal peak, daylight window, weather. */
export function pvPowerAt(ts, anchor, weather) {
    const d = new Date(ts);
    const doy = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY;
    const seasonal = 0.5 * (1 + Math.cos((2 * Math.PI * (doy - 172)) / 365)); // 1 = midsummer
    const halfDay = 4.3 + 3.3 * seasonal; // hours of usable light either side of noon
    const h = d.getHours() + d.getMinutes() / 60;
    const from = 12 - halfDay;
    const to = 12 + halfDay;
    if (h <= from || h >= to) return 0;
    const bell = Math.pow(Math.sin((Math.PI * (h - from)) / (to - from)), 1.45);
    const peak = 2.5 + 4.3 * seasonal;
    return peak * bell * weather[dayIndex(ts, anchor, weather.length)];
}

// Base load plus short, hard appliance peaks. The peaks are minutes long, which is
// what makes the average/minmax difference visible in the chart examples.
const APPLIANCES = [
    { at: 6.7, len: 4 / 60, w: 2100 }, // kettle
    { at: 7.0, len: 3 / 60, w: 950 }, // toaster
    { at: 12.5, len: 1.4, w: 2000, duty: 0.35 }, // washing machine
    { at: 18.1, len: 0.6, w: 2650, duty: 0.75 }, // oven
    { at: 20.6, len: 1.1, w: 1850, duty: 0.4 }, // dishwasher
];

/** House load in W. */
export function houseLoadAt(ts, anchor) {
    const d = new Date(ts);
    const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const dayIdx = Math.floor((ts - anchor) / DAY);
    const rnd = mulberry32(0xa11e + dayIdx * 977 + Math.floor(h * 120));
    let w = 195 + 55 * Math.sin((h / 24) * Math.PI * 2 - 1.1) + rnd() * 35;
    if (Math.floor(h * 60) % 47 < 12) w += 85; // fridge compressor
    for (const a of APPLIANCES) {
        if (h < a.at || h > a.at + a.len) continue;
        const duty = a.duty ?? 1;
        // Cycling appliances are on for `duty` of every ~6 minutes.
        const phase = ((h - a.at) * 10) % 1;
        if (phase < duty) w += a.w;
    }
    return Math.round(w);
}

/** EV charging power in kW — a 2 h session every third evening. */
export function evPowerAt(ts, anchor) {
    const dayIdx = Math.floor((ts - anchor) / DAY);
    if (dayIdx % 3 !== 0) return 0;
    const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    return h >= 18 && h < 20 ? 11 : 0;
}

/** Battery discharge the house may cover its load from, in W (for the stacking example). */
export function batteryPowerAt(ts) {
    const d = new Date(ts);
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 17 && h < 23) return 850;
    if (h >= 23 || h < 2) return 420;
    return 0;
}

/**
 * Hour-by-hour energy flow of the whole house, accumulated into the meter readings a
 * real installation would log. PV first covers the load, the surplus charges the
 * battery and only what is left goes to the grid; a deficit is taken from the battery
 * first and from the grid after that.
 *
 * Because every kWh is booked on exactly one production and one consumption side, the
 * two sides of the distribution widget add up to the same total — which is the whole
 * point of an energy balance.
 *
 * Returns `readingAt(counter, ts)` (linearly interpolated between the hourly grid) and
 * `deltaOver(counter, fromTs, toTs)`.
 */
export function simulateEnergyFlow({ anchor, end, weather, start = {} }) {
    const hours = Math.ceil((end - anchor) / HOUR) + 2;
    const COUNTERS = ['pv', 'home', 'ev', 'battCharge', 'battDischarge', 'gridIn', 'gridOut'];
    const series = {};
    for (const c of COUNTERS) series[c] = new Float64Array(hours + 1);
    const acc = {
        pv: start.pv ?? 11_480,
        home: start.home ?? 21_860,
        ev: start.ev ?? 2_740,
        battCharge: start.battCharge ?? 3_610,
        battDischarge: start.battDischarge ?? 3_390,
        gridIn: start.gridIn ?? 8_320,
        gridOut: start.gridOut ?? 5_140,
    };
    const CAP = 10.0; // usable kWh
    const CHARGE_MAX = 4.5; // kW
    const DISCHARGE_MAX = 3.5; // kW
    let soc = 4.2;

    for (let i = 0; i <= hours; i++) {
        for (const c of COUNTERS) series[c][i] = acc[c];
        const ts = anchor + i * HOUR;
        // One hour at this power = that many kWh.
        const pv = pvPowerAt(ts + HOUR / 2, anchor, weather);
        const home = houseLoadAt(ts + HOUR / 2, anchor) / 1000;
        const ev = evPowerAt(ts + HOUR / 2, anchor);
        const surplus = pv - home - ev;
        let charge = 0;
        let discharge = 0;
        let gridIn = 0;
        let gridOut = 0;
        if (surplus >= 0) {
            charge = Math.min(surplus, CHARGE_MAX, CAP - soc);
            soc += charge;
            gridOut = surplus - charge;
        } else {
            const deficit = -surplus;
            discharge = Math.min(deficit, DISCHARGE_MAX, soc);
            soc -= discharge;
            gridIn = deficit - discharge;
        }
        acc.pv += pv;
        acc.home += home;
        acc.ev += ev;
        acc.battCharge += charge;
        acc.battDischarge += discharge;
        acc.gridIn += gridIn;
        acc.gridOut += gridOut;
    }

    const readingAt = (counter, ts) => {
        const arr = series[counter];
        const x = (ts - anchor) / HOUR;
        if (x <= 0) return arr[0];
        if (x >= hours) return arr[hours];
        const i = Math.floor(x);
        return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
    };
    const deltaOver = (counter, fromTs, toTs) => readingAt(counter, toTs) - readingAt(counter, fromTs);

    return { counters: COUNTERS, readingAt, deltaOver, socNow: soc };
}
