'use strict';

/**
 * Unit tests for the countdown engine (issue #675) — lib/countdowns.js.
 *
 * Time and timers are injected, so a whole hour passes in a function call.
 * Covered: command parsing, start/pause/resume/stop/end, +/-/= in every state,
 * the target datapoint at start, end and stop, restart semantics, restore after
 * an adapter restart (still running → re-armed, elapsed → caught up), the
 * per-second remainingMs ticker, and the no-duration guard.
 *
 *   node test/countdowns.test.js
 */

const assert = require('assert');
const { CountdownEngine, parseCountdownCommand, parseSeconds, durationFromConfig } = require('../lib/countdowns');

/**
 * Deterministic clock + timer queue.
 *
 * @param start
 */
function makeClock(start = 1_000_000) {
    let now = start;
    let seq = 0;
    const timers = new Map();
    return {
        now: () => now,
        setTimeout(fn, ms) {
            const id = ++seq;
            timers.set(id, { at: now + Math.max(0, ms), fn });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        /**
         * Advance the clock, firing due timers in order (and any they schedule).
         *
         * @param ms
         */
        async advance(ms) {
            const target = now + ms;
            for (;;) {
                let nextId = null;
                let nextAt = Infinity;
                for (const [id, t] of timers) {
                    if (t.at <= target && t.at < nextAt) {
                        nextAt = t.at;
                        nextId = id;
                    }
                }
                if (nextId == null) {
                    break;
                }
                const t = timers.get(nextId);
                timers.delete(nextId);
                now = Math.max(now, t.at);
                await t.fn();
                // Let the async transitions the timer kicked off settle.
                await new Promise((r) => setImmediate(r));
            }
            now = target;
        },
        pending: () => timers.size,
    };
}

function makeEngine(clock, opts = {}) {
    const statusLog = [];
    const targetLog = [];
    const warnings = [];
    const engine = new CountdownEngine({
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        log: {
            info() {},
            warn(m) {
                warnings.push(m);
            },
        },
        writeStatus: (key, status) => {
            statusLog.push({ key, ...status });
        },
        writeTarget: (dp, raw, why) => {
            targetLog.push({ dp, raw, why });
        },
        ...opts,
    });
    return { engine, statusLog, targetLog, warnings };
}

const CONFIG = { durationSec: 3600, targetDp: 'hue.0.lamp.on', valueOnEnd: 'false', valueOnStart: 'true' };

(async () => {
    // ── parsing ──────────────────────────────────────────────────────────────
    {
        assert.strictEqual(parseSeconds('90'), 90);
        assert.strictEqual(parseSeconds('1:30'), 90);
        assert.strictEqual(parseSeconds('1:00:00'), 3600);
        assert.strictEqual(parseSeconds('abc'), null);
        assert.deepStrictEqual(parseCountdownCommand('start'), { kind: 'start' });
        assert.deepStrictEqual(parseCountdownCommand(' STOP '), { kind: 'stop' });
        assert.deepStrictEqual(parseCountdownCommand('reset'), { kind: 'stop' });
        assert.deepStrictEqual(parseCountdownCommand('+60'), { kind: 'add', ms: 60_000 });
        assert.deepStrictEqual(parseCountdownCommand('-1:10'), { kind: 'add', ms: -70_000 });
        assert.deepStrictEqual(parseCountdownCommand('=5:00'), { kind: 'set', ms: 300_000 });
        assert.deepStrictEqual(parseCountdownCommand('=0.5'), { kind: 'set', ms: 500 });
        assert.strictEqual(parseCountdownCommand('fly'), null);
        assert.strictEqual(parseCountdownCommand(''), null);
        assert.strictEqual(durationFromConfig({ durationSec: 90 }), 90_000);
        assert.strictEqual(durationFromConfig({ durationMs: 2500 }), 2500);
        assert.strictEqual(durationFromConfig({ durationSec: 0.1 }), 1000, 'clamped to the 1 s minimum');
        assert.strictEqual(durationFromConfig(null), 0);
    }

    // ── config ingest publishes idle + duration once ─────────────────────────
    {
        const clock = makeClock();
        const { engine, statusLog } = makeEngine(clock);
        assert.strictEqual(engine.ingestConfig('a', JSON.stringify(CONFIG)), true);
        assert.deepStrictEqual(engine.snapshot('a'), {
            state: 'idle',
            endTs: 0,
            remainingMs: 3_600_000,
            durationMs: 3_600_000,
        });
        assert.strictEqual(statusLog.length, 1);
        // Republishing the same config (editor keystroke elsewhere) stays silent.
        assert.strictEqual(engine.ingestConfig('a', JSON.stringify({ ...CONFIG, title: 'x' })), false);
        assert.strictEqual(statusLog.length, 1);
        // Editing the duration adopts it.
        assert.strictEqual(engine.ingestConfig('a', JSON.stringify({ ...CONFIG, durationSec: 60 })), true);
        assert.strictEqual(engine.snapshot('a').durationMs, 60_000);
        assert.strictEqual(engine.snapshot('a').remainingMs, 60_000);
        // Garbage config is tolerated.
        engine.ingestConfig('a', '{not json');
        assert.strictEqual(engine.config('a'), null);
        assert.strictEqual(engine.snapshot('a').durationMs, 60_000, 'keeps the last good duration');
    }

    // ── start → elapsed: target at start and end, live remaining from endTs ──
    {
        const clock = makeClock();
        const { engine, targetLog } = makeEngine(clock);
        engine.ingestConfig('a', CONFIG);
        assert.strictEqual(await engine.command('a', 'start'), true);
        let s = engine.snapshot('a');
        assert.strictEqual(s.state, 'running');
        assert.strictEqual(s.endTs, clock.now() + 3_600_000);
        assert.deepStrictEqual(targetLog, [{ dp: 'hue.0.lamp.on', raw: 'true', why: 'a started' }]);
        await clock.advance(1_800_000);
        assert.strictEqual(engine.snapshot('a').remainingMs, 1_800_000, 'remaining derives from the clock');
        await clock.advance(1_800_000);
        s = engine.snapshot('a');
        assert.strictEqual(s.state, 'ended');
        assert.strictEqual(s.endTs, 0);
        assert.strictEqual(s.remainingMs, 0);
        assert.strictEqual(s.durationMs, 3_600_000, 'the setting survives the run');
        assert.strictEqual(targetLog.length, 2);
        assert.strictEqual(targetLog[1].raw, 'false');
        assert.strictEqual(clock.pending(), 0, 'no timer left behind');
        // start again from ended
        await engine.command('a', 'start');
        assert.strictEqual(engine.snapshot('a').state, 'running');
    }

    // ── pause / resume / toggle ──────────────────────────────────────────────
    {
        const clock = makeClock();
        const { engine } = makeEngine(clock);
        engine.ingestConfig('a', { durationSec: 100 });
        await engine.command('a', 'start');
        await clock.advance(30_000);
        await engine.command('a', 'pause');
        let s = engine.snapshot('a');
        assert.strictEqual(s.state, 'paused');
        assert.strictEqual(s.remainingMs, 70_000);
        assert.strictEqual(s.endTs, 0);
        await clock.advance(600_000);
        assert.strictEqual(engine.snapshot('a').remainingMs, 70_000, 'paused time does not run');
        assert.strictEqual(clock.pending(), 0);
        await engine.command('a', 'resume');
        s = engine.snapshot('a');
        assert.strictEqual(s.state, 'running');
        assert.strictEqual(s.endTs, clock.now() + 70_000);
        await engine.command('a', 'toggle');
        assert.strictEqual(engine.snapshot('a').state, 'paused');
        await engine.command('a', 'toggle');
        assert.strictEqual(engine.snapshot('a').state, 'running');
        // start while paused resumes (does not restart with the full duration)
        await engine.command('a', 'pause');
        await engine.command('a', 'start');
        assert.strictEqual(engine.snapshot('a').remainingMs, 70_000);
        // pause when not running is a harmless no-op
        await engine.command('a', 'stop');
        await engine.command('a', 'pause');
        assert.strictEqual(engine.snapshot('a').state, 'idle');
    }

    // ── start while running restarts with the full duration ─────────────────
    {
        const clock = makeClock();
        const { engine } = makeEngine(clock);
        engine.ingestConfig('a', { durationSec: 100 });
        await engine.command('a', 'start');
        await clock.advance(40_000);
        await engine.command('a', 'start');
        assert.strictEqual(engine.snapshot('a').remainingMs, 100_000);
        assert.strictEqual(clock.pending(), 1, 'exactly one timer armed');
    }

    // ── stop: writes valueOnEnd only when the countdown owns the target ─────
    {
        const clock = makeClock();
        const { engine, targetLog } = makeEngine(clock);
        engine.ingestConfig('a', CONFIG);
        await engine.command('a', 'start');
        await clock.advance(1000);
        await engine.command('a', 'stop');
        const s = engine.snapshot('a');
        assert.strictEqual(s.state, 'idle');
        assert.strictEqual(s.remainingMs, 3_600_000);
        assert.deepStrictEqual(
            targetLog.map((t) => t.raw),
            ['true', 'false'],
            'valueOnStart set → stop switches off again',
        );
        // stop while idle writes nothing
        await engine.command('a', 'stop');
        assert.strictEqual(targetLog.length, 2);

        // pure end action (no valueOnStart): stop cancels silently
        const b = makeEngine(clock);
        b.engine.ingestConfig('b', { durationSec: 10, targetDp: 'x.y', valueOnEnd: 'true' });
        await b.engine.command('b', 'start');
        await b.engine.command('b', 'stop');
        assert.deepStrictEqual(b.targetLog, []);

        // explicit override wins
        const c = makeEngine(clock);
        c.engine.ingestConfig('c', { durationSec: 10, targetDp: 'x.y', valueOnEnd: 'off', stopWritesEnd: true });
        await c.engine.command('c', 'start');
        await c.engine.command('c', 'stop');
        assert.deepStrictEqual(
            c.targetLog.map((t) => t.raw),
            ['off'],
        );
    }

    // ── end command finishes now ─────────────────────────────────────────────
    {
        const clock = makeClock();
        const { engine, targetLog } = makeEngine(clock);
        engine.ingestConfig('a', CONFIG);
        await engine.command('a', 'start');
        await engine.command('a', 'end');
        assert.strictEqual(engine.snapshot('a').state, 'ended');
        assert.strictEqual(targetLog[targetLog.length - 1].raw, 'false');
        assert.strictEqual(clock.pending(), 0);
        // end while idle does nothing
        await engine.command('a', 'stop');
        const n = targetLog.length;
        await engine.command('a', 'end');
        assert.strictEqual(targetLog.length, n);
    }

    // ── +/- and = in every state ─────────────────────────────────────────────
    {
        const clock = makeClock();
        const { engine } = makeEngine(clock);
        engine.ingestConfig('a', { durationSec: 100 });
        // idle
        await engine.command('a', '+60');
        assert.deepStrictEqual(engine.snapshot('a'), {
            state: 'idle',
            endTs: 0,
            remainingMs: 160_000,
            durationMs: 160_000,
        });
        await engine.command('a', '-1000');
        assert.strictEqual(engine.snapshot('a').durationMs, 1000, 'clamped to 1 s, never 0');
        await engine.command('a', '=5:00');
        assert.strictEqual(engine.snapshot('a').durationMs, 300_000);
        // running
        await engine.command('a', 'start');
        await clock.advance(100_000);
        await engine.command('a', '+60');
        let s = engine.snapshot('a');
        assert.strictEqual(s.remainingMs, 260_000);
        assert.strictEqual(s.durationMs, 360_000);
        assert.strictEqual(clock.pending(), 1);
        await engine.command('a', '-1:00:00');
        assert.strictEqual(engine.snapshot('a').state, 'ended', 'removing more than remains ends it');
        // = while running re-arms
        await engine.command('a', 'start');
        await engine.command('a', '=10');
        s = engine.snapshot('a');
        assert.strictEqual(s.state, 'running');
        assert.strictEqual(s.endTs, clock.now() + 10_000);
        await clock.advance(10_000);
        assert.strictEqual(engine.snapshot('a').state, 'ended');
        // paused
        await engine.command('a', '=100');
        await engine.command('a', 'start');
        await clock.advance(50_000);
        await engine.command('a', 'pause');
        await engine.command('a', '+30');
        s = engine.snapshot('a');
        assert.strictEqual(s.state, 'paused');
        assert.strictEqual(s.remainingMs, 80_000);
        assert.strictEqual(s.durationMs, 130_000);
        await engine.command('a', '-80');
        assert.strictEqual(engine.snapshot('a').state, 'ended', 'paused countdown adjusted to zero ends');
        // ended + adjust → idle with the new setting
        await engine.command('a', '+5');
        s = engine.snapshot('a');
        assert.strictEqual(s.state, 'idle');
        assert.strictEqual(s.remainingMs, s.durationMs);
    }

    // ── unknown command / no duration ────────────────────────────────────────
    {
        const clock = makeClock();
        const { engine, warnings } = makeEngine(clock);
        engine.ingestConfig('a', { targetDp: 'x' });
        assert.strictEqual(await engine.command('a', 'fly'), false);
        assert.strictEqual(await engine.command('a', 'start'), true);
        assert.strictEqual(engine.snapshot('a').state, 'idle', 'start without a duration is ignored');
        assert.ok(warnings.some((w) => /no duration/.test(w)));
        // = gives it a duration, then start works
        await engine.command('a', '=30');
        await engine.command('a', 'start');
        assert.strictEqual(engine.snapshot('a').state, 'running');
    }

    // ── restore: running survives a restart, elapsed is caught up ───────────
    {
        const clock = makeClock();
        const { engine, targetLog, statusLog } = makeEngine(clock);
        // What the adapter finds on disk after a restart:
        engine.ingestConfig('run', CONFIG);
        engine.ingestStatus('run', {
            state: 'running',
            endTs: clock.now() + 60_000,
            remainingMs: 0,
            durationMs: 3_600_000,
        });
        engine.ingestConfig('late', CONFIG);
        engine.ingestStatus('late', { state: 'running', endTs: clock.now() - 5_000, durationMs: 3_600_000 });
        engine.ingestConfig('pau', { durationSec: 100 });
        engine.ingestStatus('pau', { state: 'paused', endTs: 0, remainingMs: 42_000, durationMs: 100_000 });
        engine.ingestConfig('idle', { durationSec: 100 });
        statusLog.length = 0;
        await engine.restore();
        assert.strictEqual(engine.snapshot('run').state, 'running');
        assert.strictEqual(clock.pending(), 1, 'the running one is re-armed');
        assert.strictEqual(engine.snapshot('late').state, 'ended');
        assert.deepStrictEqual(targetLog, [
            { dp: 'hue.0.lamp.on', raw: 'false', why: 'late ended while the adapter was down' },
        ]);
        assert.strictEqual(engine.snapshot('pau').remainingMs, 42_000);
        assert.strictEqual(engine.snapshot('idle').remainingMs, 100_000);
        assert.strictEqual(statusLog.filter((s) => s.state).length, 4, 'every entry published once');
        await clock.advance(60_000);
        assert.strictEqual(engine.snapshot('run').state, 'ended');
        assert.strictEqual(targetLog.length, 2);
    }

    // ── publishRemaining ticker: once a second while running only ────────────
    {
        const clock = makeClock();
        const { engine, statusLog } = makeEngine(clock);
        engine.ingestConfig('a', { durationSec: 5, publishRemaining: true });
        await engine.command('a', 'start');
        statusLog.length = 0;
        await clock.advance(3_000);
        const ticks = statusLog.filter((s) => s.state === undefined);
        assert.deepStrictEqual(
            ticks.map((t) => t.remainingMs),
            [4000, 3000, 2000],
        );
        await engine.command('a', 'pause');
        statusLog.length = 0;
        await clock.advance(5_000);
        assert.strictEqual(statusLog.filter((s) => s.state === undefined).length, 0, 'no ticks while paused');
        await engine.command('a', 'resume');
        await clock.advance(10_000);
        assert.strictEqual(engine.snapshot('a').state, 'ended');
        assert.strictEqual(clock.pending(), 0, 'ticker stopped with the countdown');
        // turning the option off mid-run stops the ticker
        await engine.command('a', 'start');
        engine.ingestConfig('a', { durationSec: 5, publishRemaining: false });
        statusLog.length = 0;
        await clock.advance(2_000);
        assert.strictEqual(statusLog.filter((s) => s.state === undefined).length, 0);
    }

    // ── remove / dispose clear timers ────────────────────────────────────────
    {
        const clock = makeClock();
        const { engine } = makeEngine(clock);
        engine.ingestConfig('a', { durationSec: 100, publishRemaining: true });
        engine.ingestConfig('b', { durationSec: 100 });
        await engine.command('a', 'start');
        await engine.command('b', 'start');
        assert.strictEqual(clock.pending(), 3);
        engine.remove('a');
        assert.strictEqual(clock.pending(), 1);
        assert.strictEqual(engine.has('a'), false);
        engine.dispose();
        assert.strictEqual(clock.pending(), 0);
    }

    // ── long countdowns are armed in chunks and still end on time ────────────
    {
        const clock = makeClock();
        const { engine } = makeEngine(clock);
        const thirtyDays = 30 * 24 * 3600;
        engine.ingestConfig('a', { durationSec: thirtyDays });
        await engine.command('a', 'start');
        await clock.advance(thirtyDays * 1000 - 1);
        assert.strictEqual(engine.snapshot('a').state, 'running');
        await clock.advance(1);
        assert.strictEqual(engine.snapshot('a').state, 'ended');
    }

    console.log('countdowns.test.js: all assertions passed');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
