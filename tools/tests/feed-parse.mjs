// News widget (#854) — the pure part: feedParse.ts.
//
//   node tools/tests/feed-parse.mjs
//
// No dev server: the module is bundled with esbuild and run in a blank Chromium
// page, because it parses with the browser's DOMParser. Checked: RSS 2.0, RSS 1.0
// (RDF), Atom, the rssfeed adapter's JSON, Latin-1 decoding, CDATA teasers,
// every place a preview image hides, relative links, merging several feeds
// (order, duplicates, filters, age, cap) and the age labels.
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = await build({
    entryPoints: ['src-vis/components/widgets/feedParse.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'FeedParse',
    write: false,
    logLevel: 'warning',
});
const code = out.outputFiles[0].text;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>n-tv.de - Startseite</title>
  <link>https://www.n-tv.de/</link>
  <image><title>Logo</title><url>https://www.n-tv.de/logo.png</url></image>
  <item>
    <title>Erste &amp;quot;Meldung&amp;quot;</title>
    <link>https://www.n-tv.de/politik/a1.html</link>
    <guid isPermaLink="false">a1</guid>
    <pubDate>Mon, 27 Oct 2026 10:00:00 +0100</pubDate>
    <description><![CDATA[<img src="/bilder/a1.jpg" alt=""><p>Teaser <b>eins</b>.</p><p>Zweiter Absatz</p>]]></description>
  </item>
  <item>
    <title>Mit Enclosure</title>
    <link>https://www.n-tv.de/a2.html</link>
    <pubDate>Mon, 27 Oct 2026 11:00:00 +0100</pubDate>
    <enclosure url="https://img.n-tv.de/a2.jpg" type="image/jpeg" length="1"/>
    <description>Nur Text</description>
  </item>
  <item>
    <title>Mit media:content</title>
    <link>https://www.n-tv.de/a3.html</link>
    <media:content url="https://img.n-tv.de/a3.mp4" medium="video"/>
    <media:content url="https://img.n-tv.de/a3.jpg" medium="image"/>
  </item>
  <item>
    <title>Mit media:thumbnail</title>
    <guid>https://www.n-tv.de/a4.html</guid>
    <media:thumbnail url="https://img.n-tv.de/a4-thumb.jpg"/>
    <content:encoded><![CDATA[<p>Volltext</p>]]></content:encoded>
  </item>
</channel>
</rss>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://heise.de/"><title>heise</title><link>https://www.heise.de/</link></channel>
  <item rdf:about="https://www.heise.de/r1">
    <title>RDF eins</title><link>https://www.heise.de/r1</link>
    <dc:date>2026-10-27T08:30:00+01:00</dc:date>
    <description>RDF Teaser</description>
  </item>
</rdf:RDF>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://blog.example/">
  <title type="html">Mein &lt;b&gt;Blog&lt;/b&gt;</title>
  <entry>
    <title>Atom eins</title>
    <id>tag:blog,1</id>
    <link rel="alternate" href="/posts/1"/>
    <link rel="enclosure" type="image/png" href="/img/1.png"/>
    <updated>2026-10-26T12:00:00Z</updated>
    <summary type="html">&lt;p&gt;Atom &amp;amp; Teaser&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title>Atom zwei</title>
    <id>tag:blog,2</id>
    <link href="https://blog.example/posts/2"/>
    <published>2026-10-27T12:00:00Z</published>
    <content type="html">&lt;img src="https://blog.example/2.jpg"&gt;Inhalt</content>
  </entry>
</feed>`;

const RSSFEED_STATE = JSON.stringify({
    meta: { title: 'Tagesschau', link: 'https://www.tagesschau.de/' },
    articles: [
        {
            title: 'Adapter eins',
            description: '<p>Adapter Teaser</p>',
            link: 'https://www.tagesschau.de/x1.html',
            date: '2026-10-27T09:00:00.000Z',
            guid: 'x1',
            image: { url: 'https://www.tagesschau.de/x1.jpg' },
        },
        {
            title: 'Adapter zwei',
            summary: 'Nur summary',
            link: 'https://www.tagesschau.de/x2.html',
            pubdate: '2026-10-27T07:00:00.000Z',
            enclosures: [{ url: 'https://www.tagesschau.de/x2.png', type: 'image/png' }],
        },
    ],
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: code });

const got = await page.evaluate(
    ({ RSS2, RDF, ATOM, RSSFEED_STATE }) => {
        const P = window.FeedParse;
        const r = {};
        r.rss = P.parseFeedXml(RSS2, 'https://www.n-tv.de/rss');
        r.rdf = P.parseFeedXml(RDF);
        r.atom = P.parseFeedXml(ATOM, 'https://blog.example/atom.xml');
        r.adapter = P.parseRssfeedState(RSSFEED_STATE);
        r.adapterObj = P.parseRssfeedState(JSON.parse(RSSFEED_STATE)).items.length;
        r.adapterBad = [P.parseRssfeedState('kein json'), P.parseRssfeedState('{"x":1}'), P.parseRssfeedState(42)];
        const errs = [];
        for (const bad of ['<html><body>nope</body></html>', 'kein xml <', '']) {
            try {
                P.parseFeedXml(bad);
                errs.push('parsed');
            } catch (e) {
                errs.push(e.message);
            }
        }
        r.errors = errs;

        // Latin-1 bytes, charset only in the prolog
        const latin = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Grüße</title></channel></rss>';
        const bytes = new Uint8Array([...latin].map((c) => c.charCodeAt(0)));
        r.latin1 = P.decodeFeedBytes(bytes.buffer, 'application/rss+xml');
        r.utf8 = P.decodeFeedBytes(new TextEncoder().encode('Grüße').buffer, 'text/xml; charset=utf-8');
        r.withBom = P.parseFeedXml(String.fromCharCode(0xfeff) + RDF).items.length;
        r.contentImg = P.parseFeedXml(
            '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>T</title><link>https://t.de/1</link>' +
                '<description>Nur Text</description><content:encoded><![CDATA[<p><img src="https://t.de/1.jpg"> Volltext</p>]]></content:encoded></item></channel></rss>',
        ).items[0];

        const now = Date.parse('2026-10-27T12:00:00Z');
        const base = { maxItems: 50, maxAgeHours: 0, include: '', exclude: '', now };
        r.merged = P.mergeFeeds([r.rss.items, r.atom.items, null, r.rss.items], base).map(
            (i) => `${i.source}:${i.title}`,
        );
        r.capped = P.mergeFeeds([r.rss.items], { ...base, maxItems: 2 }).length;
        r.include = P.mergeFeeds([r.rss.items, r.atom.items], { ...base, include: 'teaser, VOLLTEXT' }).map(
            (i) => i.title,
        );
        r.exclude = P.mergeFeeds([r.rss.items], { ...base, exclude: 'enclosure\nmedia:content' }).map((i) => i.title);
        r.age = P.mergeFeeds([r.atom.items, r.rss.items], { ...base, maxAgeHours: 6 }).map((i) => i.title);
        r.ages = [30e3, 5 * 60e3, 3 * 3600e3, 50 * 3600e3].map((d) => P.ageParts(now - d, now));
        r.text = P.htmlToText('<p>A</p><p>B&nbsp;&amp; C</p><script>x()</script>');
        return r;
    },
    { RSS2, RDF, ATOM, RSSFEED_STATE },
);
await browser.close();

const rss = got.rss.items;
eq('rss: channel title', got.rss.title, 'n-tv.de - Startseite');
eq('rss: item count', rss.length, 4);
eq('rss: double-encoded title decoded', rss[0].title, 'Erste "Meldung"');
eq('rss: guid as id', rss[0].id, 'a1');
eq('rss: date', rss[0].time, Date.parse('2026-10-27T09:00:00Z'));
eq('rss: teaser as text, paragraphs spaced', rss[0].summary, 'Teaser eins. Zweiter Absatz');
eq('rss: first <img> resolved against the article', rss[0].image, 'https://www.n-tv.de/bilder/a1.jpg');
eq('rss: enclosure image', rss[1].image, 'https://img.n-tv.de/a2.jpg');
eq('rss: media:content image, not the video', rss[2].image, 'https://img.n-tv.de/a3.jpg');
eq('rss: undated item', rss[2].time, 0);
eq('rss: media:thumbnail', rss[3].image, 'https://img.n-tv.de/a4-thumb.jpg');
eq('rss: permalink guid as link', rss[3].link, 'https://www.n-tv.de/a4.html');
eq('rss: content:encoded as teaser fallback', rss[3].summary, 'Volltext');

eq('rdf: title', got.rdf.title, 'heise');
eq(
    'rdf: item',
    [got.rdf.items[0].title, got.rdf.items[0].link, got.rdf.items[0].summary],
    ['RDF eins', 'https://www.heise.de/r1', 'RDF Teaser'],
);
eq('rdf: dc:date', got.rdf.items[0].time, Date.parse('2026-10-27T07:30:00Z'));

const atom = got.atom.items;
eq('atom: html title as text', got.atom.title, 'Mein Blog');
eq('atom: relative link via xml:base', atom[0].link, 'https://blog.example/posts/1');
eq('atom: enclosure link image', atom[0].image, 'https://blog.example/img/1.png');
eq('atom: html summary as text', atom[0].summary, 'Atom & Teaser');
eq('atom: published date', atom[1].time, Date.parse('2026-10-27T12:00:00Z'));
eq('atom: image from content', atom[1].image, 'https://blog.example/2.jpg');

const ad = got.adapter;
eq('adapter: title', ad.title, 'Tagesschau');
eq(
    'adapter: items',
    ad.items.map((i) => [i.title, i.summary, i.image]),
    [
        ['Adapter eins', 'Adapter Teaser', 'https://www.tagesschau.de/x1.jpg'],
        ['Adapter zwei', 'Nur summary', 'https://www.tagesschau.de/x2.png'],
    ],
);
eq('adapter: pubdate fallback', ad.items[1].time, Date.parse('2026-10-27T07:00:00Z'));
eq('adapter: parsed object accepted', got.adapterObj, 2);
eq('adapter: junk → null', got.adapterBad, [null, null, null]);

eq('not a feed → errors', got.errors, ['not-a-feed', 'not-xml', 'not-xml']);
eq('latin-1 from prolog', /Grüße/.test(got.latin1), true);
eq('utf-8 from header', got.utf8, 'Grüße');
eq('BOM tolerated', got.withBom, 1);
eq(
    'image from the full text when the teaser has none',
    [got.contentImg.image, got.contentImg.summary],
    ['https://t.de/1.jpg', 'Nur Text'],
);

eq('merge: newest first, undated last, duplicates once', got.merged, [
    '1:Atom zwei',
    '0:Mit Enclosure',
    '0:Erste "Meldung"',
    '1:Atom eins',
    '0:Mit media:content',
    '0:Mit media:thumbnail',
]);
eq('merge: capped', got.capped, 2);
eq('merge: include keywords (case-insensitive)', got.include, ['Erste "Meldung"', 'Atom eins', 'Mit media:thumbnail']);
eq('merge: exclude keywords', got.exclude, ['Erste "Meldung"', 'Mit media:thumbnail']);
eq('merge: max age keeps undated', got.age, [
    'Atom zwei',
    'Mit Enclosure',
    'Erste "Meldung"',
    'Mit media:content',
    'Mit media:thumbnail',
]);
eq('age parts', got.ages, [
    { n: 0, unit: 'now' },
    { n: 5, unit: 'min' },
    { n: 3, unit: 'h' },
    { n: 2, unit: 'd' },
]);
eq('htmlToText', got.text, 'A B & C'.replace(' ', ' '));

let failed = 0;
for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
}
console.log(`feed-parse: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
