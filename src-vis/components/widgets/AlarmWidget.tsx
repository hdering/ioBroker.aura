import { useEffect, useMemo, useState } from 'react';
import {
    ShieldAlert,
    ShieldCheck,
    ShieldOff,
    Moon,
    Home,
    AlertTriangle,
    Bell,
    Lock,
    Activity,
    Clock as ClockIcon,
    Ban,
    KeyRound,
    Send,
} from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT, type TranslationKey } from '../../i18n';
import type { WidgetProps, WidgetConfig, ioBrokerState } from '../../types';

// ── alarm state mapping (mirrors info.state_list of ioBroker.alarm) ──────────

type AlarmStateCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const STATE_INFO: Record<AlarmStateCode, { labelKey: TranslationKey; color: string; pulse?: boolean }> = {
    0: { labelKey: 'alarm.state.deactivated', color: '#64748b' },
    1: { labelKey: 'alarm.state.sharp', color: '#3b82f6' },
    2: { labelKey: 'alarm.state.sharpInside', color: '#06b6d4' },
    3: { labelKey: 'alarm.state.burglary', color: '#ef4444', pulse: true },
    4: { labelKey: 'alarm.state.nightRest', color: '#6366f1' },
    5: { labelKey: 'alarm.state.getsActivated', color: '#eab308' },
    6: { labelKey: 'alarm.state.activationFail', color: '#f97316' },
    7: { labelKey: 'alarm.state.activationAbort', color: '#f97316' },
    8: { labelKey: 'alarm.state.silentAlarm', color: '#dc2626' },
};

// use.list value mapping: 0 disable, 1 enable, 2 sharp_inside, 3 enable_with_delay, 4 night_rest
const USE_LIST = {
    off: 0,
    sharp: 1,
    inside: 2,
    delay: 3,
    night: 4,
} as const;

// ── data hook ────────────────────────────────────────────────────────────────

interface AlarmData {
    stateCode: AlarmStateCode;
    stateText: string;
    activated: boolean;
    activatedWarnings: boolean;
    sleep: boolean;
    sharpInside: boolean;
    burglar: boolean;
    silent: boolean;
    siren: boolean;
    enableable: boolean;
    activationCountdown: number;
    silentCountdown: number;
    alarmCircuitList: string;
    notificationCircuitList: string;
    sharpInsideCircuitList: string;
    wrongPassword: boolean;
    logLast: string;
    logToday: string;
}

const DEFAULT_DATA: AlarmData = {
    stateCode: 0,
    stateText: '',
    activated: false,
    activatedWarnings: false,
    sleep: false,
    sharpInside: false,
    burglar: false,
    silent: false,
    siren: false,
    enableable: true,
    activationCountdown: 0,
    silentCountdown: 0,
    alarmCircuitList: '',
    notificationCircuitList: '',
    sharpInsideCircuitList: '',
    wrongPassword: false,
    logLast: '',
    logToday: '',
};

function useAlarmData(prefix: string): AlarmData {
    const { subscribe, getState } = useIoBroker();
    const [data, setData] = useState<AlarmData>({ ...DEFAULT_DATA });

    useEffect(() => {
        setData({ ...DEFAULT_DATA });
        if (!prefix) return;

        const cleanups: (() => void)[] = [];
        const points: [string, keyof AlarmData][] = [
            ['status.state_list', 'stateCode'],
            ['status.state', 'stateText'],
            ['status.activated', 'activated'],
            ['status.activated_with_warnings', 'activatedWarnings'],
            ['status.sleep', 'sleep'],
            ['status.sharp_inside_activated', 'sharpInside'],
            ['status.burglar_alarm', 'burglar'],
            ['status.silent_alarm', 'silent'],
            ['status.siren', 'siren'],
            ['status.enableable', 'enableable'],
            ['status.activation_countdown', 'activationCountdown'],
            ['status.silent_countdown', 'silentCountdown'],
            ['info.alarm_circuit_list', 'alarmCircuitList'],
            ['info.notification_circuit_list', 'notificationCircuitList'],
            ['info.sharp_inside_circuit_list', 'sharpInsideCircuitList'],
            ['info.wrong_password', 'wrongPassword'],
            ['info.log', 'logLast'],
            ['info.log_today', 'logToday'],
        ];

        for (const [dp, key] of points) {
            const id = `${prefix}.${dp}`;
            const apply = (s: ioBrokerState | null) => {
                if (!s) return;
                setData((prev) => ({ ...prev, [key]: (s.val ?? prev[key]) as AlarmData[typeof key] }));
            };
            cleanups.push(subscribe(id, apply));
            getState(id).then(apply);
        }

        return () => cleanups.forEach((fn) => fn());
    }, [prefix, subscribe, getState]);

    return data;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtCountdown(s: number): string {
    if (!s || s <= 0) return '';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m > 0) return `${m}:${String(r).padStart(2, '0')} min`;
    return `${r}s`;
}

