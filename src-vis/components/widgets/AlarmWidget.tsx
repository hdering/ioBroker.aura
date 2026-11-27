/**
 * Alarm system widget. Data comes from the ioBroker.alarm adapter (`sourceMode:
 * 'adapter'`, fixed paths under `alarmPrefix`) or from freely chosen datapoints
 * (`sourceMode: 'manual'`, #1037). Mode buttons and zones are lists — set in the
 * widget options or read from a JSON datapoint, like the Auswahlfeld's entries.
 *
 * The rendering only knows `AlarmSource` (alarm/useAlarmSource.ts); all options
 * are read here, so the schema generator sees them.
 */
import { useEffect, useMemo, useState } from 'react';
import {
    ShieldAlert,
    Moon,
    Home,
    AlertTriangle,
    Bell,
    Activity,
    Clock as ClockIcon,
    Ban,
    KeyRound,
    Send,
    X,
} from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import type { WidgetProps, AlarmContactDef, AlarmModeDef, AlarmStateMapEntry, AlarmZoneDef } from '../../types';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import { AlarmKeypadModal } from './AlarmKeypadModal';
import { parseAlarmModesJson, parseAlarmZonesJson } from '../../utils/alarmListJson';
import {
    PHASE_INFO,
    resolveAdapterModes,
    resolveAdapterZones,
    resolveManualModes,
    resolveManualZones,
    isSet,
    type LogSeparator,
    type ResolvedMode,
    type ResolvedZone,
} from './alarm/alarmModel';
import { useAlarmAdapterSource, useAlarmManualSource, type PinTarget } from './alarm/useAlarmSource';

export { AlarmConfig } from '../config/AlarmConfig';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtCountdown(s: number): string {
    if (!s || s <= 0) return '';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m > 0) return `${m}:${String(r).padStart(2, '0')} min`;
    return `${r}s`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ── tiny inline components ───────────────────────────────────────────────────

function ModeButton({
    active,
    color,
    label,
    icon,
    onClick,
    disabled,
    fontSize,
    iconSize,
}: {
    active: boolean;
    color: string;
    label: string;
    icon: string;
    onClick: () => void;
    disabled?: boolean;
    fontSize: number;
    iconSize: number;
}) {
    const Icon = getWidgetIcon(icon, ShieldAlert);
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="aura-alarm-mode flex flex-col items-center gap-1 rounded-xl py-2 px-2 transition-all min-w-0"
            data-active={active ? 'true' : undefined}
            style={{
                background: active ? color : 'var(--app-bg)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${active ? color : 'var(--app-border)'}`,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                flex: 1,
            }}
            title={label}
        >
            <Icon size={iconSize} style={{ color: active ? '#fff' : color }} />
            <span className="truncate" style={{ fontSize, lineHeight: 1.1 }}>
                {label}
            </span>
        </button>
    );
}

