'use strict';

/**
 * Unit tests for the message system (issue #429).
 *
 * Covered: payload normalization (JSON + plain text + rejections), the implicit
 * target that each `messages.send` datapoint carries, the history ring buffer
 * including replace-by-id and retention, the unread counter, ack/dismiss/clear,
 * and the backfill of `clients.<id>.messages.send` on trees that predate it.
 *
 * main.js is loaded with @iobroker/adapter-core stubbed out, so the adapter class
 * can be instantiated without a running js-controller.
 */

const assert = require('assert');

// ── Stub @iobroker/adapter-core before main.js pulls it in ────────────────────
class FakeAdapter {
    constructor(options) {
        this.name = options.name;
        this.namespace = 'aura.0';
        this.log = { info() {}, warn() {}, error() {}, debug() {} };
    }
    on() {}
}
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: { Adapter: FakeAdapter },
};

const createAdapter = require('../main.js');

// ── In-memory object + state store, keyed by adapter-relative id ─────────────
function makeAdapter(config = {}, initialObjects = {}) {
    const a = createAdapter({});
    const objects = new Map(Object.entries(initialObjects));
    const states = new Map();

    a.config = config;
    a._objects = objects;
    a._states = states;
    a.getObjectAsync = async (id) => objects.get(id) || null;
    a.setObjectAsync = async (id, obj) => {
        objects.set(id, obj);
    };
    a.setObjectNotExistsAsync = async (id, obj) => {
        if (!objects.has(id)) {
            objects.set(id, obj);
        }
    };
    a.delObjectAsync = async (id) => {
        objects.delete(id);
    };
    a.getObjectViewAsync = async (_design, type, params) => {
        const rows = [];
        for (const [id, obj] of objects) {
            const full = `aura.0.${id}`;
            if (obj.type !== type) {
                continue;
            }
            if (full < params.startkey || full > params.endkey) {
                continue;
            }
            rows.push({ id: full, value: obj });
        }
        return { rows };
    };
    a.getStateAsync = async (id) => (states.has(id) ? states.get(id) : null);
    a.setStateAsync = async (id, val, ack) => {
        // Accepts both call shapes used across main.js.
        if (val && typeof val === 'object' && 'val' in val) {
            states.set(id, { val: val.val, ack: !!val.ack });
        } else {
            states.set(id, { val, ack: !!ack });
        }
    };
    a.setForeignStateAsync = a.setStateAsync;

    // Convenience accessors used by the assertions below.
    a._val = (id) => (states.has(id) ? states.get(id).val : undefined);
    a._history = () => JSON.parse(String(a._val('messages.history') ?? '[]'));
    a._last = () => JSON.parse(String(a._val('messages.lastMessage') || '{}'));
    return a;
}

/** Drive one write to a `messages.send` datapoint through the real dispatch. */
async function send(a, relDp, payload, origin) {
    await a._handleMessageSend(typeof payload === 'string' ? payload : JSON.stringify(payload), origin, relDp);
}

