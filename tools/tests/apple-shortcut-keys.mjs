// Verifies the Apple key handling of issue #651: macOS/iOS gets ⌘/⌥/⌫ in every
// shortcut hint, Windows/Linux keeps the translated Strg/Ctrl, Alt, Entf/Del —
// and the drag-copy modifier is Option on Apple, Ctrl everywhere else.
//
//   node tools/tests/apple-shortcut-keys.mjs
//
// No dev server needed: the platform sniffing is pure and the translation layer
// only needs the language, so both are bundled with esbuild and the config store
// is stubbed away.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

// The store only ever supplies the language here; pulling in the real one would
// drag half the frontend (and import.meta.env) into node.
const stubStore = {
    name: 'stub-config-store',
    setup(b) {
        b.onResolve({ filter: /store\/configStore$/ }, () => ({ path: 'config-store', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
                'export const useConfigStore = { getState: () => ({ frontend: { language: globalThis.__auraLang ?? "de" } }) };',
            loader: 'js',
        }));
    },
};

// `isApplePlatform()` caches its verdict, so each platform needs its own module
// instance — hence a fresh bundle file per load.
let seq = 0;
async function load() {
    const bundle = join(cache, `aura-apple-keys-${process.pid}-${seq++}.mjs`);
    await build({
        stdin: {
            contents: [
                "export { isAppleUA, APPLE_KEY_LABELS, isCopyDragModifier } from './src-vis/utils/platformKeys.ts';",
                "export { t, keyLabel } from './src-vis/i18n/index.ts';",
                "export { de } from './src-vis/i18n/de.ts';",
                "export { en } from './src-vis/i18n/en.ts';",
            ].join('\n'),
            resolveDir: process.cwd(),
            loader: 'ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: bundle,
        plugins: [stubStore],
        logLevel: 'warning',
    });
    const mod = await import(pathToFileURL(bundle).href);
    rmSync(bundle, { force: true });
    return mod;
}

const pc = await load();
const { isAppleUA, APPLE_KEY_LABELS, isCopyDragModifier, de, en } = pc;

const results = [];
const eq = (name, got, want) =>
    results.push({ name, ok: got === want, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}` });

// ── 1. Platform detection ──
{
    const CHROME_MAC =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const SAFARI_IOS =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const CHROME_WIN =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const CHROME_ANDROID =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    const FF_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

    eq('Chrome on macOS is Apple', isAppleUA('MacIntel', CHROME_MAC), true);
    eq('macOS UA-CH platform is Apple', isAppleUA('macOS', CHROME_MAC), true);
    eq('iPhone is Apple', isAppleUA('iPhone', SAFARI_IOS), true);
    // iPadOS 13+ claims to be a Mac — which is the answer we want anyway.
    eq('iPad reporting MacIntel is Apple', isAppleUA('MacIntel', CHROME_MAC), true);
    // "AppleWebKit" sits in every Chromium UA — it must not fool the sniffer.
    eq('Chrome on Windows is not Apple', isAppleUA('Win32', CHROME_WIN), false);
    eq('Windows UA-CH platform is not Apple', isAppleUA('Windows', CHROME_WIN), false);
    eq('Android is not Apple', isAppleUA('Linux armv8l', CHROME_ANDROID), false);
    eq('Linux is not Apple', isAppleUA('Linux x86_64', FF_LINUX), false);
    eq('ChromeOS is not Apple', isAppleUA('Cros', CHROME_WIN), false);
    eq('empty platform and UA is not Apple', isAppleUA('', ''), false);
}

// ── 2. Key labels ──
{
    eq('Apple modifier is Command', APPLE_KEY_LABELS.mod, '⌘');
    eq('Apple alt is Option', APPLE_KEY_LABELS.alt, '⌥');
    eq('Apple delete is Backspace glyph', APPLE_KEY_LABELS.del, '⌫');
    eq('German modifier is Strg', de['keys.mod'], 'Strg');
    eq('English modifier is Ctrl', en['keys.mod'], 'Ctrl');
    eq('German delete is Entf', de['keys.del'], 'Entf');
    eq('English delete is Del', en['keys.del'], 'Del');
}

// ── 3. Hints are templated, not hard-wired to Ctrl ──
{
    for (const [lang, dict] of [
        ['de', de],
        ['en', en],
    ]) {
        for (const key of ['settings.editor.ctrlS', 'editor.peekHint']) {
            const str = dict[key];
            results.push({
                name: `${lang} ${key} uses {mod}`,
                ok: str.includes('{mod}'),
                detail: `got ${JSON.stringify(str)}`,
            });
            results.push({
                name: `${lang} ${key} spells out no fixed modifier`,
                ok: !/Strg|Ctrl/.test(str),
                detail: `got ${JSON.stringify(str)}`,
            });
        }
        results.push({
            name: `${lang} peek hint uses {alt}`,
            ok: dict['editor.peekHint'].includes('{alt}'),
            detail: `got ${JSON.stringify(dict['editor.peekHint'])}`,
        });
    }
}

// ── 4. Drag-copy modifier (non-Apple: node's navigator is not a Mac) ──
const ev = (mods) => ({ altKey: false, ctrlKey: false, metaKey: false, ...mods });
{
    eq('PC: Ctrl+drag copies', isCopyDragModifier(ev({ ctrlKey: true })), true);
    eq('PC: Cmd+drag copies', isCopyDragModifier(ev({ metaKey: true })), true);
    eq('PC: Alt+drag moves', isCopyDragModifier(ev({ altKey: true })), false);
    eq('PC: plain drag moves', isCopyDragModifier(ev({})), false);
}

// ── 5. The hints as the user reads them ──
{
    eq('PC/de: save hint', pc.t('settings.editor.ctrlS'), 'Strg+S speichert sofort');
    eq('PC/de: peek hint', pc.t('editor.peekHint'), 'Strg+Alt halten = Vorschau ohne Bearbeiten-Buttons');
    globalThis.__auraLang = 'en';
    eq('PC/en: save hint', pc.t('settings.editor.ctrlS'), 'Ctrl+S saves immediately');
    eq('PC/en: peek hint', pc.t('editor.peekHint'), 'Hold Ctrl+Alt = preview without edit buttons');
    eq('PC/en: cell menu label', `${pc.keyLabel('mod')}+C`, 'Ctrl+C');

    // Same code, Apple browser: every hint switches to the Mac glyphs.
    Object.defineProperty(globalThis, 'navigator', {
        value: {
            platform: 'MacIntel',
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        configurable: true,
        writable: true,
    });
    const mac = await load();
    eq('Mac/en: save hint', mac.t('settings.editor.ctrlS'), '⌘+S saves immediately');
    eq('Mac/en: peek hint', mac.t('editor.peekHint'), 'Hold ⌘+⌥ = preview without edit buttons');
    eq('Mac/en: cell menu label', `${mac.keyLabel('mod')}+C`, '⌘+C');
    eq('Mac/en: clear hint', mac.keyLabel('del'), '⌫');
    globalThis.__auraLang = 'de';
    eq('Mac/de: save hint', mac.t('settings.editor.ctrlS'), '⌘+S speichert sofort');
    eq('Mac: Option+drag copies', mac.isCopyDragModifier(ev({ altKey: true })), true);
    eq('Mac: Ctrl+drag moves', mac.isCopyDragModifier(ev({ ctrlKey: true })), false);
    eq('Mac: Cmd+drag still copies', mac.isCopyDragModifier(ev({ metaKey: true })), true);
    // The namespace placeholder must survive the new per-language defaults.
    results.push({
        name: '{ns} still resolves',
        ok: mac.t('settings.autobackup.description').includes('aura.0.backups/'),
        detail: `got ${JSON.stringify(mac.t('settings.autobackup.description'))}`,
    });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