function StatePill({
    color,
    pulse,
    label,
    fontSize,
}: {
    color: string;
    pulse?: boolean;
    label: string;
    fontSize: number;
}) {
    return (
        <span
            className="aura-alarm-state inline-flex items-center gap-1 rounded-full font-semibold"
            style={{
                background: `color-mix(in srgb, ${color} 13%, transparent)`,
                color,
                border: `1px solid color-mix(in srgb, ${color} 33%, transparent)`,
                padding: '2px 10px',
                fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                animation: pulse ? 'alarm-pulse 1s ease-in-out infinite' : undefined,
            }}
        >
            {pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
            {label}
        </span>
    );
}

// ── main widget ──────────────────────────────────────────────────────────────

export function AlarmWidget({ config, editMode }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};

    const manual = o.sourceMode === 'manual';
    const prefix = ((o.alarmPrefix as string) || 'alarm.0').trim();
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const showHeader = o.showHeader !== false;
    const showModes = o.showModes !== false;
    const showCountdown = o.showCountdown !== false;
    const showCircuits = o.showCircuits !== false;
    const showZones = o.showZones !== false;
    const showLog = o.showLog !== false;
    const showPanic = o.showPanic === true;
    const showDelay = o.showDelay !== false;
    const showPresence = o.showPresence === true;
    const logLines = Math.max(0, Math.min(20, (o.logLines as number) ?? 5));
    const requirePin = o.requirePinForDisarm === true;
    // #911: arming via the adapter's toggle_password DPs, which check the same PIN.
    const requireArmPin = o.requirePinForArm === true;
    const panicConfirm = o.panicConfirm !== false;
    const compactMode = o.compactMode === true;
    const sizeScale = Math.max(0.5, Math.min(2.5, (o.sizeScale as number) ?? 1));
    // Legacy per-button switches (before the mode list) — still honoured in adapter mode.
    const legacyModes = {
        showModeOff: o.showModeOff,
        showModeSharp: o.showModeSharp,
        showModeInside: o.showModeInside,
        showModeNight: o.showModeNight,
    };

    // ── lists: own list or JSON datapoint ──────────────────────────────────────
    const modesFromJson = o.modesSource === 'json';
    const zonesFromJson = o.zonesSource === 'json';
    const modesDp = str(o.modesDp);
    const zonesDp = str(o.zonesDp);
    const { value: modesRaw } = useDatapoint(modesFromJson ? modesDp : '');
    const { value: zonesRaw } = useDatapoint(zonesFromJson ? zonesDp : '');
    const ownModes = o.modes as AlarmModeDef[] | undefined;
    const ownZones = o.zones as AlarmZoneDef[] | undefined;
    const modeList = useMemo(
        () => (modesFromJson ? parseAlarmModesJson(modesRaw).items : ownModes),
        [modesFromJson, modesRaw, ownModes],
    );
    const zoneList = useMemo(
        () => (zonesFromJson ? parseAlarmZonesJson(zonesRaw).items : ownZones),
        [zonesFromJson, zonesRaw, ownZones],
    );
    const modes: ResolvedMode[] = useMemo(
        () => (manual ? resolveManualModes(modeList) : resolveAdapterModes(modeList, legacyModes)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            manual,
            modeList,
            legacyModes.showModeOff,
            legacyModes.showModeSharp,
            legacyModes.showModeInside,
            legacyModes.showModeNight,
        ],
    );
    const zones: ResolvedZone[] = useMemo(
        () => (manual ? resolveManualZones(zoneList) : resolveAdapterZones(zoneList, prefix)),
        [manual, zoneList, prefix],
    );

    // ── source ─────────────────────────────────────────────────────────────────
    const adapter = useAlarmAdapterSource({ prefix, requirePin, requireArmPin, logLines }, !manual);
    const manualSrc = useAlarmManualSource(
        {
            stateDp: str(o.stateDp),
            stateMap: o.stateMap as AlarmStateMapEntry[] | undefined,
            triggeredDp: str(o.triggeredDp),
            sirenDp: str(o.sirenDp),
            enableableDp: str(o.enableableDp),
            countdownDp: str(o.countdownDp),
            countdownUnit: o.countdownUnit === 'endTs' ? 'endTs' : 's',
            silentCountdownDp: str(o.silentCountdownDp),
            circuitsDp: str(o.circuitsDp),
            contacts: (o.contacts as AlarmContactDef[] | undefined) ?? [],
            contactsBlockArm: o.contactsBlockArm === true,
            noticeDp: str(o.noticeDp),
            quitDp: str(o.quitDp),
            quitValue: (o.quitValue as string) ?? 'true',
            delayDp: str(o.delayDp),
            delayValue: (o.delayValue as string) ?? 'true',
            panicDp: str(o.panicDp),
            panicValue: (o.panicValue as string) ?? 'true',
            presenceDp: str(o.presenceDp),
            logDp: str(o.logDp),
            logSeparator: ((o.logSeparator as LogSeparator) ?? 'br') as LogSeparator,
            logLines,
            pinCheck: o.pinCheck === 'dp' || o.pinCheck === 'aura' ? o.pinCheck : 'none',
            pinCode: str(o.pinCode),
            pinDp: str(o.pinDp),
            pinPayload: o.pinPayload === 'pin' ? 'pin' : 'json',
            wrongPinDp: str(o.wrongPinDp),
            requirePin,
            requireArmPin,
            disarmMode: modes.find((m) => m.disarm),
            modes,
        },
        manual,
    );
    const src = manual ? manualSrc : adapter;

    // #911: touch keypad in a popup instead of the inline field (wall tablets)
    const pinPossible = manual ? o.pinCheck === 'dp' || o.pinCheck === 'aura' : true;
    const keypad = pinPossible && (requirePin || requireArmPin) && o.pinInput === 'keypad';

    const WidgetIcon = getWidgetIcon((o.icon as string) ?? 'ShieldAlert', ShieldAlert);

    const [pin, setPin] = useState('');
    const [pinOpen, setPinOpen] = useState(false);
    const [pinTarget, setPinTarget] = useState<PinTarget>({ kind: 'disarm' });
    const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);

    const triggered = src.triggered;
    useEffect(() => {
        if (!triggered) setPinOpen(false);
    }, [triggered]);

    const info = PHASE_INFO[src.phase] ?? PHASE_INFO.off;
    const stateLabel = src.stateLabel || (t(info.labelKey) as string);

    // Visual scaling
    const fsBase = 13 * sizeScale;
    const fsSmall = 11 * sizeScale;
    const fsTiny = 10 * sizeScale;
    const fsModeIcon = 18 * sizeScale;
    const fsModeLabel = 11 * sizeScale;
    const gap = 8 * sizeScale;

    // ── commands ───────────────────────────────────────────────────────────────
    const press = (target: PinTarget) => {
        const plan = src.plan(target);
        if (plan === 'skip') return;
        if (plan === 'pin') {
            setPinTarget(target);
            setPinOpen(true);
            return;
        }
        src.run(target);
    };
    const doPanic = () => {
        if (panicConfirm) setConfirmAction(() => src.panic);
        else src.panic();
    };
    const cancelPin = () => {
        setPin('');
        setPinOpen(false);
    };
    const submitPin = (code = pin) => {
        if (!code) return;
        const verdict = src.submitPin(triggered ? { kind: 'disarm' } : pinTarget, code);
        setPin('');
        // Aura checks the code asynchronously — a miss keeps the entry open with its message.
        if (verdict instanceof Promise) {
            void verdict.then((ok) => {
                if (ok) setPinOpen(false);
            });
            return;
        }
        setPinOpen(false);
    };
    const pinErrorText = (() => {
        const e = src.pinError;
        if (!e) return '';
        if (e.kind === 'locked') return t('alarm.pin.locked', { s: e.retryAfter }) as string;
        if (e.kind === 'unknown') return t('alarm.pin.unknownCode') as string;
        return t('alarm.pin.unavailable') as string;
    })();
    const pinForDisarm =
        triggered || pinTarget.kind === 'disarm' || (pinTarget.kind === 'mode' && pinTarget.mode.disarm);
    const pinWhileTriggered = triggered && src.pinWhileTriggered;

    const modeLabel = (m: ResolvedMode) => m.label || (m.labelKey ? (t(m.labelKey) as string) : m.key);
    const zoneLabel = (z: ResolvedZone) => z.label || (z.labelKey ? (t(z.labelKey) as string) : z.key);

    const cardTint = triggered
        ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.45)' }
        : null;

    const showPresenceChip = showPresence && src.presence !== null;
    const listHint = (what: string, dp: string) => (
        <div
            className="aura-alarm-hint rounded-lg shrink-0"
            style={{
                padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                border: '1px dashed var(--app-border)',
                color: 'var(--text-secondary)',
                fontSize: fsTiny,
            }}
        >
            {t('alarm.hint.noEntries', { what, dp: dp || '–' }) as string}
        </div>
    );

    return (
        <div className="aura-widget-row w-full h-full flex flex-col overflow-hidden" style={{ gap }}>
            <style>{`
        @keyframes alarm-pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.55; }
        }
        @keyframes alarm-card-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50%     { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>

            {/* Widget header (title + icon) */}
            <HeaderGroup>
                {(showTitle || showIcon) && (
                    <TitleRow align={titleAlign} className="flex items-center gap-2 shrink-0">
                        {showIcon && (
                            <WidgetIcon
                                size={iconSize}
                                style={{ '--aura-icon-color': triggered ? '#ef4444' : 'var(--accent)' }}
                                className="aura-widget-icon shrink-0"
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title || t('alarm.title')}
                            </p>
                        )}
                        <HeaderSlotsInline />
                    </TitleRow>
                )}
                <HeaderSlotsRow2 />
            </HeaderGroup>

            {/* Status / state row */}
            {showHeader && (
                <div
                    className="flex items-center justify-between rounded-xl shrink-0"
                    style={{
                        padding: `${6 * sizeScale}px ${10 * sizeScale}px`,
                        background: cardTint?.background ?? 'var(--app-bg)',
                        border: cardTint?.border ?? '1px solid var(--app-border)',
                        animation: triggered ? 'alarm-card-pulse 1.4s ease-in-out infinite' : undefined,
                        gap,
                    }}
                >
                    <div className="flex items-center min-w-0" style={{ gap: 6 * sizeScale }}>
                        <StatePill color={info.color} pulse={info.pulse} label={stateLabel} fontSize={fsTiny} />
                        {src.sleep && (
                            <span
                                className="inline-flex items-center gap-1"
                                style={{ color: '#6366f1', fontSize: fsTiny }}
                            >
                                <Moon size={Math.round(12 * sizeScale)} /> {t('alarm.nightRest')}
                            </span>
                        )}
                    </div>
                    {showPresenceChip && (
                        <button
                            onClick={src.togglePresence}
                            className="inline-flex items-center gap-1 rounded-full"
                            style={{
                                fontSize: fsTiny,
                                padding: `${2 * sizeScale}px ${8 * sizeScale}px`,
                                background: src.presence ? '#10b98122' : 'var(--app-surface)',
                                color: src.presence ? '#10b981' : 'var(--text-secondary)',
                                border: `1px solid ${src.presence ? '#10b98155' : 'var(--app-border)'}`,
                            }}
                            title={t('alarm.presence') as string}
                        >
                            <Home size={Math.round(11 * sizeScale)} />
                            {src.presence ? (t('alarm.presence.on') as string) : (t('alarm.presence.off') as string)}
                        </button>
                    )}
                </div>
            )}

            {keypad && pinOpen && (
                <AlarmKeypadModal
                    title={(pinForDisarm ? t('alarm.keypad.title') : t('alarm.keypad.titleArm')) as string}
                    wrongPin={src.wrongPin}
                    errorText={pinErrorText || undefined}
                    onSubmit={submitPin}
                    onCancel={cancelPin}
                />
            )}

            {/* Keypad mode: while an alarm is triggered a button reopens the keypad popup */}
            {keypad && triggered ? (
                <div className="flex flex-col shrink-0" style={{ gap: 4 * sizeScale }}>
                    <button
                        onClick={() => setPinOpen(true)}
                        className="aura-alarm-keypad-open rounded-xl flex items-center justify-center font-semibold"
                        style={{
                            padding: 8 * sizeScale,
                            gap: 6 * sizeScale,
                            background: '#ef4444',
                            color: '#fff',
                            border: '1px solid #ef4444',
                            fontSize: fsBase,
                        }}
                    >
                        <KeyRound size={Math.round(14 * sizeScale)} />
                        {t('alarm.pinPlaceholder') as string}
                    </button>
                    {(src.wrongPin || pinErrorText) && (
                        <span style={{ color: '#ef4444', fontSize: fsTiny }}>
                            {pinErrorText || (t('alarm.wrongPin') as string)}
                        </span>
                    )}
                </div>
            ) : /* PIN entry: after a PIN request, and always while an alarm is triggered */
            !keypad && (pinOpen || pinWhileTriggered) ? (
                <div
                    className="flex flex-wrap items-center rounded-xl shrink-0"
                    style={{
                        padding: 8 * sizeScale,
                        background: 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                        gap: 6 * sizeScale,
                    }}
                >
                    <KeyRound size={Math.round(14 * sizeScale)} color="#ef4444" className="shrink-0" />
                    <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder={t('alarm.pinPlaceholder') as string}
                        className="flex-1 min-w-0 rounded-lg px-2 py-1 font-mono"
                        style={{
                            background: 'var(--app-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                            fontSize: fsBase,
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitPin();
                        }}
                        autoFocus
                    />
                    {/* Icon only: with the label the PIN input got squeezed to nothing in narrow widgets */}
                    <button
                        onClick={() => submitPin()}
                        className="rounded-lg flex items-center justify-center shrink-0"
                        title={t('alarm.send') as string}
                        aria-label={t('alarm.send') as string}
                        style={{
                            padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                            background: '#ef4444',
                            color: '#fff',
                            border: '1px solid #ef4444',
                        }}
                    >
                        <Send size={Math.round(14 * sizeScale)} />
                    </button>
                    {/* While an alarm is triggered the PIN field stays — no way back to the mode buttons */}
                    {!pinWhileTriggered && (
                        <button
                            onClick={cancelPin}
                            className="rounded-lg flex items-center justify-center shrink-0"
                            title={t('common.cancel') as string}
                            aria-label={t('common.cancel') as string}
                            style={{
                                padding: 4 * sizeScale,
                                background: 'var(--app-surface)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <X size={Math.round(14 * sizeScale)} />
                        </button>
                    )}
                    {(src.wrongPin || pinErrorText) && (
                        <span
                            className="aura-alarm-pin-error basis-full"
                            style={{ color: '#ef4444', fontSize: fsTiny }}
                        >
                            {pinErrorText || (t('alarm.wrongPin') as string)}
                        </span>
                    )}
                </div>
            ) : showModes && modes.length > 0 ? (
                <div
                    className="aura-alarm-modes grid shrink-0"
                    style={{
                        gridTemplateColumns: `repeat(${
                            compactMode ? Math.min(2, modes.length) : modes.length
                        }, minmax(0, 1fr))`,
                        gap: 6 * sizeScale,
                    }}
                >
                    {modes.map((m) => {
                        const active = src.isModeActive(m);
                        return (
                            <ModeButton
                                key={m.key}
                                active={active}
                                color={m.color}
                                label={modeLabel(m)}
                                icon={m.icon}
                                onClick={() => press({ kind: 'mode', mode: m })}
                                // Adapter: only "Scharf" depends on status.enableable (as before #1037).
                                disabled={!m.disarm && !src.enableable && !active && (manual || m.key === 'sharp')}
                                fontSize={fsModeLabel}
                                iconSize={fsModeIcon}
                            />
                        );
                    })}
                </div>
            ) : (
                showModes &&
                editMode &&
                manual &&
                listHint(t('alarm.hint.modes') as string, modesFromJson ? modesDp : '')
            )}

            {/* Secondary actions (delay + panic) */}
            {!triggered && ((showDelay && src.hasDelay) || (showPanic && src.hasPanic)) && (
                <div className="flex shrink-0" style={{ gap: 6 * sizeScale }}>
                    {showDelay && src.hasDelay && (
                        <button
                            onClick={() => press({ kind: 'delay' })}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg"
                            style={{
                                padding: `${5 * sizeScale}px ${8 * sizeScale}px`,
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                                fontSize: fsSmall,
                            }}
                        >
                            <ClockIcon size={Math.round(13 * sizeScale)} />
                            {t('alarm.enableDelay') as string}
                        </button>
                    )}
                    {showPanic && src.hasPanic && (
                        <button
                            onClick={doPanic}
                            className="inline-flex items-center justify-center gap-1 rounded-lg"
                            style={{
                                padding: `${5 * sizeScale}px ${10 * sizeScale}px`,
                                background: '#ef444422',
                                color: '#ef4444',
                                border: '1px solid #ef444455',
                                fontSize: fsSmall,
                                fontWeight: 600,
                            }}
                        >
                            <AlertTriangle size={Math.round(13 * sizeScale)} />
                            {t('alarm.panic') as string}
                        </button>
                    )}
                </div>
            )}

            {/* Countdown */}
            {showCountdown && (src.activationCountdown > 0 || src.silentCountdown > 0) && (
                <div
                    className="aura-alarm-countdown flex items-center rounded-lg shrink-0"
                    style={{
                        padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                        background: '#eab30822',
                        border: '1px solid #eab30855',
                        color: '#eab308',
                        fontSize: fsSmall,
                        gap: 6 * sizeScale,
                    }}
                >
                    <ClockIcon size={Math.round(13 * sizeScale)} />
                    {src.activationCountdown > 0 ? (
                        <>
                            {t('alarm.activatingIn') as string} <strong>{fmtCountdown(src.activationCountdown)}</strong>
                        </>
                    ) : (
                        <>
                            {t('alarm.silentIn') as string} <strong>{fmtCountdown(src.silentCountdown)}</strong>
                        </>
                    )}
                </div>
            )}

            {/* Open alarm circuits — live status, cannot be acknowledged away */}
            {showCircuits && src.openCircuits && (
                <div
                    className="aura-alarm-circuits flex items-start rounded-lg shrink-0"
                    style={{
                        padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                        background: '#ef444422',
                        border: '1px solid #ef444455',
                        color: '#ef4444',
                        fontSize: fsSmall,
                        gap: 6 * sizeScale,
                    }}
                >
                    <AlertTriangle size={Math.round(13 * sizeScale)} className="mt-0.5 shrink-0" />
                    <span className="flex-1">
                        {t('alarm.openCircuits') as string}: {src.openCircuits}
                    </span>
                </div>
            )}

            {/* Acknowledgeable notice — quitting resets exactly these flags, so the block then disappears */}
            {showCircuits && src.quitNotice && (
                <div
                    className="aura-alarm-notice flex items-start rounded-lg shrink-0"
                    style={{
                        padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                        background: '#f9731622',
                        border: '1px solid #f9731655',
                        color: '#f97316',
                        fontSize: fsSmall,
                        gap: 6 * sizeScale,
                    }}
                >
                    <Bell size={Math.round(13 * sizeScale)} className="mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>
                        {src.quitNotice.failed
                            ? (t('alarm.state.activationFail') as string)
                            : src.quitNotice.text || (t('alarm.changesPending') as string)}
                    </span>
                    {src.hasQuit && (
                        <button
                            onClick={src.quit}
                            className="rounded inline-flex items-center gap-1 shrink-0"
                            style={{
                                padding: `${2 * sizeScale}px ${6 * sizeScale}px`,
                                fontSize: fsTiny,
                                color: '#f97316',
                                border: '1px solid #f9731699',
                                background: 'transparent',
                            }}
                            title={t('alarm.quitChanges') as string}
                        >
                            <Ban size={Math.round(11 * sizeScale)} />
                            {t('alarm.quit') as string}
                        </button>
                    )}
                </div>
            )}

            {/* Passive notification list (nothing to acknowledge) */}
            {showCircuits && !src.openCircuits && !src.quitNotice && src.passiveNotice && (
                <div
                    className="flex items-center rounded-lg shrink-0"
                    style={{
                        padding: `${3 * sizeScale}px ${8 * sizeScale}px`,
                        background: 'var(--app-bg)',
                        border: '1px dashed var(--app-border)',
                        color: 'var(--text-secondary)',
                        fontSize: fsTiny,
                        gap: 6 * sizeScale,
                    }}
                >
                    <Bell size={Math.round(11 * sizeScale)} />
                    {src.passiveNotice}
                </div>
            )}

            {/* Zones */}
            {showZones && zones.length > 0 && (
                <div className="aura-alarm-zones flex shrink-0" style={{ gap: 6 * sizeScale }}>
                    {zones.map((z) => (
                        <ZoneTile key={z.key} zone={z} label={zoneLabel(z)} sizeScale={sizeScale} />
                    ))}
                </div>
            )}
            {showZones &&
                zones.length === 0 &&
                editMode &&
                manual &&
                zonesFromJson &&
                listHint(t('alarm.hint.zones') as string, zonesDp)}

            {/* Log (today) */}
            {showLog && src.log.length > 0 && (
                <div
                    className="aura-alarm-log flex flex-col rounded-lg overflow-hidden min-h-0"
                    style={{
                        background: 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                        padding: `${4 * sizeScale}px ${8 * sizeScale}px`,
                        gap: 2 * sizeScale,
                    }}
                >
                    <div
                        className="flex items-center gap-1 shrink-0"
                        style={{ fontSize: fsTiny, color: 'var(--text-secondary)' }}
                    >
                        <Activity size={Math.round(11 * sizeScale)} />
                        {t('alarm.today') as string}
                    </div>
                    <div className="flex flex-col overflow-auto min-h-0" style={{ gap: 1 * sizeScale }}>
                        {src.log.map((entry, i) => (
                            <div key={i} className="flex" style={{ gap: 6 * sizeScale, fontSize: fsTiny }}>
                                <span
                                    className="tabular-nums shrink-0"
                                    style={{ color: 'var(--text-secondary)', minWidth: 36 * sizeScale }}
                                >
                                    {entry.time}
                                </span>
                                <span
                                    className="flex-1 min-w-0"
                                    style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}
                                >
                                    {entry.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Confirm overlay for panic */}
            {confirmAction && (
                <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.55)', zIndex: 20, borderRadius: 'inherit' }}
                    onClick={() => setConfirmAction(null)}
                >
                    <div
                        className="rounded-xl p-4 flex flex-col items-center"
                        style={{
                            background: 'var(--app-surface)',
                            border: '1px solid var(--app-border)',
                            gap: 8,
                            minWidth: 200,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AlertTriangle size={28} color="#ef4444" />
                        <div style={{ fontSize: fsBase, color: 'var(--text-primary)', fontWeight: 600 }}>
                            {t('alarm.panicConfirm') as string}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="rounded-lg px-3 py-1"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                    fontSize: fsSmall,
                                }}
                            >
                                {t('alarm.cancel') as string}
                            </button>
                            <button
                                onClick={() => {
                                    confirmAction();
                                    setConfirmAction(null);
                                }}
                                className="rounded-lg px-3 py-1 font-semibold"
                                style={{
                                    background: '#ef4444',
                                    color: '#fff',
                                    border: '1px solid #ef4444',
                                    fontSize: fsSmall,
                                }}
                            >
                                {t('alarm.confirm') as string}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── ZoneTile ─────────────────────────────────────────────────────────────────

function ZoneTile({ zone, label, sizeScale }: { zone: ResolvedZone; label: string; sizeScale: number }) {
    const { setState } = useIoBroker();
    const enabled = useDatapoint(zone.onOffDp ?? '');
    const trig = useDatapoint(zone.triggeredDp ?? '');
    const isOn = zone.onOffDp ? isSet(enabled.value) : false;
    const isTrig = zone.triggeredDp ? isSet(trig.value) : false;
    const color = isTrig ? '#ef4444' : isOn ? '#10b981' : 'var(--text-secondary)';
    const fsLabel = 10 * sizeScale;
    const fsSub = 9 * sizeScale;
    const canToggle = !!zone.onOffDp;
    return (
        <button
            onClick={() => canToggle && setState(zone.onOffDp!, !isOn)}
            disabled={!canToggle}
            className="aura-alarm-zone flex-1 flex flex-col items-center rounded-lg transition-colors min-w-0"
            data-zone={zone.key}
            style={{
                padding: `${4 * sizeScale}px ${4 * sizeScale}px`,
                background: isTrig
                    ? '#ef444422'
                    : isOn
                      ? `color-mix(in srgb, ${color} 10%, transparent)`
                      : 'var(--app-bg)',
                border: `1px solid ${
                    isTrig ? '#ef444499' : isOn ? `color-mix(in srgb, ${color} 33%, transparent)` : 'var(--app-border)'
                }`,
                gap: 2 * sizeScale,
                cursor: canToggle ? 'pointer' : 'default',
            }}
            title={label}
        >
            <span className="flex items-center gap-1" style={{ color, fontSize: fsLabel, fontWeight: 600 }}>
                <span
                    style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: isOn ? 1 : 0.35 }}
                />
                {label}
            </span>
            <span style={{ fontSize: fsSub, color: 'var(--text-secondary)' }}>
                {isTrig ? '⚠' : canToggle ? (isOn ? 'on' : 'off') : ''}
            </span>
        </button>
    );
}
