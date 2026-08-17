import { useState } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import type { WidgetConfig } from '../../../types';
import { ShutterViz } from '../ShutterViz';
import { clampPct, rawToTiltPct, tiltPctToRaw, tiltRange } from '../../../utils/shutterTilt';

interface Props {
    widget: WidgetConfig;
}

const POPUP_SLAT_COLOR = 'color-mix(in srgb, var(--text-secondary) 30%, transparent)';

export function ShutterPopupBody({ widget }: Props) {
    const opts = widget.options ?? {};
    const actualPositionDp = opts.actualPositionDp as string | undefined;
    const tiltDp = opts.tiltDp as string | undefined;
    const actualTiltDp = opts.actualTiltDp as string | undefined;
    const { value, setValue } = useDatapoint(widget.datapoint);
    const { value: actualVal } = useDatapoint(actualPositionDp ?? '');
    const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
    const { value: tiltVal } = useDatapoint(tiltDp ?? '');
    const { value: actualTiltVal } = useDatapoint(actualTiltDp ?? '');
    const { setState } = useIoBroker();

    // Separate read-only status DP (if set) shows the real position, not the target
    const posValue = actualPositionDp && typeof actualVal === 'number' ? actualVal : value;
    const rawPos = typeof posValue === 'number' ? Math.round(posValue) : 0;
    const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
    const showClosedPercent = !!(opts.showClosedPercent as boolean);
    const isMoving = activityVal === true || activityVal === 1 || activityVal === '1' || activityVal === 'true';
    const positionLivePreview = !!(opts.positionLivePreview as boolean);
    const tiltLivePreview = opts.tiltLivePreview !== false;
    const tiltLabel = (opts.tiltLabel as string) || 'Lamellen';

    const [sliderDraft, setSliderDraft] = useState<number | null>(null);
    const [tiltDraft, setTiltDraft] = useState<number | null>(null);
    // Thumbs always follow the finger; graphic and percentage only when the
    // widget's live-preview option says so.
    const display = sliderDraft ?? pos;
    const shownPos = positionLivePreview ? display : pos;
    const closedFrac = Math.max(0, Math.min(1, (100 - shownPos) / 100));

    const tiltRng = tiltRange(opts);
    const tiltActive = !!tiltDp;
    const tiltRawValue = actualTiltDp && typeof actualTiltVal === 'number' ? actualTiltVal : tiltVal;
    const tiltPct = rawToTiltPct(tiltRawValue, tiltRng) ?? 0;
    const tiltDisplay = tiltDraft ?? tiltPct;
    const tiltShown = tiltLivePreview ? tiltDisplay : tiltPct;

    const writePos = (p: number) => {
        const raw = (opts.invertPosition as boolean) ? 100 - p : p;
        setValue(raw);
        setSliderDraft(null);
    };

    const writeTilt = (pct: number) => {
        if (tiltDp) setState(tiltDp, tiltPctToRaw(clampPct(pct), tiltRng));
        setTiltDraft(null);
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

    const quickBtn = (p: number, current: number, onPick: () => void) => (
        <button
            key={p}
            onClick={onPick}
            className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            style={{
                background: Math.abs(current - p) < 3 ? 'var(--accent)' : 'var(--app-bg)',
                color: Math.abs(current - p) < 3 ? '#fff' : 'var(--text-primary)',
                border: '1px solid var(--app-border)',
            }}
        >
            {p}%
        </button>
    );

    return (
        <div className="flex flex-col items-center gap-6 py-6 px-4">
            <div className="flex items-center gap-8">
                {/* Visualization */}
                <ShutterViz
                    closedFrac={closedFrac}
                    accentColor={
                        isMoving
                            ? 'var(--accent-yellow, #f59e0b)'
                            : closedFrac < 1
                              ? 'var(--accent)'
                              : 'var(--text-secondary)'
                    }
                    isMoving={isMoving}
                    tiltFrac={tiltActive ? tiltShown / 100 : undefined}
                    pitch={10}
                    slatColor={POPUP_SLAT_COLOR}
                    radius={8}
                    dotPx={10}
                    style={{ width: 120, height: 140 }}
                />

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
                        {showClosedPercent ? 100 - shownPos : shownPos}%
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
            <div className="flex gap-2">{[0, 25, 50, 75, 100].map((p) => quickBtn(p, display, () => writePos(p)))}</div>

            {/* Slat tilt – only with a tilt datapoint configured */}
            {tiltActive && (
                <>
                    <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-secondary)' }}>{tiltLabel}</span>
                            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                {Math.round(tiltShown)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(tiltDisplay)}
                            aria-label={tiltLabel}
                            onChange={(e) => setTiltDraft(Number(e.target.value))}
                            onMouseUp={() => {
                                if (tiltDraft !== null) writeTilt(tiltDraft);
                            }}
                            onTouchEnd={() => {
                                if (tiltDraft !== null) writeTilt(tiltDraft);
                            }}
                            style={{ accentColor: 'var(--accent)', width: '100%' }}
                            className="h-2 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            <span>Zu</span>
                            <span>Offen</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {[0, 25, 50, 75, 100].map((p) => quickBtn(p, tiltDisplay, () => writeTilt(p)))}
                    </div>
                </>
            )}
        </div>
    );
}
