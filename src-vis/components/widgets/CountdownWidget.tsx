/**
 * Countdown widget (#675).
 *
 * Two sources:
 *   aura       — the adapter runs the countdown (lib/countdowns.js). The widget
 *                publishes its config to aura.0.countdowns.<key>.config, sends
 *                commands through .cmd and mirrors .state/.endTs/.remainingMs/
 *                .durationMs. The remaining time is derived locally from endTs
 *                once a second, so nothing flows over the socket while it runs
 *                and the countdown keeps going when this tab is closed.
 *   datapoint  — display only: a foreign datapoint holding the remaining time
 *                in ms or s, or the end as an epoch timestamp (mytime `end`).
 *
 * Layouts: default (title, digits, progress, controls, presets), compact (one
 * row), custom (CustomGridView with digits/progress/controls/step/presets).
 * In the editor the widget shows live values but every control is inert.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hourglass, Play, Pause, Square, Plus, Minus } from 'lucide-react';
import type { WidgetProps, CountdownFormat, CountdownDpKind, CountdownSource } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT, type TranslationKey } from '../../i18n';
import { subscribeDpValue, useIoBroker } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import { publishCountdownConfig, countdownStateId, type CountdownConfigPayload } from '../../utils/publishCountdown';
import { formatCountdown, formatPreset } from '../../utils/countdownFormat';
import { CountdownDurationModal } from './CountdownDurationModal';
import { CustomGridView } from './CustomGridView';

type Phase = 'idle' | 'running' | 'paused' | 'ended' | 'unknown';

interface Live {
    phase: Phase;
    endTs: number;
    remainingMs: number;
    durationMs: number;
}

const INITIAL_LIVE: Live = { phase: 'unknown', endTs: 0, remainingMs: 0, durationMs: 0 };

const PHASE_COLOR: Record<Phase, string> = {
    idle: 'var(--text-primary)',
    running: 'var(--accent)',
    paused: 'var(--accent-yellow)',
    ended: 'var(--accent-green)',
    unknown: 'var(--text-secondary)',
};

function asNumber(v: unknown): number {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : 0;
}

/** Font size that lets `chars` tabular digits fill a w×h box (≈0.62 em per glyph). */
function fitDigitPx(w: number, h: number, chars: number): number {
    if (w <= 0 || h <= 0 || chars <= 0) return 0;
    const byWidth = w / (chars * 0.62);
    const byHeight = h * 0.9;
    return Math.max(12, Math.min(160, Math.floor(Math.min(byWidth, byHeight))));
}