function parseLogToday(raw: string, max: number): { time: string; text: string }[] {
    if (!raw) return [];
    const parts = raw
        .split(/<br\s*\/?>/i)
        .map((s) => s.trim())
        .filter(Boolean);
    const out: { time: string; text: string }[] = [];
    for (const line of parts) {
        if (out.length >= max) break;
        const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[:-]\s*(.+)$/);
        if (m) out.push({ time: m[1], text: m[2] });
        else out.push({ time: '', text: line });
    }
    return out;
}

// ── tiny inline components ───────────────────────────────────────────────────

function ModeButton({
    active,
    color,
    label,
    Icon,
    onClick,
    disabled,
    fontSize,
    iconSize,
}: {
    active: boolean;
    color: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    onClick: () => void;
    disabled?: boolean;
    fontSize: number;
    iconSize: number;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-center gap-1 rounded-xl py-2 px-2 transition-all min-w-0"
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
            <Icon size={iconSize} color={active ? '#fff' : color} />
            <span className="truncate" style={{ fontSize, lineHeight: 1.1 }}>
                {label}
            </span>
        </button>
    );
}

function StatePill({ code, label, fontSize }: { code: AlarmStateCode; label: string; fontSize: number }) {
    const info = STATE_INFO[code] ?? STATE_INFO[0];
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full font-semibold"
            style={{
                background: `${info.color}22`,
                color: info.color,
                border: `1px solid ${info.color}55`,
                padding: '2px 10px',
                fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                animation: info.pulse ? 'alarm-pulse 1s ease-in-out infinite' : undefined,
            }}
        >
            {info.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: info.color }} />}
            {label}
        </span>
    );
}

// ── main widget ──────────────────────────────────────────────────────────────

