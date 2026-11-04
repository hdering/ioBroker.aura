// Linked tabs (#896): resolving a link to its original, the reverse lookup, and
// `{{clientId}}` in tab/section rules. Also the MCP addressing (findTab followLink).
//
//   node tools/tests/tab-link-logic.mjs
//
// No dev server needed - utils/tabLink.ts and utils/clientIdToken.ts are pure and
// bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const entry = join(cache, `aura-tab-link-entry-${process.pid}.ts`);
const bundle = join(cache, `aura-tab-link-logic-${process.pid}.mjs`);
writeFileSync(
    entry,
    `export * from ${JSON.stringify(join(process.cwd(), 'src-vis/utils/tabLink.ts'))};\n` +
        `export * from ${JSON.stringify(join(process.cwd(), 'src-vis/utils/clientIdToken.ts'))};\n`,
);
await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });
rmSync(entry, { force: true });
const { findTab } = createRequire(import.meta.url)('../../lib/mcp/auraConfig.js');

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}

const widget = { id: 'w1', type: 'switch', gridPos: { x: 0, y: 0, w: 4, h: 2 } };
const layouts = [
    {
        id: 'l-me',
        name: 'Ich',
        slug: 'ich',
        sections: [
            {
                id: 's-main',
                name: 'Haus',
                slug: 'haus',
                tabs: [
                    { id: 'licht', name: 'Licht', slug: 'licht', widgets: [widget] },
                    { id: 'garage', name: 'Garage', slug: 'garage', widgets: [], pinProtected: true },
                ],
            },
        ],
    },
    {
        id: 'l-wife',
        name: 'Frau',
        slug: 'frau',
        sections: [
            {
                id: 's-wife',
                name: 'Start',
                slug: 'start',
                tabs: [
                    {
                        id: 'tab-1',
                        name: 'Lampen',
                        slug: 'lampen',
                        widgets: [],
                        link: { sectionId: 's-main', tabId: 'licht' },
                    },
                    {
                        id: 'tab-2',
                        name: 'Tor',
                        slug: 'tor',
                        widgets: [],
                        link: { sectionId: 's-main', tabId: 'garage' },
                    },
                    {
                        id: 'tab-3',
                        name: 'Weg',
                        slug: 'weg',
                        widgets: [],
                        link: { sectionId: 's-main', tabId: 'gone' },
                    },
                    // A link to a link never resolves (the editor always links the original).
                    {
                        id: 'tab-4',
                        name: 'Kette',
                        slug: 'kette',
                        widgets: [],
                        link: { sectionId: 's-wife', tabId: 'tab-1' },
                    },
                ],
            },
        ],
    },
];

// ── findLinkSource ──
const src = m.findLinkSource(layouts, { sectionId: 's-main', tabId: 'licht' });
check('link resolves to the original', [src?.layout.id, src?.section.id, src?.tab.id], ['l-me', 's-main', 'licht']);
check(
    'original widgets reachable',
    src?.tab.widgets.map((w) => w.id),
    ['w1'],
);
check('missing original', m.findLinkSource(layouts, { sectionId: 's-main', tabId: 'gone' }), undefined);
check('link to a link does not resolve', m.findLinkSource(layouts, { sectionId: 's-wife', tabId: 'tab-1' }), undefined);
check('no link', m.findLinkSource(layouts, undefined), undefined);
check('label with single section', m.linkSourceLabel(src), 'Ich › Licht');

// ── linksTo ──
check(
    'reverse lookup',
    m.linksTo(layouts, 's-main', 'licht').map((x) => x.tab.id),
    ['tab-1'],
);
check('reverse lookup of an unlinked tab', m.linksTo(layouts, 's-wife', 'tab-2').length, 0);

// ── {{clientId}} in tab rules ──
const conds = [
    {
        id: 'c1',
        clauses: [{ datapoint: '0_userdata.0.aura.{{clientId}}.zeigeRechner', operator: '==', value: 'false' }],
        style: {},
        hideWidget: true,
    },
    {
        id: 'c2',
        clauses: [
            { datapoint: 'a.b', operator: '==', value: 'x.{{clientId}}', valueType: 'datapoint' },
            { datapoint: 'c.d', operator: '==', value: '{{clientId}}' },
        ],
        style: {},
    },
];
const resolved = m.withClientIdConditions(conds, 'handy-frau');
check('datapoint token replaced', resolved[0].clauses[0].datapoint, '0_userdata.0.aura.handy-frau.zeigeRechner');
check('second-DP value replaced', resolved[1].clauses[0].value, 'x.handy-frau');
check('static value untouched', resolved[1].clauses[1].value, '{{clientId}}');
const plain = [{ id: 'c', clauses: [{ datapoint: 'x.y', operator: '==', value: '1' }], style: {} }];
check('no token = same array', m.withClientIdConditions(plain, 'abc') === plain, true);
check('undefined stays undefined', m.withClientIdConditions(undefined, 'abc'), undefined);

// ── MCP addressing ──
const viaLink = findTab(layouts, { tab: 'Lampen', followLink: true });
check(
    'MCP: widget path follows the link',
    [viaLink.tab?.id, viaLink.tab?.layoutName, viaLink.linkedVia?.id],
    ['licht', 'Ich', 'tab-1'],
);
const own = findTab(layouts, { tab: 'Lampen' });
check('MCP: rename/delete path keeps the link', [own.tab?.id, !!own.tab?.link], ['tab-1', true]);
check('MCP: dangling link is an error', !!findTab(layouts, { tab: 'Weg', followLink: true }).error, true);
check('MCP: locked original stays locked', findTab(layouts, { tab: 'Tor', followLink: true }).tab?.pinLocked, true);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall checks passed');