const btnBase = 'nodrag flex items-center justify-center rounded-full transition-opacity disabled:opacity-40';
// Literal class names so Tailwind's scanner sees them (a template `w-${n}` would not be generated).
const BTN_SIZE: Record<number, string> = { 7: 'w-7 h-7', 8: 'w-8 h-8', 9: 'w-9 h-9' };
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function CountdownWidget({ config, editMode, onConfigChange }: WidgetProps) {
    const t = useT();
    const o = (config.options ?? {}) as Record<string, unknown>;
    const source: CountdownSource = o.source === 'datapoint' ? 'datapoint' : 'aura';
    const isDp = source === 'datapoint';
    const dpKind = (o.dpKind as CountdownDpKind | undefined) ?? 'remaining-ms';
    const durationSec = Math.max(0, asNumber(o.durationSec));
    const stepSec = Math.max(1, asNumber(o.stepSec) || 60);
    const presets = useMemo(
        () =>
            Array.isArray(o.presets)
                ? (o.presets as unknown[]).map(asNumber).filter((n) => n > 0 && Number.isFinite(n))
                : [],
        [o.presets],
    );
    const targetDp = o.targetDp as string | undefined;
    const valueOnEnd = o.valueOnEnd as string | undefined;
    const valueOnStart = o.valueOnStart as string | undefined;
    const stopWritesEnd = o.stopWritesEnd as boolean | undefined;
    const publishRemaining = o.publishRemaining === true;
    const format = (o.format as CountdownFormat | undefined) ?? 'auto';
    const showDays = o.showDays === true;
    const digitSize = Math.max(0, asNumber(o.digitSize));
    const showProgress = o.showProgress !== false && !isDp;
    const showControls = o.showControls !== false && !isDp;
    const showStep = o.showStep !== false && !isDp;
    const showPresets = o.showPresets !== false && !isDp;
    const endedText = ((o.endedText as string | undefined) ?? '').trim();
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const iconSize = asNumber(o.iconSize) || 18;
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Hourglass);
    const posClass = contentPositionClass(o.contentPosition as string | undefined);
    const layout = config.layout ?? 'default';
    const interactive = !editMode;
    const { setState } = useIoBroker();

    // Stable, instance-unique backend key — same scheme as the Zeitschaltuhr:
    // copies are stripped of stateBaseId and get their own channel.
    useLayoutEffect(() => {
        if (isDp || o.stateBaseId) return;
        const seg =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        onConfigChange({ ...config, options: { ...o, stateBaseId: `${NS}.countdowns.${seg}` } });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const backendKey = isDp ? null : (o.stateBaseId as string | undefined)?.split('.').pop() || null;

    // ── Publish config to the adapter whenever it changes ──────────────────────
    const lastPublishedRef = useRef('');
    useEffect(() => {
        if (!backendKey) return;
        const payload: CountdownConfigPayload = {
            durationSec,
            targetDp,
            valueOnEnd,
            valueOnStart,
            stopWritesEnd,
            publishRemaining,
            title: config.title,
        };
        const serialized = JSON.stringify(payload);
        if (serialized !== lastPublishedRef.current) {
            publishCountdownConfig(backendKey, config.title || 'Countdown', payload);
            lastPublishedRef.current = serialized;
        }
    }, [backendKey, durationSec, targetDp, valueOnEnd, valueOnStart, stopWritesEnd, publishRemaining, config.title]);

    // ── Mirror the adapter's status states ─────────────────────────────────────
    const [live, setLive] = useState<Live>(INITIAL_LIVE);
    useEffect(() => {
        if (!backendKey) return;
        setLive(INITIAL_LIVE);
        const patch = (p: Partial<Live>) => setLive((cur) => ({ ...cur, ...p }));
        const unsubs = [
            subscribeDpValue(countdownStateId(backendKey, 'state'), (v) => {
                const s = String(v ?? '');
                patch({
                    phase: s === 'running' || s === 'paused' || s === 'ended' || s === 'idle' ? s : 'unknown',
                });
            }),
            subscribeDpValue(countdownStateId(backendKey, 'endTs'), (v) => patch({ endTs: asNumber(v) })),
            subscribeDpValue(countdownStateId(backendKey, 'remainingMs'), (v) => patch({ remainingMs: asNumber(v) })),
            subscribeDpValue(countdownStateId(backendKey, 'durationMs'), (v) => patch({ durationMs: asNumber(v) })),
        ];
        return () => unsubs.forEach((u) => u());
    }, [backendKey]);

    // ── Foreign datapoint (display only) ───────────────────────────────────────
    const [anchor, setAnchor] = useState<{ value: number; at: number } | null>(null);
    useEffect(() => {
        if (!isDp) return;
        setAnchor(null);
        const dp = config.datapoint;
        if (!dp) return;
        return subscribeDpValue(dp, (v) => setAnchor({ value: asNumber(v), at: Date.now() }));
    }, [isDp, config.datapoint]);

    // ── Derive phase / remaining / end for the current tick ────────────────────
    const [nowTick, setNowTick] = useState(() => Date.now());
    let phase: Phase;
    let remainingMs: number;
    let endRef = 0; // where the whole seconds flip — aligns the tick
    let durationMs = live.durationMs;
    if (isDp) {
        durationMs = 0;
        if (!anchor || !config.datapoint) {
            phase = 'unknown';
            remainingMs = 0;
        } else {
            const raw = anchor.value;
            if (dpKind === 'end-ts') {
                endRef = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
            } else {
                endRef = anchor.at + (dpKind === 'remaining-s' ? raw * 1000 : raw);
            }
            remainingMs = Math.max(0, endRef - nowTick);
            phase = remainingMs > 0 ? 'running' : raw > 0 ? 'ended' : 'idle';
        }
    } else {
        phase = live.phase;
        endRef = live.endTs;
        if (phase === 'running') remainingMs = Math.max(0, live.endTs - nowTick);
        else if (phase === 'paused') remainingMs = live.remainingMs;
        else if (phase === 'idle') remainingMs = live.remainingMs || live.durationMs;
        else if (phase === 'ended') remainingMs = 0;
        else remainingMs = durationSec * 1000;
    }
    const running = phase === 'running';

    // One tick per second, aligned to the moment the whole seconds change, only
    // while running and only while the tab is visible (visited tabs stay mounted).
    useEffect(() => {
        if (!running) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let interval: ReturnType<typeof setInterval> | null = null;
        const tick = () => setNowTick(Date.now());
        const stop = () => {
            if (timer) clearTimeout(timer);
            if (interval) clearInterval(interval);
            timer = null;
            interval = null;
        };
        const start = () => {
            stop();
            tick();
            if (document.hidden) return;
            const ref = endRef || Date.now();
            const delay = ((((ref - Date.now()) % 1000) + 1000) % 1000) + 30;
            timer = setTimeout(() => {
                tick();
                interval = setInterval(tick, 1000);
            }, delay);
        };
        document.addEventListener('visibilitychange', start);
        start();
        return () => {
            stop();
            document.removeEventListener('visibilitychange', start);
        };
    }, [running, endRef]);

    const digits = phase === 'ended' && endedText ? endedText : formatCountdown(remainingMs, format, showDays);
    const color = PHASE_COLOR[phase];
    const fraction =
        durationMs > 0 && (phase === 'running' || phase === 'paused')
            ? Math.min(1, remainingMs / durationMs)
            : phase === 'idle'
              ? 1
              : 0;
    const stateLabel = t(`countdown.state.${phase}` as TranslationKey);

    // ── Commands ───────────────────────────────────────────────────────────────
    const send = (cmd: string) => {
        if (!interactive || !backendKey) return;
        setState(countdownStateId(backendKey, 'cmd'), cmd);
    };
    const canCommand = interactive && !!backendKey && phase !== 'unknown';
    const primaryCmd = phase === 'running' ? 'pause' : phase === 'paused' ? 'resume' : 'start';
    const primaryLabel =
        phase === 'running' ? t('countdown.pause') : phase === 'paused' ? t('countdown.resume') : t('countdown.start');
    const PrimaryIcon = phase === 'running' ? Pause : Play;

    const [editingDuration, setEditingDuration] = useState(false);
    const currentSeconds = Math.round((durationMs || durationSec * 1000) / 1000);

    // ── Digits: fit the box unless a fixed size is configured ──────────────────
    const boxRef = useRef<HTMLDivElement>(null);
    const [autoPx, setAutoPx] = useState(0);
    const chars = digits.length;
    useEffect(() => {
        if (digitSize > 0) return;
        const el = boxRef.current;
        if (!el) return;
        const measure = () => setAutoPx(fitDigitPx(el.clientWidth, el.clientHeight, chars));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [digitSize, chars, layout]);
    const digitPx = digitSize > 0 ? digitSize : autoPx || 28;

    // ── Building blocks (also handed to the custom layout) ─────────────────────
    const iconNode = showIcon ? (
        <span className="shrink-0 flex items-center" style={{ color }}>
            <WidgetIcon size={iconSize} />
        </span>
    ) : null;

    const digitsNode = (
        <div ref={boxRef} className="aura-countdown-digits relative flex-1 min-h-0 w-full" style={{ minHeight: 24 }}>
            <button
                type="button"
                onClick={canCommand ? () => setEditingDuration(true) : undefined}
                disabled={!canCommand}
                className="nodrag absolute inset-0 flex items-center justify-center font-semibold tabular-nums leading-none whitespace-nowrap disabled:cursor-default"
                style={{
                    fontSize: `${digitPx}px`,
                    color,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: canCommand ? 'pointer' : 'default',
                    opacity: phase === 'unknown' ? 0.6 : 1,
                }}
                title={interactive ? (canCommand ? t('countdown.setDuration') : stateLabel) : t('countdown.editHint')}
                aria-label={t('countdown.setDuration')}
            >
                {isDp && !config.datapoint ? t('countdown.noDatapoint') : digits}
            </button>
        </div>
    );

    const progressNode = (
        <div
            className="aura-countdown-progress w-full h-1 rounded-full overflow-hidden shrink-0"
            style={{ background: 'var(--app-border)' }}
            role="progressbar"
            aria-valuenow={Math.round(fraction * 100)}
        >
            <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${fraction * 100}%`, background: color }}
            />
        </div>
    );

    const stepButton = (sign: '+' | '-') => {
        const label =
            sign === '+'
                ? t('countdown.addTime', { t: formatPreset(stepSec) })
                : t('countdown.removeTime', { t: formatPreset(stepSec) });
        const Icon = sign === '+' ? Plus : Minus;
        return (
            <button
                type="button"
                onClick={() => send(`${sign}${stepSec}`)}
                disabled={!canCommand}
                className={`${btnBase} aura-countdown-step w-8 h-8`}
                style={btnStyle}
                title={label}
                aria-label={label}
            >
                <Icon size={14} />
            </button>
        );
    };

    const primaryButton = (size = 9) => (
        <button
            type="button"
            onClick={() => send(primaryCmd)}
            disabled={!canCommand}
            className={`${btnBase} aura-countdown-primary ${BTN_SIZE[size] ?? BTN_SIZE[9]} text-white`}
            style={{ background: 'var(--accent)' }}
            title={primaryLabel}
            aria-label={primaryLabel}
            data-cmd={primaryCmd}
        >
            <PrimaryIcon size={size >= 9 ? 16 : 13} fill="currentColor" />
        </button>
    );

    const stopButton = (size = 8) => (
        <button
            type="button"
            onClick={() => send('stop')}
            disabled={!canCommand || phase === 'idle'}
            className={`${btnBase} aura-countdown-stop ${BTN_SIZE[size] ?? BTN_SIZE[8]}`}
            style={btnStyle}
            title={t('countdown.stop')}
            aria-label={t('countdown.stop')}
            data-cmd="stop"
        >
            <Square size={size >= 8 ? 12 : 10} fill="currentColor" />
        </button>
    );

    const controlsNode = (
        <div className="aura-countdown-controls flex items-center justify-center gap-2 shrink-0">
            {showStep && stepButton('-')}
            {primaryButton()}
            {stopButton()}
            {showStep && stepButton('+')}
        </div>
    );

    const stepNode = (
        <div className="aura-countdown-steps flex items-center justify-center gap-2 shrink-0">
            {stepButton('-')}
            {stepButton('+')}
        </div>
    );

    const presetsNode =
        presets.length > 0 ? (
            <div className="aura-countdown-presets flex flex-wrap items-center justify-center gap-1 shrink-0">
                {presets.map((p) => {
                    const active = currentSeconds === p;
                    return (
                        <button
                            key={p}
                            type="button"
                            onClick={() => send(`=${p}`)}
                            disabled={!canCommand}
                            className="nodrag text-[10px] leading-none px-2 py-1 rounded-full transition-opacity disabled:opacity-40"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-primary)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                            title={t('countdown.setPreset', { t: formatPreset(p) })}
                        >
                            {formatPreset(p)}
                        </button>
                    );
                })}
            </div>
        ) : null;

    const titleNode = showTitle ? (
        <p
            className="aura-widget-title text-xs flex-1 truncate"
            style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
        >
            {config.title}
        </p>
    ) : null;

    const modal = editingDuration && (
        <CountdownDurationModal
            initialSeconds={currentSeconds}
            presets={presets}
            onApply={(sec) => {
                if (sec > 0) send(`=${sec}`);
                setEditingDuration(false);
            }}
            onCancel={() => setEditingDuration(false)}
        />
    );

    // ── Custom layout ──────────────────────────────────────────────────────────
    if (layout === 'custom') {
        return (
            <div className="aura-widget-row aura-countdown relative w-full h-full" data-state={phase}>
                <CustomGridView
                    config={config}
                    value={digits}
                    extraFields={{
                        remaining: digits,
                        state: stateLabel,
                        duration: formatCountdown((durationMs || durationSec * 1000) as number, format, showDays),
                        target: targetDp ?? '',
                    }}
                    extraComponents={{
                        icon: iconNode,
                        digits: digitsNode,
                        progress: progressNode,
                        controls: showControls ? controlsNode : null,
                        step: showStep ? stepNode : null,
                        presets: showPresets ? presetsNode : null,
                    }}
                />
                {modal}
            </div>
        );
    }

    // ── Compact layout: one row ────────────────────────────────────────────────
    if (layout === 'compact') {
        return (
            <div
                className={`aura-widget-row aura-countdown flex items-center gap-2 h-full ${posClass}`}
                data-state={phase}
            >
                {iconNode}
                {titleNode}
                <span
                    className="aura-countdown-digits font-semibold tabular-nums shrink-0"
                    style={{ color, fontSize: digitSize > 0 ? `${digitSize}px` : undefined }}
                    title={stateLabel}
                >
                    {isDp && !config.datapoint ? t('countdown.noDatapoint') : digits}
                </span>
                {showControls && primaryButton(7)}
                {showControls && stopButton(7)}
                {modal}
            </div>
        );
    }

    // ── Default layout ─────────────────────────────────────────────────────────
    return (
        <div className={`aura-widget-row aura-countdown flex flex-col h-full gap-1.5 ${posClass}`} data-state={phase}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1.5 shrink-0">
                    {iconNode}
                    {titleNode}
                    <span
                        className="aura-countdown-state text-[10px] shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {stateLabel}
                    </span>
                </div>
            )}
            {digitsNode}
            {showProgress && progressNode}
            {showControls && controlsNode}
            {showPresets && presetsNode}
            {modal}
        </div>
    );
}
