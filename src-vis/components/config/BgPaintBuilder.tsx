/**
 * Builder for a colour or gradient behind a widget, popup or tab (#830).
 *
 * The background image field takes any CSS colour or gradient as typed text;
 * this panel writes the same string for those who do not want to type it. It
 * reads the current value back when it is a colour or a simple linear/radial
 * gradient, otherwise it starts from a default and only replaces the value on
 * the first change.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useT } from '../../i18n';
import { ColorPicker } from '../common/ColorPicker';
import { buildPaint, DEFAULT_PAINT, parsePaint, type PaintSpec } from '../../utils/backgroundImage';

interface Props {
    value: string;
    onChange: (css: string) => void;
}

const inputStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const labelCls = 'text-[11px] mb-1 block';
const labelStyle = { color: 'var(--text-secondary)' };
const KINDS: PaintSpec['kind'][] = ['color', 'linear', 'radial'];
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function BgPaintBuilder({ value, onChange }: Props) {
    const t = useT();
    const [spec, setSpec] = useState<PaintSpec>(() => parsePaint(value) ?? DEFAULT_PAINT);

    const update = (p: Partial<PaintSpec>) => {
        const next = { ...spec, ...p };
        setSpec(next);
        onChange(buildPaint(next));
    };
    const setStop = (i: number, p: Partial<PaintSpec['stops'][number]>) =>
        update({ stops: spec.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) });

    const stops = spec.kind === 'color' ? spec.stops.slice(0, 1) : spec.stops;

    return (
        <div
            className="aura-bg-paint-builder space-y-2 rounded-lg p-2"
            style={{ border: '1px solid var(--app-border)' }}
        >
            <div className="flex gap-1">
                {KINDS.map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => update({ kind: k })}
                        className="flex-1 text-[11px] px-2 py-1.5 rounded-lg hover:opacity-80"
                        style={
                            spec.kind === k
                                ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                                : { ...inputStyle, color: 'var(--text-secondary)' }
                        }
                    >
                        {t(`bgImage.paint.${k}` as never)}
                    </button>
                ))}
            </div>
            <div
                className="aura-bg-paint-preview rounded-lg"
                style={{
                    height: 36,
                    border: '1px solid var(--app-border)',
                    background: buildPaint(spec),
                }}
            />
            {spec.kind === 'linear' && (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('bgImage.paint.angle')}
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="number"
                            min={0}
                            max={360}
                            step={15}
                            value={spec.angle}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                if (Number.isFinite(n)) update({ angle: ((n % 360) + 360) % 360 });
                            }}
                            className={`${inputCls} !w-20 shrink-0`}
                            style={inputStyle}
                        />
                        <div className="flex flex-wrap gap-1">
                            {ANGLES.map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => update({ angle: a })}
                                    title={`${a}°`}
                                    className="w-7 h-7 rounded-lg hover:opacity-80 flex items-center justify-center"
                                    style={{
                                        ...inputStyle,
                                        borderColor: spec.angle === a ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                >
                                    <span style={{ display: 'inline-block', transform: `rotate(${a}deg)` }}>↑</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {spec.kind === 'radial' && (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('bgImage.paint.shape')}
                    </label>
                    <select
                        value={spec.shape}
                        onChange={(e) => update({ shape: e.target.value as PaintSpec['shape'] })}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="ellipse">{t('bgImage.paint.ellipse')}</option>
                        <option value="circle">{t('bgImage.paint.circle')}</option>
                    </select>
                </div>
            )}
            <div className="space-y-1">
                <label className={labelCls} style={labelStyle}>
                    {spec.kind === 'color' ? t('bgImage.paint.colorLabel') : t('bgImage.paint.stops')}
                </label>
                {stops.map((s, i) => (
                    <div key={i} className="aura-bg-paint-stop flex items-center gap-1">
                        <ColorPicker
                            value={s.color}
                            onChange={(c) => setStop(i, { color: c })}
                            dual={false}
                            binding={false}
                            className="w-8 h-8 shrink-0"
                        />
                        <input
                            type="text"
                            value={s.color}
                            onChange={(e) => setStop(i, { color: e.target.value })}
                            className={`flex-1 min-w-0 font-mono ${inputCls}`}
                            style={inputStyle}
                        />
                        {spec.kind !== 'color' && (
                            <>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={s.pos ?? ''}
                                    placeholder="%"
                                    title={t('bgImage.paint.pos')}
                                    onChange={(e) =>
                                        setStop(i, {
                                            pos:
                                                e.target.value === ''
                                                    ? undefined
                                                    : Math.max(0, Math.min(100, Number(e.target.value))),
                                        })
                                    }
                                    className={`${inputCls} !w-16 shrink-0`}
                                    style={inputStyle}
                                />
                                <button
                                    type="button"
                                    disabled={spec.stops.length <= 2}
                                    onClick={() => update({ stops: spec.stops.filter((_, j) => j !== i) })}
                                    className="px-1.5 h-8 rounded-lg hover:opacity-80 shrink-0 disabled:opacity-30"
                                    style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                                    title={t('bgImage.paint.removeStop')}
                                >
                                    <X size={12} />
                                </button>
                            </>
                        )}
                    </div>
                ))}
                {spec.kind !== 'color' && (
                    <button
                        type="button"
                        onClick={() =>
                            update({ stops: [...spec.stops, { color: spec.stops[spec.stops.length - 1].color }] })
                        }
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
                        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                    >
                        <Plus size={12} /> {t('bgImage.paint.addStop')}
                    </button>
                )}
            </div>
        </div>
    );
}
