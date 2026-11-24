// Temporary fix for js-controller 7.2.x until ioBroker.js-controller#3649 is released:
// parallel rights checks share ONE read of all users and groups instead of one each.
// Without it a freshly started web adapter with reconnecting clients makes thousands of
// SCANs, each walking all objects with the jsonl DB, and blocks the controller for minutes
// (ioBroker.js-controller#3648).
//
//   node patch-usergroup-725.mjs            apply (keeps *.orig next to each file)
//   node patch-usergroup-725.mjs --revert   put the originals back
//   node patch-usergroup-725.mjs --check    show whether the files are patched
//
// Patches @iobroker/db-objects-redis (build/esm and build/cjs objectsUtils.js). Every
// process loads it at start: restart web (or the whole ioBroker) afterwards. A
// js-controller update replaces the files and so undoes this patch.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const BASE = '/opt/iobroker/node_modules/@iobroker/db-objects-redis';
const MARK = '/* aura-patch #3648 */';
const files = [
    { path: `${BASE}/build/esm/lib/objects/objectsUtils.js`, tools: 'tools', clone: 'deepClone', indent: '    ' },
    {
        path: `${BASE}/build/cjs/lib/objects/objectsUtils.js`,
        tools: 'import_db_base.tools',
        clone: '(0, import_deep_clone.default)',
        indent: '  ',
    },
];
const mode = process.argv[2] || '--apply';
const version = JSON.parse(readFileSync(`${BASE}/package.json`, 'utf8')).version;
console.log(`@iobroker/db-objects-redis ${version}`);

for (const f of files) {
    const src = readFileSync(f.path, 'utf8');
    const patched = src.includes(MARK);
    if (mode === '--check') {
        console.log(`${patched ? 'patched  ' : 'original '} ${f.path}`);
        continue;
    }
    if (mode === '--revert') {
        if (!existsSync(`${f.path}.orig`)) {
            console.log(`no backup, left alone: ${f.path}`);
            continue;
        }
        copyFileSync(`${f.path}.orig`, f.path);
        console.log(`restored ${f.path}`);
        continue;
    }
    if (patched) {
        console.log(`already patched: ${f.path}`);
        continue;
    }
    const i = f.indent;
    const t = f.tools;
    // 1. the module state: callers waiting for the read in progress (null = none running)
    const decl = 'let users = {};\n';
    // 2. right after the cache hit: wait for a read in progress instead of starting one
    const hit = `${i}if (users[user]) {\n${i}${i}return ${t}.maybeCallbackWithError(callback, null, user, users[user].groups, users[user].acl);\n${i}}\n`;
    // 3. the answer at the end of the read: answer the waiting callers as well
    const answer = `return ${t}.maybeCallbackWithError(callback, error, user, users[user] ? users[user].groups : [], users[user] ? users[user].acl : ${f.clone}(defaultAcl.acl));`;
    for (const [name, anchor] of [
        ['declaration', decl],
        ['cache hit', hit],
        ['answer', answer],
    ]) {
        if (src.split(anchor).length !== 2) {
            console.error(`anchor "${name}" not found exactly once in ${f.path} - not patched (other version?)`);
            process.exit(1);
        }
    }
    let out = src.replace(decl, `${decl}let userGroupWaiters = null; ${MARK}\n`);
    out = out.replace(
        hit,
        `${hit}${i}if (userGroupWaiters) { ${MARK}\n${i}${i}userGroupWaiters.push({ user, callback });\n${i}${i}return;\n${i}}\n${i}userGroupWaiters = [];\n`,
    );
    out = out.replace(
        answer,
        `const waiters = userGroupWaiters || []; ${MARK}\n` +
            `userGroupWaiters = null;\n` +
            `for (const w of waiters) {\n` +
            `    setImmediate(() => ${t}.maybeCallbackWithError(w.callback, error, w.user, users[w.user] ? users[w.user].groups : [], users[w.user] ? users[w.user].acl : ${f.clone}(defaultAcl.acl)));\n` +
            `}\n` +
            answer,
    );
    if (!existsSync(`${f.path}.orig`)) copyFileSync(f.path, `${f.path}.orig`);
    writeFileSync(f.path, out);
    console.log(`patched ${f.path} (original: ${f.path}.orig)`);
}
if (mode !== '--check') console.log('restart web (or ioBroker) so the processes load the changed file');
