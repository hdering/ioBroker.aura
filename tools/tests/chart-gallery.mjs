// Every example of the chart gallery (docs/widgets/beispiele-*.md) validates against the
// real widget schema — the same check the MCP recipes go through. The gallery exists to be
// imported: an option renamed in the code has to fail here, not in a user's dashboard.
//
//   node tools/tests/chart-gallery.mjs
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EXAMPLES, PAGES } from '../screenshots/chart-gallery/examples.mjs';

const require = createRequire(import.meta.url);
const { validateWidget } = require('../../lib/mcp/validate.js');
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));

let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log('  ✓', name);
    } catch (e) {
        failed++;
        console.log('  ✗', name, '\n   ', e.message);
    }
}

console.log('chart gallery');

check('ids are unique and every example sits in a section of a page', () => {
    const ids = EXAMPLES.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate example id');
    const sections = new Set(PAGES.flatMap((p) => p.sections));
    for (const e of EXAMPLES) assert.ok(sections.has(e.section), `${e.id}: unknown section "${e.section}"`);
});

for (const e of EXAMPLES) {
    check(`${e.id} validates against the widget schema`, () => {
        const { errors, warnings } = validateWidget(e.widget, schema, {});
        assert.deepEqual(errors, [], errors.join(' | '));
        assert.deepEqual(warnings, [], warnings.join(' | '));
    });
}

check('the committed export JSON matches the example', () => {
    // The page offers the JSON file for download; it must be what the example defines,
    // or the picture and the import would disagree.
    for (const e of EXAMPLES) {
        const file = `docs/widgets/assets/beispiele/${e.id}.json`;
        if (!existsSync(file)) continue; // not generated yet
        assert.deepEqual(
            JSON.parse(readFileSync(file, 'utf8')),
            e.widget,
            `${file} is stale — run chart-gallery.mjs --md-only`,
        );
    }
});

if (failed) {
    console.log(`chart gallery: ${failed} failed`);
    process.exit(1);
}
console.log(`chart gallery: ${EXAMPLES.length} examples valid`);
