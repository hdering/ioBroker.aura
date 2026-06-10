/**
 * GroupActionControl — the configurable group action shown in a list header or
 * group title bar. Its type (switch/dimmer/shutter/momentary) decides the
 * control rendered and how it writes to all collected targets at once:
 *   - switch    → tri-state toggle (GroupMasterSwitch), on/off all targets
 *   - dimmer    → slider 0–100, writes the level to all dimmer/level DPs
 *   - shutter   → ▲ ■ ▼ buttons, up/stop/down to every shutter target
 *   - momentary → one push button, writes a pulse value to all target DPs
 *
 * In the editor an empty type shows a dashed placeholder (like GroupMasterSwitch)
 * so the configurer sees where the control will appear once DPs exist.
 */
import { useRef, useState, type CSSProperties } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { GroupMasterSwitch } from './GroupMasterSwitch';
import { useGroupControl } from '../../hooks/useGroupControl';
import type { GroupActionConfigOpts, GroupActionType, GroupTarget, ShutterTarget } from '../../utils/groupTargets';

type SetState = (id: string, v: boolean | number | string) => void;

function coerce(v: string | number | boolean | undefined, fallback: boolean | number | string) {
    if (v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
}

interface Props {
    type: GroupActionType;
    cfg: GroupActionConfigOpts;
    setState: SetState;
    switchTargets: GroupTarget[];
    dimmerIds: string[];
    shutterTargets: ShutterTarget[];
    pulseIds: string[];
    editing?: boolean;
    placeholderHint?: string;
    placeholderLabel?: string;
    className?: string;
}

const cmdBtnCls = 'nodrag shrink-0 flex items-center justify-center rounded transition-colors disabled:opacity-30';
const cmdBtnStyle: CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--widget-border)',
    width: 24,
    height: 24,
};

function Placeholder({ label, hint, className = '' }: { label?: string; hint?: string; className?: string }) {
    return (
        <span className={`nodrag shrink-0 inline-flex items-center gap-1 ${className}`} title={hint}>
            {label && (
                <span className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {label}
                </span>
            )}
            <span
                className="relative w-9 h-[18px] rounded-full shrink-0"
                style={{ background: 'transparent', border: '1px dashed var(--app-border)', opacity: 0.6 }}
                aria-hidden
            >
                <span
                    className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full"
                    style={{ background: 'var(--app-border)' }}
                />
            </span>
        </span>
    );
}

export function GroupActionControl({
    type,
    cfg,
    setState,
    switchTargets,
    dimmerIds,
    shutterTargets,
    pulseIds,
    editing = false,
    placeholderHint,
    placeholderLabel,
    className = '',
}: Props) {
    // Hooks must run unconditionally regardless of the active type.
    const { aggregate, toggleAll, activeCount, total } = useGroupControl(switchTargets);
    const [level, setLevel] = useState(0);
    const pulsePendingRef = useRef(false);

    if (type === 'switch') {
        return (
            <GroupMasterSwitch
                aggregate={aggregate}
                onToggle={toggleAll}
                title={`${activeCount}/${total}`}
                editing={editing}
                placeholderHint={placeholderHint}
                placeholderLabel={placeholderLabel}
                className={className}
            />
        );
    }

    if (type === 'dimmer') {
        if (dimmerIds.length === 0)
            return editing ? (
                <Placeholder label={placeholderLabel} hint={placeholderHint} className={className} />
            ) : null;
        const applyLevel = () => dimmerIds.forEach((id) => setState(id, level));
        return (
            <div className={`nodrag shrink-0 flex items-center gap-1.5 ${className}`}>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    onMouseUp={applyLevel}
                    onTouchEnd={applyLevel}
                    onPointerUp={applyLevel}
                    className="nodrag w-16 h-1.5 rounded-full cursor-pointer"
                    style={{ accentColor: 'var(--accent)' }}
                    title={placeholderHint}
                />
                <span className="text-[10px] tabular-nums w-7 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {level}%
                </span>
            </div>
        );
    }

    if (type === 'shutter') {
        const active = shutterTargets.filter((t) => t.upDp || t.downDp || t.positionDp || t.stopDp);
        if (active.length === 0)
            return editing ? (
                <Placeholder label={placeholderLabel} hint={placeholderHint} className={className} />
            ) : null;
        const up = () =>
            active.forEach((t) => {
                if (t.upDp) setState(t.upDp, coerce(t.writeValue, true));
                else if (t.positionDp) setState(t.positionDp, t.invert ? 0 : 100);
            });
        const down = () =>
            active.forEach((t) => {
                if (t.downDp) setState(t.downDp, coerce(t.writeValue, true));
                else if (t.positionDp) setState(t.positionDp, t.invert ? 100 : 0);
            });
        const stop = () => active.forEach((t) => t.stopDp && setState(t.stopDp, coerce(t.writeValue, true)));
        return (
            <div className={`nodrag shrink-0 flex items-center gap-1 ${className}`}>
                <button onClick={up} title="Auf" aria-label="Auf" className={cmdBtnCls} style={cmdBtnStyle}>
                    <ChevronUp size={14} />
                </button>
                <button onClick={stop} title="Stop" aria-label="Stop" className={cmdBtnCls} style={cmdBtnStyle}>
                    <Square size={10} />
                </button>
                <button onClick={down} title="Ab" aria-label="Ab" className={cmdBtnCls} style={cmdBtnStyle}>
                    <ChevronDown size={14} />
                </button>
            </div>
        );
    }

    // momentary
    if (pulseIds.length === 0)
        return editing ? <Placeholder label={placeholderLabel} hint={placeholderHint} className={className} /> : null;
    const press = () => {
        if (pulsePendingRef.current) return;
        const pulse = coerce(cfg.groupPulseValue, true);
        pulseIds.forEach((id) => setState(id, pulse));
        if (cfg.groupPulseReset) {
            pulsePendingRef.current = true;
            const resetVal = coerce(cfg.groupPulseResetValue, false);
            setTimeout(() => {
                pulseIds.forEach((id) => setState(id, resetVal));
                pulsePendingRef.current = false;
            }, cfg.groupPulseDelay ?? 500);
        }
    };
    return (
        <button
            onClick={press}
            className={`nodrag shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-transform active:scale-95 ${className}`}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
            {cfg.groupPulseLabel || 'Auslösen'}
        </button>
    );
}
