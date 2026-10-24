'use strict';

/**
 * Scenes widget backend (issue #825).
 *
 * Aura has no scene engine of its own: scenes are plain objects of the ioBroker
 * scenes adapter (`scene.0.*`, engine `system.adapter.scenes.N`). Aura is only the
 * surface — it creates, learns and deletes scenes in its own folder
 * `scene.0.aura.*` and triggers any scene by writing `true` to it (frontend).
 *
 * Facts about the scenes adapter (v5.1, checked against its source):
 *   - Every scene lives under `scene.0.`, whatever the adapter instance; the
 *     instance that runs it is picked by `common.engine`.
 *   - It subscribes to `scene.*` objects and restarts itself on every change, so a
 *     written object is live without any restart from our side.
 *   - Scenes without members are ignored; a member value of null becomes false.
 *
 * Rules enforced here (the frontend is not trusted):
 *   - Only `scene.0.aura.<slug>` is written or deleted.
 *   - Every member must be in the device list of the Aura instance config.
 *   - With a scenes PIN configured, every write needs it (rate-limited).
 */

const crypto = require('crypto');

const SCENE_ROOT = 'scene.0.aura';
const OWN_ID_RE = /^scene\.0\.aura\.[A-Za-z0-9_-]+$/;
const MAX_NAME = 80;
const SCENE_COMMANDS = new Set(['sceneStatus', 'listScenes', 'saveScene', 'learnScene', 'deleteScene']);

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** 'system.adapter.scenes.1' | 'scenes.1' | '' → 'scenes.1' (default 'scenes.0'). */
function normalizeInstance(v) {
    const s = String(v || '')
        .trim()
        .replace(/^system\.adapter\./, '');
    return /^scenes\.\d+$/.test(s) ? s : 'scenes.0';
}

/** Device table rows from the instance config → [{ id, label }], invalid and duplicate rows dropped. */
function normalizeDevices(rows) {
    const out = [];
    const seen = new Set();
    for (const r of Array.isArray(rows) ? rows : []) {
        const id = String((r && r.id) || '').trim();
        if (!id || seen.has(id) || /[*\s]/.test(id)) {
            continue;
        }
        seen.add(id);
        out.push({ id, label: String((r && r.label) || '').trim() });
    }
    return out;
}

function nameText(name, lang = 'de') {
    if (typeof name === 'string') {
        return name;
    }
    if (name && typeof name === 'object') {
        return name[lang] || name.en || Object.values(name).find((v) => typeof v === 'string') || '';
    }
    return '';
}

/** Scene name → id segment the scenes admin would accept too (letters, digits, _ and -). */
function slugify(name) {
    const s = String(name || '')
        .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c])
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return s.slice(0, 50) || 'szene';
}

/** First free `scene.0.aura.<slug>` (then `_2`, `_3`, …). */
function uniqueSceneId(name, existingIds) {
    const taken = new Set(existingIds);
    const base = `${SCENE_ROOT}.${slugify(name)}`;
    if (!taken.has(base)) {
        return base;
    }
    for (let i = 2; ; i++) {
        if (!taken.has(`${base}_${i}`)) {
            return `${base}_${i}`;
        }
    }
}

function isOwnSceneId(id) {
    return typeof id === 'string' && OWN_ID_RE.test(id);
}

function isSceneObject(obj) {
    return !!obj && obj.type === 'state' && (obj.common?.role === 'scene.state' || Array.isArray(obj.native?.members));
}

function newMember(id) {
    return { id, setIfTrue: null, setIfFalse: null, stopAllDelays: true, desc: null, disabled: false, delay: 0 };
}

/** Keep stored members (values, delays) for ids still wanted, append new ones in the given order. */
function mergeMembers(oldMembers, ids) {
    const byId = new Map();
    for (const m of Array.isArray(oldMembers) ? oldMembers : []) {
        if (m && typeof m.id === 'string') {
            byId.set(m.id, m);
        }
    }
    return ids.map((id) => byId.get(id) || newMember(id));
}

/** The object the scenes admin itself writes for a new scene. */
function buildSceneObject({ id, name, instance, members }) {
    return {
        _id: id,
        type: 'state',
        common: {
            name,
            type: 'mixed',
            role: 'scene.state',
            desc: 'Aura',
            enabled: true,
            read: true,
            write: true,
            def: false,
            engine: `system.adapter.${instance}`,
        },
        native: {
            onTrue: { trigger: {}, cron: null, astro: null },
            onFalse: { enabled: false, trigger: {}, cron: null, astro: null },
            easy: true,
            members,
        },
    };
}

