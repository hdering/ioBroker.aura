import type { ConditionClause, ConditionOperator } from '../types';
import { evaluateClause } from './conditionEval';
import { combineClauseHits } from './clauseLogic';
import { substituteItemVars } from './nameFilter';
import { dpTokenRefs, dpValueText, replaceDpTokens } from './dpTokens';
import { splitDpRef, resolveDpValue } from './dpRef';
import { SPEECH_TEXT_MAX } from './speech';

/**
 * Announcements without a script (issue #834, phase 4) — the pure part.
 *
 * A rule is "datapoint + condition → text → devices", like a popup trigger, but
 * evaluated by the adapter rather than by each open dashboard: a lock such as
 * "at most once a day" has to hold across all devices, and an announcement must
 * not depend on which dashboards happen to be open when the doorbell rings.
 * The adapter (lib/announcements.js) gets these functions through
 * lib/shared/auraShared.js; Admin → Ansagen uses them for the editor and preview.
 *
 * Text tokens, resolved once when the rule fires:
 *   {{value}}             value of the first condition's datapoint
 *   {{dp}} {{name}} …     the variables of that datapoint id (popupPlaceholders)
 *   [[id]]                value of any datapoint, also [[{{parent}}.TEMP]]
 */

export interface AnnouncementRule {
    id: string;
    name: string;
    enabled: boolean;
    /** First condition. Its datapoint is the trigger: `{{value}}`, `{{dp}}` & co. */
    clause: ConditionClause;
    /** Further conditions, joined like widget conditions (AND binds tighter than OR). */
    extraClauses?: ConditionClause[];
    /**
     * `edge` (default): speak when the conditions turn from unmet to met.
     * `update`: speak on every new value of the trigger datapoint while they are
     * met — a doorbell that reports `true` on every press without going back.
     */
    mode?: 'edge' | 'update';
    /** Text to speak, or a sound file (path or URL) to play. */
    text: string;
    /** Devices (aura.0.clients.<id>) that speak it. Empty = every device. */
    clientIds?: string[];
    /** 0..100. Absent = the device's speech.volume. */
    volume?: number;
    voice?: string;
    /** Stop what is playing and drop the queue first. */
    interrupt?: boolean;
    /** Only devices with the display on. */
    onlyVisible?: boolean;
    /** Time window `HH:MM`, both set or both empty. `from > to` spans midnight. */
    timeFrom?: string;
    timeTo?: string;
    /** Weekdays it may speak on, 0 = Sunday. Empty/absent = every day. */
    days?: number[];
    /** At most once per this many minutes. 0/absent = no limit. */
    cooldownMin?: number;
    /** At most once per calendar day. */
    oncePerDay?: boolean;
    /**
     * Client id of the device that created the rule in the Ansagen widget (#918).
     * Such a rule may only be changed from that device; Admin → Ansagen can take
     * it over (drop the owner). Absent = an admin rule.
     */
    owner?: string;
}

export interface AnnouncementConfig {
    rules: AnnouncementRule[];
}

const OPERATORS: ConditionOperator[] = [
    '==',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'true',
    'false',
    'active',
    'inactive',
    'contains',
    'changed',
];

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function str(v: unknown, max = 256): string {
    return typeof v === 'string' ? v.slice(0, max) : '';
}

function normClause(raw: unknown): ConditionClause | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    const operator = OPERATORS.includes(c.operator as ConditionOperator) ? (c.operator as ConditionOperator) : '==';
    const out: ConditionClause = {
        datapoint: str(c.datapoint, 512).trim(),
        operator,
        value: c.value === undefined || c.value === null ? '' : String(c.value).slice(0, 512),
    };
    if (c.valueType === 'datapoint') out.valueType = 'datapoint';
    if (c.join === 'AND' || c.join === 'OR') out.join = c.join;
    if (c.bracket === 'open' || c.bracket === 'in') out.bracket = c.bracket;
    return out;
}

