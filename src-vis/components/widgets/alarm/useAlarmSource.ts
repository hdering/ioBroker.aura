/**
 * Alarm widget data sources (#1037): the ioBroker.alarm adapter (fixed paths under
 * a prefix) or freely chosen datapoints. Both deliver the same `AlarmSource`, the
 * widget renders only from that.
 *
 * Options are read in AlarmWidget itself (the schema generator only sees reads of
 * `config.options` there) and handed in as plain values.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { pinVerify } from '../../../utils/pinApi';
import type { AlarmContactDef, AlarmPhase, AlarmStateMapEntry, ioBrokerState } from '../../../types';
import {
    ADAPTER_CODE_PHASE,
    countdownSeconds,
    isSet,
    isTriggeredPhase,
    noticeOf,
    parseLog,
    phaseFromValue,
    pinPayload,
    sameValue,
    typedValue,
    USE_LIST,
    valueText,
    type LogSeparator,
    type ResolvedMode,
} from './alarmModel';

export type PinTarget = { kind: 'mode'; mode: ResolvedMode } | { kind: 'delay' } | { kind: 'disarm' };

export interface AlarmSource {
    phase: AlarmPhase;
    /** Own status text (state map / adapter text); empty = the phase's default text. */
    stateLabel: string;
    triggered: boolean;
    /** Adapter: night rest flag next to the pill. */
    sleep: boolean;
    enableable: boolean;
    activationCountdown: number;
    silentCountdown: number;
    openCircuits: string;
    /** Something to acknowledge; `text` empty = generic text. */
    quitNotice: { text: string; failed: boolean } | null;
    passiveNotice: string;
    wrongPin: boolean;
    /** PIN check failed for another reason than a wrong code (Aura check only). */
    pinError: { kind: 'locked'; retryAfter: number } | { kind: 'unknown' } | { kind: 'unavailable' } | null;
    log: { time: string; text: string }[];
    /** null = no presence datapoint. */
    presence: boolean | null;
    hasDelay: boolean;
    hasPanic: boolean;
    hasQuit: boolean;
    isModeActive(m: ResolvedMode): boolean;
    /** What a press does: run at once, ask for the PIN first, or nothing (adapter: arming an armed system with PIN). */
    plan(target: PinTarget): 'run' | 'pin' | 'skip';
    run(target: PinTarget): void;
    /** Aura check: resolves with the verdict, the PIN entry stays open on a miss. */
    submitPin(target: PinTarget, pin: string): void | Promise<boolean>;
    panic(): void;
    quit(): void;
    togglePresence(): void;
    /** PIN entry stays open while an alarm is triggered. */
    pinWhileTriggered: boolean;
}

/** Subscribe a set of ids; returns the latest value per id. */
function useStates(ids: string[]): Record<string, unknown> {
    const { subscribe, getState } = useIoBroker();
    const [vals, setVals] = useState<Record<string, unknown>>({});
    const key = ids.join('\u0001');
    useEffect(() => {
        setVals({});
        const list = key ? key.split('\u0001').filter(Boolean) : [];
        const cleanups: (() => void)[] = [];
        for (const id of [...new Set(list)]) {
            const apply = (s: ioBrokerState | null) => {
                if (!s) return;
                setVals((prev) => (prev[id] === s.val ? prev : { ...prev, [id]: s.val }));
            };
            cleanups.push(subscribe(id, apply));
            getState(id).then(apply);
        }
        return () => cleanups.forEach((fn) => fn());
    }, [key, subscribe, getState]);
    return vals;
}

/** Re-render once a second while `on` (countdown from an end timestamp). */
function useTicker(on: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!on) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [on]);
    return on ? now : Date.now();
}

// ── adapter ──────────────────────────────────────────────────────────────────

export interface AdapterSettings {
    prefix: string;
    requirePin: boolean;
    requireArmPin: boolean;
    logLines: number;
}

const ADAPTER_DPS = [
    'status.state_list',
    'status.state',
    'status.sleep',
    'status.sharp_inside_activated',
    'status.burglar_alarm',
    'status.silent_alarm',
    'status.siren',
    'status.enableable',
    'status.activation_countdown',
    'status.silent_countdown',
    'info.alarm_circuit_list',
    'info.notification_circuit_list',
    'info.notification_circuit_changes',
    'status.activation_failed',
    'info.wrong_password',
    'info.log_today',
    'presence.on_off',
];