/**
 * Check a save request. Returns { name, ids } or { error }.
 * `allowed` is the Set of device ids from the instance config.
 */
function validateSave(message, allowed) {
    const name = String(message?.name ?? '').trim();
    if (!name) {
        return { error: 'name missing' };
    }
    if (name.length > MAX_NAME) {
        return { error: 'name too long' };
    }
    const raw = Array.isArray(message?.members) ? message.members : [];
    const ids = [];
    for (const m of raw) {
        const id = typeof m === 'string' ? m : m?.id;
        if (typeof id !== 'string' || !id) {
            return { error: 'invalid member' };
        }
        if (!allowed.has(id)) {
            return { error: `device not allowed: ${id}` };
        }
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }
    if (!ids.length) {
        return { error: 'no devices' };
    }
    return { name, ids };
}

/** What the widget gets per scene. Members (and their stored values) only for Aura's own scenes. */
function sceneSummary(obj, lang) {
    const own = isOwnSceneId(obj._id);
    const members = Array.isArray(obj.native?.members) ? obj.native.members : [];
    const out = {
        id: obj._id,
        name: nameText(obj.common?.name, lang) || obj._id.split('.').pop(),
        own,
        enabled: obj.common?.enabled !== false,
        memberCount: members.length,
    };
    if (own) {
        out.members = members.filter((m) => m && m.id).map((m) => ({ id: m.id, value: m.setIfTrue ?? null }));
    }
    return out;
}

/**
 * PIN check with a simple lock-out: 5 free attempts, then 30 s, 60 s, 120 s … (max 15 min).
 * `now` is injectable for tests.
 */
function createPinGuard(now = () => Date.now()) {
    let fails = 0;
    let lockedUntil = 0;
    return {
        check(given, expected) {
            if (!expected) {
                return { ok: true };
            }
            const t = now();
            if (t < lockedUntil) {
                return { ok: false, error: 'locked', retryAfter: Math.ceil((lockedUntil - t) / 1000) };
            }
            const a = crypto
                .createHash('sha256')
                .update(String(given ?? ''))
                .digest();
            const b = crypto.createHash('sha256').update(String(expected)).digest();
            if (crypto.timingSafeEqual(a, b)) {
                fails = 0;
                return { ok: true };
            }
            fails++;
            if (fails >= 5) {
                lockedUntil = t + Math.min(15 * 60, 30 * 2 ** (fails - 5)) * 1000;
            }
            return { ok: false, error: 'pin' };
        },
    };
}

/**
 * The sendTo commands of the scenes widget. `adapter` needs config, log and the
 * foreign object/state calls — a fake one is enough for tests.
 *
 *   sceneStatus  → { ok, instance, installed, running, pinRequired, devices:[{id,name,label,type,unit}] }
 *   listScenes   → { ok, scenes:[sceneSummary] }
 *   saveScene    { id?, name, members:[id], pin? } → { ok, id, missing:[id] }
 *   learnScene   { id, pin? } → { ok, missing:[id] }
 *   deleteScene  { id, pin? } → { ok }
 */
