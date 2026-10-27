/**
 * News widget (#854) — the pure part: RSS 2.0 / RSS 1.0 (RDF) / Atom and the
 * JSON of the ioBroker.rssfeed adapter into one article shape, then merged,
 * de-duplicated, filtered and sorted for display.
 *
 * Runs on a DOM (DOMParser), nothing else: the widget uses it as is, the test
 * (tools/tests/feed-parse.mjs) bundles it into a blank browser page.
 */

export interface FeedEntry {
    /** Stable key: guid / id / link / title. */
    id: string;
    title: string;
    /** Article URL, absolute; '' when the feed has none. */
    link: string;
    /** ms since epoch; 0 = undated. */
    time: number;
    /** Teaser as plain text (tags stripped, entities decoded). */
    summary: string;
    /** Preview image URL, absolute; '' = none. */
    image: string;
}

export interface ParsedFeed {
    title: string;
    items: FeedEntry[];
}

/** An entry of the merged list, tagged with the index of its source. */
export interface FeedItem extends FeedEntry {
    source: number;
}

const ATOM_NS = 'http://www.w3.org/2005/Atom';
const MEDIA_NS = 'http://search.yahoo.com/mrss/';

// ── decoding ────────────────────────────────────────────────────────────────

/**
 * Bytes of a feed → text. The charset comes from the Content-Type, else from
 * the XML prolog (`<?xml … encoding="ISO-8859-1"?>`), else UTF-8 — plenty of
 * German feeds still ship Latin-1.
 */