export function useAlarmAdapterSource(s: AdapterSettings, enabled: boolean): AlarmSource {
    const { setState } = useIoBroker();
    const p = s.prefix;
    const ids = useMemo(() => (enabled && p ? ADAPTER_DPS.map((d) => `${p}.${d}`) : []), [enabled, p]);
    const v = useStates(ids);
    const get = (d: string) => v[`${p}.${d}`];

    const code = Number(get('status.state_list') ?? 0);
    const phase = ADAPTER_CODE_PHASE[code] ?? 'off';
    const burglar = get('status.burglar_alarm') === true;
    const silent = get('status.silent_alarm') === true;
    const siren = get('status.siren') === true;
    const sleep = get('status.sleep') === true;
    const sharpInside = get('status.sharp_inside_activated') === true;
    const activationFailed = get('status.activation_failed') === true;
    const notificationChanges = get('info.notification_circuit_changes') === true;
    const notificationList = valueText(get('info.notification_circuit_list'));
    const canQuit = activationFailed || notificationChanges;
    const triggered = burglar || silent || siren;
    const presenceRaw = get('presence.on_off');
    const write = (d: string, val: boolean | number | string) => setState(`${p}.${d}`, val);

    const run = (t: PinTarget) => {
        if (t.kind === 'delay') return write('use.enable_with_delay', true);
        if (t.kind === 'disarm') return write('use.disable', true);
        switch (t.mode.key) {
            case 'off':
                return write('use.disable', true);
            case 'sharp':
                return write('use.list', USE_LIST.sharp);
            case 'inside':
                return write('use.activate_sharp_inside', true);
            case 'night':
                return write('use.activate_nightrest', true);
        }
    };

    return {
        phase,
        stateLabel: '',
        triggered,
        sleep,
        enableable: get('status.enableable') !== false,
        activationCountdown: Number(get('status.activation_countdown') ?? 0) || 0,
        silentCountdown: Number(get('status.silent_countdown') ?? 0) || 0,
        openCircuits: valueText(get('info.alarm_circuit_list')),
        quitNotice: canQuit ? { text: activationFailed ? '' : notificationList, failed: activationFailed } : null,
        passiveNotice: notificationList,
        wrongPin: get('info.wrong_password') === true,
        pinError: null,
        log: parseLog(get('info.log_today'), s.logLines, 'br'),
        presence: presenceRaw === undefined ? false : presenceRaw === true,
        hasDelay: true,
        hasPanic: true,
        hasQuit: true,
        isModeActive: (m) =>
            m.key === 'off'
                ? code === 0
                : m.key === 'sharp'
                  ? code === 1
                  : m.key === 'inside'
                    ? code === 2 || sharpInside
                    : m.key === 'night'
                      ? code === 4 || sleep
                      : false,
        plan: (t) => {
            if (t.kind === 'disarm') return s.requirePin ? 'pin' : 'run';
            if (t.kind === 'delay') return !s.requireArmPin ? 'run' : code !== 1 ? 'pin' : 'skip';
            if (t.mode.key === 'off') return s.requirePin ? 'pin' : 'run';
            // The toggle DPs would disarm an already armed system — never send them then.
            if (t.mode.key === 'sharp') return !s.requireArmPin ? 'run' : code !== 1 ? 'pin' : 'skip';
            // Inside / night rest have no password DP in the adapter.
            return 'run';
        },
        run,
        submitPin: (t, pin) => {
            // A triggered alarm always takes the disarm code, whatever was asked before.
            const kind =
                triggered || t.kind === 'disarm' || (t.kind === 'mode' && t.mode.key === 'off') ? 'disarm' : t.kind;
            const dp =
                kind === 'mode'
                    ? 'use.toggle_password'
                    : kind === 'delay'
                      ? 'use.toggle_with_delay_and_password'
                      : 'use.disable_password';
            write(dp, pin);
        },
        panic: () => write('use.panic', true),
        quit: () => write('use.quit_changes', true),
        togglePresence: () => write('presence.on_off', !(presenceRaw === true)),
        pinWhileTriggered: s.requirePin,
    };
}

