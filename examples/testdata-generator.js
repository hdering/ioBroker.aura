// ============================================================================
// Testdaten-Generator für ioBroker
// Schreibt alle 30 Sekunden realistische Werte in Beispiel-Datenpunkte,
// damit Graphen/Charts in vis schön aussehen.
//
// Datenpunkte werden automatisch unter 0_userdata.0.testdata.* angelegt.
// Einfach im JavaScript-Adapter als neues Skript einfügen und starten.
// ============================================================================

const BASE = '0_userdata.0.testdata';
const INTERVAL_MS = 30 * 1000; // alle 30 Sekunden
const HISTORY_INSTANCE = 'history.0'; // History-Adapter-Instanz für das Logging
const ENABLE_HISTORY = true; // false → History gar nicht per Code setzen (manuell im Objekt-Tab aktivieren)

// History-Logging-Einstellungen (pro Datenpunkt)
const HISTORY_SETTINGS = {
  enabled: true,
  changesOnly: false, // alle Werte loggen (nicht nur Änderungen) → lückenlose Kurven
  debounce: 0,
  debounceTime: 0,
  retention: 604800, // 7 Tage aufbewahren
  maxLength: 960, // RAM-Puffer
  changesMinDelta: 0,
  changesRelogInterval: 0,
  aliasId: '',
};

// --- Datenpunkt-Definitionen ------------------------------------------------
// Jeder Datenpunkt bekommt eine Generator-Funktion, die den nächsten Wert
// aus dem vorherigen Wert + Tageszeit berechnet (smooth, keine Sprünge).

const datapoints = {
  temperature: {
    common: { name: 'Temperatur', type: 'number', role: 'value.temperature', unit: '°C', read: true, write: false },
    min: -5,
    max: 35,
    state: 21,
  },
  humidity: {
    common: { name: 'Luftfeuchtigkeit', type: 'number', role: 'value.humidity', unit: '%', read: true, write: false },
    min: 30,
    max: 80,
    state: 55,
  },
  power: {
    common: { name: 'Leistung', type: 'number', role: 'value.power', unit: 'W', read: true, write: false },
    min: 0,
    max: 3500,
    state: 250,
  },
  co2: {
    common: { name: 'CO₂', type: 'number', role: 'value', unit: 'ppm', read: true, write: false },
    min: 400,
    max: 1500,
    state: 600,
  },
  battery: {
    common: { name: 'Akku', type: 'number', role: 'value.battery', unit: '%', read: true, write: false },
    min: 0,
    max: 100,
    state: 100,
  },
  windspeed: {
    common: { name: 'Windgeschwindigkeit', type: 'number', role: 'value.speed', unit: 'km/h', read: true, write: false },
    min: 0,
    max: 60,
    state: 8,
  },
};

