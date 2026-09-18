/**
 * Duration editor of the Countdown widget (#675) — opened by tapping the digits.
 *
 * Three fields (hours, minutes, seconds) plus the widget's preset chips. Apply
 * hands back whole seconds; the widget turns that into a `=N` command.
 * Rendered into the portal target like TimerEventModal so it overlays the
 * dashboard and picks up the frontend theme.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import { formatPreset, splitDuration } from '../../utils/countdownFormat';

interface Props {
    initialSeconds: number;
    presets: number[];
    onApply: (seconds: number) => void;
    onCancel: () => void;
}

const inputCls = 'w-full text-center text-lg font-semibold tabular-nums rounded-lg px-2 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function CountdownDurationModal({ initialSeconds, presets, onApply, onCancel }: Props) {
    const t = useT();
    const [{ h, m, s }, setFields] = useState(() => splitDuration(initialSeconds));
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const total = () => Math.max(0, h * 3600 + m * 60 + s);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') onApply(total());
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [h, m, s, onCancel]);

    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)));

    const field = (label: string, value: number, max: number, set: (v: number) => void) => (
        <label className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <input
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                value={value}
                onChange={(e) => set(clamp(Number(e.target.value), max))}
                onFocus={(e) => e.currentTarget.select()}
                className={inputCls}
                style={inputStyle}
            />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </span>
        </label>
    );

    return createPortal(
        <div
            data-aura-app="frontend"
            className="aura-countdown-modal fixed inset-0 z-[9000] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={onCancel}
        >
            <div
                className="rounded-2xl shadow-2xl w-full max-w-xs flex flex-col"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <p className="text-sm font-semibold flex-1">{t('countdown.setDuration')}</p>
                    <button onClick={onCancel} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3">
                    <div className="flex items-start gap-2">
                        {field(t('countdown.hours'), h, 999, (v) => setFields({ h: v, m, s }))}
                        <span className="text-lg font-semibold pt-2">:</span>
                        {field(t('countdown.minutes'), m, 59, (v) => setFields({ h, m: v, s }))}
                        <span className="text-lg font-semibold pt-2">:</span>
                        {field(t('countdown.seconds'), s, 59, (v) => setFields({ h, m, s: v }))}
                    </div>
                    {presets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {presets.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setFields(splitDuration(p))}
                                    className="text-[11px] px-2.5 py-1 rounded-full hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {formatPreset(p)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div
                    className="flex items-center gap-2 px-4 py-3 border-t"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <span className="flex-1" />
                    <button
                        onClick={onCancel}
                        className="px-3 py-2 text-xs rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('countdown.cancel')}
                    </button>
                    <button
                        onClick={() => onApply(total())}
                        disabled={total() <= 0}
                        className="px-3 py-2 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('countdown.apply')}
                    </button>
                </div>
            </div>
        </div>,
        portal,
    );
}
