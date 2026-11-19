'use strict';

/**
 * The message `help` (lib/help.js) describes the messages for AI agents. Its list of commands has to follow
 * onMessage in main.js (and SCENE_COMMANDS of lib/scenes.js), and the text has to name every command.
 *
 * main.js is loaded with `@iobroker/adapter-core` stubbed out, as in messages.test.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

class FakeAdapter {
    constructor(options) {
        this.name = options.name;
        this.namespace = 'aura.0';
        this.log = { info() {}, warn() {}, error() {}, debug() {} };
    }
    on() {}
}
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: { Adapter: FakeAdapter },
};

const createAdapter = require('../main.js');
const { HELP, COMMANDS } = require('../lib/help');
const { SCENE_COMMANDS } = require('../lib/scenes');

/** The commands of onMessage in main.js */
function commandsOfMain() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const start = source.indexOf('    async onMessage(msg) {');
    const end = source.indexOf('\n    }\n', start);
    assert.ok(start > 0 && end > start, 'onMessage found');
    const names = [...source.slice(start, end).matchAll(/\bmsg\.command === '([^']+)'/g)].map((m) => m[1]);
    return [...new Set([...names, ...SCENE_COMMANDS])];
}

(async () => {
    const names = COMMANDS.map((c) => c.command);
    assert.deepStrictEqual([...names].sort(), commandsOfMain().sort(), 'COMMANDS lists exactly what onMessage answers');
    assert.deepStrictEqual(names, [...new Set(names)], 'every command once');
    console.log('\u2713 COMMANDS lists exactly the commands onMessage answers');

    for (const { command } of COMMANDS.filter((c) => c.command !== 'help')) {
        assert.ok(HELP.includes(command), `HELP names ${command}`);
    }
    for (const line of HELP.split('\n')) {
        assert.ok(line.length <= 120, `line too long: ${line}`);
    }
    console.log('\u2713 HELP names every command, lines of at most 120 characters');

    const write = Object.fromEntries(COMMANDS.map((c) => [c.command, c.write]));
    for (const command of ['notify', 'message', 'saveScene', 'deleteScene', 'staggeredWrite', 'restartAdapter']) {
        assert.strictEqual(write[command], true, `${command} writes`);
    }
    for (const command of ['help', 'listScenes', 'sceneDevices', 'listTimers', 'getRecentLogs']) {
        assert.strictEqual(write[command], false, `${command} only reads`);
    }
    console.log('\u2713 commands that change something are marked write');

    const a = createAdapter({});
    const replies = [];
    a.sendTo = (to, command, result, callback) => replies.push({ to, command, result, callback });
    await a.onMessage({ command: 'help', message: {}, from: 'system.adapter.pi-agent.0', callback: { id: 1 } });
    assert.strictEqual(replies.length, 1);
    assert.strictEqual(replies[0].to, 'system.adapter.pi-agent.0');
    assert.deepStrictEqual(replies[0].result, { help: HELP, commands: COMMANDS });
    console.log('\u2713 help answers {help, commands}');

    console.log('\nAll help tests passed.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
