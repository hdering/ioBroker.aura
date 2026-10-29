import type { MessageTarget } from '../types';

/**
 * Speech output of the dashboard (issue #834) — the pure part.
 *
 * `<ns>.speech.say` (every device) and `<ns>.clients.<id>.speech.say` (one device)
 * accept, like SayIt's `tts.text`:
 *
 *   Guten Morgen                  text, spoken by the browser's own voice
 *   /sayit.0/tts.mp3, gong.mp3    a sound file (path or URL) that is played
 *   80;Guten Morgen               volume;text (or volume;file)
 *   {"text": "…", …}              JSON for everything else, see SpeechRequest
 *
 * No browser API in here, so the parsing is testable under node.
 */

export type SpeechResult = 'played' | 'blocked' | 'muted' | 'skipped' | 'interrupted' | 'unsupported' | 'error';

export const SPEECH_RESULTS: SpeechResult[] = [
    'played',
    'blocked',
    'muted',
    'skipped',
    'interrupted',
    'unsupported',
    'error',
];

export interface SpeechRequest {
    /** Spoken by speechSynthesis. Exactly one of text / file is set. */
    text?: string;
    /** Sound file: absolute URL, ioBroker file path (`/sayit.0/tts.mp3`) or `aura-file:…`. */
    file?: string;
    /** 0..100. Absent = the device's speech.volume. */
    volume?: number;
    /** Name (or part of it) of a speechSynthesis voice. */
    voice?: string;
    /** BCP-47 language, e.g. `de-DE`. Absent = the dashboard language. */
    lang?: string;
    /** 0.1..10, 1 = normal. */
    rate?: number;
    /** 0..2, 1 = normal. */
    pitch?: number;
    /** Stop what is playing and drop the queue before this one. */
    interrupt?: boolean;
    /** Only play while the display is on (page visible); otherwise `skipped`. */
    onlyVisible?: boolean;
    /** Same shape as a message target: clients, layout, tab. */
    target?: MessageTarget;
}

/** Longest text a single announcement may carry. */
export const SPEECH_TEXT_MAX = 4000;

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|opus|webm)(?:[?#].*)?$/i;

/** A value that names a sound file rather than text to speak. */
export function isAudioRef(v: string): boolean {
    const s = v.trim();
    if (!s || /\s/.test(s)) return false;
    if (s.startsWith('aura-file:') || s.startsWith('data:audio/')) return true;
    return AUDIO_EXT.test(s);
}

function clampNum(v: unknown, min: number, max: number): number | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(min, Math.min(max, n));
}

function str(v: unknown, max = 256): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    return s ? s.slice(0, max) : undefined;
}

function truthy(v: unknown): boolean {
    return v === true || v === 'true' || v === 1;
}

function strList(v: unknown): string[] | undefined {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    const out = list.map((x) => str(x, 128)).filter((x): x is string => !!x);
    return out.length ? out : undefined;
}

/** Text or file, decided by what the value looks like. */
function bodyFrom(v: string): Pick<SpeechRequest, 'text' | 'file'> | null {
    const s = v.trim();
    if (!s) return null;
    if (isAudioRef(s) || /^https?:\/\/\S+$/i.test(s)) return { file: s };
    return { text: s.slice(0, SPEECH_TEXT_MAX) };
}

/**
 * Parse one value written to a speech.say datapoint. null = nothing to do
 * (empty, the self-clear, or a broken JSON payload).
 */
export function parseSpeechPayload(raw: unknown): SpeechRequest | null {
    if (raw === null || raw === undefined) return null;
    const val = String(raw).trim();
    if (!val) return null;

    if (val.startsWith('{')) {
        let p: Record<string, unknown>;
        try {
            p = JSON.parse(val) as Record<string, unknown>;
        } catch {
            return null;
        }
        if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
        const file = str(p.file, 2000) ?? str(p.url, 2000);
        const text = typeof p.text === 'string' ? p.text.trim().slice(0, SPEECH_TEXT_MAX) : '';
        // A text that is really a file name plays the file, as in the plain form.
        const body: Pick<SpeechRequest, 'text' | 'file'> | null = file ? { file } : text ? bodyFrom(text) : null;
        if (!body) return null;
        const req: SpeechRequest = { ...body };
        const volume = clampNum(p.volume, 0, 100);
        if (volume !== undefined) req.volume = Math.round(volume);
        const voice = str(p.voice, 128);
        if (voice) req.voice = voice;
        const lang = str(p.lang ?? p.language, 32);
        if (lang) req.lang = lang;
        const rate = clampNum(p.rate, 0.1, 10);
        if (rate !== undefined) req.rate = rate;
        const pitch = clampNum(p.pitch, 0, 2);
        if (pitch !== undefined) req.pitch = pitch;
        if (truthy(p.interrupt)) req.interrupt = true;
        if (truthy(p.onlyVisible)) req.onlyVisible = true;

        const t = p.target && typeof p.target === 'object' && !Array.isArray(p.target) ? p.target : {};
        const tt = t as Record<string, unknown>;
        const target: MessageTarget = {};
        // `clients` at the top level is accepted as a shorthand for target.clients.
        const clients = strList(tt.clients ?? p.clients);
        if (clients) target.clients = clients;
        const layout = str(tt.layout, 128);
        if (layout) target.layout = layout;
        const tab = str(tt.tab, 128);
        if (tab) target.tab = tab;
        if (Object.keys(target).length) req.target = target;
        return req;
    }

    // SayIt's "volume;text". Only a leading number counts, so a sentence with a
    // semicolon in it stays a sentence.
    const m = /^(\d{1,3})\s*;([\s\S]*)$/.exec(val);
    if (m) {
        const body = bodyFrom(m[2]);
        if (!body) return null;
        return { ...body, volume: Math.min(100, Number(m[1])) };
    }
    return bodyFrom(val);
}

