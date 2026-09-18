/**
 * Configuration panel of the Countdown widget (#675) — shown in the widget edit
 * sidebar. Source (own countdown vs. foreign datapoint), duration, ± step and
 * presets, the target action the adapter performs, and the display switches.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import type { WidgetConfig, CountdownDpKind, CountdownFormat } from '../../types';
import { useT } from '../../i18n';
import { DatapointPicker } from './DatapointPicker';
import { formatPreset, parseDurationText, splitDuration } from '../../utils/countdownFormat';

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintCls = 'text-[10px] mt-0.5';
const hintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };
const boxCls = 'rounded-xl p-2 space-y-2';
const boxStyle: React.CSSProperties = { background: 'var(--app-bg)', border: '1px solid var(--app-border)' };

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
            aria-pressed={on}
        >
            <span
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                style={{ left: on ? '14px' : '2px' }}
            />
        </button>
    );
}

function presetsToText(presets: unknown): string {
    if (!Array.isArray(presets)) return '';
    return presets
        .map((p) => Number(p))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => (n % 60 === 0 ? formatPreset(n).replace(' ', '') : String(n)))
        .join(', ');
}

export function CountdownConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const isDp = o.source === 'datapoint';
    const dpKind = (o.dpKind as CountdownDpKind | undefined) ?? 'remaining-ms';
    const durationSec = Number(o.durationSec) || 0;
    const stepSec = Number(o.stepSec) || 60;
    const targetDp = (o.targetDp as string | undefined) ?? '';
    const valueOnEnd = (o.valueOnEnd as string | undefined) ?? '';
    const valueOnStart = (o.valueOnStart as string | undefined) ?? '';
    const stopWritesEnd = o.stopWritesEnd === true;
    const publishRemaining = o.publishRemaining === true;
    const format = (o.format as CountdownFormat | undefined) ?? 'auto';
    const showDays = o.showDays === true;
    const digitSize = Number(o.digitSize) || 0;
    const showProgress = o.showProgress !== false;
    const showControls = o.showControls !== false;
    const showStep = o.showStep !== false;
    const showPresets = o.showPresets !== false;
    const endedText = (o.endedText as string | undefined) ?? '';
    const stateBaseId = o.stateBaseId as string | undefined;

    const [picker, setPicker] = useState<'source' | 'target' | null>(null);
    const [presetText, setPresetText] = useState(() => presetsToText(o.presets));
    const [presetError, setPresetError] = useState(false);

    const setOpts = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const dur = splitDuration(durationSec);
    const setDuration = (h: number, m: number, s: number) =>
        setOpts({ durationSec: Math.max(0, Math.floor(h) * 3600 + Math.floor(m) * 60 + Math.floor(s)) });

    const onPresetText = (text: string) => {
        setPresetText(text);
        const tokens = text
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        const parsed = tokens.map(parseDurationText);
        if (parsed.some((p) => p == null || p <= 0)) {
            setPresetError(tokens.length > 0);
            return;
        }
        setPresetError(false);
        setOpts({ presets: parsed as number[] });
    };

    const durationField = (label: string, value: number, max: number, set: (v: number) => void) => (
        <label className="flex flex-col items-center flex-1 min-w-0">
            <input
                type="number"
                min={0}
                max={max}
                value={value}
                onChange={(e) => set(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                className={`${inputCls} text-center tabular-nums`}
                style={inputStyle}
            />
            <span className="text-[10px] mt-0.5" style={labelStyle}>
                {label}
            </span>
        </label>
    );

    const dpField = (value: string, onChange: (v: string) => void, which: 'source' | 'target', placeholder: string) => (
        <div className="flex gap-1">
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`flex-1 font-mono min-w-0 ${inputCls}`}
                style={inputStyle}
            />
            <button
                type="button"
                onClick={() => setPicker(which)}
                className="px-2 rounded-lg shrink-0"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                }}
            >
                <Database size={13} />
            </button>
        </div>
    );

    return (
        <>
            {picker && (
                <DatapointPicker
                    currentValue={picker === 'source' ? config.datapoint : targetDp}
                    onSelect={(id) => {
                        if (picker === 'source') onConfigChange({ ...config, datapoint: id });
                        else setOpts({ targetDp: id });
                        setPicker(null);
                    }}
                    onClose={() => setPicker(null)}
                />
            )}

            <div className="space-y-3">
                {/* ── Quelle ─────────────────────────────────────────────────── */}
                <div className={boxCls} style={boxStyle}>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('countdown.cfg.source')}
                    </p>
                    <div className="flex gap-1">
                        {(
                            [
                                { id: 'aura', label: t('countdown.cfg.sourceAura') },
                                { id: 'datapoint', label: t('countdown.cfg.sourceDp') },
                            ] as const
                        ).map((opt) => {
                            const active = (isDp ? 'datapoint' : 'aura') === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setOpts({ source: opt.id })}
                                    className="flex-1 text-[10px] leading-tight rounded-lg px-2 py-1.5"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-surface)',
                                        color: active ? '#fff' : 'var(--text-primary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                    data-source={opt.id}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    {isDp && (
                        <>
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    {t('countdown.cfg.dp')}
                                </label>
                                {dpField(
                                    config.datapoint ?? '',
                                    (v) => onConfigChange({ ...config, datapoint: v }),
                                    'source',
                                    'mytime.0.Countdowns.test.end',
                                )}
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    {t('countdown.cfg.dpKind')}
                                </label>
                                <select
                                    value={dpKind}
                                    onChange={(e) => setOpts({ dpKind: e.target.value })}
                                    className={inputCls}
                                    style={inputStyle}
                                >
                                    <option value="remaining-ms">{t('countdown.cfg.dpKind.remainingMs')}</option>
                                    <option value="remaining-s">{t('countdown.cfg.dpKind.remainingS')}</option>
                                    <option value="end-ts">{t('countdown.cfg.dpKind.endTs')}</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>

                {!isDp && (
                    <>
                        {/* ── Dauer ──────────────────────────────────────────────── */}
                        <div className={boxCls} style={boxStyle}>
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('countdown.cfg.duration')}
                            </p>
                            <div className="flex items-start gap-1.5">
                                {durationField(t('countdown.hours'), dur.h, 999, (v) => setDuration(v, dur.m, dur.s))}
                                {durationField(t('countdown.minutes'), dur.m, 59, (v) => setDuration(dur.h, v, dur.s))}
                                {durationField(t('countdown.seconds'), dur.s, 59, (v) => setDuration(dur.h, dur.m, v))}
                            </div>
                            <p className={hintCls} style={hintStyle}>
                                {t('countdown.cfg.durationHint')}
                            </p>
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    {t('countdown.cfg.step')}
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={stepSec}
                                    onChange={(e) => setOpts({ stepSec: Math.max(1, Number(e.target.value) || 1) })}
                                    className={`${inputCls} tabular-nums`}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    {t('countdown.cfg.presets')}
                                </label>
                                <input
                                    type="text"
                                    value={presetText}
                                    onChange={(e) => onPresetText(e.target.value)}
                                    placeholder="5m, 15m, 1h"
                                    className={`${inputCls} font-mono`}
                                    style={{
                                        ...inputStyle,
                                        borderColor: presetError ? 'var(--accent-red)' : 'var(--app-border)',
                                    }}
                                />
                                <p className={hintCls} style={hintStyle}>
                                    {t('countdown.cfg.presetsHint')}
                                </p>
                            </div>
                        </div>

                        {/* ── Ziel-Aktion ────────────────────────────────────────── */}
                        <div className={boxCls} style={boxStyle}>
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('countdown.cfg.target')}
                            </p>
                            <p className={hintCls} style={hintStyle}>
                                {t('countdown.cfg.targetHint')}
                            </p>
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    {t('countdown.cfg.targetDp')}
                                </label>
                                {dpField(
                                    targetDp,
                                    (v) => setOpts({ targetDp: v || undefined }),
                                    'target',
                                    'z.B. hue.0.light.1.on',
                                )}
                            </div>
                            <div className="flex gap-1.5">
                                <div className="flex-1 min-w-0">
                                    <label className={labelCls} style={labelStyle}>
                                        {t('countdown.cfg.valueOnStart')}
                                    </label>
                                    <input
                                        type="text"
                                        value={valueOnStart}
                                        onChange={(e) => setOpts({ valueOnStart: e.target.value || undefined })}
                                        placeholder="true"
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className={labelCls} style={labelStyle}>
                                        {t('countdown.cfg.valueOnEnd')}
                                    </label>
                                    <input
                                        type="text"
                                        value={valueOnEnd}
                                        onChange={(e) => setOpts({ valueOnEnd: e.target.value || undefined })}
                                        placeholder="false"
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                            <p className={hintCls} style={hintStyle}>
                                {t('countdown.cfg.valueHint')}
                            </p>
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="min-w-0">
                                    <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                        {t('countdown.cfg.stopWritesEnd')}
                                    </p>
                                    <p className={hintCls} style={hintStyle}>
                                        {t('countdown.cfg.stopWritesEndHint')}
                                    </p>
                                </div>
                                <Toggle
                                    on={stopWritesEnd}
                                    onToggle={() => setOpts({ stopWritesEnd: !stopWritesEnd })}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                        {t('countdown.cfg.publishRemaining')}
                                    </p>
                                    <p className={hintCls} style={hintStyle}>
                                        {t('countdown.cfg.publishRemainingHint')}
                                    </p>
                                </div>
                                <Toggle
                                    on={publishRemaining}
                                    onToggle={() => setOpts({ publishRemaining: !publishRemaining })}
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* ── Anzeige ────────────────────────────────────────────────── */}
                <div className={boxCls} style={boxStyle}>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('countdown.cfg.display')}
                    </p>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            {t('countdown.cfg.format')}
                        </label>
                        <select
                            value={format}
                            onChange={(e) => setOpts({ format: e.target.value })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="auto">{t('countdown.cfg.format.auto')}</option>
                            <option value="hms">{t('countdown.cfg.format.hms')}</option>
                            <option value="ms">{t('countdown.cfg.format.ms')}</option>
                            <option value="hm">{t('countdown.cfg.format.hm')}</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] shrink-0" style={labelStyle}>
                            {t('countdown.cfg.digitSize')}
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={120}
                            step={2}
                            value={digitSize}
                            onChange={(e) => setOpts({ digitSize: Number(e.target.value) || 0 })}
                            className="flex-1"
                        />
                        <span className="text-[10px] font-mono w-9 text-right" style={labelStyle}>
                            {digitSize > 0 ? `${digitSize}px` : t('countdown.cfg.digitAuto')}
                        </span>
                    </div>
                    {(
                        [
                            { key: 'showDays', label: t('countdown.cfg.showDays'), val: showDays },
                            ...(isDp
                                ? []
                                : [
                                      {
                                          key: 'showProgress',
                                          label: t('countdown.cfg.showProgress'),
                                          val: showProgress,
                                      },
                                      {
                                          key: 'showControls',
                                          label: t('countdown.cfg.showControls'),
                                          val: showControls,
                                      },
                                      { key: 'showStep', label: t('countdown.cfg.showStep'), val: showStep },
                                      { key: 'showPresets', label: t('countdown.cfg.showPresets'), val: showPresets },
                                  ]),
                        ] as { key: string; label: string; val: boolean }[]
                    ).map(({ key, label, val }) => (
                        <div key={key} className="flex items-center justify-between">
                            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                {label}
                            </span>
                            <Toggle on={val} onToggle={() => setOpts({ [key]: !val })} />
                        </div>
                    ))}
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            {t('countdown.cfg.endedText')}
                        </label>
                        <input
                            type="text"
                            value={endedText}
                            onChange={(e) => setOpts({ endedText: e.target.value || undefined })}
                            placeholder={t('countdown.ended')}
                            className={inputCls}
                            style={inputStyle}
                        />
                        <p className={hintCls} style={hintStyle}>
                            {t('countdown.cfg.endedTextHint')}
                        </p>
                    </div>
                </div>

                {!isDp && stateBaseId && (
                    <div className={boxCls} style={boxStyle}>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {t('countdown.cfg.states')}
                        </p>
                        <code
                            className="block text-[10px] font-mono break-all"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {stateBaseId}.cmd
                        </code>
                        <p className={hintCls} style={hintStyle}>
                            {t('countdown.cfg.statesHint')}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
