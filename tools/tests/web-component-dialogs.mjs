// Host dialogs of ioBroker web components (`dialogs.open()` of the webcomponent
// widget): which requests are shown, one dialog per widget at a time, the values
// a form starts with and resolves with, and the size of the frame.
//
//   node tools/tests/web-component-dialogs.mjs
//
// No dev server needed - utils/webComponentDialogs.ts is free of React and of the
// DOM and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-web-component-dialogs-${process.pid}.mjs`);
await build({
    entryPoints: [join(process.cwd(), 'src-vis/utils/webComponentDialogs.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failed++;
    }
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}
const tick = () => new Promise((r) => setTimeout(r, 0));
// quiet the warning the controller logs for a refused request
const warn = console.warn;
console.warn = () => {};

// ── which requests are shown ────────────────────────────────────────────────
const element = { nodeType: 1, tagName: 'DIV' };
const form = {
    type: 'panel',
    items: {
        head: { type: 'header', text: 'Limits' },
        max: { type: 'number', label: 'Maximum', min: 0, max: 100, default: 80 },
        on: { type: 'checkbox', label: 'On', default: true },
        mode: { type: 'select', options: [{ value: 1, label: 'One' }], default: 1 },
        name: { type: 'text' },
        line: { type: 'divider' },
    },
};
check('request: nothing', m.checkDialogRequest(null), null);
check('request: neither form nor element', m.checkDialogRequest({ title: 'x' }), null);
check('request: form without items', m.checkDialogRequest({ form: { type: 'panel' } }), null);
check('request: form with items', !!m.checkDialogRequest({ form }), true);
check('request: element', !!m.checkDialogRequest({ element, width: 600 }), true);
check('request: element that is a text node', m.checkDialogRequest({ element: { nodeType: 3 } }), null);
check('request: element that is a string', m.checkDialogRequest({ element: '<div>' }), null);

// ── one dialog at a time ────────────────────────────────────────────────────
{
    const shown = [];
    let blocked = false;
    const c = m.createDialogController(
        (d) => shown.push(d ? d.id : null),
        () => blocked,
    );
    const results = [];
    const first = c.open({ element }, { theme: 'a' }).then((r) => results.push(['first', r]));
    check('controller: the first dialog is shown', shown, [1]);
    check('controller: keeps the context', c.current?.context, { theme: 'a' });
    const second = c.open({ form, title: 'Limits' }).then((r) => results.push(['second', r]));
    await first;
    check('controller: a new request resolves the open one with null', results, [['first', null]]);
    check('controller: and shows the new one', shown, [1, 2]);
    c.close(1, 'late');
    await tick();
    check('controller: a late close of the old one does nothing', [results.length, c.current?.id], [1, 2]);
    c.close(2, { max: 5 });
    await second;
    check('controller: closes with the result', results[1], ['second', { max: 5 }]);
    check('controller: nothing on screen afterwards', [c.current, shown.at(-1)], [null, null]);

    const third = c.open({ element });
    c.close(3, undefined);
    check('controller: no result is null', await third, null);

    const refused = await c.open({ title: 'nothing to show' });
    check('controller: a request without form or element resolves null', [refused, c.current], [null, null]);

    const open = c.open({ element });
    const before = c.current?.id;
    const invalid = await c.open({});
    check('controller: an invalid request leaves the open dialog alone', [invalid, c.current?.id], [null, before]);
    c.closeAll();
    check('controller: closeAll resolves the open dialog with null', await open, null);
    check('controller: closeAll hides it', shown.at(-1), null);

    blocked = true;
    const count = shown.length;
    check('controller: in edit mode nothing opens', await c.open({ element }), null);
    check('controller: and nothing is shown', shown.length, count);
}

// ── form values ─────────────────────────────────────────────────────────────
check('form: defaults of the fields with a value', m.formDefaults(form), { max: 80, on: true, mode: 1 });
check(
    'form: data overrides the defaults, foreign keys are dropped',
    m.initialFormValues(form, { max: 20, name: 'x', foreign: 1, head: 'y' }),
    { max: 20, on: true, mode: 1, name: 'x' },
);
check('form: null in data keeps the default', m.initialFormValues(form, { max: null, on: false }), {
    max: 80,
    on: false,
    mode: 1,
});
check('form: no data', m.initialFormValues(form, undefined), { max: 80, on: true, mode: 1 });
check(
    'form: the result is typed as the form declares',
    m.formResult(form, { max: '42', on: 'true', mode: 1, name: 7, head: 'x', line: 'y', other: 1 }),
    { max: 42, on: true, mode: '1', name: '7' },
);
check('form: a field without a value is missing', m.formResult(form, { max: '', on: false }), { on: false });

// ── size of the frame ───────────────────────────────────────────────────────
const desktop = { width: 1280, height: 800 };
const phone = { width: 390, height: 844 };
check('size: default width', m.dialogFrameSize({}, desktop), {
    compact: false,
    width: 480,
    height: undefined,
    maxHeight: 768,
});
check('size: asked width and height', m.dialogFrameSize({ width: 600, height: 400 }, desktop), {
    compact: false,
    width: 600,
    height: 400,
    maxHeight: 768,
});
check('size: at most the screen', m.dialogFrameSize({ width: 3000, height: 3000 }, desktop), {
    compact: false,
    width: 1248,
    height: 768,
    maxHeight: 768,
});
check('size: a broken width falls back', m.dialogFrameSize({ width: -5, height: 'x' }, desktop).width, 480);
check('size: a phone takes the whole width', m.dialogFrameSize({ width: 300 }, phone), {
    compact: true,
    width: 374,
    height: undefined,
    maxHeight: 828,
});

console.warn = warn;
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
