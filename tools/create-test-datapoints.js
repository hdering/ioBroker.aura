/*
 * =============================================================================
 *  Test-Datenpunkte-Generator für die ioBroker Dev-/Testinstanz
 * =============================================================================
 *
 *  Zweck : Legt unter 0_userdata.0.visTest.* eine breite Palette an DPs in
 *          allen möglichen Formen an (bool/number/string/json/enum/color/…),
 *          setzt aktuelle Werte UND erzeugt realistische Verlaufsdaten
 *          (30 Tage, 15-Min-Raster) für Diagramme – inkl. Energie-Serien
 *          passend zum Energiebilanz-Widget.
 *
 *  Nutzung: In den ioBroker JavaScript-Adapter einfügen und starten.
 *           Das Skript ist idempotent – mehrfaches Ausführen überschreibt
 *           Werte/History neu, ohne DPs zu duplizieren.
 *
 *  History: geht per sendTo(...,'storeState',...) an HISTORY_INSTANCE.
 *           Default 'history.0'; wird auto-detektiert falls nicht vorhanden.
 * =============================================================================
 */

// ----------------------------- Konfiguration --------------------------------
const ROOT            = '0_userdata.0.visTest';   // Wurzel aller Test-DPs
let   HISTORY_INSTANCE = 'history.0';              // Ziel-History-Adapter
const HIST_DAYS       = 30;                        // Tage rückwärts
const HIST_STEP_MIN   = 15;                        // Auflösung in Minuten
const WIPE_FIRST      = false;                     // true = ROOT vorher löschen
const LIVE_UPDATE     = true;                      // true = Skript bleibt aktiv u. schreibt laufend
const LIVE_INTERVAL_S = 30;                        // Sekunden zwischen Live-Updates
// ----------------------------------------------------------------------------

const STEP_MS = HIST_STEP_MIN * 60 * 1000;
const NOW     = Date.now();
const START   = NOW - HIST_DAYS * 24 * 60 * 60 * 1000;

// deterministischer Pseudo-Zufall (reproduzierbar über Läufe hinweg)
let _seed = 1337;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function noise(a) { return (rnd() - 0.5) * 2 * a; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v, d = 2) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

// --------------------------- Objekt-Helfer ----------------------------------
/** Legt ein Objekt an, falls es noch nicht existiert (setObjectNotExistsAsync-Ersatz). */
async function ensureObject(id, obj) {
    const existing = await getObjectAsync(id);
    if (!existing) await setObjectAsync(id, obj);
}

async function mkFolder(id, name) {
    await ensureObject(id, { type: 'folder', common: { name }, native: {} });
}

/** Legt einen State an, setzt custom-History (optional) und Startwert. */
async function mkState(id, common, val, { hist = false } = {}) {
    const full = `${ROOT}.${id}`;
    await ensureObject(full, { type: 'state', common, native: {} });
    // vorhandene Objekte auf aktuelle common-Definition heben
    await extendObjectAsync(full, { common });
    if (hist) {
        await extendObjectAsync(full, {
            common: { custom: { [HISTORY_INSTANCE]: {
                enabled: true, changesOnly: false, debounce: 0,
                retention: 0, maxLength: 960, aliasId: '',
            } } },
        });
    }
    if (val !== undefined) await setStateAsync(full, { val, ack: true });
    return full;
}

/** Schiebt eine Punkte-Serie [{ts,val}] in den History-Adapter. */
async function pushHistory(full, series) {
    const state = series.map(p => ({ val: round(p.val, 3), ack: true, ts: p.ts, from: 'system.adapter.javascript.0', q: 0 }));
    // in Blöcken senden, damit die Nachricht nicht zu groß wird
    const CHUNK = 500;
    for (let i = 0; i < state.length; i += CHUNK) {
        await sendToAsync(HISTORY_INSTANCE, 'storeState', { id: full, state: state.slice(i, i + CHUNK) });
    }
}

