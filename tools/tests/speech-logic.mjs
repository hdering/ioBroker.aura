// Speech output of the dashboard (issue #834): payload parsing, sentence split,
// message text, voice pick and the play queue (order, autoplay block + tap,
// interrupt, overflow, expiry).
//
//   node tools/tests/speech-logic.mjs
//
// No dev server and no browser: utils/speech.ts is pure and utils/speechPlayer.ts
// takes its backend as a parameter, so a fake one stands in for speechSynthesis
// and <audio>. Bundled with esbuild like the other *-logic tests.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-speech-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/speech.ts'; export * from './src-vis/utils/speechPlayer.ts'; export * from './src-vis/utils/speechClaim.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const {
    parseSpeechPayload,
    isAudioRef,
    splitSpeechText,
    messageSpeechText,
    pickVoice,
    toSpeechVolume,
    SpeechQueue,
    SPEECH_QUEUE_MAX,
    SPEECH_MAX_AGE_MS,
    ServerClock,
    claimAnnouncement,
    SPEECH_CLAIMS_KEY,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// ── 1. Payload forms ────────────────────────────────────────────────────────
eq('plain text is spoken', parseSpeechPayload('Guten Morgen'), { text: 'Guten Morgen' });
eq('empty / self-clear does nothing', parseSpeechPayload(''), null);
eq('whitespace does nothing', parseSpeechPayload('   '), null);
eq('null does nothing', parseSpeechPayload(null), null);
eq('SayIt path plays the file', parseSpeechPayload('/sayit.0/tts.mp3?ts=1'), { file: '/sayit.0/tts.mp3?ts=1' });
eq('a bare sound file name plays the file', parseSpeechPayload('gong.mp3'), { file: 'gong.mp3' });
eq('an URL plays the file', parseSpeechPayload('https://example.com/stream'), { file: 'https://example.com/stream' });
eq('volume;text', parseSpeechPayload('80;Es hat geklingelt'), { text: 'Es hat geklingelt', volume: 80 });
eq('volume;file', parseSpeechPayload('40;/sayit.0/gong.wav'), { file: '/sayit.0/gong.wav', volume: 40 });
eq('volume above 100 is capped', parseSpeechPayload('250;Laut'), { text: 'Laut', volume: 100 });
eq('a sentence with a semicolon stays a sentence', parseSpeechPayload('Achtung; heute ist Biomüll'), {
    text: 'Achtung; heute ist Biomüll',
});
eq('a sentence ending in .mp3-like word is text', isAudioRef('Ich höre gern mp3'), false);
eq('a sentence with spaces is never a file', isAudioRef('spiel gong.mp3 ab'), false);
eq('aura-file: is a file', isAudioRef('aura-file:/opt/sounds/gong.mp3'), true);

eq(
    'JSON with every option',
    parseSpeechPayload(
        JSON.stringify({
            text: 'Waschmaschine fertig',
            volume: '70',
            voice: 'Anna',
            lang: 'de-DE',
            rate: 1.2,
            pitch: 0.9,
            interrupt: true,
            onlyVisible: 'true',
            target: { clients: ['kueche'], layout: 'home', tab: 'start' },
        }),
    ),
    {
        text: 'Waschmaschine fertig',
        volume: 70,
        voice: 'Anna',
        lang: 'de-DE',
        rate: 1.2,
        pitch: 0.9,
        interrupt: true,
        onlyVisible: true,
        target: { clients: ['kueche'], layout: 'home', tab: 'start' },
    },
);
eq('JSON: top-level clients as a comma list', parseSpeechPayload('{"text":"Hallo","clients":"flur, kueche"}'), {
    text: 'Hallo',
    target: { clients: ['flur', 'kueche'] },
});
eq('JSON: file wins over text', parseSpeechPayload('{"file":"/sayit.0/tts.mp3","text":"x"}'), {
    file: '/sayit.0/tts.mp3',
});
eq('JSON: a file name in text plays it', parseSpeechPayload('{"text":"gong.ogg"}'), { file: 'gong.ogg' });
eq('JSON: broken payload does nothing', parseSpeechPayload('{"text":'), null);
eq('JSON: neither text nor file does nothing', parseSpeechPayload('{"volume":50}'), null);
eq('JSON: out-of-range numbers are clamped', parseSpeechPayload('{"text":"a","volume":-5,"rate":99}'), {
    text: 'a',
    volume: 0,
    rate: 10,
});
eq('device volume default', toSpeechVolume(undefined), 100);
eq('device volume from a string', toSpeechVolume('35'), 35);
eq('device volume garbage', toSpeechVolume('laut'), 100);

