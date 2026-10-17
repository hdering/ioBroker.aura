// Map widget lines (#410 recorded tracks, #790 routes) — the pure part.
//
//   node tools/tests/map-track-logic.mjs
//
// No dev server needed: utils/mapTrack is pure and bundled with esbuild. How the
// lines look on the map is tools/tests/map-lines.mjs (browser).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-map-track-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/mapTrack.ts'; export { formatPhotonAddress } from './src-vis/utils/geo.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    // basePath reads import.meta.env, which only vite provides.
    define: { 'import.meta.env': '{}' },
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// ── parseTrack: the example from #410 ───────────────────────────────────────
{
    const json = JSON.stringify({
        name: 'Fahrt vom 04.07.2026',
        lineColor: '#1976d2',
        points: [
            { lat: 51.05041, lon: 13.73731, timestamp: '2026-07-04T12:00:00+02:00', speed: 0, accuracy: 8 },
            { lat: 51.05082, lon: 13.7381, timestamp: '2026-07-04T12:00:10+02:00', speed: 18, accuracy: 7 },
            { lat: 51.05135, lon: 13.7392, timestamp: '2026-07-04T12:00:20+02:00', speed: 31, accuracy: 6 },
        ],
    });
    const t = m.parseTrack(json);
    check('issue example: 3 points', t.points.length === 3, String(t.points.length));
    check('issue example: name + lineColor', t.name === 'Fahrt vom 04.07.2026' && t.color === '#1976d2');
    const p = t.points[1];
    check('point carries lat/lon', p.pos[0] === 51.05082 && p.pos[1] === 13.7381);
    check('point carries speed + accuracy', p.speed === 18 && p.accuracy === 7);
    check('ISO timestamp parsed', p.ts === Date.parse('2026-07-04T12:00:10+02:00'));
}

// ── parseTrack: other shapes ────────────────────────────────────────────────
{
    const arr = m.parseTrack([
        [52.5, 13.4],
        [52.6, 13.5],
    ]);
    check('bare [lat, lon] array', arr.points.length === 2 && arr.points[0].pos[0] === 52.5);

    const strs = m.parseTrack(['52.5,13.4', '52.6;13.5', 'garbage']);
    check('"lat,lon" strings, garbage skipped', strs.points.length === 2);

    const nested = m.parseTrack({ data: { trip: { pts: [{ y: 1, x: 2 }] } } }, 'data.trip.pts', 'y', 'x');
    check('explicit pointsPath + lat/lon keys', nested.points.length === 1 && nested.points[0].pos.join() === '1,2');

    const sec = m.parseTrack([{ lat: 1, lng: 2, ts: 1_700_000_000 }]);
    check('epoch seconds become ms', sec.points[0].ts === 1_700_000_000_000);

    const geo = m.parseTrack({
        type: 'Feature',
        properties: { name: 'GPX' },
        geometry: {
            type: 'LineString',
            coordinates: [
                [13.4, 52.5],
                [13.5, 52.6],
            ],
        },
    });
    check('GeoJSON is [lon, lat]', geo.points[0].pos.join() === '52.5,13.4' && geo.name === 'GPX');

    check('broken JSON yields no points', m.parseTrack('{oops').points.length === 0);
    check('null yields no points', m.parseTrack(null).points.length === 0);
}

// ── historyToTrack ──────────────────────────────────────────────────────────
{
    const rows = [
        { ts: 3000, val: '{"lat":1.2,"lon":2.2,"speed":40}' },
        { ts: 1000, val: { lat: 1, lon: 2 } },
        { ts: 1500, val: { lat: 1, lon: 2 } }, // parked: same place …
        { ts: 2000, val: { lat: 1, lon: 2 } }, // … still parked
        { ts: 2500, val: null },
        { ts: 4000, val: '1.3,2.3' },
    ];
    const t = m.historyToTrack(rows);
    check('history sorted, parked run kept as its two ends, nulls dropped', t.length === 4, String(t.length));
    check('parked run ends at its last reading', t[0].ts === 1000 && t[1].ts === 2000, `${t[0].ts}/${t[1].ts}`);
    check('history ts from the entry', t[3].ts === 4000);
    check('history keeps speed from the value', t[2].speed === 40);

    check('live point appended', m.appendLivePoint(t, { pos: [1.4, 2.4], ts: 5000 }).length === 5);
    const sameA = m.appendLivePoint(t, { pos: [1.3, 2.3], ts: 6000 });
    check('same place opens a run', sameA.length === 5);
    const sameB = m.appendLivePoint(sameA, { pos: [1.3, 2.3], ts: 7000 });
    check('same place again moves the run end', sameB.length === 5 && sameB[4].ts === 7000);
    check('older point not appended', m.appendLivePoint(t, { pos: [9, 9], ts: 10 }).length === 4);
}

// ── day window ──────────────────────────────────────────────────────────────
{
    const now = new Date(2026, 8, 8, 15, 30).getTime();
    const today = m.dayRange(0, now);
    check('today starts at local midnight', today.start === new Date(2026, 8, 8).getTime());
    check('today ends at the next midnight', today.end === new Date(2026, 8, 9).getTime());
    const y = m.dayRange(-1, now);
    check('yesterday', y.start === new Date(2026, 8, 7).getTime() && y.end === today.start);
    const pts = [{ pos: [1, 1], ts: y.start + 1 }, { pos: [1, 2], ts: today.start + 5 }, { pos: [1, 3] }];
    const f = m.filterDay(pts, today.start, today.end);
    check('filterDay keeps the day and untimed points', f.length === 2 && f[0].pos[1] === 2);
}