export function decodeFeedBytes(bytes: ArrayBuffer, contentType = ''): string {
    let label = /charset\s*=\s*"?([\w-]+)/i.exec(contentType)?.[1];
    if (!label) {
        const head = new TextDecoder('latin1').decode(bytes.slice(0, 256));
        label = /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
    }
    try {
        return new TextDecoder(label || 'utf-8').decode(bytes);
    } catch {
        return new TextDecoder('utf-8').decode(bytes);
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** HTML (or text with entities) → plain text. A parsed, never attached document runs no scripts. */
export function htmlToText(html: string): string {
    if (!html) return '';
    if (!/[<&]/.test(html)) return html.replace(/\s+/g, ' ').trim();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach((n) => n.remove());
    // Block elements end a sentence; without a space "Absatz.Nächster" runs together.
    doc.querySelectorAll('p, br, div, li, h1, h2, h3, h4').forEach((n) => n.append(' '));
    return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** First `<img src>` in an HTML fragment. */
function firstImage(html: string): string {
    if (!html || !/<img/i.test(html)) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector('img[src]')?.getAttribute('src') ?? '';
}

function absolute(url: string, base: string): string {
    const u = url.trim();
    if (!u) return '';
    try {
        return new URL(u, base || undefined).href;
    } catch {
        return /^https?:\/\//i.test(u) ? u : '';
    }
}

function parseTime(raw: string | undefined | null): number {
    if (!raw) return 0;
    const t = Date.parse(raw.trim());
    return Number.isFinite(t) ? t : 0;
}

/** Child elements of `el` with the local name `name` (any namespace unless given). */
function kids(el: Element, name: string, ns?: string): Element[] {
    return Array.from(el.children).filter((c) => c.localName === name && (ns === undefined || c.namespaceURI === ns));
}

function kid(el: Element, name: string, ns?: string): Element | undefined {
    return kids(el, name, ns)[0];
}

function text(el: Element | undefined): string {
    return el?.textContent?.trim() ?? '';
}

/** Atom text construct: type="html"/"xhtml" carries markup. */
function atomText(el: Element | undefined): string {
    if (!el) return '';
    const type = el.getAttribute('type');
    if (type === 'xhtml') return el.textContent?.trim() ?? '';
    return text(el);
}

/** Preview image of an RSS/Atom item: media:thumbnail, media:content, enclosure, itunes:image, then the first <img>. */
function itemImage(item: Element, html: string): string {
    const thumb = kid(item, 'thumbnail', MEDIA_NS);
    if (thumb?.getAttribute('url')) return thumb.getAttribute('url')!;
    const group = kid(item, 'group', MEDIA_NS);
    const media = [...kids(item, 'content', MEDIA_NS), ...(group ? kids(group, 'content', MEDIA_NS) : [])];
    const img = media.find((m) => {
        const medium = m.getAttribute('medium');
        const type = m.getAttribute('type') ?? '';
        return medium === 'image' || type.startsWith('image/') || (!medium && !type);
    });
    if (img?.getAttribute('url')) return img.getAttribute('url')!;
    const groupThumb = group ? kid(group, 'thumbnail', MEDIA_NS) : undefined;
    if (groupThumb?.getAttribute('url')) return groupThumb.getAttribute('url')!;
    const enc = kids(item, 'enclosure').find((e) => (e.getAttribute('type') ?? '').startsWith('image/'));
    if (enc?.getAttribute('url')) return enc.getAttribute('url')!;
    const atomEnc = kids(item, 'link', ATOM_NS).find(
        (l) => l.getAttribute('rel') === 'enclosure' && (l.getAttribute('type') ?? '').startsWith('image/'),
    );
    if (atomEnc?.getAttribute('href')) return atomEnc.getAttribute('href')!;
    const itunes = kid(item, 'image');
    if (itunes?.getAttribute('href')) return itunes.getAttribute('href')!;
    return firstImage(html);
}

function entry(
    id: string,
    title: string,
    link: string,
    time: number,
    html: string,
    image: string,
    base: string,
): FeedEntry {
    const absLink = absolute(link, base);
    const plainTitle = htmlToText(title);
    return {
        id: id || absLink || plainTitle,
        title: plainTitle,
        link: absLink,
        time,
        summary: htmlToText(html),
        image: absolute(image, absLink || base),
    };
}

// ── XML feeds ───────────────────────────────────────────────────────────────

/** RSS 2.0, RSS 1.0 (RDF) or Atom → entries. Throws when the text is no feed. */
export function parseFeedXml(xml: string, feedUrl = ''): ParsedFeed {
    const doc = new DOMParser().parseFromString(xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not-xml');
    const root = doc.documentElement;

    if (root.localName === 'feed') {
        const base = absolute(root.getAttribute('xml:base') ?? '', feedUrl) || feedUrl;
        const items = kids(root, 'entry').map((e) => {
            const links = kids(e, 'link');
            const alt =
                links.find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate') ??
                links.find((l) => l.getAttribute('rel') !== 'enclosure');
            const html = atomText(kid(e, 'summary')) || atomText(kid(e, 'content'));
            return entry(
                text(kid(e, 'id')),
                atomText(kid(e, 'title')),
                alt?.getAttribute('href') ?? '',
                parseTime(text(kid(e, 'published')) || text(kid(e, 'updated'))),
                html,
                itemImage(e, `${html} ${atomText(kid(e, 'content'))}`),
                base,
            );
        });
        return { title: htmlToText(atomText(kid(root, 'title'))), items };
    }

    if (root.localName === 'rss' || root.localName === 'RDF') {
        const channel = kid(root, 'channel');
        // RSS 2.0: items inside <channel>; RDF: items are siblings of <channel>.
        const itemEls = channel && kids(channel, 'item').length ? kids(channel, 'item') : kids(root, 'item');
        const base = absolute(text(channel ? kid(channel, 'link') : undefined), feedUrl) || feedUrl;
        const items = itemEls.map((it) => {
            const guid = kid(it, 'guid');
            const permalink = guid && guid.getAttribute('isPermaLink') !== 'false' ? text(guid) : '';
            const desc = text(kid(it, 'description'));
            const content = text(kid(it, 'encoded'));
            return entry(
                text(guid) || it.getAttribute('rdf:about') || '',
                text(kid(it, 'title')),
                text(kid(it, 'link')) || permalink,
                parseTime(text(kid(it, 'pubDate')) || text(kid(it, 'date'))),
                desc || content,
                // Teasers often come without the picture; the full text (tagesschau) has it.
                itemImage(it, `${desc} ${content}`),
                base,
            );
        });
        return { title: htmlToText(text(channel ? kid(channel, 'title') : undefined)), items };
    }

    throw new Error('not-a-feed');
}

// ── ioBroker.rssfeed ────────────────────────────────────────────────────────

interface RssfeedArticle {
    title?: string;
    description?: string;
    summary?: string;
    link?: string;
    origlink?: string;
    permalink?: string;
    date?: string;
    pubdate?: string;
    guid?: string;
    image?: { url?: string } | null;
    enclosures?: { url?: string; type?: string }[];
}

/**
 * The state of an ioBroker.rssfeed feed: `{ meta: { title, … }, articles: [ … ] }`
 * as written by the adapter (feedparser items, filtered to a fixed field list).
 * Accepts the JSON string or the parsed value; anything else → null.
 */
export function parseRssfeedState(val: unknown): ParsedFeed | null {
    let data = val;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    if (!data || typeof data !== 'object') return null;
    const obj = data as { meta?: { title?: string; link?: string }; articles?: unknown };
    if (!Array.isArray(obj.articles)) return null;
    const base = obj.meta?.link ?? '';
    const items = (obj.articles as RssfeedArticle[])
        .filter((a) => a && typeof a === 'object')
        .map((a) => {
            const html = a.description || a.summary || '';
            const enc = (a.enclosures ?? []).find((e) => (e?.type ?? '').startsWith('image/'));
            return entry(
                a.guid ?? '',
                a.title ?? '',
                a.link || a.origlink || a.permalink || '',
                parseTime(a.pubdate || a.date),
                html,
                a.image?.url || enc?.url || firstImage(html),
                base,
            );
        });
    return { title: htmlToText(obj.meta?.title ?? ''), items };
}

// ── merge ───────────────────────────────────────────────────────────────────

export interface MergeOptions {
    maxItems: number;
    /** Hide articles older than this; 0 = off. Undated articles always stay. */
    maxAgeHours: number;
    /** Comma/line separated; an article must contain one of them (title or teaser). */
    include: string;
    /** Comma/line separated; an article containing one of them is hidden. */
    exclude: string;
    now: number;
}

export function splitKeywords(raw: string): string[] {
    return raw
        .split(/[,\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Several feeds → one list: newest first (undated articles after the dated
 * ones, in feed order), the same article from two feeds once (link, else
 * title), keyword and age filters, capped at `maxItems`.
 */
export function mergeFeeds(feeds: (FeedEntry[] | null)[], opts: MergeOptions): FeedItem[] {
    const include = splitKeywords(opts.include);
    const exclude = splitKeywords(opts.exclude);
    const minTime = opts.maxAgeHours > 0 ? opts.now - opts.maxAgeHours * 3600_000 : 0;
    const seen = new Set<string>();
    const all: (FeedItem & { order: number })[] = [];
    let order = 0;
    feeds.forEach((items, source) => {
        for (const it of items ?? []) {
            order++;
            if (!it.title) continue;
            const key = (it.link || it.title).toLowerCase();
            if (seen.has(key)) continue;
            if (minTime && it.time && it.time < minTime) continue;
            const hay = `${it.title} ${it.summary}`.toLowerCase();
            if (include.length && !include.some((k) => hay.includes(k))) continue;
            if (exclude.some((k) => hay.includes(k))) continue;
            seen.add(key);
            all.push({ ...it, source, order });
        }
    });
    all.sort((a, b) => {
        if (a.time && b.time) return b.time - a.time || a.order - b.order;
        if (a.time !== b.time) return a.time ? -1 : 1;
        return a.order - b.order;
    });
    return all.slice(0, Math.max(1, opts.maxItems)).map(({ order: _order, ...it }) => it);
}

/** "vor 5 min" style age in whole units; the caller translates the unit. */
export function ageParts(time: number, now: number): { n: number; unit: 'now' | 'min' | 'h' | 'd' } {
    const s = Math.max(0, (now - time) / 1000);
    if (s < 60) return { n: 0, unit: 'now' };
    if (s < 3600) return { n: Math.floor(s / 60), unit: 'min' };
    if (s < 86400) return { n: Math.floor(s / 3600), unit: 'h' };
    return { n: Math.floor(s / 86400), unit: 'd' };
}