/** Erzeugt ts-Stützstellen und ruft fn(ts, hourOfDay, dayIndex) -> val. */
function series(fn) {
    const out = [];
    let idx = 0;
    for (let ts = START; ts <= NOW; ts += STEP_MS, idx++) {
        const d = new Date(ts);
        const hod = d.getHours() + d.getMinutes() / 60;   // 0..24
        const day = Math.floor((ts - START) / (24 * 3600 * 1000));
        out.push({ ts, val: fn(ts, hod, day, idx) });
    }
    return out;
}

// ------------------- instantane Energie-Formeln (geteilt) -------------------
function pvPower(h, ts) {
    const cloud = 0.55 + 0.45 * Math.abs(Math.sin(ts / 8.64e7));
    return (h > 5.5 && h < 20.5)
        ? clamp(6500 * Math.exp(-Math.pow(h - 13, 2) / 8) * cloud + noise(150), 0, 7000)
        : 0;
}
function housePower(h) {
    let l = 300 + noise(60);
    if (h >= 6 && h <= 9)   l += 900 * Math.exp(-Math.pow(h - 7.5, 2) / 1.2);
    if (h >= 17 && h <= 23) l += 1600 * Math.exp(-Math.pow(h - 19.5, 2) / 3);
    if (rnd() > 0.97)       l += 2000;
    return clamp(l, 120, 5000);
}
/** Batterie-/Netz-Aufteilung aus PV, Last, aktuellem SoC (10 kWh Speicher). */
function splitPower(pvW, loadW, soC, dtH) {
    const surplus = pvW - loadW;
    let battW = 0;
    if (surplus > 200 && soC < 100)      battW = Math.min(surplus, 3000, (100 - soC) / 100 * 10000);
    else if (surplus < -100 && soC > 10) battW = Math.max(surplus, -3000, -(soC - 10) / 100 * 10000);
    const newSoc = clamp(soC + (battW * dtH) / 10000 * 100, 5, 100);
    const gridW  = loadW - pvW + battW;
    return { battW, newSoc, gridW };
}

// ----------------------------- Auto-Detect ----------------------------------
async function detectHistory() {
    const candidates = [HISTORY_INSTANCE, 'history.0', 'influxdb.0', 'sql.0'];
    for (const inst of candidates) {
        const o = await getObjectAsync(`system.adapter.${inst}`);
        if (o) { HISTORY_INSTANCE = inst; return true; }
    }
    return false;
}

