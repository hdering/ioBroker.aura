// Start-up changes to Aura's own instance object (lib/ownInstanceObject.js).
//
//   node tools/tests/own-instance-object.mjs
//
// Every write to system.adapter.aura.N restarts the instance - and with the web
// adapter extension on, the web instance too. Checked: all start-up changes land
// in ONE object (one write), a second start finds nothing left to do (no restart
// loop), and each change on its own still marks the object as changed.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { syncOwnInstanceObject } = require(join(process.cwd(), 'lib/ownInstanceObject.js'));
const { TOKEN_PLACEHOLDER } = require(join(process.cwd(), 'lib/mcp/clientConfig.js'));

const TOKEN = '0123456789abcdef0123456789abcdef';
const encrypt = (value) => `$/aes-192-cbc:enc:${value.length}`;
const linksFor = (webInstance) => ({
    frontend: { link: '%protocol%://%ip%:8095/', name: { en: 'Aura Frontend' } },
    backend: { link: '%protocol%://%ip%:8095/#/admin', name: { en: 'Aura Backend' } },
    ...(webInstance
        ? {
              web: { link: 'http://%ip%:8082/aura/', name: { en: 'Aura Frontend (web adapter)' } },
              webBackend: { link: 'http://%ip%:8082/aura/#/admin', name: { en: 'Aura Backend (web adapter)' } },
          }
        : {}),
});
const block = `{"mcpServers":{"aura":{"headers":{"Authorization":"Bearer ${TOKEN}"}}}}`;

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL ${name}\n       ${e.message}`);
    }
}

/** What MCP on + extension on via set_object looked like on a live system. */
function freshObject() {
    return {
        _id: 'system.adapter.aura.0',
        common: { localLinks: linksFor('') },
        native: {
            port: 8095,
            webInstance: 'web.0',
            mcpEnabled: true,
            mcpToken: TOKEN,
            mcpClientConfig: block,
            mcpDesktopConfig: block,
            resetAdminPin: true,
        },
    };
}
const deps = (over = {}) => ({
    encrypt,
    clearResetAdminPin: true,
    localLinks: async (webInstance) => linksFor(webInstance),
    ...over,
});

await test('every start-up change ends up in one object', async () => {
    const obj = freshObject();
    const r = await syncOwnInstanceObject(obj, deps());
    assert.equal(r.changed, true);
    assert.equal(r.plainMcpToken, TOKEN);
    assert.equal(obj.native.mcpToken, encrypt(TOKEN));
    assert.equal(obj.native.resetAdminPin, false);
    assert.equal(obj.common.localLinks.web.link, 'http://%ip%:8082/aura/');
    assert.ok(obj.native.mcpClientConfig.includes(TOKEN_PLACEHOLDER));
    assert.ok(obj.native.mcpDesktopConfig.includes(TOKEN_PLACEHOLDER));
    assert.ok(!obj.native.mcpClientConfig.includes(TOKEN));
    const texts = r.info.join('\n');
    assert.match(texts, /encrypted in place/);
    assert.match(texts, /token replaced by a placeholder/);
});

await test('second start: nothing left to write (no restart loop)', async () => {
    const obj = freshObject();
    await syncOwnInstanceObject(obj, deps());
    // next start: js-controller decrypts, the flag is false, links and blocks are current
    const r = await syncOwnInstanceObject(obj, deps({ clearResetAdminPin: false }));
    assert.equal(r.changed, false);
    assert.equal(r.plainMcpToken, null);
    assert.deepEqual([...r.info, ...r.debug], []);
});

await test('an encrypted token is left alone', async () => {
    const obj = freshObject();
    obj.native.mcpToken = encrypt(TOKEN);
    obj.native.mcpClientConfig = obj.native.mcpDesktopConfig = '';
    obj.native.resetAdminPin = false;
    obj.common.localLinks = linksFor('web.0');
    const r = await syncOwnInstanceObject(obj, deps({ clearResetAdminPin: false }));
    assert.equal(r.changed, false);
    assert.equal(obj.native.mcpToken, encrypt(TOKEN));
});

await test('the reset flag is cleared only after a reset ran', async () => {
    const obj = freshObject();
    obj.native.mcpToken = encrypt(TOKEN);
    obj.native.mcpClientConfig = obj.native.mcpDesktopConfig = '';
    obj.common.localLinks = linksFor('web.0');
    let r = await syncOwnInstanceObject(obj, deps({ clearResetAdminPin: false }));
    assert.equal(r.changed, false);
    assert.equal(obj.native.resetAdminPin, true);
    r = await syncOwnInstanceObject(obj, deps({ clearResetAdminPin: true }));
    assert.equal(r.changed, true);
    assert.equal(obj.native.resetAdminPin, false);
});

await test('legacy webInstance "*" is cleared before the links are built', async () => {
    const obj = freshObject();
    obj.native.webInstance = '*';
    const asked = [];
    await syncOwnInstanceObject(
        obj,
        deps({
            localLinks: async (webInstance) => {
                asked.push(webInstance);
                return linksFor(webInstance);
            },
        }),
    );
    assert.equal(obj.native.webInstance, '');
    assert.deepEqual(asked, ['']);
    assert.equal(obj.common.localLinks.web, undefined);
});

await test('a socket instance in webInstance moves to socketInstance', async () => {
    const obj = freshObject();
    obj.native.webInstance = 'socketio.0';
    obj.native.socketInstance = '';
    const r = await syncOwnInstanceObject(obj, deps());
    assert.equal(obj.native.webInstance, '');
    assert.equal(obj.native.socketInstance, 'socketio.0');
    assert.match(r.info.join('\n'), /moved socket backend "socketio\.0"/);
});

await test('switching the extension off drops the web links', async () => {
    const obj = freshObject();
    obj.native.mcpToken = encrypt(TOKEN);
    obj.native.mcpClientConfig = obj.native.mcpDesktopConfig = '';
    obj.native.resetAdminPin = false;
    obj.native.webInstance = '';
    obj.common.localLinks = linksFor('web.0');
    const r = await syncOwnInstanceObject(obj, deps({ clearResetAdminPin: false }));
    assert.equal(r.changed, true);
    assert.equal(obj.common.localLinks.web, undefined);
    assert.equal(obj.common.localLinks.webBackend, undefined);
});

await test('main.js writes its instance object in one place only', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(join(process.cwd(), 'main.js'), 'utf8');
    const own =
        /(setForeignObjectAsync|extendForeignObjectAsync|setForeignObject|extendForeignObject)\(\s*(`system\.adapter\.\$\{this\.namespace\}`|obj\._id)/g;
    const hits = src.match(own) || [];
    assert.equal(hits.length, 1, `writes to the own instance object: ${hits.join(' | ')}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