/**
 * Split a text into pieces speechSynthesis reliably finishes. Chrome stops a long
 * utterance after about 15 seconds without an `end` event, so a morning briefing
 * is spoken sentence by sentence; a sentence that is still too long is cut at the
 * last comma or space before the limit.
 */
export function splitSpeechText(text: string, max = 200): string[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?;:]+(?:[.!?;:]+|$)/g) ?? [clean];
    const out: string[] = [];
    let cur = '';
    const push = (s: string) => {
        const v = s.trim();
        if (v) out.push(v);
    };
    for (const raw of sentences) {
        let s = raw.trim();
        while (s.length > max) {
            const cut = Math.max(s.lastIndexOf(',', max), s.lastIndexOf(' ', max));
            const at = cut > max / 3 ? cut + 1 : max;
            if (cur) {
                push(cur);
                cur = '';
            }
            push(s.slice(0, at));
            s = s.slice(at).trim();
        }
        if (!s) continue;
        if (cur && cur.length + 1 + s.length > max) {
            push(cur);
            cur = s;
        } else {
            cur = cur ? `${cur} ${s}` : s;
        }
    }
    push(cur);
    return out;
}

/** Plain text of a message for reading out: title, then text (or the HTML without tags). */
export function messageSpeechText(msg: { title?: string; text?: string; html?: string }): string {
    const strip = (s: string) =>
        s
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '. ')
            .replace(/<\/(p|div|li|tr|h\d)>/gi, '. ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s*\.\s*(\.\s*)+/g, '. ')
            .replace(/\s+/g, ' ')
            // A closing tag before a line break leaves "Bad ." behind.
            .replace(/\s+([.!?,;:])/g, '$1')
            .trim();
    const parts: string[] = [];
    const title = msg.title ? strip(msg.title) : '';
    if (title) parts.push(/[.!?:]$/.test(title) ? title : `${title}.`);
    const body = msg.text ? strip(msg.text) : msg.html ? strip(msg.html) : '';
    if (body) parts.push(body);
    return parts.join(' ').slice(0, SPEECH_TEXT_MAX);
}

/**
 * The value of `speech.volume` as a 0..100 default, or the fallback for a missing
 * or broken one.
 */
export function toSpeechVolume(v: unknown, fallback = 100): number {
    const n = clampNum(v, 0, 100);
    return n === undefined ? fallback : Math.round(n);
}

/**
 * Pick a speechSynthesis voice: by name (exact, then contains), else the best
 * match for the language (exact tag, then the primary subtag), else none.
 */
export function pickVoice<V extends { name: string; lang: string; default?: boolean }>(
    voices: V[],
    want: { voice?: string; lang?: string },
): V | undefined {
    if (!voices.length) return undefined;
    if (want.voice) {
        const w = want.voice.toLowerCase();
        const hit =
            voices.find((v) => v.name.toLowerCase() === w) ?? voices.find((v) => v.name.toLowerCase().includes(w));
        if (hit) return hit;
    }
    if (want.lang) {
        const l = want.lang.toLowerCase().replace('_', '-');
        const primary = l.split('-')[0];
        const sameLang = (v: V) => v.lang.toLowerCase().replace('_', '-');
        return (
            voices.find((v) => sameLang(v) === l && v.default) ??
            voices.find((v) => sameLang(v) === l) ??
            voices.find((v) => sameLang(v).split('-')[0] === primary && v.default) ??
            voices.find((v) => sameLang(v).split('-')[0] === primary)
        );
    }
    return undefined;
}