// ── stays and trips ─────────────────────────────────────────────────────────
{
    const t0 = new Date(2026, 8, 8, 0, 0).getTime();
    const min = 60_000;
    const home = [50.7286, 6.6006];
    const at = (pos, m_, jitter = 0) => ({ pos: [pos[0] + jitter, pos[1]], ts: t0 + m_ * min });
    const track = [
        // home 00:00–09:16, readings every ~30 min with GPS jitter (≈ 20 m)
        ...Array.from({ length: 19 }, (_, i) => at(home, i * 30, i % 2 ? 0.0002 : 0)),
        at(home, 556),
        // trip 09:16–09:38 (≈ 7.3 km out and back)
        at([50.74, 6.62], 563),
        at([50.75, 6.64], 570),
        at([50.74, 6.62], 577),
        // home again 09:37–16:50
        at(home, 577 + 1),
        at(home, 700, 0.0003),
        at(home, 1010),
    ];
    const segs = m.detectSegments(track, 100, 10);
    const kinds = segs.map((s) => s.kind).join(',');
    check('home – trip – home', kinds === 'stay,move,stay', kinds);
    check('first stay 00:00–09:16', segs[0].start === t0 && segs[0].end === t0 + 556 * min);
    check('trip duration 22 min', Math.round((segs[1].end - segs[1].start) / min) === 22);
    check('trip length counted', segs[1].km > 6.5 && segs[1].km < 8, segs[1].km.toFixed(2));
    check(
        'stay centre near home',
        m.nearestPlace(segs[0].center, [{ pos: home, label: 'Home' }], 50)?.label === 'Home',
    );

    // A single outlier inside a stay must not cut it in two.
    const outlier = [at(home, 0), at(home, 20), at([50.735, 6.6006], 21), at(home, 22), at(home, 60)];
    const so = m.detectSegments(outlier, 100, 10).filter((s) => s.kind === 'stay');
    check('outlier does not split the stay', so.length === 1, String(so.length));

    check('untimed points give no timeline', m.detectSegments([{ pos: [1, 1] }, { pos: [1, 2] }]).length === 0);
    const short = m.detectSegments([at(home, 0), at(home, 5)], 100, 10);
    check(
        '5 min at one place is no stay',
        short.every((s) => s.kind !== 'stay'),
    );
}

// ── direction + address ─────────────────────────────────────────────────────
{
    check('bearing east = 90°', Math.round(m.bearingDeg([50, 10], [50, 10.1])) === 90);
    check('bearing north = 0°', Math.round(m.bearingDeg([50, 10], [50.1, 10])) === 0);
    check(
        'end bearing skips a parked tail',
        Math.round(
            m.endBearing([
                [50, 10],
                [50.1, 10],
                [50.1, 10],
            ]),
        ) === 0,
    );
    const a = m.formatPhotonAddress({
        street: 'Am Schnocksgraben',
        housenumber: '4',
        city: 'Vettweiß',
        country: 'Deutschland',
    });
    check('address line', a.address === 'Am Schnocksgraben 4, Vettweiß, Deutschland', a.address);
    check('title falls back to street', a.title === 'Am Schnocksgraben 4');
    const b = m.formatPhotonAddress({ name: 'Aral', street: 'Hauptstr.', city: 'Düren', country: 'Deutschland' });
    check(
        'a named place is the title',
        b.title === 'Aral' && b.address === 'Hauptstr., Düren, Deutschland',
        JSON.stringify(b),
    );
    const c = m.formatPhotonAddress({
        name: 'Am Empker Pfad',
        district: 'Froitzheim',
        city: 'Vettweiß',
        country: 'Deutschland',
    });
    check('no street: name leads the address', c.address === 'Am Empker Pfad, Vettweiß, Deutschland', c.address);
}

// ── lengths, bounds, formatting ─────────────────────────────────────────────
{
    // One degree of latitude ≈ 111.2 km.
    const km = m.trackLengthKm([
        [50, 10],
        [51, 10],
    ]);
    check('length of 1° latitude', Math.abs(km - 111.2) < 0.5, km.toFixed(2));
    const b = m.trackBounds([
        [51, 10],
        [50, 12],
        [52, 11],
    ]);
    check('bounds sw/ne', b[0].join() === '50,10' && b[1].join() === '52,12');
    check('no bounds for an empty track', m.trackBounds([]) === null);
    check('duration minutes', m.formatDuration(14.4) === '14 min');
    check('duration hours', m.formatDuration(65) === '1 h 05 min');
}

// ── routing ─────────────────────────────────────────────────────────────────
{
    check('unknown profile falls back to car', m.normalizeProfile('rocket') === 'car');
    check(
        'route key rounds ~110 m',
        m.routeKey([52.52001, 13.40001], [48.1, 11.5], 'car') === m.routeKey([52.52049, 13.40049], [48.1, 11.5], 'car'),
    );
    check('route key differs per profile', m.routeKey([1, 2], [3, 4], 'car') !== m.routeKey([1, 2], [3, 4], 'bike'));
    const url = m.routeUrl([52.5, 13.4], [48.1, 11.5], 'bike');
    check(
        'OSRM url is lon,lat per profile',
        url.includes('/routed-bike/') && url.includes('13.400000,52.500000;11.500000,48.100000'),
        url,
    );
    const r = m.parseOsrmRoute({
        code: 'Ok',
        routes: [
            {
                distance: 12400,
                duration: 840,
                geometry: {
                    coordinates: [
                        [13.4, 52.5],
                        [13.5, 52.6],
                    ],
                },
            },
        ],
    });
    check('OSRM response parsed', r.distanceKm === 12.4 && r.durationMin === 14 && r.coords[0].join() === '52.5,13.4');
    check('NoRoute yields null', m.parseOsrmRoute({ code: 'NoRoute' }) === null);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