// =================================== MAIN ===================================
async function main() {
    log(`[visTest] Start – Root=${ROOT}, ${HIST_DAYS}d @ ${HIST_STEP_MIN}min`);

    if (WIPE_FIRST) {
        try { await deleteStateAsync(ROOT); } catch (e) {}
        try { await deleteObjectAsync(ROOT, true); } catch (e) {}
    }

    const hasHist = await detectHistory();
    if (hasHist) log(`[visTest] History-Adapter: ${HISTORY_INSTANCE}`);
    else          log('[visTest] Kein History-Adapter gefunden – nur aktuelle Werte, keine Verläufe', 'warn');

    // ---- Ordnerstruktur ----
    await mkFolder(ROOT, 'vis Test-Datenpunkte');
    for (const [id, name] of [
        ['bool',   'Boolesche Werte / Schalter'],
        ['sensor', 'Sensoren (Verlauf)'],
        ['level',  'Level / Dimmer / Jalousie'],
        ['energy', 'Energie & Leistung'],
        ['enum',   'Aufzählungen / Modi'],
        ['string', 'Texte / JSON / Farben'],
        ['counter','Zähler (kumulativ)'],
    ]) await mkFolder(`${ROOT}.${id}`, name);

    // ======================= 1) BOOL / SCHALTER =============================
    await mkState('bool.lightLiving',  { name: 'Licht Wohnzimmer', type: 'boolean', role: 'switch',        read: true, write: true }, true);
    await mkState('bool.lightKitchen', { name: 'Licht Küche',      type: 'boolean', role: 'switch.light',  read: true, write: true }, false);
    await mkState('bool.doorFront',    { name: 'Haustür',          type: 'boolean', role: 'sensor.door',   read: true, write: false }, false);
    await mkState('bool.windowBed',    { name: 'Fenster Schlafz.', type: 'boolean', role: 'sensor.window', read: true, write: false }, true);
    await mkState('bool.motionHall',   { name: 'Bewegung Flur',    type: 'boolean', role: 'sensor.motion', read: true, write: false }, false);
    await mkState('bool.presence',     { name: 'Anwesenheit',      type: 'boolean', role: 'indicator',     read: true, write: true }, true);
    await mkState('bool.alarm',        { name: 'Alarm aktiv',      type: 'boolean', role: 'indicator.alarm', read: true, write: true }, false);

    // ======================= 2) SENSOREN (mit Verlauf) ======================
    const sensors = [
        // id,                name,                unit, role,               fn(hod,day)
        ['sensor.tempLiving', 'Temperatur Wohnz.', '°C', 'value.temperature', (h)   => 21 + 1.5 * Math.sin((h - 15) / 24 * 2 * Math.PI) + noise(0.4)],
        ['sensor.tempOut',    'Temperatur außen',  '°C', 'value.temperature', (h,d) => 9 + 7 * Math.sin((h - 9) / 24 * 2 * Math.PI) + 3 * Math.sin(d / 30 * Math.PI) + noise(1.2)],
        ['sensor.humLiving',  'Luftfeuchte Wohnz.','%',  'value.humidity',    (h)   => clamp(48 + 12 * Math.sin((h - 4) / 24 * 2 * Math.PI) + noise(3), 25, 85)],
        ['sensor.co2',        'CO₂ Wohnzimmer',    'ppm','value.co2',         (h)   => clamp(420 + ((h > 6 && h < 23) ? 350 * Math.abs(Math.sin(h / 4)) : 40) + noise(50), 400, 1600)],
        ['sensor.lux',        'Helligkeit',        'lx', 'value.brightness',  (h)   => clamp((h > 6 && h < 21) ? 12000 * Math.exp(-Math.pow(h - 13.5, 2) / 18) + noise(400) : noise(5), 0, 20000)],
        ['sensor.pressure',   'Luftdruck',         'hPa','value.pressure',    (h,d) => round(1013 + 8 * Math.sin(d / 7 * Math.PI) + noise(1.5), 1)],
        ['sensor.windSpeed',  'Windgeschw.',       'm/s','value.speed',       (h)   => clamp(3 + 2 * Math.sin(h / 3) + noise(2), 0, 15)],
    ];
    for (const [id, name, unit, role, fn] of sensors) {
        const s = series((ts, h, d) => round(fn(h, d), 2));
        await mkState(id, { name, type: 'number', role, unit, read: true, write: false }, s[s.length - 1].val, { hist: hasHist });
        if (hasHist) await pushHistory(`${ROOT}.${id}`, s);
    }

    // ======================= 3) LEVEL / DIMMER ==============================
    await mkState('level.dimmerLiving', { name: 'Dimmer Wohnzimmer', type: 'number', role: 'level.dimmer',      unit: '%', min: 0, max: 100, read: true, write: true }, 65);
    await mkState('level.blindLiving',  { name: 'Jalousie Wohnzimmer',type: 'number', role: 'level.blind',       unit: '%', min: 0, max: 100, read: true, write: true }, 30);
    await mkState('level.volume',       { name: 'Lautstärke',        type: 'number', role: 'level.volume',      unit: '%', min: 0, max: 100, read: true, write: true }, 40);
    await mkState('level.setpoint',     { name: 'Soll-Temperatur',   type: 'number', role: 'level.temperature', unit: '°C',min: 5, max: 30, step: 0.5, read: true, write: true }, 21.5);

    // ======================= 4) ENERGIE & LEISTUNG ==========================
    // Konsistente Serien: PV, Hauslast, Netz(+Import/-Einspeisung), Batterie, SoC
    // + daraus integrierte kumulative kWh-Zähler.
    const pv = [], load = [], grid = [], batt = [], soc = [];
    const eProd = [], eCons = [], eImp = [], eExp = [];
    let soC = 55, kProd = 0, kCons = 0, kImp = 0, kExp = 0;
    const dt = HIST_STEP_MIN / 60; // Stunden pro Schritt

    for (let ts = START, i = 0; ts <= NOW; ts += STEP_MS, i++) {
        const d = new Date(ts);
        const h = d.getHours() + d.getMinutes() / 60;

        // PV & Hauslast aus geteilten Formeln
        const pvW   = pvPower(h, ts);
        const loadW = housePower(h);

        // Batterie/Netz-Aufteilung (SoC stateful)
        const { battW, newSoc, gridW } = splitPower(pvW, loadW, soC, dt);
        soC = newSoc;

        // kumulative Energiemengen (kWh)
        kProd += (pvW * dt) / 1000;
        kCons += (loadW * dt) / 1000;
        if (gridW > 0) kImp += (gridW * dt) / 1000; else kExp += (-gridW * dt) / 1000;

        pv.push({ ts, val: round(pvW) });
        load.push({ ts, val: round(loadW) });
        grid.push({ ts, val: round(gridW) });
        batt.push({ ts, val: round(battW) });
        soc.push({ ts, val: round(soC, 1) });
        eProd.push({ ts, val: round(kProd, 3) });
        eCons.push({ ts, val: round(kCons, 3) });
        eImp.push({ ts, val: round(kImp, 3) });
        eExp.push({ ts, val: round(kExp, 3) });
    }

    const energyDefs = [
        ['energy.pvPower',    'PV-Leistung',        'W',   'value.power',                pv],
        ['energy.housePower', 'Hausverbrauch',      'W',   'value.power',                load],
        ['energy.gridPower',  'Netz (+Bezug/-Eins.)','W',  'value.power',                grid],
        ['energy.battPower',  'Batterie (+lädt)',   'W',   'value.power',                batt],
        ['energy.battSoc',    'Batterie-Ladestand', '%',   'value.battery',              soc],
        ['energy.kwhProduced','Erzeugung gesamt',   'kWh', 'value.power.consumption',    eProd],
        ['energy.kwhConsumed','Verbrauch gesamt',   'kWh', 'value.power.consumption',    eCons],
        ['energy.kwhImport',  'Netzbezug gesamt',   'kWh', 'value.power.consumption',    eImp],
        ['energy.kwhExport',  'Einspeisung gesamt', 'kWh', 'value.power.consumption',    eExp],
    ];
    for (const [id, name, unit, role, s] of energyDefs) {
        await mkState(id, { name, type: 'number', role, unit, read: true, write: false }, s[s.length - 1].val, { hist: hasHist });
        if (hasHist) await pushHistory(`${ROOT}.${id}`, s);
    }

    // ======================= 5) ENUM / MODI =================================
    await mkState('enum.hvacMode', {
        name: 'HVAC-Modus', type: 'number', role: 'level.mode.thermostat', read: true, write: true,
        states: { 0: 'Aus', 1: 'Heizen', 2: 'Kühlen', 3: 'Auto', 4: 'Lüften' },
    }, 1);
    await mkState('enum.washer', {
        name: 'Waschmaschine', type: 'number', role: 'value', read: true, write: false,
        states: { 0: 'Aus', 1: 'Waschen', 2: 'Spülen', 3: 'Schleudern', 4: 'Fertig' },
    }, 4);
    await mkState('enum.fanSpeed', {
        name: 'Lüfterstufe', type: 'string', role: 'text', read: true, write: true,
        states: { low: 'Niedrig', mid: 'Mittel', high: 'Hoch', auto: 'Automatik' },
    }, 'auto');
    await mkState('enum.battLevel', { name: 'Batteriestatus', type: 'number', role: 'value.battery', unit: '%', min: 0, max: 100, read: true, write: false }, 78);

    // ======================= 6) STRING / JSON / FARBE =======================
    await mkState('string.statusText',  { name: 'Statustext',     type: 'string', role: 'text',              read: true, write: true }, 'Alles in Ordnung');
    await mkState('string.weatherDesc', { name: 'Wetter',         type: 'string', role: 'weather.title',     read: true, write: false }, 'Teilweise bewölkt');
    await mkState('string.url',         { name: 'Kamera-URL',     type: 'string', role: 'url',               read: true, write: false }, 'http://192.168.188.168:8082/');
    await mkState('string.date',        { name: 'Letzte Aktion',  type: 'string', role: 'value.datetime',    read: true, write: false }, new Date(NOW).toISOString());
    await mkState('string.colorRgb',    { name: 'RGB-Farbe',      type: 'string', role: 'level.color.rgb',   read: true, write: true }, '#33aaff');
    await mkState('string.colorHue',    { name: 'Farbton (Hue)',  type: 'number', role: 'level.color.hue',   unit: '°', min: 0, max: 360, read: true, write: true }, 210);
    await mkState('string.jsonArray',   { name: 'JSON-Array',     type: 'string', role: 'json',              read: true, write: false },
        JSON.stringify([{ name: 'Wohnzimmer', temp: 21.5 }, { name: 'Küche', temp: 22.1 }, { name: 'Bad', temp: 23.4 }]));
    await mkState('string.jsonTable',   { name: 'JSON-Tabelle',   type: 'string', role: 'json',              read: true, write: false },
        JSON.stringify([
            { Raum: 'Wohnzimmer', Temp: 21.5, Feuchte: 48, Status: 'OK' },
            { Raum: 'Schlafzimmer', Temp: 19.2, Feuchte: 52, Status: 'OK' },
            { Raum: 'Bad', Temp: 23.4, Feuchte: 61, Status: 'hoch' },
            { Raum: 'Küche', Temp: 22.1, Feuchte: 45, Status: 'OK' },
        ]));

    // ======================= 7) ZÄHLER (kumulativ, mit Verlauf) =============
    // Wasser & Gas als stetig steigende Zähler
    let water = 1234.5, gas = 5678.9;
    const waterS = series(() => (water += 0.02 + rnd() * 0.05));
    const gasS   = series((ts, h) => (gas += (h > 6 && h < 22 ? 0.03 : 0.005) + rnd() * 0.02));
    await mkState('counter.water', { name: 'Wasserzähler', type: 'number', role: 'value.volume', unit: 'm³', read: true, write: false }, round(waterS[waterS.length - 1].val, 2), { hist: hasHist });
    await mkState('counter.gas',   { name: 'Gaszähler',    type: 'number', role: 'value.volume', unit: 'm³', read: true, write: false }, round(gasS[gasS.length - 1].val, 2),   { hist: hasHist });
    if (hasHist) { await pushHistory(`${ROOT}.counter.water`, waterS); await pushHistory(`${ROOT}.counter.gas`, gasS); }
    await mkState('counter.reboots', { name: 'Neustarts',  type: 'number', role: 'value', unit: '', read: true, write: false }, 7);

    log('[visTest] Fertig ✔  DPs + Verläufe angelegt unter ' + ROOT);
}