(async () => {
    // ── Plain text becomes an info message ───────────────────────────────────
    {
        const a = makeAdapter();
        const msg = a._normalizeMessage('Waschmaschine fertig');
        assert.strictEqual(msg.severity, 'info');
        assert.strictEqual(msg.text, 'Waschmaschine fertig');
        assert.strictEqual(msg.durationSec, 8, 'info default duration');
        assert.strictEqual(msg.position, 'top-right', 'default position');
        assert.strictEqual(msg.priority, 0);
        assert.strictEqual(msg.persist, true);
        assert.ok(msg.id && msg.ts, 'id and ts are assigned');
        console.log('✓ plain text payload becomes an info message');
    }

    // ── Unusable payloads are rejected, not thrown on ────────────────────────
    {
        const a = makeAdapter();
        assert.strictEqual(a._normalizeMessage(''), null, 'empty');
        assert.strictEqual(a._normalizeMessage('   '), null, 'whitespace');
        assert.strictEqual(a._normalizeMessage(null), null, 'null');
        assert.strictEqual(a._normalizeMessage('{not json'), null, 'broken JSON');
        assert.strictEqual(a._normalizeMessage('{"severity":"error"}'), null, 'no visible body');
        assert.strictEqual(a._normalizeMessage('{"a":1}'), null, 'JSON object without a body');
        console.log('✓ unusable payloads are rejected');
    }

    // ── Only `{` opts into JSON — everything else stays plain text ───────────
    // Deliberate: prefix styles like "[Warnung] Tür offen" must survive as text.
    {
        const a = makeAdapter();
        assert.strictEqual(a._normalizeMessage('[Warnung] Tür offen').text, '[Warnung] Tür offen');
        assert.strictEqual(a._normalizeMessage('[1,2]').text, '[1,2]', 'a JSON array is read as text, not parsed');
        console.log('✓ only a leading { opts into JSON parsing');
    }

    // ── Severity drives the default duration; requireAck disables it ─────────
    {
        const a = makeAdapter();
        assert.strictEqual(a._normalizeMessage('{"severity":"warning","text":"x"}').durationSec, 15);
        assert.strictEqual(a._normalizeMessage('{"severity":"error","text":"x"}').durationSec, 0);
        assert.strictEqual(a._normalizeMessage('{"text":"x","durationSec":3}').durationSec, 3);
        assert.strictEqual(a._normalizeMessage('{"text":"x","durationSec":0}').durationSec, 0, 'explicit 0 wins');
        const ackd = a._normalizeMessage('{"text":"x","durationSec":30,"requireAck":true}');
        assert.strictEqual(ackd.durationSec, 0, 'requireAck must defeat any auto-close');
        assert.strictEqual(ackd.requireAck, true);
        assert.strictEqual(a._normalizeMessage('{"severity":"nope","text":"x"}').severity, 'info', 'unknown severity');
        console.log('✓ duration defaults follow severity and requireAck');
    }

    // ── Out-of-range values are clamped, not passed through ──────────────────
    {
        const a = makeAdapter();
        const m = a._normalizeMessage(
            '{"text":"x","priority":9999,"transparency":500,"width":-5,"position":"nowhere"}',
        );
        assert.strictEqual(m.priority, 100);
        assert.strictEqual(m.transparency, 95);
        assert.strictEqual(m.width, undefined, 'a clamped-to-0 width means "use the default"');
        assert.strictEqual(m.position, 'top-right', 'unknown position falls back');
        console.log('✓ numeric fields are clamped and unknown enums fall back');
    }

    // ── config.messageDefaults feeds the normalizer ──────────────────────────
    {
        const a = makeAdapter();
        await a._loadMessageDefaults(
            JSON.stringify({
                position: 'bottom-center',
                durations: { info: 3, warning: 99 },
                width: 500,
                transparency: 20,
                errorsRequireAck: true,
            }),
        );
        const m = a._normalizeMessage('{"text":"x"}');
        assert.strictEqual(m.position, 'bottom-center');
        assert.strictEqual(m.durationSec, 3, 'per-severity duration default');
        assert.strictEqual(m.width, 500);
        assert.strictEqual(m.transparency, 20);
        assert.strictEqual(a._normalizeMessage('{"severity":"warning","text":"x"}').durationSec, 99);
        assert.strictEqual(
            a._normalizeMessage('{"severity":"success","text":"x"}').durationSec,
            8,
            'an unlisted severity keeps its built-in default',
        );

        // "Errors always need confirming" can be opted into per message but not out of.
        const err = a._normalizeMessage('{"severity":"error","text":"x","durationSec":30}');
        assert.strictEqual(err.requireAck, true);
        assert.strictEqual(err.durationSec, 0, 'a forced confirmation defeats the auto-close');

        // The payload still beats every default.
        const explicit = a._normalizeMessage('{"text":"x","position":"top-left","durationSec":7,"width":200}');
        assert.strictEqual(explicit.position, 'top-left');
        assert.strictEqual(explicit.durationSec, 7);
        assert.strictEqual(explicit.width, 200);
        console.log('✓ config.messageDefaults feeds the normalizer, payload still wins');
    }

    // ── Broken or absent defaults fall back to the built-ins ─────────────────
    {
        const a = makeAdapter();
        await a._loadMessageDefaults('{not json');
        assert.strictEqual(a._normalizeMessage('{"text":"x"}').position, 'top-right');
        await a._loadMessageDefaults(JSON.stringify({ position: 'nowhere', durations: 'nope', width: -1 }));
        const m = a._normalizeMessage('{"text":"x"}');
        assert.strictEqual(m.position, 'top-right', 'unknown position ignored');
        assert.strictEqual(m.durationSec, 8, 'non-object durations ignored');
        assert.strictEqual(m.width, undefined, 'out-of-range width ignored');
        console.log('✓ broken defaults fall back to the built-ins');
    }

    // ── Actions are validated and capped ────────────────────────────────────
    {
        const a = makeAdapter();
        const m = a._normalizeMessage(
            JSON.stringify({
                text: 'x',
                actions: [
                    { label: 'Ja', dp: 'js.0.a', value: true },
                    { label: 'no dp' },
                    { dp: 'js.0.b' },
                    { label: 'Nein', dp: 'js.0.c', close: false },
                ],
            }),
        );
        assert.strictEqual(m.actions.length, 2, 'entries without label or dp are dropped');
        assert.deepStrictEqual(m.actions[0], { label: 'Ja', dp: 'js.0.a', value: 'true', close: true });
        assert.strictEqual(m.actions[1].close, false);

        const many = a._normalizeMessage(
            JSON.stringify({
                text: 'x',
                actions: Array.from({ length: 20 }, (_, i) => ({ label: `a${i}`, dp: 'js.0.x' })),
            }),
        );
        assert.strictEqual(many.actions.length, 6, 'action list is capped');
        console.log('✓ actions are validated and capped');
    }

    // ── ackDp gets a default value; no ackDp means no ackValue ───────────────
    {
        const a = makeAdapter();
        const m = a._normalizeMessage('{"text":"x","ackDp":"js.0.seen"}');
        assert.strictEqual(m.ackDp, 'js.0.seen');
        assert.strictEqual(m.ackValue, 'true');
        assert.strictEqual(a._normalizeMessage('{"text":"x"}').ackValue, undefined);
        console.log('✓ ackDp defaults its value');
    }

    // ── The datapoint that was written supplies the implicit target ──────────
    {
        const a = makeAdapter();
        assert.strictEqual(a._normalizeMessage('{"text":"x"}', { kind: 'global' }).target, undefined);
        assert.deepStrictEqual(a._normalizeMessage('{"text":"x"}', { kind: 'client', clientId: 'tablet' }).target, {
            clients: ['tablet'],
        });
        assert.deepStrictEqual(a._normalizeMessage('{"text":"x"}', { kind: 'layout', slug: 'haus' }).target, {
            layout: 'haus',
        });
        // An explicit target wins over the implicit one.
        assert.deepStrictEqual(
            a._normalizeMessage('{"text":"x","target":{"layout":"garten","tab":"beet"}}', {
                kind: 'layout',
                slug: 'haus',
            }).target,
            { layout: 'garten', tab: 'beet' },
        );
        console.log('✓ implicit target comes from the datapoint, explicit target wins');
    }

    // ── send: archive, lastMessage, unreadCount, DP self-clear ──────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { severity: 'warning', title: 'Heizung', text: 'kalt' }, { kind: 'global' });
        const hist = a._history();
        assert.strictEqual(hist.length, 1);
        assert.strictEqual(hist[0].title, 'Heizung');
        assert.strictEqual(a._val('messages.unreadCount'), 1);
        assert.strictEqual(a._last().title, 'Heizung');
        assert.strictEqual(a._val('messages.send'), '', 'the command DP clears itself');
        console.log('✓ send archives, publishes and clears the datapoint');
    }

    // ── A broken payload still clears the DP (no re-fire on restart) ────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', '{broken', { kind: 'global' });
        assert.strictEqual(a._val('messages.send'), '');
        assert.strictEqual(a._val('messages.history'), undefined, 'nothing archived');
        console.log('✓ a rejected payload still clears the datapoint');
    }

    // ── persist:false shows but does not archive ────────────────────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { text: 'flüchtig', persist: false }, { kind: 'global' });
        assert.strictEqual(a._val('messages.history'), undefined, 'not archived');
        assert.strictEqual(a._last().text, 'flüchtig', 'but still delivered');
        console.log('✓ persist:false delivers without archiving');
    }

    // ── Same id replaces in place instead of stacking ───────────────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { id: 'wm', text: 'läuft' }, { kind: 'global' });
        await send(a, 'messages.send', { id: 'wm', text: 'fertig' }, { kind: 'global' });
        await send(a, 'messages.send', { id: 'other', text: 'x' }, { kind: 'global' });
        const hist = a._history();
        assert.strictEqual(hist.length, 2, 'the repeated id stays one entry');
        assert.strictEqual(hist.find((m) => m.id === 'wm').text, 'fertig', 'newest content wins');
        console.log('✓ a repeated id replaces its predecessor');
    }

    // ── Ring buffer honours the configured size, newest first ───────────────
    {
        const a = makeAdapter({ messageHistorySize: 3 });
        for (let i = 0; i < 6; i++) {
            await send(a, 'messages.send', { text: `m${i}` }, { kind: 'global' });
        }
        const hist = a._history();
        assert.strictEqual(hist.length, 3, 'trimmed to the configured size');
        assert.strictEqual(hist[0].text, 'm5', 'newest first');
        assert.strictEqual(hist[2].text, 'm3', 'oldest kept entry');
        console.log('✓ ring buffer trims to the configured size');
    }

    // ── Retention drops stale entries ──────────────────────────────────────
    {
        const a = makeAdapter({ messageRetentionDays: 7 });
        const day = 86400_000;
        await a._writeMessageHistory([
            { id: 'fresh', ts: Date.now() - day, text: 'a' },
            { id: 'stale', ts: Date.now() - 30 * day, text: 'b' },
        ]);
        const ids = a._history().map((m) => m.id);
        assert.deepStrictEqual(ids, ['fresh'], 'only the entry inside the window survives');

        // 0 = keep forever
        const b = makeAdapter({ messageRetentionDays: 0 });
        await b._writeMessageHistory([{ id: 'ancient', ts: Date.now() - 3650 * day, text: 'b' }]);
        assert.strictEqual(b._history().length, 1, 'retention 0 keeps everything');
        console.log('✓ retention drops stale entries, 0 keeps them');
    }

    // ── ack marks read, lowers the counter, tells clients to close ──────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { id: 'x', text: 'a' }, { kind: 'global' });
        await send(a, 'messages.send', { id: 'y', text: 'b' }, { kind: 'global' });
        assert.strictEqual(a._val('messages.unreadCount'), 2);

        await a._handleMessageMark('x', 'ack');
        const x = a._history().find((m) => m.id === 'x');
        assert.strictEqual(x.read, true);
        assert.ok(x.ackedAt, 'ack timestamp recorded');
        assert.strictEqual(x.dismissed, true, 'ack also closes the toast');
        assert.strictEqual(a._val('messages.unreadCount'), 1);
        assert.deepStrictEqual(
            { id: a._last().id, dismissed: a._last().dismissed, read: a._last().read },
            { id: 'x', dismissed: true, read: true },
            'close marker broadcast',
        );
        assert.strictEqual(a._val('messages.ack'), '', 'command DP clears itself');
        console.log('✓ ack marks read, updates the counter and broadcasts a close');
    }

    // ── dismiss closes without marking read ────────────────────────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { id: 'x', text: 'a' }, { kind: 'global' });
        await a._handleMessageMark('x', 'dismiss');
        const x = a._history().find((m) => m.id === 'x');
        assert.strictEqual(x.dismissed, true);
        assert.strictEqual(x.read, false, 'dismiss is not a confirmation');
        assert.strictEqual(a._val('messages.unreadCount'), 1, 'still unread');
        assert.strictEqual(a._last().read, false);
        console.log('✓ dismiss closes the toast but leaves the entry unread');
    }

    // ── "*" applies to every entry ─────────────────────────────────────────
    {
        const a = makeAdapter();
        for (const id of ['a', 'b', 'c']) {
            await send(a, 'messages.send', { id, text: id }, { kind: 'global' });
        }
        await a._handleMessageMark('*', 'ack');
        assert.strictEqual(a._val('messages.unreadCount'), 0);
        assert.ok(
            a._history().every((m) => m.read === true),
            'every entry confirmed',
        );
        console.log('✓ ack "*" confirms every entry');
    }

    // ── An unknown id is a no-op, and the DP still clears ──────────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { id: 'a', text: 'a' }, { kind: 'global' });
        await a._handleMessageMark('does-not-exist', 'ack');
        assert.strictEqual(a._val('messages.unreadCount'), 1, 'nothing changed');
        assert.strictEqual(a._val('messages.ack'), '');
        console.log('✓ acking an unknown id is a no-op');
    }

    // ── clear empties the archive and resets the button ────────────────────
    {
        const a = makeAdapter();
        await send(a, 'messages.send', { text: 'a' }, { kind: 'global' });
        await a._handleMessageClear();
        assert.deepStrictEqual(a._history(), []);
        assert.strictEqual(a._val('messages.unreadCount'), 0);
        assert.strictEqual(a._val('messages.clear'), false, 'button resets');
        console.log('✓ clear empties the archive');
    }

    // ── A corrupt history datapoint starts over instead of throwing ────────
    {
        const a = makeAdapter();
        a._states.set('messages.history', { val: '{not an array', ack: true });
        assert.deepStrictEqual(await a._readMessageHistory(), []);
        a._states.set('messages.history', { val: '{"a":1}', ack: true });
        assert.deepStrictEqual(await a._readMessageHistory(), [], 'an object is not a history');
        console.log('✓ a corrupt history datapoint is replaced, not fatal');
    }

    // ── Layout datapoints: created, renamed, removed ───────────────────────
    {
        const a = makeAdapter();
        const dashboard = (slugs) =>
            JSON.stringify({
                state: { layouts: slugs.map((s) => ({ slug: s, name: s.toUpperCase(), sections: [] })) },
            });

        await a._syncLayoutMessageDps(dashboard(['haus', 'garten']));
        assert.ok(a._objects.has('layouts.haus.messages.send'));
        assert.ok(a._objects.has('layouts.garten.messages.send'));

        // Rename: the old branch must not linger.
        await a._syncLayoutMessageDps(dashboard(['haus', 'hof']));
        assert.ok(a._objects.has('layouts.hof.messages.send'));
        assert.ok(!a._objects.has('layouts.garten'), 'renamed layout channel removed');
        assert.ok(!a._objects.has('layouts.garten.messages.send'), 'renamed layout datapoint removed');

        // A slug with characters ioBroker rejects gets sanitized, and the original
        // is remembered so the delivered message carries the real slug.
        await a._syncLayoutMessageDps(dashboard(['wohn zimmer/1']));
        assert.ok(a._objects.has('layouts.wohn_zimmer_1.messages.send'), 'slug sanitized for the object id');
        assert.strictEqual(a._layoutSlugs.get('wohn_zimmer_1').slug, 'wohn zimmer/1');
        assert.strictEqual(a._objects.get('layouts.wohn_zimmer_1').native.slug, 'wohn zimmer/1');

        // Malformed config must not delete anything or throw.
        await a._syncLayoutMessageDps('{oops');
        assert.strictEqual(a._layoutSlugs.size, 0);
        console.log('✓ layout datapoints follow renames and deletions');
    }

    // ── #429/#532: existing clients get the messages DP backfilled ─────────
    {
        const a = makeAdapter();
        // A client whose tree was complete before the messages channel existed:
        // _ensureClientTree short-circuits on navigate.url, so only the explicit
        // backfill in _syncNavigateTargets can reach it.
        a._objects.set('clients.old', { type: 'channel', common: { name: 'old' }, native: {} });
        a._objects.set('clients.old.navigate', { type: 'channel', common: { name: 'Navigation' }, native: {} });
        a._objects.set('clients.old.navigate.url', { type: 'state', common: { name: 'Navigate' }, native: {} });
        a._objects.set('clients.old.navigate.target', {
            type: 'state',
            common: { name: 'sel', role: 'text' },
            native: {},
        });

        assert.strictEqual(await a._ensureClientTree('old'), false, 'tree looks complete to _ensureClientTree');
        assert.ok(!a._objects.has('clients.old.messages.send'), 'so it does not create the new DP');

        a._states.set('config.dashboard', { val: JSON.stringify({ state: { layouts: [] } }), ack: true });
        await a._syncNavigateTargets();
        assert.ok(a._objects.has('clients.old.messages'), 'sync backfills the channel');
        assert.ok(a._objects.has('clients.old.messages.send'), 'sync backfills the datapoint');

        // A fresh client gets it from _ensureClientTree directly.
        await a._ensureClientTree('new', 'Tablet');
        assert.ok(a._objects.has('clients.new.messages.send'));
        console.log('✓ clients.<id>.messages.send is backfilled on pre-existing trees');
    }

    console.log('\nAll message tests passed.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