// ── manual ───────────────────────────────────────────────────────────────────

export interface ManualSettings {
    stateDp: string;
    stateMap: AlarmStateMapEntry[] | undefined;
    triggeredDp: string;
    sirenDp: string;
    enableableDp: string;
    countdownDp: string;
    countdownUnit: 's' | 'endTs';
    silentCountdownDp: string;
    circuitsDp: string;
    contacts: AlarmContactDef[];
    contactsBlockArm: boolean;
    noticeDp: string;
    quitDp: string;
    quitValue: string;
    delayDp: string;
    delayValue: string;
    panicDp: string;
    panicValue: string;
    presenceDp: string;
    logDp: string;
    logSeparator: LogSeparator;
    logLines: number;
    pinCheck: 'none' | 'dp' | 'aura';
    /** Named PIN of the vault (pinCheck 'aura'). */
    pinCode: string;
    pinDp: string;
    pinPayload: 'json' | 'pin';
    wrongPinDp: string;
    requirePin: boolean;
    requireArmPin: boolean;
    disarmMode: ResolvedMode | undefined;
    /** The visible mode buttons — their own on/off datapoints are subscribed here. */
    modes: ResolvedMode[];
}

export function useAlarmManualSource(s: ManualSettings, enabled: boolean): AlarmSource {
    const { setState } = useIoBroker();
    const contactIds = s.contacts.map((c) => c.dp).filter(Boolean);
    const single = [
        s.stateDp,
        s.triggeredDp,
        s.sirenDp,
        s.enableableDp,
        s.countdownDp,
        s.silentCountdownDp,
        s.circuitsDp,
        s.noticeDp,
        s.presenceDp,
        s.logDp,
        s.pinCheck === 'dp' ? s.wrongPinDp : '',
    ];
    const modeIds = s.modes.map((m) => m.activeDp ?? '');
    const ids = enabled ? [...single, ...contactIds, ...modeIds].filter(Boolean) : [];
    const v = useStates(ids);
    const get = (id: string) => (id ? v[id] : undefined);

    const rawState = get(s.stateDp);
    const isActive = (m: ResolvedMode): boolean => {
        const raw = m.activeDp ? get(m.activeDp) : rawState;
        if (raw === undefined || raw === null || String(raw) === '') return false;
        // "true" also takes 1 / "on" from a boolean-ish datapoint of the mode.
        if (m.activeDp && m.activeWhen === 'true') return isSet(raw);
        return sameValue(raw, m.activeWhen);
    };
    // Without a state datapoint (one boolean per mode) the active button says what is on;
    // an arming mode wins over a lit "Aus".
    const activeMode = s.stateDp
        ? undefined
        : (s.modes.find((m) => !m.disarm && isActive(m)) ?? s.modes.find((m) => isActive(m)));
    const st = s.stateDp
        ? phaseFromValue(rawState, s.stateMap)
        : { phase: activeMode?.phase ?? ('off' as AlarmPhase), label: undefined, known: !!activeMode };
    const triggered =
        isTriggeredPhase(st.phase) ||
        (!!s.triggeredDp && isSet(get(s.triggeredDp))) ||
        (!!s.sirenDp && isSet(get(s.sirenDp)));
    const phase: AlarmPhase = triggered && !isTriggeredPhase(st.phase) ? 'triggered' : st.phase;

    const openContacts = s.contacts.filter((c) => c.dp && isSet(get(c.dp))).map((c) => c.name || c.dp);
    const circuitsText = [valueText(get(s.circuitsDp)).trim(), openContacts.join(', ')].filter(Boolean).join(', ');
    const enableable =
        (!s.enableableDp || get(s.enableableDp) === undefined || isSet(get(s.enableableDp))) &&
        !(s.contactsBlockArm && openContacts.length > 0);

    const cdRaw = get(s.countdownDp);
    const silentRaw = get(s.silentCountdownDp);
    const now = useTicker(enabled && s.countdownUnit === 'endTs' && (Number(cdRaw) > 0 || Number(silentRaw) > 0));
    const notice = s.noticeDp ? noticeOf(get(s.noticeDp)) : { active: false, text: '' };
    const presenceRaw = get(s.presenceDp);
    const pinViaDp = s.pinCheck === 'dp' && !!s.pinDp;
    const pinViaAura = s.pinCheck === 'aura' && !!s.pinCode;
    const pinOn = pinViaDp || pinViaAura;
    const [auraWrong, setAuraWrong] = useState(false);
    const [pinError, setPinError] = useState<AlarmSource['pinError']>(null);

    const writeMode = (m: ResolvedMode) => {
        const dp = m.writeDp || s.stateDp;
        if (dp) setState(dp, typedValue(m.writeValue));
    };
    const targetMode = (t: PinTarget): ResolvedMode | undefined =>
        t.kind === 'mode' ? t.mode : t.kind === 'disarm' ? s.disarmMode : undefined;

    return {
        phase,
        stateLabel: st.label ?? '',
        triggered,
        sleep: false,
        enableable,
        activationCountdown: s.countdownDp ? countdownSeconds(cdRaw, s.countdownUnit, now) : 0,
        silentCountdown: s.silentCountdownDp ? countdownSeconds(silentRaw, s.countdownUnit, now) : 0,
        openCircuits: circuitsText,
        quitNotice: notice.active && s.quitDp ? { text: notice.text, failed: false } : null,
        passiveNotice: notice.active && !s.quitDp ? notice.text : '',
        wrongPin: pinViaAura ? auraWrong : pinViaDp && !!s.wrongPinDp && isSet(get(s.wrongPinDp)),
        pinError: pinViaAura ? pinError : null,
        log: s.logDp ? parseLog(get(s.logDp), s.logLines, s.logSeparator) : [],
        presence: s.presenceDp ? isSet(presenceRaw) : null,
        hasDelay: !!s.delayDp,
        hasPanic: !!s.panicDp,
        hasQuit: !!s.quitDp,
        isModeActive: isActive,
        plan: (t) => {
            if (!pinOn) return 'run';
            if (t.kind === 'delay') return s.requireArmPin ? 'pin' : 'run';
            const m = targetMode(t);
            const disarm = t.kind === 'disarm' || !!m?.disarm;
            const need = m?.requirePin ?? (disarm ? s.requirePin : s.requireArmPin);
            return need ? 'pin' : 'run';
        },
        run: (t) => {
            if (t.kind === 'delay') {
                if (s.delayDp) setState(s.delayDp, typedValue(s.delayValue));
                return;
            }
            const m = targetMode(t);
            if (m) writeMode(m);
        },
        submitPin: (t, pin) => {
            if (!pinOn) return;
            const tt: PinTarget = triggered ? { kind: 'disarm' } : t;
            if (pinViaAura) {
                const run = () => {
                    if (tt.kind === 'delay') {
                        if (s.delayDp) setState(s.delayDp, typedValue(s.delayValue));
                        return;
                    }
                    const m = targetMode(tt);
                    if (m) writeMode(m);
                };
                return pinVerify(s.pinCode, pin).then((r) => {
                    if (r.ok) {
                        setAuraWrong(false);
                        setPinError(null);
                        run();
                        return true;
                    }
                    if (r.reason === 'wrong') {
                        setAuraWrong(true);
                        setPinError(null);
                    } else if (r.reason === 'ratelimited') {
                        setAuraWrong(false);
                        setPinError({ kind: 'locked', retryAfter: r.retryAfter ?? 0 });
                    } else {
                        setAuraWrong(false);
                        setPinError({ kind: r.reason === 'unknown' ? 'unknown' : 'unavailable' });
                    }
                    return false;
                });
            }
            const m = targetMode(tt);
            const action =
                tt.kind === 'delay'
                    ? { mode: 'delay', dp: s.delayDp, value: s.delayValue }
                    : { mode: m?.key ?? 'disarm', dp: m?.writeDp || s.stateDp, value: m?.writeValue ?? '' };
            setState(s.pinDp, pinPayload(s.pinPayload, pin, action));
        },
        panic: () => {
            if (s.panicDp) setState(s.panicDp, typedValue(s.panicValue));
        },
        quit: () => {
            if (s.quitDp) setState(s.quitDp, typedValue(s.quitValue));
        },
        togglePresence: () => {
            if (s.presenceDp) setState(s.presenceDp, !isSet(presenceRaw));
        },
        pinWhileTriggered: pinOn && s.requirePin,
    };
}