// --- Hilfsfunktionen --------------------------------------------------------

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Tageszeit als 0..1 (0 = Mitternacht, 0.5 = Mittag)
function dayFraction() {
  const now = new Date();
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

// Sinus-Tageskurve: Tiefpunkt nachts, Hochpunkt nachmittags (~15 Uhr)
function dayCurve() {
  // verschoben so, dass Maximum gegen 15 Uhr liegt
  return Math.sin((dayFraction() - 0.25) * 2 * Math.PI);
}

// Berechnet den nächsten Wert je Datenpunkt
function nextValue(key, def) {
  const noise = () => (Math.random() - 0.5);
  const curve = dayCurve(); // -1 .. 1
  let v = def.state;

  switch (key) {
    case 'temperature':
      // Basis 18°C + Tagesgang ±8°C + leichtes Rauschen
      v = 18 + curve * 8 + noise() * 1.5;
      break;
    case 'humidity':
      // gegenläufig zur Temperatur (feuchter nachts)
      v = 55 - curve * 15 + noise() * 4;
      break;
    case 'power':
      // Grundlast + Verbrauchsspitzen morgens/abends
      const peakMorning = Math.exp(-Math.pow((dayFraction() - 0.3) * 12, 2));
      const peakEvening = Math.exp(-Math.pow((dayFraction() - 0.8) * 12, 2));
      v = 150 + (peakMorning + peakEvening) * 2500 + Math.random() * 400;
      break;
    case 'co2':
      // steigt bei Anwesenheit (tagsüber), fällt nachts (Random-Walk + Tagesgang)
      v = def.state + curve * 30 + noise() * 80;
      v = clamp(v, def.min, def.max);
      break;
    case 'battery':
      // langsame Entladung, nachts Aufladung
      v = def.state + (curve > 0 ? -0.4 : 1.2) + noise() * 0.2;
      if (v <= def.min) v = def.min + 1;
      if (v >= def.max) v = def.max;
      break;
    case 'windspeed':
      // Random-Walk mit Böen
      v = def.state + noise() * 6 + (Math.random() < 0.1 ? Math.random() * 15 : 0);
      v = v * 0.85 + 6 * 0.15; // sanft Richtung Mittelwert ziehen
      break;
    default:
      v = def.state + noise() * (def.max - def.min) * 0.05;
  }

  v = clamp(v, def.min, def.max);
  v = Math.round(v * 10) / 10; // 1 Nachkommastelle
  def.state = v;
  return v;
}

// --- Datenpunkte anlegen und Loop starten -----------------------------------

let created = 0;
const total = Object.keys(datapoints).length;

Object.keys(datapoints).forEach((key) => {
  const def = datapoints[key];
  const id = `${BASE}.${key}`;
  createState(id, def.state, def.common, () => {
    created++;
    if (created === total) {
      log(`Testdaten-Generator: ${total} Datenpunkte bereit unter ${BASE}.*`);
      enableHistoryOnce(); // History einmalig (idempotent) aktivieren
      writeAll(); // sofort einen ersten Wert schreiben
    }
  });
});

// History-Logging einmalig aktivieren – nur wenn die Instanz existiert und
// noch nicht gesetzt ist. extendObject wird NIE aufgerufen, wenn alles passt
// → kein Objekt-Churn, keine Restart-Schleife.
function enableHistoryOnce() {
  if (!ENABLE_HISTORY) return;

  // 1) Existiert die History-Instanz überhaupt?
  getObject(`system.adapter.${HISTORY_INSTANCE}`, (err, inst) => {
    if (err || !inst) {
      log(`History übersprungen: Instanz ${HISTORY_INSTANCE} existiert nicht. ` +
          `History ggf. manuell im Objekt-Tab aktivieren.`, 'warn');
      return;
    }

    Object.keys(datapoints).forEach((key) => {
      const id = `${BASE}.${key}`;
      getObject(id, (e, obj) => {
        if (e || !obj) return;
        const custom = (obj.common && obj.common.custom) || {};
        // schon aktiv? → NICHT erneut schreiben (verhindert Churn/Loop)
        if (custom[HISTORY_INSTANCE] && custom[HISTORY_INSTANCE].enabled) return;
        custom[HISTORY_INSTANCE] = { ...HISTORY_SETTINGS };
        try {
          extendObject(id, { common: { custom } });
        } catch (ex) {
          log(`History für ${id} konnte nicht gesetzt werden: ${ex}`, 'warn');
        }
      });
    });
    log(`History-Logging geprüft/aktiviert für ${HISTORY_INSTANCE}`);
  });
}

function writeAll() {
  Object.keys(datapoints).forEach((key) => {
    const def = datapoints[key];
    setState(`${BASE}.${key}`, nextValue(key, def), true); // ack=true
  });
}

// Loop: alle 30 Sekunden neue Werte
const timer = setInterval(writeAll, INTERVAL_MS);

onStop(() => {
  clearInterval(timer);
  log('Testdaten-Generator gestoppt.');
}, 2000);