// ── 2. Sentence split (Chrome cuts long utterances) ─────────────────────────
{
    const morning =
        'Guten Morgen, heute ist Montag der 26te Oktober 2026. Es ist 7 Uhr und 5 Minuten. ' +
        "Die Aussentemperatur beträgt '8,5' Grad. Wetter Bedingungen, bewölkt. Aktuell kein regen.";
    const parts = splitSpeechText(morning, 60);
    check(
        'every piece fits the limit',
        parts.every((p) => p.length <= 60),
        JSON.stringify(parts),
    );
    eq('nothing is lost', parts.join(' ').replace(/\s+/g, ' '), morning.replace(/\s+/g, ' ').trim());
    eq('short text stays one piece', splitSpeechText('Hallo Welt.'), ['Hallo Welt.']);
    const long = 'wort '.repeat(100).trim();
    const cut = splitSpeechText(long, 50);
    check(
        'a sentence without punctuation is cut at spaces',
        cut.every((p) => p.length <= 50 && !p.startsWith(' ')),
    );
    eq('empty text has no pieces', splitSpeechText('   '), []);
}

// ── 3. Message text ─────────────────────────────────────────────────────────
eq('title and text', messageSpeechText({ title: 'Waschmaschine', text: 'Fertig' }), 'Waschmaschine. Fertig');
eq(
    'title keeps its own punctuation',
    messageSpeechText({ title: 'Achtung!', text: 'Fenster offen' }),
    'Achtung! Fenster offen',
);
eq(
    'HTML is read without tags',
    messageSpeechText({ html: '<b>Bad</b><br>21 &deg;C<script>x()</script>' }).replace('&deg;', '°'),
    'Bad. 21 °C',
);
eq('HTML title tags stripped', messageSpeechText({ title: '<i>Info</i>' }), 'Info.');

