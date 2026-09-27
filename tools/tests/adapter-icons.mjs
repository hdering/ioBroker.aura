/**
 * lib/adapterIcons.js — icons of installed ioBroker icon adapters (#716).
 *
 * Pins the contract the icon picker relies on: which adapters count as icon
 * sets, what a set lists (images only, no admin UI, no photos), whether a set
 * may be tinted, and — the part that must never regress — that the file route
 * only ever hands out image files of icon adapters, not whatever else lives in
 * the ioBroker file storage.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createAdapterIcons, ioBrokerIconSource, folderIconSource, svgColours } = require('../../lib/adapterIcons.js');

let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
    if (cond) pass++;
    else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function fakeRes() {
    const res = {
        status: 0,
        headers: {},
        body: null,
        headersSent: false,
        done: null,
        writeHead(status, headers) {
            res.status = status;
            res.headers = headers || {};
            res.headersSent = true;
        },
        end(body) {
            res.body = body ?? null;
            res.done?.();
        },
    };
    res.finished = new Promise((resolve) => {
        res.done = resolve;
    });
    return res;
}

async function call(icons, url, method = 'GET') {
    const res = fakeRes();
    const handled = icons.handle({ method }, res, new URL(url, 'http://localhost'));
    if (handled) await res.finished;
    const text = res.body == null ? '' : String(res.body);
    return { handled, res, json: text.startsWith('{') ? JSON.parse(text) : null };
}

const FIXTURES = path.resolve('tools/fixtures/adapter-icons');

// ── 1. folder source (dev server / fixtures) ──────────────────────────────────
{
    const icons = createAdapterIcons({ source: folderIconSource(FIXTURES) });

    const other = await call(icons, '/icons/lucide.json?icons=home');
    check('foreign route not claimed', other.handled === false);

    const { res, json } = await call(icons, '/adapter-icons/sets');
    check('sets: 200', res.status === 200, `got ${res.status}`);
    const byId = Object.fromEntries((json?.sets || []).map((s) => [s.id, s]));
    check('sets: three fixture sets', Object.keys(byId).length === 3, Object.keys(byId).join(','));
    check('sets: title from metadata', byId['icons-test-mono']?.title === 'Test mono SVG');
    check('sets: licence reported', byId['icons-test-color']?.license === 'EPL-1.0');
    check('sets: mono set is tintable', byId['icons-test-mono']?.multicolor === false);
    check('sets: colour set is detected', byId['icons-test-color']?.multicolor === true);
    check('sets: png set is raster', byId['vis-test-png']?.raster === true);
    check('sets: svg set is not raster', byId['icons-test-mono']?.raster === false);
    check('sets: folders', JSON.stringify(byId['icons-test-mono']?.folders) === '["Lights","Rooms"]');
    check(
        'sets: png folders skip admin + jpg-only',
        JSON.stringify(byId['vis-test-png']?.folders) === '["Devices","Lights"]',
        JSON.stringify(byId['vis-test-png']?.folders),
    );

    const list = await call(icons, '/adapter-icons/list?set=vis-test-png');
    check('list: 200', list.res.status === 200);
    check(
        'list: images only, no admin, no jpg',
        JSON.stringify(list.json?.icons) === '["Devices/washer.png","Lights/lamp_off.png","Lights/lamp_on.png"]',
        JSON.stringify(list.json?.icons),
    );
    const mono = await call(icons, '/adapter-icons/list?set=icons-test-mono');
    check('list: root file listed', mono.json?.icons.includes('garage.svg'));
    check('list: metadata file not listed', !mono.json?.icons.some((f) => f.endsWith('.json')));

    const unknown = await call(icons, '/adapter-icons/list?set=aura');
    check('list: unknown set 404', unknown.res.status === 404);

    const svg = await call(icons, '/adapter-icons/file/icons-test-mono/Lights/bulb_on.svg');
    check('file: 200', svg.res.status === 200, `got ${svg.res.status}`);
    check('file: svg type', svg.res.headers['Content-Type'] === 'image/svg+xml');
    check('file: cached for a day', /max-age=86400/.test(svg.res.headers['Cache-Control'] || ''));
    check('file: svg sandboxed by CSP', /default-src 'none'/.test(svg.res.headers['Content-Security-Policy'] || ''));
    check('file: body is the svg', String(svg.res.body).includes('<svg'));

    const png = await call(icons, '/adapter-icons/file/vis-test-png/Lights/lamp_on.png');
    check('file: png served', png.res.status === 200 && png.res.headers['Content-Type'] === 'image/png');

    const enc = await call(icons, '/adapter-icons/file/icons-test-mono/Rooms%2Fbath.svg');
    check('file: encoded slash resolves', enc.res.status === 200, `got ${enc.res.status}`);

    for (const [label, url] of [
        // A plain `..` is already folded by URL parsing; an encoded slash is not.
        [
            'encoded traversal',
            '/adapter-icons/file/icons-test-mono/Lights%2F..%2F..%2Fvis-test-png%2FLights%2Flamp_on.png',
        ],
        ['backslash', '/adapter-icons/file/icons-test-mono/Lights%5C..%5Cgarage.svg'],
        ['non-image file', '/adapter-icons/file/icons-test-mono/_set.json'],
        ['jpg', '/adapter-icons/file/vis-test-png/Backgrounds/photo.jpg'],
        ['unknown adapter', '/adapter-icons/file/aura/aura-config.png'],
        ['missing file', '/adapter-icons/file/icons-test-mono/nope.svg'],
        ['no path', '/adapter-icons/file/icons-test-mono'],
    ]) {
        const r = await call(icons, url);
        check(`file: ${label} refused`, r.res.status === 404, `got ${r.res.status}`);
    }

    const post = await call(icons, '/adapter-icons/sets', 'POST');
    check('POST refused', post.res.status === 405);
}

// ── 2. ioBroker source ────────────────────────────────────────────────────────
{
    const files = {
        'icons-mfd-svg': { '': [{ file: 'light.svg', isDir: false, stats: { size: 300 } }] },
        'aura.0': { '': [{ file: 'secret.png', isDir: false, stats: { size: 10 } }] },
        'icons-empty': { '': [] },
    };
    const reads = [];
    const adapter = {
        async getForeignObjectsAsync(pattern, type) {
            check('iob: asks for adapter objects', pattern === 'system.adapter.*' && type === 'adapter');
            return {
                'system.adapter.icons-mfd-svg': {
                    _id: 'system.adapter.icons-mfd-svg',
                    common: {
                        name: 'icons-mfd-svg',
                        type: 'visualization-icons',
                        titleLang: { en: 'MFD', de: 'MFD Icons' },
                        license: 'CC-BY-SA-4.0',
                        version: '1.2.0',
                    },
                },
                'system.adapter.icons-empty': {
                    _id: 'system.adapter.icons-empty',
                    common: { name: 'icons-empty', type: 'visualization-icons', version: '1' },
                },
                'system.adapter.aura': {
                    _id: 'system.adapter.aura',
                    common: { name: 'aura', type: 'visualization', version: '1' },
                },
            };
        },
        async readDirAsync(ns, dir) {
            const d = files[ns]?.[dir];
            if (!d) throw new Error('not found');
            return d;
        },
        async readFileAsync(ns, file) {
            reads.push(`${ns}/${file}`);
            return {
                file: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff"/></svg>'),
                mimeType: 'image/svg+xml',
            };
        },
    };
    const icons = createAdapterIcons({ source: ioBrokerIconSource(adapter) });
    const { json } = await call(icons, '/adapter-icons/sets');
    check(
        'iob: only icon adapters with files',
        JSON.stringify(json?.sets.map((s) => s.id)) === '["icons-mfd-svg"]',
        JSON.stringify(json),
    );
    check('iob: german title preferred', json?.sets[0]?.title === 'MFD Icons');
    check('iob: licence from common', json?.sets[0]?.license === 'CC-BY-SA-4.0');
    const f = await call(icons, '/adapter-icons/file/icons-mfd-svg/light.svg');
    check('iob: file from adapter storage', f.res.status === 200 && reads.includes('icons-mfd-svg/light.svg'));
    const secret = await call(icons, '/adapter-icons/file/aura.0/secret.png');
    check('iob: non-icon namespace refused', secret.res.status === 404);
    check('iob: non-icon namespace never read', !reads.some((r) => r.startsWith('aura.0/')));
}

// ── 3. colour detection ───────────────────────────────────────────────────────
check('colours: one fill', svgColours('<path fill="#000"/><path fill="#000000"/>').size === 1);
check('colours: none/currentColor ignored', svgColours('<path fill="none" stroke="currentColor"/>').size === 0);
check('colours: style attribute', svgColours('<path style="fill:#f00;stroke:#00f"/>').size === 2);
check('colours: gradient ref ignored', svgColours('<path fill="url(#g)"/><stop stop-color="#fff"/>').size === 1);

console.log(`adapter-icons: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
