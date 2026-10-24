'use strict';

/**
 * Scenes widget backend (issue #825).
 *
 * Aura has no scene engine of its own: scenes are plain objects of the ioBroker
 * scenes adapter (`scene.0.*`, engine `system.adapter.scenes.N`). Aura is only the
 * surface — it creates, edits and deletes scenes in its own folder
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
 *   - A member must be an existing, writable state outside `system.*` and `scene.*`
 *     (no scene may switch adapters or other scenes). Who may edit at all is the
 *     dashboard's business: widget option `allowEdit`, section/tab PIN.
 *   - Member values are coerced to the state's `common.type`.
 */

const SCENE_ROOT = 'scene.0.aura';
const OWN_ID_RE = /^scene\.0\.aura\.[A-Za-z0-9_-]+$/;
const MAX_NAME = 80;
const MAX_MEMBERS = 100;
const SCENE_COMMANDS = new Set(['sceneStatus', 'listScenes', 'sceneDevices', 'saveScene', 'deleteScene']);

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

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

/** Why a datapoint cannot be a scene member, or null when it can. */
function memberProblem(id, obj) {
    if (typeof id !== 'string' || !id || /[*\s]/.test(id)) {
        return 'invalid';
    }
    if (id.startsWith('system.') || id.startsWith('scene.')) {
        return 'forbidden';
    }
    if (!obj) {
        return 'missing';
    }
    if (obj.type !== 'state') {
        return 'no state';
    }
    if (obj.common?.write === false) {
        return 'read-only';
    }
    return null;
}

/**
 * A member value as the state wants it. undefined = no usable value (learn it).
 * Strings from text inputs are parsed for number/boolean states.
 */
function coerceValue(v, type) {
    if (v === undefined || v === null || v === '') {
        return undefined;
    }
    if (type === 'number') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
    }
    if (type === 'boolean') {
        if (typeof v === 'boolean') {
            return v;
        }
        const s = String(v).trim().toLowerCase();
        if (['true', '1', 'on', 'an'].includes(s)) {
            return true;
        }
        if (['false', '0', 'off', 'aus'].includes(s)) {
            return false;
        }
        return undefined;
    }
    if (type === 'string') {
        return String(v);
    }
    return typeof v === 'object' ? undefined : v;
}

function newMember(id) {
    return { id, setIfTrue: null, setIfFalse: null, stopAllDelays: true, desc: null, disabled: false, delay: 0 };
}

/** Keep stored members (delays, setIfFalse, …) for ids still wanted, append new ones in the given order. */
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
 * Shape check of a save request (no object lookups). Returns { name, members:[{id, value}] } or { error }.
 * A member is an id string or { id, value }; value undefined = learn the current one.
 */
