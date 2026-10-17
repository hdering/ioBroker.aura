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
    entryPoints: ['src-vis/utils/mapTrack.ts'],
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
        { ts: 2000, val: { lat: 1, lon: 2 } }, // parked: same place
        { ts: 2500, val: null },
        { ts: 4000, val: '1.3,2.3' },
    ];
    const t = m.historyToTrack(rows);
    check('history sorted, duplicates + nulls dropped', t.length === 3, String(t.length));
    check('history ts from the entry', t[0].ts === 1000 && t[2].ts === 4000);
    check('history keeps speed from the value', t[1].speed === 40);

    const live = { pos: [1.4, 2.4], ts: 5000 };
    check('live point appended', m.appendLivePoint(t, live).length === 4);
    check('same place not appended', m.appendLivePoint(t, { pos: [1.3, 2.3], ts: 6000 }).length === 3);
    check('older point not appended', m.appendLivePoint(t, { pos: [9, 9], ts: 10 }).length === 3);
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
