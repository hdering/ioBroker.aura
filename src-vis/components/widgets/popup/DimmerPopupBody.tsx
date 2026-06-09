import { useState, type CSSProperties } from 'react';
import { Power, SunDim } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import type { WidgetConfig } from '../../../types';

interface Props {
    widget: WidgetConfig;
}

export function DimmerPopupBody({ widget }: Props) {
    const { value } = useDatapoint(widget.datapoint);
    const switchDp = (widget.options?.switchDp as string | undefined) || '';
    const { value: switchValue } = useDatapoint(switchDp);
    const { setState } = useIoBroker();
    const level = typeof value === 'number' ? Math.round(value) : 0;
    const [drag, setDrag] = useState<number | null>(null);
    const display = drag ?? level;
    const sendOnRelease = widget.options?.sendOnRelease !== false;

    const set = (v: number) => {
        if (sendOnRelease) {
            setDrag(v);
        } else {
            setState(widget.datapoint, v);
        }
    };
    const commit = () => {
        if (sendOnRelease && drag !== null) {
            setState(widget.datapoint, drag);
            setDrag(null);
        }
    };

    const isOn = switchDp
        ? typeof switchValue === 'boolean'
            ? switchValue
            : switchValue === 1 || switchValue === '1' || switchValue === 'true'
        : level > 0;
    const toggle = () => {
        if (switchDp) setState(switchDp, !isOn);
        else setState(widget.datapoint, isOn ? 0 : 100);
    };

    const pct = display / 100;
    const yellow = 'var(--accent-yellow, #f59e0b)';

    return (
        <div className="flex flex-col items-center gap-6 py-4 px-2">
            {/* Visual */}
            <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
                <svg viewBox="0 0 120 120" width="120" height="120" style={{ position: 'absolute', inset: 0 }}>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--app-border)" strokeWidth="8" />
                    <circle
                        cx="60"
                        cy="60"
                        r="52"
                        fill="none"
                        stroke={isOn ? yellow : 'var(--app-border)'}
                        strokeWidth="8"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        strokeDashoffset={`${2 * Math.PI * 52 * (1 - pct)}`}
                        strokeLinecap="round"
                        style={{
                            transform: 'rotate(-90deg)',
                            transformOrigin: '60px 60px',
                            transition: 'stroke-dashoffset 0.2s',
                        }}
                    />
                </svg>
                <div className="flex flex-col items-center gap-0.5 z-10">
                    <SunDim size={22} style={{ color: isOn ? yellow : 'var(--text-secondary)' }} />
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {display}%
                    </span>
                </div>
            </div>

            {/* Slider */}
            <div className="w-full px-4">
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={display}
                    onChange={(e) => set(Number(e.target.value))}
                    onMouseUp={commit}
                    onTouchEnd={commit}
                    style={{ '--slider-thumb-color': yellow } as CSSProperties}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    <span>0%</span>
                    <span>100%</span>
                </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
                {[25, 50, 75, 100].map((v) => (
                    <button
                        key={v}
                        onClick={() => {
                            setState(widget.datapoint, v);
                            setDrag(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: display === v ? yellow : 'var(--app-bg)',
                            color: display === v ? '#000' : 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {v}%
                    </button>
                ))}
                <button
                    onClick={toggle}
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                    style={{
                        background: isOn ? yellow : 'var(--app-bg)',
                        color: isOn ? '#000' : 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Power size={14} />
                </button>
            </div>
        </div>
    );
}