function validateSave(message) {
    const name = String(message?.name ?? '').trim();
    if (!name) {
        return { error: 'name missing' };
    }
    if (name.length > MAX_NAME) {
        return { error: 'name too long' };
    }
    const raw = Array.isArray(message?.members) ? message.members : [];
    const members = [];
    for (const m of raw) {
        const id = typeof m === 'string' ? m : m?.id;
        if (typeof id !== 'string' || !id) {
            return { error: 'invalid member' };
        }
        if (!members.some((x) => x.id === id)) {
            members.push({ id, value: typeof m === 'object' ? m.value : undefined });
        }
    }
    if (!members.length) {
        return { error: 'no devices' };
    }
    if (members.length > MAX_MEMBERS) {
        return { error: 'too many devices' };
    }
    return { name, members };
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

/** 'system.adapter.scenes.3' → 3 (for sorting). */
const instanceNo = (id) => Number(id.split('.').pop()) || 0;

/**
 * The sendTo commands of the scenes widget. `adapter` needs log and the foreign
 * object/state calls — a fake one is enough for tests.
 *
 *   sceneStatus   → { ok, instance, installed, running }
 *   listScenes    → { ok, scenes:[sceneSummary] }
 *   sceneDevices  { ids:[id] } → { ok, devices:[{ id, name, type, unit, min, max, step, states, value, problem }] }
 *   saveScene     { id?, name, members:[{ id, value? }] } → { ok, id, missing:[id] }
 *   deleteScene   { id } → { ok }
 */
function createSceneService(adapter, opts = {}) {
    const lang = () => (typeof opts.lang === 'function' ? opts.lang() : opts.lang) || 'de';

    async function readVal(id) {
        try {
            const st = await adapter.getForeignStateAsync(id);
            return st ? st.val : undefined;
        } catch {
            return undefined;
        }
    }

    async function getObj(id) {
        try {
            return await adapter.getForeignObjectAsync(id);
        } catch {
            return null;
        }
    }

    /** The scenes instance to use: the first running one, else the first installed. */
    async function detectInstance() {
        const objs = (await adapter.getForeignObjectsAsync('system.adapter.scenes.*', 'instance')) || {};
        const ids = Object.keys(objs).sort((a, b) => instanceNo(a) - instanceNo(b));
        for (const id of ids) {
            if ((await readVal(`${id}.alive`)) === true) {
                return { instance: id.replace('system.adapter.', ''), installed: true, running: true };
            }
        }
        return ids.length
            ? { instance: ids[0].replace('system.adapter.', ''), installed: true, running: false }
            : { instance: 'scenes.0', installed: false, running: false };
    }

    async function ownScene(id) {
        if (!isOwnSceneId(id)) {
            return { error: 'not an Aura scene' };
        }
        const obj = await getObj(id);
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

    /**
     * Fill setIfTrue of every member from the request (coerced to the state type);
     * members without a usable value keep their stored one or learn the current value.
     * Returns { missing } or { error } when a member may not be part of a scene.
     */
    async function applyValues(members, wanted) {
        const missing = [];
        for (const m of members) {
            const obj = await getObj(m.id);
            const problem = memberProblem(m.id, obj);
            if (problem) {
                return { error: `${problem}: ${m.id}` };
            }
            const w = wanted.find((x) => x.id === m.id);
            const v = coerceValue(w?.value, obj.common?.type);
            if (v !== undefined) {
                m.setIfTrue = v;
                continue;
            }
            if (m.setIfTrue !== null && m.setIfTrue !== undefined) {
                continue;
            }
            const cur = await readVal(m.id);
            if (cur === undefined || cur === null) {
                missing.push(m.id);
            } else {
                m.setIfTrue = cur;
            }
        }
        return { missing };
    }

    const handlers = {
        async sceneStatus() {
            return { ok: true, ...(await detectInstance()) };
        },

        async listScenes() {
            const objs = (await adapter.getForeignObjectsAsync('scene.*', 'state')) || {};
            const scenes = Object.values(objs)
                .filter(isSceneObject)
                .map((o) => sceneSummary(o, lang()))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            return { ok: true, scenes };
        },

        async sceneDevices(msg) {
            const ids = [...new Set((Array.isArray(msg.ids) ? msg.ids : []).filter((x) => typeof x === 'string'))];
            const devices = [];
            for (const id of ids.slice(0, 300)) {
                const obj = /[*\s]/.test(id) || !id ? null : await getObj(id);
                const c = obj?.common || {};
                const problem = memberProblem(id, obj);
                devices.push({
                    id,
                    name: nameText(c.name, lang()) || id,
                    type: c.type || '',
                    unit: c.unit || '',
                    min: typeof c.min === 'number' ? c.min : undefined,
                    max: typeof c.max === 'number' ? c.max : undefined,
                    step: typeof c.step === 'number' ? c.step : undefined,
                    states: c.states && typeof c.states === 'object' && !Array.isArray(c.states) ? c.states : undefined,
                    value: problem ? undefined : await readVal(id),
                    problem,
                });
            }
            return { ok: true, devices };
        },

        async saveScene(msg) {
            const v = validateSave(msg);
            if (v.error) {
                return { ok: false, error: v.error };
            }
            const ids = v.members.map((m) => m.id);
            if (msg.id) {
                const r = await ownScene(msg.id);
                if (r.error) {
                    return { ok: false, error: r.error };
                }
                const obj = r.obj;
                const members = mergeMembers(obj.native?.members, ids);
                const a = await applyValues(members, v.members);
                if (a.error) {
                    return { ok: false, error: a.error };
                }
                obj.common = { ...obj.common, name: v.name };
                obj.native = { ...obj.native, members };
                await write(obj);
                adapter.log.info(`[scenes] updated ${obj._id} (${members.length} devices)`);
                return { ok: true, id: obj._id, missing: a.missing };
            }
            const st = await detectInstance();
            if (!st.installed) {
                return { ok: false, error: 'scenes adapter not installed' };
            }
            const members = mergeMembers([], ids);
            const a = await applyValues(members, v.members);
            if (a.error) {
                return { ok: false, error: a.error };
            }
            const existing = Object.keys((await adapter.getForeignObjectsAsync(`${SCENE_ROOT}.*`, 'state')) || {});
            const id = uniqueSceneId(v.name, existing);
            await write(buildSceneObject({ id, name: v.name, instance: st.instance, members }));
            adapter.log.info(`[scenes] created ${id} (${members.length} devices)`);
            return { ok: true, id, missing: a.missing };
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

    return {
        /** Reply for one of SCENE_COMMANDS. */
        async handle(command, message) {
            const h = handlers[command];
            if (!h) {
                return { ok: false, error: `unknown command: ${command}` };
            }
            const msg = message && typeof message === 'object' ? message : {};
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
    slugify,
    uniqueSceneId,
    isOwnSceneId,
    memberProblem,
    coerceValue,
    mergeMembers,
    buildSceneObject,
    validateSave,
    sceneSummary,
    createSceneService,
};
