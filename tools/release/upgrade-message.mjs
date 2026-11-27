#!/usr/bin/env node
/**
 * Builds and stores the upgrade notice (io-package.json `common.messages`) that
 * the ioBroker admin shows as its own dialog before an update — release.ps1
 * offers it whenever a release carries a 'breaking:' entry.
 *
 *   propose <in.json> <out.json>
 *       in:  { versionBase, title, text, link?, linkText? }  (English)
 *       out: the complete message entry, title/text/linkText translated into
 *            all eleven admin languages. A failed translation keeps English.
 *   apply <entry.json> [io-package.json]
 *       appends the entry to common.messages (replaces one with the same rules).
 *
 * The admin renders message texts as plain text — no Markdown, so `code` spans
 * are kept away from the translator and then lose their backticks.
 *
 * The rules: 'oldVersion<X' catches everyone below the release, betas of it
 * included, 'newVersion>=X-next.0' already the first beta of it.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LANGUAGES = ['de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
const CODE = /`[^`]+`/g;
const MASK = /\[\[\s*(\d+)\s*\]\]/g;

/**
 * Reads a JSON file, tolerating a UTF-8 BOM (PowerShell writes one).
 *
 * @param {string} file path
 */
function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

let translateText = null;
try {
    ({ translateText } = require('@iobroker/adapter-dev/build/translate'));
} catch (e) {
    console.warn(`upgrade-message: @iobroker/adapter-dev unavailable (${e.message}) — English only`);
}

/**
 * Translates a text with its `code` spans masked; English on any failure.
 *
 * @param {string} en English text
 * @param {string} lang target language
 */
async function translate(en, lang) {
    if (!translateText || !en) {
        return en;
    }
    const codes = en.match(CODE) || [];
    let i = 0;
    const masked = en.replace(CODE, () => `[[${i++}]]`);
    try {
        const seen = new Set();
        const out = (await translateText(masked, lang, 'messages')).replace(MASK, (all, n) =>
            codes[n] !== undefined ? (seen.add(n), codes[n]) : all,
        );
        return seen.size === codes.length ? out : en;
    } catch (e) {
        console.warn(`upgrade-message: ${lang} failed (${e.message}) — keeping English`);
        return en;
    }
}

/**
 * All eleven language slots of one English text.
 *
 * @param {string} en English text
 */
async function allLanguages(en) {
    // The admin shows message texts as plain text: backticks only shield code
    // spans from the translator and are dropped afterwards.
    const plain = (s) => s.replace(/`/g, '');
    const out = { en: plain(en) };
    for (const lang of LANGUAGES) {
        out[lang] = plain(await translate(en, lang));
    }
    return out;
}

const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'propose') {
    const input = readJson(a);
    const entry = {
        condition: {
            operand: 'and',
            rules: [`oldVersion<${input.versionBase}`, `newVersion>=${input.versionBase}-next.0`],
        },
        title: await allLanguages(input.title),
        text: await allLanguages(input.text),
    };
    if (input.link) {
        entry.link = input.link;
        entry.linkText = await allLanguages(input.linkText || 'More information');
    }
    entry.level = 'warn';
    entry.buttons = ['agree', 'cancel'];
    fs.writeFileSync(b, `${JSON.stringify(entry, null, 2)}\n`);
} else if (cmd === 'apply') {
    const entry = readJson(a);
    const file = b || 'io-package.json';
    const raw = fs.readFileSync(file, 'utf8');
    const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const pkg = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const key = JSON.stringify(entry.condition?.rules);
    const messages = (pkg.common.messages || []).filter((m) => JSON.stringify(m.condition?.rules) !== key);
    messages.push(entry);
    pkg.common.messages = messages;
    let out = `${JSON.stringify(pkg, null, 2)}\n`;
    if (eol === '\r\n') {
        out = out.replace(/\n/g, '\r\n');
    }
    fs.writeFileSync(file, bom + out);
    console.log(
        `upgrade-message: common.messages now has ${messages.length} entr${messages.length === 1 ? 'y' : 'ies'}`,
    );
} else {
    console.error('usage: upgrade-message.mjs propose <in.json> <out.json> | apply <entry.json> [io-package.json]');
    process.exit(2);
}
