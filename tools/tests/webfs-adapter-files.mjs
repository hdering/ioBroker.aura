// Verifies that `/webfs/adapter/<name>/<file>` is answered from the ioBroker
// file storage instead of being proxied to the web adapter.
//
//   node tools/tests/webfs-adapter-files.mjs
//
// Issue #519: pirate-weather publishes its weather icons as `/adapter/pirate-
// weather/icons/<set>/<name>.svg`, a path that only the web adapter serves. Aura
// rerouted those to its own `/webfs/…` and piped them through to the instance
// behind the configured socket port — which answers 404 whenever that port
// points at a socketio instance or at a web instance other than the one holding
// the files. Reading `<name>.admin` out of the objects DB removes that
// dependency entirely. No adapter instance is started here: the parser is pure
// and the serving method is called on a bare prototype with a stub file store.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

// Stub @iobroker/adapter-core before main.js pulls it in, so the module loads
// without a running js-controller (same trick as test/client-tree.test.js).
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
        Adapter: class {
            constructor(options) {
                this.name = options?.name;
                this.namespace = 'aura.0';
                this.log = { info() {}, warn() {}, error() {}, debug() {} };
            }
            on() {}
        },
    },
};

const main = require(join(process.cwd(), 'main.js'));
const { parseAdapterAssetPath, Aura } = main;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// ── 1. Which paths are recognised as adapter assets ─────────────────────────
{
    eq(
        'the pirate-weather icon of the report',
        parseAdapterAssetPath('/adapter/pirate-weather/icons/icebear/cloudy.svg'),
        {
            adapter: 'pirate-weather',
            file: 'icons/icebear/cloudy.svg',
        },
    );
    eq('a file right below the adapter', parseAdapterAssetPath('/adapter/vis/img.png'), {
        adapter: 'vis',
        file: 'img.png',
    });
    eq('percent-encoded spaces are decoded', parseAdapterAssetPath('/adapter/foo/a%20b.png'), {
        adapter: 'foo',
        file: 'a b.png',
    });
    check('a bare /adapter is no asset', parseAdapterAssetPath('/adapter') === null);
    check('an adapter without a file is no asset', parseAdapterAssetPath('/adapter/foo/') === null);
    check('sonos cover art stays on the proxy', parseAdapterAssetPath('/sonos/coverImage/1.2.3.4.png') === null);
    check('socket.io stays on the proxy', parseAdapterAssetPath('/socket.io/') === null);
}

// ── 2. Traversal is rejected, not sanitised ─────────────────────────────────
{
    check('plain traversal', parseAdapterAssetPath('/adapter/foo/../../etc/passwd') === null);
    check('encoded traversal', parseAdapterAssetPath('/adapter/foo/%2e%2e/%2e%2e/etc/passwd') === null);
    check('a single dot segment', parseAdapterAssetPath('/adapter/foo/./a.png') === null);
    check('an empty segment', parseAdapterAssetPath('/adapter/foo//a.png') === null);
    check('a backslash', parseAdapterAssetPath('/adapter/foo/a%5C..%5Cb.png') === null);
    check('an encoded NUL', parseAdapterAssetPath('/adapter/foo/a%00.png') === null);
    check('a broken escape sequence', parseAdapterAssetPath('/adapter/foo/a%zz.png') === null);
    check('a traversing adapter name', parseAdapterAssetPath('/adapter/../foo/a.png') === null);
}

// ── 3. Serving: the file store answers, the proxy is not needed ─────────────
const fakeRes = () => ({
    headersSent: false,
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
        this.headersSent = true;
        this.status = status;
        this.headers = headers || {};
    },
    end(body) {
        this.body = body;
    },
});
const serve = (asset, readFileAsync) => {
    const self = Object.create(Aura.prototype);
    self.readFileAsync = readFileAsync;
    const res = fakeRes();
    return self.serveAdapterAsset(asset, res).then((served) => ({ served, res }));
};
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
{
    const asset = { adapter: 'pirate-weather', file: 'icons/icebear/cloudy.svg' };
    let asked = null;
    const { served, res } = await serve(asset, async (id, file) => {
        asked = [id, file];
        return { file: Buffer.from(svg), mimeType: 'image/svg+xml' };
    });
    check('the icon is served', served === true);
    eq('it is read from the .admin file store', asked, ['pirate-weather.admin', 'icons/icebear/cloudy.svg']);
    check('status 200', res.status === 200);
    eq('the extension decides the content type', res.headers['Content-Type'], 'image/svg+xml');
    check('the payload is passed through', String(res.body) === svg);

    const arr = await serve(asset, async () => [Buffer.from(svg), 'image/svg+xml']);
    check('the [data, mime] shape of adapter-core works too', arr.served === true && String(arr.res.body) === svg);

    const str = await serve(asset, async () => svg);
    check('a plain string is buffered', str.served === true && String(str.res.body) === svg);

    const png = await serve({ adapter: 'foo', file: 'a.png' }, async () => ({ file: Buffer.from([1, 2, 3]) }));
    eq('a png without a reported mime', png.res.headers['Content-Type'], 'image/png');

    const odd = await serve({ adapter: 'foo', file: 'a.qqq' }, async () => ({
        file: Buffer.from([1]),
        mimeType: 'application/x-odd',
    }));
    eq('an unknown extension keeps the reported mime', odd.res.headers['Content-Type'], 'application/x-odd');
}

// ── 4. Anything the file store cannot answer falls back to the proxy ────────
{
    const asset = { adapter: 'foo', file: 'missing.svg' };
    const thrown = await serve(asset, async () => {
        throw new Error('Not exists');
    });
    check('a missing file does not answer', thrown.served === false && thrown.res.headersSent === false);

    const empty = await serve(asset, async () => ({ file: Buffer.alloc(0) }));
    check('an empty file does not answer', empty.served === false && empty.res.headersSent === false);

    const nothing = await serve(asset, async () => undefined);
    check('an undefined result does not answer', nothing.served === false && nothing.res.headersSent === false);

    const nulled = await serve(asset, async () => ({ file: null }));
    check('a null payload does not answer', nulled.served === false && nulled.res.headersSent === false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