export function AlarmWidget({ config }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};
    const { setState } = useIoBroker();

    const prefix = ((o.alarmPrefix as string) || 'alarm.0').trim();
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const showHeader = o.showHeader !== false;
    const showModes = o.showModes !== false;
    const showModeOff = o.showModeOff !== false;
    const showModeSharp = o.showModeSharp !== false;
    const showModeInside = o.showModeInside !== false;
    const showModeNight = o.showModeNight !== false;
    const showCountdown = o.showCountdown !== false;
    const showCircuits = o.showCircuits !== false;
    const showZones = o.showZones !== false;
    const showLog = o.showLog !== false;
    const showPanic = o.showPanic === true;
    const showDelay = o.showDelay !== false;
    const showPresence = o.showPresence === true;
    const logLines = Math.max(0, Math.min(20, (o.logLines as number) ?? 5));
    const requirePin = o.requirePinForDisarm === true;
    const panicConfirm = o.panicConfirm !== false;
    const compactMode = o.compactMode === true;
    const sizeScale = Math.max(0.5, Math.min(2.5, (o.sizeScale as number) ?? 1));

    const WidgetIcon = getWidgetIcon((o.icon as string) ?? 'ShieldAlert', ShieldAlert);

    const data = useAlarmData(prefix);
    const presence = useDatapoint(prefix ? `${prefix}.presence.on_off` : '');

    const [pin, setPin] = useState('');
    const [pinOpen, setPinOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);

    // Auto-open pin entry when burglar/silent active and a disarm is requested.
    useEffect(() => {
        if (!data.burglar && !data.silent) setPinOpen(false);
    }, [data.burglar, data.silent]);

    const stateInfo = STATE_INFO[data.stateCode] ?? STATE_INFO[0];
    const triggered = data.burglar || data.silent || data.siren;

    // Visual scaling
    const fsBase = 13 * sizeScale;
    const fsSmall = 11 * sizeScale;
    const fsTiny = 10 * sizeScale;
    const fsModeIcon = 18 * sizeScale;
    const fsModeLabel = 11 * sizeScale;
    const gap = 8 * sizeScale;

    // ── command helpers ────────────────────────────────────────────────────────

    const writeUseList = (n: number) => setState(`${prefix}.use.list`, n);

    const doDisarm = () => {
        if (requirePin) {
            setPinOpen(true);
            return;
        }
        setState(`${prefix}.use.disable`, true);
    };
    const doEnableDelay = () => setState(`${prefix}.use.enable_with_delay`, true);
    const doSharpInside = () => setState(`${prefix}.use.activate_sharp_inside`, true);
    const doNightRest = () => setState(`${prefix}.use.activate_nightrest`, true);
    const doPanic = () => {
        const fire = () => setState(`${prefix}.use.panic`, true);
        if (panicConfirm) setConfirmAction(() => fire);
        else fire();
    };
    const doQuit = () => setState(`${prefix}.use.quit_changes`, true);
    const submitPin = () => {
        if (!pin) return;
        setState(`${prefix}.use.disable_password`, pin);
        setPin('');
        setPinOpen(false);
    };

    // ── render ────────────────────────────────────────────────────────────────

    const logEntries = useMemo(() => parseLogToday(data.logToday, logLines), [data.logToday, logLines]);

    // Visible mode buttons (each can be individually hidden via config)
    type ModeDef = {
        key: string;
        active: boolean;
        color: string;
        label: string;
        Icon: React.ComponentType<{ size?: number; color?: string }>;
        onClick: () => void;
        disabled?: boolean;
    };
    const modeButtons: ModeDef[] = [
        showModeOff && {
            key: 'off',
            active: data.stateCode === 0,
            color: '#10b981',
            label: t('alarm.mode.off') as string,
            Icon: ({ size, color }: { size?: number; color?: string }) => <ShieldOff size={size} color={color} />,
            onClick: doDisarm,
        },
        showModeSharp && {
            key: 'sharp',
            active: data.stateCode === 1,
            color: '#3b82f6',
            label: t('alarm.mode.sharp') as string,
            Icon: ({ size, color }: { size?: number; color?: string }) => (
                <ShieldCheck size={size} color={color} />
            ),
            onClick: () => writeUseList(USE_LIST.sharp),
            disabled: !data.enableable && data.stateCode !== 1,
        },
        showModeInside && {
            key: 'inside',
            active: data.stateCode === 2 || data.sharpInside,
            color: '#06b6d4',
            label: t('alarm.mode.inside') as string,
            Icon: ({ size, color }: { size?: number; color?: string }) => <Lock size={size} color={color} />,
            onClick: doSharpInside,
        },
        showModeNight && {
            key: 'night',
            active: data.stateCode === 4 || data.sleep,
            color: '#6366f1',
            label: t('alarm.mode.night') as string,
            Icon: ({ size, color }: { size?: number; color?: string }) => <Moon size={size} color={color} />,
            onClick: doNightRest,
        },
    ].filter(Boolean) as ModeDef[];

    // Trigger overlay color tinting
    const cardTint = triggered
        ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.45)' }
        : null;

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
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <WidgetIcon
                            size={iconSize}
                            style={{ color: triggered ? '#ef4444' : 'var(--accent)' }}
                            className="aura-widget-icon shrink-0"
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title || t('alarm.title')}
                        </p>
                    )}
                </div>
            )}

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
                        <StatePill
                            code={data.stateCode}
                            label={t(stateInfo.labelKey) || data.stateText}
                            fontSize={fsTiny}
                        />
                        {data.sleep && (
                            <span
                                className="inline-flex items-center gap-1"
                                style={{ color: '#6366f1', fontSize: fsTiny }}
                            >
                                <Moon size={Math.round(12 * sizeScale)} /> {t('alarm.nightRest')}
                            </span>
                        )}
                    </div>
                    {showPresence && (
                        <button
                            onClick={() => setState(`${prefix}.presence.on_off`, !presence.value)}
                            className="inline-flex items-center gap-1 rounded-full"
                            style={{
                                fontSize: fsTiny,
                                padding: `${2 * sizeScale}px ${8 * sizeScale}px`,
                                background: presence.value ? '#10b98122' : 'var(--app-surface)',
                                color: presence.value ? '#10b981' : 'var(--text-secondary)',
                                border: `1px solid ${presence.value ? '#10b98155' : 'var(--app-border)'}`,
                            }}
                            title={t('alarm.presence') as string}
                        >
                            <Home size={Math.round(11 * sizeScale)} />
                            {presence.value ? (t('alarm.presence.on') as string) : (t('alarm.presence.off') as string)}
                        </button>
                    )}
                </div>
            )}

            {/* Trigger state: PIN entry takes priority */}
            {triggered && (pinOpen || requirePin) ? (
                <div
                    className="flex items-center rounded-xl shrink-0"
                    style={{
                        padding: 8 * sizeScale,
                        background: 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                        gap: 6 * sizeScale,
                    }}
                >
                    <KeyRound size={Math.round(14 * sizeScale)} color="#ef4444" />
                    <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder={t('alarm.pinPlaceholder') as string}
                        className="flex-1 rounded-lg px-2 py-1 font-mono"
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
                    <button
                        onClick={submitPin}
                        className="rounded-lg flex items-center gap-1"
                        style={{
                            padding: `${4 * sizeScale}px ${10 * sizeScale}px`,
                            background: '#ef4444',
                            color: '#fff',
                            border: '1px solid #ef4444',
                            fontSize: fsSmall,
                        }}
                    >
                        <Send size={Math.round(12 * sizeScale)} /> {t('alarm.send') as string}
                    </button>
                    {data.wrongPassword && (
                        <span style={{ color: '#ef4444', fontSize: fsTiny }}>{t('alarm.wrongPin') as string}</span>
                    )}
                </div>
            ) : (
                showModes &&
                modeButtons.length > 0 && (
                    <div
                        className="grid shrink-0"
                        style={{
                            gridTemplateColumns: `repeat(${
                                compactMode ? Math.min(2, modeButtons.length) : modeButtons.length
                            }, minmax(0, 1fr))`,
                            gap: 6 * sizeScale,
                        }}
                    >
                        {modeButtons.map((m) => (
                            <ModeButton
                                key={m.key}
                                active={m.active}
                                color={m.color}
                                label={m.label}
                                Icon={m.Icon}
                                onClick={m.onClick}
                                disabled={m.disabled}
                                fontSize={fsModeLabel}
                                iconSize={fsModeIcon}
                            />
                        ))}
                    </div>
                )
            )}

            {/* Secondary actions (delay + panic + quit) */}
            {!triggered && (showDelay || showPanic) && (
                <div className="flex shrink-0" style={{ gap: 6 * sizeScale }}>
                    {showDelay && (
                        <button
                            onClick={doEnableDelay}
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
                    {showPanic && (
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

            {/* Countdown + circuit warnings + quit */}
            {showCountdown && (data.activationCountdown > 0 || data.silentCountdown > 0) && (
                <div
                    className="flex items-center rounded-lg shrink-0"
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
                    {data.activationCountdown > 0 ? (
                        <>
                            {t('alarm.activatingIn') as string}{' '}
                            <strong>{fmtCountdown(data.activationCountdown)}</strong>
                        </>
                    ) : (
                        <>
                            {t('alarm.silentIn') as string} <strong>{fmtCountdown(data.silentCountdown)}</strong>
                        </>
                    )}
                </div>
            )}

            {showCircuits && data.alarmCircuitList && (
                <div
                    className="flex items-start rounded-lg shrink-0"
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
                        {t('alarm.openCircuits') as string}: {data.alarmCircuitList}
                    </span>
                    <button
                        onClick={doQuit}
                        className="rounded inline-flex items-center gap-1"
                        style={{
                            padding: `${2 * sizeScale}px ${6 * sizeScale}px`,
                            fontSize: fsTiny,
                            color: '#ef4444',
                            border: '1px solid #ef444499',
                            background: 'transparent',
                        }}
                        title={t('alarm.quitChanges') as string}
                    >
                        <Ban size={Math.round(11 * sizeScale)} />
                        {t('alarm.quit') as string}
                    </button>
                </div>
            )}

            {showCircuits && !data.alarmCircuitList && data.notificationCircuitList && (
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
                    {data.notificationCircuitList}
                </div>
            )}

            {/* Zones */}
            {showZones && <ZonesRow prefix={prefix} sizeScale={sizeScale} />}

            {/* Log (today) */}
            {showLog && logEntries.length > 0 && (
                <div
                    className="flex flex-col rounded-lg overflow-hidden min-h-0"
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
                        {logEntries.map((entry, i) => (
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

// ── ZonesRow ─────────────────────────────────────────────────────────────────

function ZonesRow({ prefix, sizeScale }: { prefix: string; sizeScale: number }) {
    const t = useT();
    const { setState } = useIoBroker();
    const zones = [
        { key: 'one', label: t('alarm.zone.one') as string },
        { key: 'two', label: t('alarm.zone.two') as string },
        { key: 'three', label: t('alarm.zone.three') as string },
    ];
    return (
        <div className="flex shrink-0" style={{ gap: 6 * sizeScale }}>
            {zones.map((z) => (
                <ZoneTile
                    key={z.key}
                    prefix={prefix}
                    zoneKey={z.key}
                    label={z.label}
                    sizeScale={sizeScale}
                    setState={setState}
                />
            ))}
        </div>
    );
}

function ZoneTile({
    prefix,
    zoneKey,
    label,
    sizeScale,
    setState,
}: {
    prefix: string;
    zoneKey: string;
    label: string;
    sizeScale: number;
    setState: (id: string, val: boolean | number | string) => void;
}) {
    const enabled = useDatapoint(`${prefix}.zone.${zoneKey}_on_off`);
    const trig = useDatapoint(`${prefix}.zone.${zoneKey}`);
    const isOn = enabled.value === true;
    const isTrig = trig.value === true;
    const color = isTrig ? '#ef4444' : isOn ? '#10b981' : 'var(--text-secondary)';
    const fsLabel = 10 * sizeScale;
    const fsSub = 9 * sizeScale;
    return (
        <button
            onClick={() => setState(`${prefix}.zone.${zoneKey}_on_off`, !isOn)}
            className="flex-1 flex flex-col items-center rounded-lg transition-colors min-w-0"
            style={{
                padding: `${4 * sizeScale}px ${4 * sizeScale}px`,
                background: isTrig ? '#ef444422' : isOn ? `${color}18` : 'var(--app-bg)',
                border: `1px solid ${isTrig ? '#ef444499' : isOn ? `${color}55` : 'var(--app-border)'}`,
                gap: 2 * sizeScale,
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
                {isTrig ? '⚠' : isOn ? 'on' : 'off'}
            </span>
        </button>
    );
}

// ── Config panel (rendered by WidgetFrame) ───────────────────────────────────

export function AlarmConfig({
    config,
    onConfigChange,
}: {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    const prefix = (o.alarmPrefix as string) ?? 'alarm.0';
    const logLines = (o.logLines as number) ?? 5;
    const sizeScale = (o.sizeScale as number) ?? 1;

    const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
    const inputSty: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    const Toggle = ({ label, k, def, hint }: { label: string; k: string; def?: boolean; hint?: string }) => {
        const val = (o[k] as boolean | undefined) ?? def ?? false;
        return (
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {label}
                    </label>
                    {hint && (
                        <span className="text-[10px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                            {hint}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => set({ [k]: !val })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: val ? '18px' : '2px' }}
                    />
                </button>
            </div>
        );
    };

    return (
        <>
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('alarm.cfg.prefix') as string}
                </label>
                <input
                    type="text"
                    value={prefix}
                    onChange={(e) => set({ alarmPrefix: e.target.value || 'alarm.0' })}
                    placeholder="alarm.0"
                    className={`${inputCls} font-mono`}
                    style={inputSty}
                />
            </div>

            <div className="pt-1 mt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('alarm.cfg.sections') as string}
                </div>
                <div className="space-y-2">
                    <Toggle label={t('alarm.cfg.showHeader') as string} k="showHeader" def={true} />
                    <Toggle label={t('alarm.cfg.showModes') as string} k="showModes" def={true} />
                    {(o.showModes as boolean | undefined) !== false && (
                        <div
                            className="ml-3 pl-3 space-y-2 border-l"
                            style={{ borderColor: 'var(--app-border)' }}
                        >
                            <Toggle label={t('alarm.cfg.showModeOff') as string} k="showModeOff" def={true} />
                            <Toggle label={t('alarm.cfg.showModeSharp') as string} k="showModeSharp" def={true} />
                            <Toggle
                                label={t('alarm.cfg.showModeInside') as string}
                                k="showModeInside"
                                def={true}
                            />
                            <Toggle
                                label={t('alarm.cfg.showModeNight') as string}
                                k="showModeNight"
                                def={true}
                            />
                        </div>
                    )}
                    <Toggle label={t('alarm.cfg.showDelay') as string} k="showDelay" def={true} />
                    <Toggle label={t('alarm.cfg.showCountdown') as string} k="showCountdown" def={true} />
                    <Toggle label={t('alarm.cfg.showCircuits') as string} k="showCircuits" def={true} />
                    <Toggle label={t('alarm.cfg.showZones') as string} k="showZones" def={true} />
                    <Toggle label={t('alarm.cfg.showLog') as string} k="showLog" def={true} />
                    <Toggle
                        label={t('alarm.cfg.showPanic') as string}
                        k="showPanic"
                        def={false}
                        hint={t('alarm.cfg.showPanic.hint') as string}
                    />
                    <Toggle label={t('alarm.cfg.showPresence') as string} k="showPresence" def={false} />
                </div>
            </div>

            <div className="pt-1 mt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('alarm.cfg.behavior') as string}
                </div>
                <div className="space-y-2">
                    <Toggle
                        label={t('alarm.cfg.requirePin') as string}
                        k="requirePinForDisarm"
                        def={false}
                        hint={t('alarm.cfg.requirePin.hint') as string}
                    />
                    <Toggle label={t('alarm.cfg.panicConfirm') as string} k="panicConfirm" def={true} />
                    <Toggle
                        label={t('alarm.cfg.compactMode') as string}
                        k="compactMode"
                        def={false}
                        hint={t('alarm.cfg.compactMode.hint') as string}
                    />
                </div>
            </div>

            <div>
                <label
                    className="text-[11px] mb-1 flex items-center justify-between"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <span>{t('alarm.cfg.logLines') as string}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{logLines}</span>
                </label>
                <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={logLines}
                    onChange={(e) => set({ logLines: Number(e.target.value) })}
                    className="w-full"
                />
            </div>

            <div>
                <label
                    className="text-[11px] mb-1 flex items-center justify-between"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <span>{t('alarm.cfg.sizeScale') as string}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{sizeScale.toFixed(2)}×</span>
                </label>
                <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.05}
                    value={sizeScale}
                    onChange={(e) => set({ sizeScale: Number(e.target.value) })}
                    className="w-full"
                />
            </div>
        </>
    );
}