function normTime(v: unknown): string | undefined {
    const m = typeof v === 'string' ? HHMM.exec(v.trim()) : null;
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

/** One stored rule, normalized. null for something that is not a rule at all. */
export function normalizeAnnouncementRule(raw: unknown): AnnouncementRule | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 64).trim();
    if (!id) return null;
    const clause = normClause(r.clause) ?? { datapoint: '', operator: '==', value: '' };
    const rule: AnnouncementRule = {
        id,
        name: str(r.name, 128),
        enabled: r.enabled !== false,
        clause,
        text: str(r.text, SPEECH_TEXT_MAX),
    };
    const extra = Array.isArray(r.extraClauses)
        ? r.extraClauses.map(normClause).filter((c): c is ConditionClause => !!c)
        : [];
    if (extra.length) rule.extraClauses = extra;
    if (r.mode === 'update') rule.mode = 'update';
    const clients = Array.isArray(r.clientIds) ? r.clientIds.map((c) => str(c, 128).trim()).filter(Boolean) : [];
    if (clients.length) rule.clientIds = [...new Set(clients)];
    const volume = Number(r.volume);
    if (r.volume !== undefined && r.volume !== null && r.volume !== '' && Number.isFinite(volume)) {
        rule.volume = Math.round(Math.max(0, Math.min(100, volume)));
    }
    const voice = str(r.voice, 128).trim();
    if (voice) rule.voice = voice;
    if (r.interrupt === true) rule.interrupt = true;
    if (r.onlyVisible === true) rule.onlyVisible = true;
    const from = normTime(r.timeFrom);
    const to = normTime(r.timeTo);
    if (from && to) {
        rule.timeFrom = from;
        rule.timeTo = to;
    }
    const days = Array.isArray(r.days)
        ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
        : [];
    if (days.length && days.length < 7) rule.days = days;
    const cooldown = Number(r.cooldownMin);
    if (Number.isFinite(cooldown) && cooldown > 0) rule.cooldownMin = Math.round(cooldown);
    if (r.oncePerDay === true) rule.oncePerDay = true;
    const owner = cleanClientId(r.owner);
    if (owner) rule.owner = owner;
    return rule;
}

/** A client id as the adapter names devices (sanitizeClientId), '' for anything else. */
function cleanClientId(v: unknown): string {
    return typeof v === 'string' && /^[a-z0-9_-]{1,40}$/.test(v.trim()) ? v.trim() : '';
}

/** The value of `config.announcements`, normalized. Broken or empty = no rules. */
export function parseAnnouncementConfig(raw: unknown): AnnouncementConfig {
    let p: unknown = raw;
    if (typeof raw === 'string') {
        if (!raw.trim()) return { rules: [] };
        try {
            p = JSON.parse(raw);
        } catch {
            return { rules: [] };
        }
    }
    const list =
        p && typeof p === 'object' && Array.isArray((p as AnnouncementConfig).rules)
            ? (p as AnnouncementConfig).rules
            : [];
    const seen = new Set<string>();
    const rules: AnnouncementRule[] = [];
    for (const r of list) {
        const rule = normalizeAnnouncementRule(r);
        if (!rule || seen.has(rule.id)) continue;
        seen.add(rule.id);
        rules.push(rule);
    }
    return { rules };
}

/** All conditions in evaluation order, `clause` first. */
export function announcementClauses(rule: Pick<AnnouncementRule, 'clause' | 'extraClauses'>): ConditionClause[] {
    return rule.extraClauses?.length ? [rule.clause, ...rule.extraClauses] : [rule.clause];
}

/** A rule the adapter can run: switched on, with a trigger datapoint and something to say. */
export function announcementRunnable(rule: AnnouncementRule): boolean {
    return rule.enabled && !!rule.clause.datapoint && !!rule.text.trim();
}

