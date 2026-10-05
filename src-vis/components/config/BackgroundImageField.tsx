/**
 * Background image field (issue #442) — one control for every place an image
 * can go behind something: the widget card (Erweitert) and the popup on all its
 * levels (global, popup view, click action, list row, universal cell).
 *
 * `undefined` means "no image of my own": on the card that is no image at all,
 * on a popup level it inherits the next level — `inheritLabel` names which one.
 * Fit, alignment and dim only show once an image is set; clearing the source
 * drops them with it, so nothing half-configured stays behind.
 */
import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { BackgroundImage, BackgroundImageFit, BackgroundImagePosition } from '../../types';
import { useT } from '../../i18n';
import {
    activeBgImage,
    bgImageStyle,
    BG_IMAGE_FITS,
    BG_IMAGE_POSITIONS,
    MAX_BG_IMAGE_DIM,
} from '../../utils/backgroundImage';
import { ConfigModal } from './ConfigModal';
import { DatapointPicker } from './DatapointPicker';
import { ImagePathHint } from './ImagePathHint';

interface Props {
    value: BackgroundImage | undefined;
    onChange: (value: BackgroundImage | undefined) => void;
    /** Defaults to "Hintergrundbild". */
    label?: string;
    /** What an empty value falls back to, e.g. "View/Global". Omit where empty simply means none. */
    inheritLabel?: string;
}

const inputStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const labelCls = 'text-[11px] mb-1 block';
const labelStyle = { color: 'var(--text-secondary)' };

export function BackgroundImageField({ value, onChange, label, inheritLabel }: Props) {
    const t = useT();
    const [picking, setPicking] = useState(false);
    const src = value?.src ?? '';
    const active = src.trim() !== '';

    const patch = (p: Partial<BackgroundImage>) => {
        const next = { ...(value ?? { src: '' }), ...p };
        if (!next.src.trim()) return onChange(undefined);
        // Defaults are not stored — an unset key keeps following the documented default.
        if (next.fit === 'cover') delete next.fit;
        if (next.position === 'center') delete next.position;
        if (!next.dim) delete next.dim;
        onChange(next);
    };

    return (
        <div className="aura-bg-image-field space-y-1.5">
            <label className={labelCls} style={labelStyle}>
                {label ?? t('bgImage.label')}
                {inheritLabel && !active && <span style={{ opacity: 0.6 }}> · {inheritLabel}</span>}
            </label>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={src}
                    onChange={(e) => patch({ src: e.target.value })}
                    placeholder={t('bgImage.placeholder')}
                    className={`flex-1 min-w-0 font-mono ${inputCls}`}
                    style={inputStyle}
                />
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                    title={t('bgImage.pickFile')}
                >
                    <FolderOpen size={13} />
                </button>
                {active && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        className="text-[10px] px-2 rounded-lg hover:opacity-70 shrink-0"
                        style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                    >
                        {t('bgImage.remove')}
                    </button>
                )}
            </div>
            {src.startsWith('aura-file:') && (
                <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>
                    {src.slice('aura-file:'.length).split('/').pop()}
                </p>
            )}
            {!active && <ImagePathHint />}
            {active && (
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            {t('bgImage.fit')}
                        </label>
                        <select
                            value={value?.fit ?? 'cover'}
                            onChange={(e) => patch({ fit: e.target.value as BackgroundImageFit })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {BG_IMAGE_FITS.map((f) => (
                                <option key={f} value={f}>
                                    {t(`bgImage.fit.${f}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            {t('bgImage.position')}
                        </label>
                        <select
                            value={value?.position ?? 'center'}
                            onChange={(e) => patch({ position: e.target.value as BackgroundImagePosition })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {BG_IMAGE_POSITIONS.map((p) => (
                                <option key={p} value={p}>
                                    {t(`bgImage.pos.${p}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            {t('bgImage.dim')}
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={MAX_BG_IMAGE_DIM}
                            step={5}
                            value={value?.dim ?? ''}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                patch({
                                    dim: Number.isFinite(n) ? Math.max(0, Math.min(MAX_BG_IMAGE_DIM, n)) : undefined,
                                });
                            }}
                            placeholder="0"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                </div>
            )}
            {picking && (
                <DatapointPicker
                    modes={['files']}
                    defaultMode="files"
                    acceptMime={['image/*']}
                    currentValue={src}
                    onPickResult={(r) => {
                        if (r.kind === 'file') patch({ src: `aura-file:${r.path}` });
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}

/** Short label for a source: the file name of a path, else the start of the URL. */
function sourceLabel(src: string): string {
    if (src.startsWith('data:')) return 'data:…';
    const clean = src.replace(/^aura-file:/, '').split(/[?#]/)[0];
    return clean.split('/').filter(Boolean).pop() ?? clean;
}

/**
 * Compact entry for narrow places (tab and section popovers, the layout card):
 * a thumbnail with the file name, and the full field in its own dialog.
 */
export function BackgroundImageButton({ value, onChange, title, inheritLabel }: Props & { title: string }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const active = activeBgImage(value);
    const btnStyle = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
    };
    return (
        <div className="aura-bg-image-button flex items-center justify-between gap-2 min-w-0 w-full">
            <span className="flex items-center gap-2 min-w-0">
                {active && (
                    <span
                        className="shrink-0 rounded"
                        style={{
                            width: 28,
                            height: 20,
                            border: '1px solid var(--app-border)',
                            ...bgImageStyle({ ...active, fit: 'cover', position: 'center' }),
                        }}
                    />
                )}
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {active ? sourceLabel(active.src) : (inheritLabel ?? t('bgImage.none'))}
                </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
                {active && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        className="text-[10px] px-2 py-1 rounded-lg hover:opacity-70"
                        style={btnStyle}
                    >
                        {t('bgImage.remove')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-70"
                    style={btnStyle}
                >
                    {active ? t('bgImage.change') : t('bgImage.choose')}
                </button>
            </span>
            {open && (
                <ConfigModal title={title} maxWidth={480} maxHeight={320} padded onClose={() => setOpen(false)}>
                    <BackgroundImageField value={active} onChange={onChange} inheritLabel={inheritLabel} />
                </ConfigModal>
            )}
        </div>
    );
}
