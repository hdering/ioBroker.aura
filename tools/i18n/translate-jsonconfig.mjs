#!/usr/bin/env node
/**
 * Fills the missing languages of every inline translation object in
 * admin/jsonConfig.json ({ en, de, … }) — the repository checker wants all
 * eleven ioBroker languages for admin texts.
 *
 * Only empty slots are filled, from the English text; existing translations
 * (German, hand-made ones) stay untouched. Technical tokens — <placeholders>,
 * URLs, paths, datapoint ids, "quoted UI names" are not touched, `code` — are
 * masked before the machine sees them and put back afterwards; a text whose
 * tokens do not come back intact keeps the English text and is reported.
 *
 * Usage: node tools/i18n/translate-jsonconfig.mjs [admin/jsonConfig.json]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { translateText } = require('@iobroker/adapter-dev/build/translate');

const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
const FILE = process.argv[2] || 'admin/jsonConfig.json';

// Things a translator must not change.
const PROTECT = [
    /"Authorization: Bearer [^"]*"/g, // before <token>, which sits inside it
    /<[^<>\s][^<>]*>/g, // <web-port>, <token>, <category>
    /https?:\/\/[^\s)"”]+/g, // URLs
    /`[^`]+`/g, // code
    /(?:\/[\w.-]+){2,}\/?/g, // absolute paths
    /\b[A-Za-z]:\\[^\s,;)]+/g, // Windows paths
    /\b(?:aura|system|web|cloud)\.\d(?:\.[\w*.-]+)?/g, // ioBroker ids
    /\bstatus\.[\w<>.-]+/g,
    /\b[\w-]+\.json(?:\.gz)?\b/g, // file names
    /\bmcp-\*\.json\.gz\b/g,
    /\bPOST \/mcp\b/g,
    /\b(?:Ctrl\+[A-Z])\b/g,
];

function mask(text) {
    const tokens = [];
    let out = text;
    for (const re of PROTECT) {
        out = out.replace(re, (m) => {
            tokens.push(m);
            return `{${tokens.length - 1}}`;
        });
    }
    return { out, tokens };
}

function unmask(text, tokens) {
    // Machines like to add spaces or full-width braces around placeholders.
    const norm = text.replace(/[｛{]\s*(\d+)\s*[｝}]/g, '{$1}');
    const seen = new Set();
    const res = norm.replace(/\{(\d+)\}/g, (m, i) => {
        seen.add(Number(i));
        return tokens[Number(i)] ?? m;
    });
    return seen.size === tokens.length ? res : null;
}

const raw = fs.readFileSync(FILE, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const json = JSON.parse(raw);

const objects = [];
(function walk(o) {
    if (Array.isArray(o)) {
        o.forEach(walk);
    } else if (o && typeof o === 'object') {
        if (typeof o.en === 'string' && Object.keys(o).every((k) => LANGUAGES.includes(k))) {
            objects.push(o);
            return;
        }
        Object.values(o).forEach(walk);
    }
})(json);

let filled = 0;
const failed = [];
for (const obj of objects) {
    const { out, tokens } = mask(obj.en);
    for (const lang of LANGUAGES) {
        // A slot still holding the English text is a failed earlier run.
        if (obj[lang] && (lang === 'en' || obj[lang] !== obj.en)) {
            continue;
        }
        let text = obj.en;
        try {
            const t = await translateText(out, lang, 'jsonConfig');
            const back = unmask(t, tokens);
            if (back === null) {
                failed.push(`${lang}: ${obj.en.slice(0, 60)}`);
            } else {
                text = back;
                filled++;
            }
        } catch (e) {
            failed.push(`${lang}: ${obj.en.slice(0, 60)} (${e.message})`);
        }
        obj[lang] = text;
    }
    // Stable slot order for a readable diff.
    const ordered = Object.fromEntries(LANGUAGES.map((l) => [l, obj[l]]));
    for (const k of Object.keys(obj)) {
        delete obj[k];
    }
    Object.assign(obj, ordered);
}

let text = `${JSON.stringify(json, null, 2)}\n`;
if (eol === '\r\n') {
    text = text.replace(/\n/g, '\r\n');
}
fs.writeFileSync(FILE, text);
console.log(`translate-jsonconfig: ${objects.length} texts, ${filled} slots filled, ${failed.length} kept English`);
for (const f of failed) {
    console.log(`  English kept — ${f}`);
}