/** Datapoints whose values the conditions read. */
export function announcementDps(rule: AnnouncementRule): string[] {
    const dps = new Set<string>();
    for (const c of announcementClauses(rule)) {
        if (c.datapoint) dps.add(c.datapoint);
        if (c.valueType === 'datapoint' && c.value) dps.add(c.value);
    }
    return [...dps];
}

/**
 * The conditions against the latest values. A further condition without a
 * datapoint is half-configured and left out, as in the popup triggers.
 * `changed` holds for the datapoint whose new value is being evaluated.
 */
export function announcementMatches(rule: AnnouncementRule, values: Map<string, unknown>, changed?: string): boolean {
    const clauses = announcementClauses(rule).filter((c, i) => i === 0 || c.datapoint);
    const hits = clauses.map((c) =>
        c.operator === 'changed'
            ? !!changed && c.datapoint === changed
            : evaluateClause(c, values.get(c.datapoint) ?? null, values),
    );
    return combineClauseHits(clauses, hits, 'AND');
}

function minutesOf(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/** Inside the rule's weekdays and time window (local time). No window = always. */
export function announcementInWindow(rule: AnnouncementRule, at: Date): boolean {
    if (rule.days?.length && !rule.days.includes(at.getDay())) return false;
    if (!rule.timeFrom || !rule.timeTo) return true;
    const now = at.getHours() * 60 + at.getMinutes();
    const from = minutesOf(rule.timeFrom);
    const to = minutesOf(rule.timeTo);
    if (from === to) return true;
    // `to` is inclusive of its whole minute: 06:00–09:00 still speaks at 09:00:59.
    return from < to ? now >= from && now <= to : now >= from || now <= to;
}

function sameLocalDay(a: number, b: number): boolean {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** The lock: may the rule speak now, given when it last spoke? */
export function announcementLockAllows(rule: AnnouncementRule, lastFired: number | undefined, now: number): boolean {
    if (!lastFired) return true;
    if (rule.oncePerDay && sameLocalDay(lastFired, now)) return false;
    if (rule.cooldownMin && now - lastFired < rule.cooldownMin * 60_000) return false;
    return true;
}

/**
 * The text with the trigger's variables put in, `[[…]]` still open. `{{value}}`
 * becomes a `[[dp]]` token, so it is read the same way as any other value.
 */
export function announcementTextTemplate(rule: Pick<AnnouncementRule, 'text' | 'clause'>): string {
    const dp = rule.clause.datapoint;
    const withValue = dp ? rule.text.replace(/\{\{value\}\}/gi, `[[${dp}]]`) : rule.text;
    return dp ? substituteItemVars(withValue, dp) : withValue;
}

/** Datapoint ids the text reads, for fetching their values before rendering. */
export function announcementTextDps(template: string): string[] {
    return [
        ...new Set(
            dpTokenRefs(template)
                .map((ref) => splitDpRef(ref).id)
                .filter(Boolean),
        ),
    ];
}

/**
 * The spoken text. A value that cannot be read becomes nothing rather than a
 * spoken "[[hm-rpc.0…]]".
 */
export function renderAnnouncementText(template: string, values: Map<string, unknown>): string {
    return replaceDpTokens(template, (ref) => {
        const { id, path } = splitDpRef(ref);
        return dpValueText(resolveDpValue(values.get(id) ?? null, path));
    });
}

/** What goes to `speech.say` (see parseSpeechPayload). */
export function announcementPayload(rule: AnnouncementRule, text: string): Record<string, unknown> {
    const p: Record<string, unknown> = { text };
    if (rule.volume !== undefined) p.volume = rule.volume;
    if (rule.voice) p.voice = rule.voice;
    if (rule.interrupt) p.interrupt = true;
    if (rule.onlyVisible) p.onlyVisible = true;
    if (rule.clientIds?.length) p.target = { clients: rule.clientIds };
    return p;
}

/** How many rules one device may own — the widget is for a handful, not for bulk. */
export const ANNOUNCEMENT_MAX_PER_DEVICE = 50;

/** What the Ansagen widget asks the adapter to do (sendTo `announcementEdit`). */
export type AnnouncementClientEdit =
    | { op: 'upsert'; rule: unknown }
    | { op: 'delete'; id: string }
    | { op: 'toggle'; id: string; enabled: boolean };

export interface AnnouncementClientEditResult {
    config: AnnouncementConfig;
    /** `forbidden` = not this device's rule, `limit` = too many rules, `invalid` = not a rule. */
    error?: 'forbidden' | 'limit' | 'invalid' | 'notFound';
    rule?: AnnouncementRule;
}

/**
 * An edit from a dashboard (#918), applied to the stored rules. A device only
 * touches the rules it owns; a new rule becomes its own and, without devices of
 * its own, speaks on that device only — "all devices" stays an admin decision.
 * The adapter applies this; the widget never writes `config.announcements` itself.
 */
export function applyAnnouncementClientEdit(
    config: AnnouncementConfig,
    clientId: string,
    edit: AnnouncementClientEdit,
): AnnouncementClientEditResult {
    const owner = cleanClientId(clientId);
    if (!owner || !edit || typeof edit !== 'object') return { config, error: 'invalid' };
    const rules = config.rules;
    if (edit.op === 'delete' || edit.op === 'toggle') {
        const cur = rules.find((r) => r.id === edit.id);
        if (!cur) return { config, error: 'notFound' };
        if (cur.owner !== owner) return { config, error: 'forbidden' };
        if (edit.op === 'delete') return { config: { ...config, rules: rules.filter((r) => r.id !== edit.id) } };
        const rule = { ...cur, enabled: edit.enabled === true };
        return { config: { ...config, rules: rules.map((r) => (r.id === rule.id ? rule : r)) }, rule };
    }
    if (edit.op !== 'upsert') return { config, error: 'invalid' };
    const next = normalizeAnnouncementRule(edit.rule);
    if (!next) return { config, error: 'invalid' };
    const cur = rules.find((r) => r.id === next.id);
    if (cur && cur.owner !== owner) return { config, error: 'forbidden' };
    if (!cur && rules.filter((r) => r.owner === owner).length >= ANNOUNCEMENT_MAX_PER_DEVICE) {
        return { config, error: 'limit' };
    }
    const rule: AnnouncementRule = { ...next, owner, clientIds: next.clientIds?.length ? next.clientIds : [owner] };
    return {
        config: { ...config, rules: cur ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule] },
        rule,
    };
}

/**
 * Admin → Ansagen saves its whole list, while a dashboard may have added or
 * changed a rule since the page loaded. Three-way merge per rule id: what the
 * admin changed (or deleted) since `base` wins, everything else is taken from
 * `theirs` — the rules as stored right now. Order: the admin's, then new ones.
 */
export function mergeAnnouncementConfig(
    base: AnnouncementConfig,
    mine: AnnouncementConfig,
    theirs: AnnouncementConfig,
): AnnouncementConfig {
    const key = (r: AnnouncementRule | undefined) => (r ? JSON.stringify(r) : '');
    const baseById = new Map(base.rules.map((r) => [r.id, r]));
    const mineById = new Map(mine.rules.map((r) => [r.id, r]));
    const theirsById = new Map(theirs.rules.map((r) => [r.id, r]));
    const out: AnnouncementRule[] = [];
    for (const r of mine.rules) {
        const b = baseById.get(r.id);
        const t = theirsById.get(r.id);
        if (b && key(b) === key(r)) {
            // untouched here: whatever is stored now, or gone when a device deleted it
            if (t) out.push(t);
        } else {
            out.push(r);
        }
    }
    for (const r of theirs.rules) {
        if (mineById.has(r.id)) continue;
        // deleted here (it was in base) — stays deleted unless a device changed it since
        const b = baseById.get(r.id);
        if (b && key(b) === key(r)) continue;
        out.push(r);
    }
    return { rules: out };
}
