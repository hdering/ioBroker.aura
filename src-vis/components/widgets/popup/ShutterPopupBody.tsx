import { useState } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import type { WidgetConfig } from '../../../types';

interface Props {
    widget: WidgetConfig;
}

function ShutterViz({ closedFrac, isMoving }: { closedFrac: number; isMoving: boolean }) {
    const accent = isMoving
        ? 'var(--accent-yellow, #f59e0b)'
        : closedFrac < 1
          ? 'var(--accent)'
          : 'var(--text-secondary)';
    return (
        <div
            style={{
                width: 120,
                height: 140,
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                borderRadius: 8,
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${closedFrac * 100}%`,
                    transition: 'height 0.4s ease',
                    backgroundImage:
                        'repeating-linear-gradient(to bottom, transparent 0px, transparent 8px, color-mix(in srgb, var(--text-secondary) 30%, transparent) 8px, color-mix(in srgb, var(--text-secondary) 30%, transparent) 10px)',
                }}
            />
            {closedFrac > 0.02 && closedFrac < 0.98 && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${closedFrac * 100}%`,
                        height: 2,
                        background: accent,
                        transition: 'top 0.4s ease',
                        boxShadow: `0 0 4px ${accent}88`,
                    }}
                />
            )}
            {isMoving && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: accent }} />
                </div>
            )}
        </div>
    );
}

export function ShutterPopupBody({ widget }: Props) {
    const opts = widget.options ?? {};
    const { value, setValue } = useDatapoint(widget.datapoint);
    const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
    const { setState } = useIoBroker();

    const rawPos = typeof value === 'number' ? Math.round(value) : 0;
    const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
    const closedFrac = Math.max(0, Math.min(1, (100 - pos) / 100));
    const showClosedPercent = !!(opts.showClosedPercent as boolean);
    const isMoving = activityVal === true || activityVal === 1 || activityVal === '1' || activityVal === 'true';

    const [sliderDraft, setSliderDraft] = useState<number | null>(null);
    const display = sliderDraft ?? pos;

    const writePos = (p: number) => {
        const raw = (opts.invertPosition as boolean) ? 100 - p : p;
        setValue(raw);
        setSliderDraft(null);
    };

    const stop = () => {
        const stopDp = opts.stopDp as string | undefined;
        if (stopDp) setState(stopDp, true);
        else setState(widget.datapoint, rawPos);
    };

    const btnStyle: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="flex flex-col items-center gap-6 py-6 px-4">
            <div className="flex items-center gap-8">
                {/* Visualization */}
                <ShutterViz closedFrac={closedFrac} isMoving={isMoving} />

                {/* Vertical control column */}
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={() => writePos(100)}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={btnStyle}
                    >
                        <ChevronUp size={22} />
                    </button>
                    <button
                        onClick={stop}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={btnStyle}
                    >
                        <Square size={18} />
                    </button>
                    <button
                        onClick={() => writePos(0)}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={btnStyle}
                    >
                        <ChevronDown size={22} />
                    </button>
                </div>
            </div>

            {/* Position display + slider */}
            <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Position</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {showClosedPercent ? 100 - display : display}%
                    </span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={display}
                    onChange={(e) => setSliderDraft(Number(e.target.value))}
                    onMouseUp={() => {
                        if (sliderDraft !== null) writePos(sliderDraft);
                    }}
                    onTouchEnd={() => {
                        if (sliderDraft !== null) writePos(sliderDraft);
                    }}
                    style={{ accentColor: 'var(--accent)', width: '100%' }}
                    className="h-2 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>Zu</span>
                    <span>Offen</span>
                </div>
            </div>

            {/* Quick positions */}
            <div className="flex gap-2">
                {[0, 25, 50, 75, 100].map((p) => (
                    <button
                        key={p}
                        onClick={() => writePos(p)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: Math.abs(display - p) < 3 ? 'var(--accent)' : 'var(--app-bg)',
                            color: Math.abs(display - p) < 3 ? '#fff' : 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {p}%
                    </button>
                ))}
            </div>
        </div>
    );
}