function createSceneService(adapter, opts = {}) {
    const guard = opts.guard || createPinGuard();
    const lang = () => (typeof opts.lang === 'function' ? opts.lang() : opts.lang) || 'de';
    const cfg = () => adapter.config || {};
    const instance = () => normalizeInstance(cfg().scenesInstance);
    const devices = () => normalizeDevices(cfg().sceneDevices);
    const pin = () => String(cfg().scenesPin || '');

    async function readVal(id) {
        try {
            const st = await adapter.getForeignStateAsync(id);
            return st ? st.val : undefined;
        } catch {
            return undefined;
        }
    }

    /** Store the current device values as the scene's "on" values; returns the ids without a value. */
    async function learn(members, onlyMissing) {
        const missing = [];
        for (const m of members) {
            if (onlyMissing && m.setIfTrue !== null && m.setIfTrue !== undefined) {
                continue;
            }
            const v = await readVal(m.id);
            if (v === undefined || v === null) {
                missing.push(m.id);
            } else {
                m.setIfTrue = v;
            }
        }
        return missing;
    }

    async function ownScene(id) {
        if (!isOwnSceneId(id)) {
            return { error: 'not an Aura scene' };
        }
        const obj = await adapter.getForeignObjectAsync(id);
        if (!obj) {
            return { error: 'scene not found' };
        }
        return { obj };
    }

    async function write(obj) {
        const o = { ...obj };
        delete o.ts;
        await adapter.setForeignObjectAsync(o._id, o);
    }

    const handlers = {
        async sceneStatus() {
            const inst = instance();
            const instObj = await adapter.getForeignObjectAsync(`system.adapter.${inst}`).catch(() => null);
            const alive = instObj ? await readVal(`system.adapter.${inst}.alive`) : false;
            const list = [];
            for (const d of devices()) {
                const obj = await adapter.getForeignObjectAsync(d.id).catch(() => null);
                list.push({
                    id: d.id,
                    label: d.label,
                    name: d.label || nameText(obj?.common?.name, lang()) || d.id,
                    type: obj?.common?.type || '',
                    unit: obj?.common?.unit || '',
                    missing: !obj,
                });
            }
            return {
                ok: true,
                instance: inst,
                installed: !!instObj,
                running: alive === true,
                pinRequired: !!pin(),
                devices: list,
            };
        },

        async listScenes() {
            const objs = (await adapter.getForeignObjectsAsync('scene.*', 'state')) || {};
            const scenes = Object.values(objs)
                .filter(isSceneObject)
                .map((o) => sceneSummary(o, lang()))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            return { ok: true, scenes };
        },

        async saveScene(msg) {
            const v = validateSave(msg, new Set(devices().map((d) => d.id)));
            if (v.error) {
                return { ok: false, error: v.error };
            }
            if (msg.id) {
                const r = await ownScene(msg.id);
                if (r.error) {
                    return { ok: false, error: r.error };
                }
                const obj = r.obj;
                const members = mergeMembers(obj.native?.members, v.ids);
                const missing = await learn(members, true);
                obj.common = { ...obj.common, name: v.name };
                obj.native = { ...obj.native, members };
                await write(obj);
                adapter.log.info(`[scenes] updated ${obj._id} (${members.length} devices)`);
                return { ok: true, id: obj._id, missing };
            }
            const existing = Object.keys((await adapter.getForeignObjectsAsync(`${SCENE_ROOT}.*`, 'state')) || {});
            const id = uniqueSceneId(v.name, existing);
            const members = mergeMembers([], v.ids);
            const missing = await learn(members, false);
            await write(buildSceneObject({ id, name: v.name, instance: instance(), members }));
            adapter.log.info(`[scenes] created ${id} (${members.length} devices)`);
            return { ok: true, id, missing };
        },

        async learnScene(msg) {
            const r = await ownScene(msg.id);
            if (r.error) {
                return { ok: false, error: r.error };
            }
            const members = Array.isArray(r.obj.native?.members) ? r.obj.native.members : [];
            const missing = await learn(members, false);
            r.obj.native = { ...r.obj.native, members };
            await write(r.obj);
            adapter.log.info(`[scenes] learned ${r.obj._id}`);
            return { ok: true, missing };
        },

        async deleteScene(msg) {
            const r = await ownScene(msg.id);
            if (r.error) {
                return { ok: false, error: r.error };
            }
            await adapter.delForeignObjectAsync(r.obj._id);
            adapter.log.info(`[scenes] deleted ${r.obj._id}`);
            return { ok: true };
        },
    };

    const WRITES = new Set(['saveScene', 'learnScene', 'deleteScene']);

    return {
        /** Reply for one of SCENE_COMMANDS. */
        async handle(command, message) {
            const h = handlers[command];
            if (!h) {
                return { ok: false, error: `unknown command: ${command}` };
            }
            const msg = message && typeof message === 'object' ? message : {};
            if (WRITES.has(command)) {
                const g = guard.check(msg.pin, pin());
                if (!g.ok) {
                    return { ok: false, error: g.error, retryAfter: g.retryAfter };
                }
            }
            try {
                return await h(msg);
            } catch (e) {
                adapter.log.warn(`[scenes] ${command} failed: ${e?.message || e}`);
                return { ok: false, error: e?.message || String(e) };
            }
        },
    };
}

module.exports = {
    SCENE_ROOT,
    SCENE_COMMANDS,
    normalizeInstance,
    normalizeDevices,
    slugify,
    uniqueSceneId,
    isOwnSceneId,
    mergeMembers,
    buildSceneObject,
    validateSave,
    sceneSummary,
    createPinGuard,
    createSceneService,
};
