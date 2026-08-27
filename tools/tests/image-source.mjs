// Verifies how a raw image value - a datapoint value or a configured URL - is
// turned into a browser-loadable <img> src.
//
//   node tools/tests/image-source.mjs
//
// The focus is issue #592: adapters such as fb-checkpresence publish their
// guest-WLAN QR code as raw SVG markup in a string state. Before the fix such a
// value fell through to the web-adapter path branch and 404ed. No dev server is
// needed - the resolver is pure, so it is bundled with esbuild and called
// directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-image-source-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { resolveImageSource, resolveHtmlAssets } from './src-vis/utils/assetUrl.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { resolveImageSource, resolveHtmlAssets } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── 1. Raw SVG markup becomes an inline data URI ────────────────────────────
{
    // Exactly what fb-checkpresence writes to guest.wlanQR (qr-image, type svg).
    const qr =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"><path fill="black" d="M4 4h7v1h-7z"/></svg>';
    const src = resolveImageSource(qr);
    check('QR markup becomes an svg data URI', src.startsWith('data:image/svg+xml;charset=utf-8,'));
    check('the markup is not routed to /webfs', !src.includes('/webfs'));
    eq('the payload round-trips', decodeURIComponent(src.slice('data:image/svg+xml;charset=utf-8,'.length)), qr);
    check('the # of a fill colour is escaped', !resolveImageSource('<svg><path fill="#abcdef"/></svg>').includes('#'));
    check('leading whitespace is tolerated', resolveImageSource('\n  ' + qr).startsWith('data:image/svg+xml'));
    check(
        'an XML prolog is tolerated',
        resolveImageSource('<?xml version="1.0"?>' + qr).startsWith('data:image/svg+xml'),
    );
    check('a doctype is tolerated', resolveImageSource('<!DOCTYPE svg>' + qr).startsWith('data:image/svg+xml'));
}

// ── 2. Nothing else is mistaken for SVG ─────────────────────────────────────
{
    check('plain HTML is no image', !resolveImageSource('<div>hallo</div>').startsWith('data:image/svg+xml'));
    check('text starting with < is no image', !resolveImageSource('<3').startsWith('data:'));
    eq(
        'an .svg file path still goes to the web adapter',
        resolveImageSource('/vis.0/main/qr.svg'),
        '/webfs/vis.0/main/qr.svg',
    );
}

// ── 3. The other source kinds keep working ──────────────────────────────────
{
    eq('https URL untouched', resolveImageSource('https://x/y.png'), 'https://x/y.png');
    eq('data URI untouched', resolveImageSource('data:image/png;base64,iVBOR'), 'data:image/png;base64,iVBOR');
    eq('aura-file goes to /fs/read', resolveImageSource('aura-file:/opt/a.png'), '/fs/read?path=%2Fopt%2Fa.png');
    eq('adapter path goes to /webfs', resolveImageSource('sonos/cover.png'), '/webfs/sonos/cover.png');
    eq('aura-local path untouched', resolveImageSource('/fs/read?path=x'), '/fs/read?path=x');
    eq('empty stays empty', resolveImageSource(''), '');
    eq('non-string stays empty', resolveImageSource(null), '');
    const b64 = 'PHN2Zw' + 'A'.repeat(120);
    check('base64-encoded SVG keeps its mime', resolveImageSource(b64).startsWith('data:image/svg+xml;base64,'));
}

// ── 4. HTML fragments: an src="…" is rewritten, inline <svg> is left alone ──
{
    const html = '<img src="aura-file:/opt/a.png"><svg viewBox="0 0 1 1"></svg>';
    const out = resolveHtmlAssets(html);
    check('src attribute rewritten', out.includes('/fs/read?path=%2Fopt%2Fa.png'));
    check('inline svg element untouched', out.includes('<svg viewBox="0 0 1 1">'));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
