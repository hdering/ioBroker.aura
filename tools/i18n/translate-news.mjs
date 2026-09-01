#!/usr/bin/env node
/**
 * Translates the changelog in io-package.json (`common.news`) into every
 * language the ioBroker repository checker asks for (W1144).
 *
 * release.ps1 writes the English text into all eleven language slots, which is
 * valid but shows English news to everyone. This script replaces every slot
 * that is still literally the English text with a real translation and leaves
 * entries that were already translated alone — so a release only ever pays for
 * its own new entry.
 *
 * Two things are deliberate:
 *
 *   - It translates line by line. The free Google endpoint silently truncates
 *     long blocks: a 3000-character entry came back half English.
 *   - It repairs afterwards. The machine drops "(#123)" issue references,
 *     rewrites them in full-width parentheses for zh-cn, and translates the
 *     literal tokens inside [[…]] / {{…}} (NAME became NOMBRE in Spanish).
 *
 * Failure is never fatal. If the translator is unreachable or rate-limited the
 * English text stays where it is — a release must not depend on Google.
 *
 * Usage: node tools/i18n/translate-news.mjs [io-package.json]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const LANGUAGES = ['de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
const FILE = process.argv[2] || 'io-package.json';

const REF = /\(#\d+\)/g;
const FULL_WIDTH_REF = /（#(\d+)）/g;
const TOKEN = /\[\[[^\]]*\]\]|\{\{[^}]*\}\}/g;

/** Restores the issue references of one line, in the order the English has them. */
function repairRefs(en, translated) {
    let line = translated.replace(FULL_WIDTH_REF, '(#$1)');
    const want = en.match(REF) || [];
    const have = line.match(REF) || [];
    if (want.join(',') === have.join(',')) {
        return line;
    }
    line = line.replace(/\s*\(#\d+\)/g, '').trimEnd();
    return want.length ? `${line} ${want.join(' ')}` : line;
}

/** Puts the literal [[dp]] / {{parent}} tokens back, positionally. */
function repairTokens(en, translated) {
    const want = en.match(TOKEN) || [];
    const have = translated.match(TOKEN) || [];
    if (!want.length || want.join('|') === have.join('|') || want.length !== have.length) {
        return translated;
    }
    let i = 0;
    return translated.replace(TOKEN, () => want[i++]);
}

let translateText;
try {
    ({ translateText } = require('@iobroker/adapter-dev/build/translate'));
} catch (e) {
    console.warn(`translate-news: @iobroker/adapter-dev unavailable (${e.message}) — keeping the English text`);
    process.exit(0);
}

const raw = fs.readFileSync(FILE, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const pkg = JSON.parse(raw);
const news = pkg.common?.news;
if (!news) {
    console.warn('translate-news: no common.news — nothing to do');
    process.exit(0);
}

let done = 0;
let skipped = 0;
for (const [version, entry] of Object.entries(news)) {
    const en = entry.en;
    if (!en) {
        continue;
    }
    const enLines = en.split('\n');
    for (const lang of LANGUAGES) {
        // Anything that differs from the English text is a translation already.
        if (entry[lang] && entry[lang] !== en) {
            continue;
        }
        const lines = [];
        let ok = true;
        for (const line of enLines) {
            if (!line.trim()) {
                lines.push(line);
                continue;
            }
            try {
                lines.push(await translateText(line, lang, `news.${version}`));
            } catch (e) {
                console.warn(`translate-news: ${version} ${lang} failed (${e.message}) — keeping English`);
                ok = false;
                break;
            }
        }
        if (!ok) {
            entry[lang] = en;
            skipped++;
            continue;
        }
        entry[lang] = lines.map((line, i) => repairTokens(enLines[i], repairRefs(enLines[i], line))).join('\n');
        done++;
    }
    // Keep the slot order stable so a release produces a readable diff.
    const ordered = { en };
    for (const lang of LANGUAGES) {
        ordered[lang] = entry[lang] ?? en;
    }
    news[version] = ordered;
}

let out = `${JSON.stringify(pkg, null, 2)}\n`;
if (eol === '\r\n') {
    out = out.replace(/\n/g, '\r\n');
}
fs.writeFileSync(FILE, out);

if (done || skipped) {
    console.log(`translate-news: ${done} translated, ${skipped} left in English`);
} else {
    console.log('translate-news: everything already translated');
}