// ============================== LIVE-UPDATER ================================
// Schreibt regelmäßig frische Werte -> History wächst weiter, Widgets zappeln.
let liveTimer = null;

async function liveTick() {
    try {
        const d = new Date();
        const h = d.getHours() + d.getMinutes() / 60;
        const dtH = LIVE_INTERVAL_S / 3600;

        // --- Sensoren neu berechnen ---
        const sfns = {
            'sensor.tempLiving': () => 21 + 1.5 * Math.sin((h - 15) / 24 * 2 * Math.PI) + noise(0.4),
            'sensor.tempOut':    () => 9 + 7 * Math.sin((h - 9) / 24 * 2 * Math.PI) + noise(1.2),
            'sensor.humLiving':  () => clamp(48 + 12 * Math.sin((h - 4) / 24 * 2 * Math.PI) + noise(3), 25, 85),
            'sensor.co2':        () => clamp(420 + ((h > 6 && h < 23) ? 350 * Math.abs(Math.sin(h / 4)) : 40) + noise(50), 400, 1600),
            'sensor.lux':        () => clamp((h > 6 && h < 21) ? 12000 * Math.exp(-Math.pow(h - 13.5, 2) / 18) + noise(400) : noise(5), 0, 20000),
            'sensor.pressure':   () => 1013 + noise(3),
            'sensor.windSpeed':  () => clamp(3 + 2 * Math.sin(h / 3) + noise(2), 0, 15),
        };
        for (const [id, fn] of Object.entries(sfns)) await setStateAsync(`${ROOT}.${id}`, { val: round(fn(), 2), ack: true });

        // --- Energie (SoC aus State weiterführen) ---
        const socState = await getStateAsync(`${ROOT}.energy.battSoc`);
        let soC = (socState && typeof socState.val === 'number') ? socState.val : 55;
        const pvW = pvPower(h, Date.now());
        const loadW = housePower(h);
        const { battW, newSoc, gridW } = splitPower(pvW, loadW, soC, dtH);
        await setStateAsync(`${ROOT}.energy.pvPower`,    { val: round(pvW), ack: true });
        await setStateAsync(`${ROOT}.energy.housePower`, { val: round(loadW), ack: true });
        await setStateAsync(`${ROOT}.energy.gridPower`,  { val: round(gridW), ack: true });
        await setStateAsync(`${ROOT}.energy.battPower`,  { val: round(battW), ack: true });
        await setStateAsync(`${ROOT}.energy.battSoc`,    { val: round(newSoc, 1), ack: true });

        // --- kumulative kWh-Zähler hochzählen ---
        const bump = async (id, addKwh) => {
            const s = await getStateAsync(`${ROOT}.${id}`);
            const base = (s && typeof s.val === 'number') ? s.val : 0;
            await setStateAsync(`${ROOT}.${id}`, { val: round(base + addKwh, 3), ack: true });
        };
        await bump('energy.kwhProduced', pvW * dtH / 1000);
        await bump('energy.kwhConsumed', loadW * dtH / 1000);
        if (gridW > 0) await bump('energy.kwhImport', gridW * dtH / 1000);
        else           await bump('energy.kwhExport', -gridW * dtH / 1000);

        // --- Wasser/Gas Zähler ---
        await bump('counter.water', 0.001 + rnd() * 0.003);
        await bump('counter.gas', (h > 6 && h < 22 ? 0.002 : 0.0004) + rnd() * 0.002);

        // --- Bools gelegentlich umschalten (Bewegung/Tür/Licht) ---
        if (rnd() > 0.6) await setStateAsync(`${ROOT}.bool.motionHall`, { val: rnd() > 0.5, ack: true });
        if (rnd() > 0.9) await setStateAsync(`${ROOT}.bool.doorFront`,  { val: rnd() > 0.5, ack: true });
        if (rnd() > 0.85) await setStateAsync(`${ROOT}.bool.lightKitchen`, { val: rnd() > 0.5, ack: true });
    } catch (e) {
        log('[visTest] liveTick-Fehler: ' + e, 'warn');
    }
}

main()
    .then(() => {
        if (LIVE_UPDATE) {
            liveTimer = setInterval(liveTick, LIVE_INTERVAL_S * 1000);
            log(`[visTest] Live-Updates aktiv – alle ${LIVE_INTERVAL_S}s (Skript bleibt laufen)`);
        }
    })
    .catch(e => log('[visTest] FEHLER: ' + e, 'error'));

// beim Stoppen des Skripts sauber aufräumen
onStop(() => { if (liveTimer) clearInterval(liveTimer); }, 1000);
