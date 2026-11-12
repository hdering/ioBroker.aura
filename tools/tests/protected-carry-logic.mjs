// A tab the MCP created in a PIN-protected section must survive an editor that has
// not read it from the vault yet.
//
//   node tools/tests/protected-carry-logic.mjs
//
// Editor half (src-vis/utils/protectedCarryOver.ts, bundled with esbuild): the
// adapter's redacted copy carries the new tab as a stub; carryProtectedContent used
// to replace the section's tabs with the editor's own list and drop it. Adapter half
// (lib/security/dashboardVault.js): the next editor save fills the marked tab from
// the vault instead of writing it empty — or not at all.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const entry = join(cache, `aura-protected-carry-entry-${process.pid}.ts`);
const bundle = join(cache, `aura-protected-carry-logic-${process.pid}.mjs`);
writeFileSync(entry, `export * from ${JSON.stringify(join(process.cwd(), 'src-vis/utils/protectedCarryOver.ts'))};\n`);
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
const vault = createRequire(import.meta.url)('../../lib/security/dashboardVault.js');

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failed++;
    }
    console.log(
        `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}

check('marker names match', m.VAULT_KEEP_TAB, vault.VAULT_KEEP_TAB);

const w = (id) => ({ id, type: 'value', gridPos: { x: 0, y: 0, w: 4, h: 2 } });
// The editor holds the section with its content (KEEP), tabs A and B.
const local = [
    {
        id: 'l1',
        sections: [
            {
                id: 's',
                name: 'Sec',
                pin: vault.KEEP_PIN,
                tabs: [
                    { id: 'A', name: 'A', widgets: [w('a1')] },
                    { id: 'B', name: 'B', widgets: [w('b1')] },
                ],
            },
        ],
    },
];
// The adapter's copy after the MCP added tab N between A and B.
const remote = () => [
    {
        id: 'l1',
        sections: [
            {
                id: 's',
                name: 'Sec',
                pinProtected: true,
                tabs: [
                    { id: 'A', name: 'A', widgets: [] },
                    { id: 'N', name: 'Neu', widgets: [] },
                    { id: 'B', name: 'B', widgets: [] },
                ],
            },
        ],
    },
];

const r = remote();
check('carry reports a fill', m.carryProtectedContent(r, local), true);
const sec = r[0].sections[0];
check(
    'the new tab stays, at its remote place',
    sec.tabs.map((t) => t.id),
    ['A', 'N', 'B'],
);
check(
    'known tabs carry the editor content',
    sec.tabs[0].widgets.map((x) => x.id),
    ['a1'],
);
check('the new tab is marked', sec.tabs[1][m.VAULT_KEEP_TAB], true);
check('the section keeps its PIN as KEEP', sec.pin, vault.KEEP_PIN);

// Same echo without a remote-only tab: nothing marked.
const plain = remote();
plain[0].sections[0].tabs.splice(1, 1);
m.carryProtectedContent(plain, local);
check(
    'no marker without a new tab',
    plain[0].sections[0].tabs.some((t) => t[m.VAULT_KEEP_TAB]),
    false,
);

// The editor saves before it read the vault: the adapter fills N from the vault.
const stored = {
    tabs: [
        { id: 'A', widgets: [w('a1')] },
        { id: 'N', name: 'Neu', widgets: [w('n1')] },
        { id: 'B', widgets: [w('b1')] },
    ],
};
const saved = { layouts: [{ id: 'l1', sections: [JSON.parse(JSON.stringify(sec))] }] };
saved.layouts[0].sections[0].tabs[1].name = 'Umbenannt';
const split = vault.splitDashboard(saved);
const p = split.protected[0];
check('one filled tab', vault.fillVaultKeptTabs(p.content, stored), 1);
const n = p.content.tabs.find((t) => t.id === 'N');
check(
    'N keeps its vault widgets',
    n.widgets.map((x) => x.id),
    ['n1'],
);
check('… and takes the editor rename', n.name, 'Umbenannt');
check('the marker never reaches the vault', vault.VAULT_KEEP_TAB in n, false);
check(
    'the marker never reaches the public stub',
    vault.VAULT_KEEP_TAB in split.publicConfig.layouts[0].sections[0].tabs[1],
    false,
);

// A marked tab the vault does not know stays an empty tab, unmarked.
const orphan = { tabs: [{ id: 'X', name: 'X', widgets: [], [vault.VAULT_KEEP_TAB]: true }] };
check('unknown marked tab: nothing filled', vault.fillVaultKeptTabs(orphan, { tabs: [] }), 0);
check('… and unmarked', orphan.tabs[0], { id: 'X', name: 'X', widgets: [] });

// Widgets the editor put on a marked tab win over the vault copy.
const edited = { tabs: [{ id: 'N', widgets: [w('mine')], [vault.VAULT_KEEP_TAB]: true }] };
vault.fillVaultKeptTabs(edited, stored);
check(
    'editor widgets win',
    edited.tabs[0].widgets.map((x) => x.id),
    ['mine'],
);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nprotected-carry-logic: all checks passed');