// ── 4. Voice pick ───────────────────────────────────────────────────────────
{
    const voices = [
        { name: 'Google US English', lang: 'en-US' },
        { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE' },
        { name: 'Anna', lang: 'de-DE', default: true },
        { name: 'Swiss', lang: 'de-CH' },
    ];
    eq('voice by exact name', pickVoice(voices, { voice: 'anna' })?.name, 'Anna');
    eq('voice by part of the name', pickVoice(voices, { voice: 'katja' })?.name, 'Microsoft Katja - German (Germany)');
    eq('language picks the default voice of it', pickVoice(voices, { lang: 'de-DE' })?.name, 'Anna');
    eq('primary language subtag', pickVoice(voices, { lang: 'de' })?.name, 'Anna');
    eq('exact region first', pickVoice(voices, { lang: 'de-CH' })?.name, 'Swiss');
    eq(
        'unknown voice falls back to the language',
        pickVoice(voices, { voice: 'Hal', lang: 'en' })?.name,
        'Google US English',
    );
    eq('no voices, no pick', pickVoice([], { lang: 'de' }), undefined);
}

// ── 5. The queue ────────────────────────────────────────────────────────────
function fakeBackend() {
    const calls = [];
    const pending = [];
    let blockNext = 0;
    const start = (kind, what) =>
        new Promise((resolve) => {
            calls.push(`${kind}:${what}`);
            if (blockNext > 0) {
                blockNext -= 1;
                resolve('blocked');
                return;
            }
            pending.push(resolve);
        });
    return {
        calls,
        block(n = 1) {
            blockNext = n;
        },
        /** Finish the oldest running item. */
        finish(outcome = 'ended') {
            pending.shift()?.(outcome);
        },
        backend: {
            speak: (text) => start('speak', text),
            play: (url) => start('play', url),
            cancel() {
                calls.push('cancel');
                while (pending.length) pending.shift()('interrupted');
            },
        },
    };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const item = (req, extra = {}) => ({ req, volume: 100, queuedAt: Date.now(), ...extra });

{
    const f = fakeBackend();
    const log = [];
    const q = new SpeechQueue(f.backend, {
        onPlaying: (p) => log.push(`playing:${p}`),
        onResult: (r, it) => log.push(`${r}:${it.req.text ?? it.req.file}`),
        onBlocked: (b) => log.push(`blocked:${b}`),
    });
    q.enqueue(item({ text: 'eins' }));
    q.enqueue(item({ file: '/sayit.0/tts.mp3' }, { url: '/webfs/sayit.0/tts.mp3' }));
    await tick();
    eq('one at a time', f.calls, ['speak:eins']);
    f.finish();
    await tick();
    eq('the next starts after the first ended, with the resolved url', f.calls, [
        'speak:eins',
        'play:/webfs/sayit.0/tts.mp3',
    ]);
    f.finish();
    await tick();
    eq('feedback in order', log, ['playing:true', 'played:eins', 'played:/sayit.0/tts.mp3', 'playing:false']);
}

{
    const f = fakeBackend();
    const log = [];
    const q = new SpeechQueue(f.backend, {
        onResult: (r, it) => log.push(`${r}:${it.req.text}`),
        onBlocked: (b) => log.push(`blocked:${b}`),
    });
    f.block();
    q.enqueue(item({ text: 'Klingel' }));
    await tick();
    eq('autoplay refusal reports blocked', log, ['blocked:Klingel', 'blocked:true']);
    check('the announcement waits', q.isBlocked && q.size === 1);
    q.enqueue(item({ text: 'danach' }));
    await tick();
    eq('nothing plays while blocked', f.calls, ['speak:Klingel']);
    q.unlock();
    eq('a tap replays it synchronously (inside the gesture)', f.calls, ['speak:Klingel', 'speak:Klingel']);
    f.finish();
    await tick();
    f.finish();
    await tick();
    eq('and the rest follows', log.slice(2), ['blocked:false', 'played:Klingel', 'played:danach']);
}

{
    const f = fakeBackend();
    const log = [];
    const q = new SpeechQueue(f.backend, { onResult: (r, it) => log.push(`${r}:${it.req.text}`) });
    q.enqueue(item({ text: 'lang' }));
    q.enqueue(item({ text: 'wartet' }));
    await tick();
    q.enqueue(item({ text: 'ALARM', interrupt: true }));
    await tick();
    eq('interrupt stops the current and drops the queue', log, ['interrupted:lang', 'interrupted:wartet']);
    eq('then plays at once', f.calls, ['speak:lang', 'cancel', 'speak:ALARM']);
    f.finish();
    await tick();
    eq('the interrupting one completes', log.at(-1), 'played:ALARM');
    check('queue is empty afterwards', q.size === 0);
}

{
    const f = fakeBackend();
    const log = [];
    const q = new SpeechQueue(f.backend, { onResult: (r, it) => log.push(`${r}:${it.req.text}`) });
    for (let i = 0; i < SPEECH_QUEUE_MAX + 3; i++) q.enqueue(item({ text: `n${i}` }));
    await tick();
    // n0 is playing; the rest queue — the oldest waiting ones go first.
    eq('a looping script cannot grow the queue', log, ['skipped:n1', 'skipped:n2']);
    check('queue holds the limit', q.size === SPEECH_QUEUE_MAX + 1, `size ${q.size}`);
}

{
    const f = fakeBackend();
    const log = [];
    let now = 1_000_000;
    const q = new SpeechQueue(
        f.backend,
        { onResult: (r, it) => log.push(`${r}:${it.req.text}`), onBlocked: (b) => log.push(`blocked:${b}`) },
        () => now,
    );
    f.block();
    q.enqueue({ req: { text: 'alt' }, volume: 100, queuedAt: now });
    await tick();
    now += SPEECH_MAX_AGE_MS + 1;
    q.dropExpired();
    eq('a stale blocked announcement expires', log, ['blocked:alt', 'blocked:true', 'skipped:alt', 'blocked:false']);
    check('nothing left to unlock', !q.isBlocked && q.size === 0);
}

{
    const f = fakeBackend();
    const log = [];
    const q = new SpeechQueue(f.backend, { onResult: (r, it) => log.push(`${r}:${it.req.text}`) });
    q.enqueue(item({ text: 'kaputt' }));
    q.enqueue(item({ text: 'ok' }));
    await tick();
    f.finish('error');
    await tick();
    f.finish();
    await tick();
    eq('an error does not stop the queue', log, ['error:kaputt', 'played:ok']);
}

// ── 6. Expiry while waiting and on a late start ────────────────────────────
{
    const f = fakeBackend();
    const log = [];
    let now = 5_000_000;
    const q = new SpeechQueue(f.backend, { onResult: (r, it) => log.push(`${r}:${it.req.text}`) }, () => now);
    q.enqueue({ req: { text: 'lang' }, volume: 100, queuedAt: now });
    q.enqueue({ req: { text: 'klingel' }, volume: 100, queuedAt: now, expiresAt: now + 1000 });
    q.enqueue({ req: { text: 'danach' }, volume: 100, queuedAt: now });
    await tick();
    now += 5000; // the first one took longer than the doorbell is worth
    f.finish();
    await tick();
    eq('an announcement that expired behind a long one is skipped', log, ['played:lang', 'skipped:klingel']);
    eq('the next one still plays', f.calls, ['speak:lang', 'speak:danach']);
}
{
    const deadlines = [];
    const backend = {
        speak: async (_t, o) => {
            deadlines.push(o.deadline);
            return 'expired';
        },
        play: async (_u, _v, d) => {
            deadlines.push(d);
            return 'ended';
        },
        cancel() {},
    };
    const log = [];
    const q = new SpeechQueue(backend, { onResult: (r) => log.push(r) }, () => 100);
    q.enqueue({ req: { text: 'x' }, volume: 100, queuedAt: 100, expiresAt: 900 });
    q.enqueue({ req: { file: 'a.mp3' }, volume: 100, queuedAt: 100 });
    await tick();
    await tick();
    eq('the backend gets the deadline (explicit, else queuedAt + max age)', deadlines, [900, 100 + SPEECH_MAX_AGE_MS]);
    eq('a start after the deadline counts as skipped', log, ['skipped', 'played']);
}

// ── 7. Server clock ─────────────────────────────────────────────────────────
{
    let local = 1_000_000;
    const c = new ServerClock(() => local);
    eq('unknown before the first sample', c.offset(), null);
    eq('no conversion without an offset', c.toLocal(5), undefined);
    c.note(1_000_000 + 60_000 - 200); // server 60 s ahead, 200 ms latency
    local += 15_000;
    c.note(1_015_000 + 60_000 - 50);
    eq('the largest sample wins (least latency)', c.offset(), 60_000 - 50);
    local += 1000;
    c.note(local + 60_000 - 3_600_000); // a stale value delivered after a tab woke up
    eq('a late delivery does not drag the estimate down', c.offset(), 60_000 - 50);
    eq('server time on the device clock', c.toLocal(2_000_000), 2_000_000 - (60_000 - 50));
    c.note('garbage');
    c.note(0);
    eq('garbage is not a sample', c.offset(), 60_000 - 50);
    local += 31 * 60_000;
    c.note(local - 10_000); // the clock was corrected meanwhile: server now 10 s behind
    eq('old samples age out', c.offset(), -10_000);
}

// ── 8. One device, one announcement ─────────────────────────────────────────
{
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    let chain = Promise.resolve();
    const locks = {
        request: (_name, cb) => {
            const run = chain.then(() => cb());
            chain = run.catch(() => {});
            return run;
        },
    };
    const sleeps = [];
    const tab = (visible) => ({
        storage,
        locks,
        visible: () => visible,
        sleep: (ms) => {
            sleeps.push(ms);
            return new Promise((r) => setTimeout(r, 20));
        },
        now: () => Date.now(),
    });
    const [hiddenA, visibleB, hiddenC] = await Promise.all([
        claimAnnouncement('aura.0.speech.say@1', tab(false)),
        claimAnnouncement('aura.0.speech.say@1', tab(true)),
        claimAnnouncement('aura.0.speech.say@1', tab(false)),
    ]);
    eq('the visible tab plays it, the hidden ones do not', [hiddenA, visibleB, hiddenC], [false, true, false]);
    check('hidden tabs wait before asking', sleeps.length === 2 && sleeps.every((ms) => ms > 0));
    const [a, b] = await Promise.all([
        claimAnnouncement('aura.0.speech.say@2', tab(false)),
        claimAnnouncement('aura.0.speech.say@2', tab(false)),
    ]);
    check('with all tabs hidden exactly one plays', a !== b, `${a} ${b}`);
    eq('a new announcement is claimed again', await claimAnnouncement('aura.0.speech.say@3', tab(true)), true);
    eq('without storage every tab plays', await claimAnnouncement('k', { ...tab(true), storage: null }), true);
    store.set(SPEECH_CLAIMS_KEY, '{broken');
    eq('a broken claim list does not silence the device', await claimAnnouncement('k2', tab(true)), true);
    const old = { stale: Date.now() - 2 * 3_600_000 };
    store.set(SPEECH_CLAIMS_KEY, JSON.stringify(old));
    await claimAnnouncement('k3', tab(true));
    eq('old claims are pruned', Object.keys(JSON.parse(store.get(SPEECH_CLAIMS_KEY))), ['k3']);
}

let failed = 0;
for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
