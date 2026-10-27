/**
 * SlideshowConfig — settings of the slideshow (#848): which folder, in which order and how
 * fast, how a change looks, and how videos play.
 */
import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { ConfigSection } from './ConfigSection';
import { DatapointPicker } from './DatapointPicker';
import { ColorPicker } from '../common/ColorPicker';
import type { WidgetConfig } from '../../types';
import { useT } from '../../i18n';
import {
    SLIDESHOW_CAPTIONS,
    SLIDESHOW_DEFAULTS,
    SLIDESHOW_TRANSITIONS,
    type SlideshowCaption,
    type SlideshowTransition,
} from '../widgets/SlideshowWidget';
import { SLIDESHOW_ORDERS, type SlideshowOrder } from '../widgets/slideshowOrder';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

const fieldCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const fieldSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelSty: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
            <span className="text-[11px]" style={labelSty}>
                {label}
            </span>
        </label>
    );
}

function NumberField({
    label,
    value,
    min,
    max,
    onChange,
    hint,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
    hint?: string;
}) {
    // Typing passes through values below min ("1" on the way to "1500"), so the text is kept
    // as a draft and only clamped when the field is left (#860).
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <div className="flex-1 min-w-0">
            <label className={labelCls} style={labelSty}>
                {label}
            </label>
            <input
                type="number"
                min={min}
                max={max}
                value={draft ?? value}
                onChange={(e) => {
                    const raw = e.target.value;
                    setDraft(raw);
                    const n = Number(raw);
                    if (raw !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
                }}
                onBlur={() => {
                    if (draft === null) return;
                    const n = Number(draft);
                    if (draft !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
                    setDraft(null);
                }}
                className={fieldCls}
                style={fieldSty}
            />
            {hint && (
                <p className="text-[10px] mt-1" style={hintSty}>
                    {hint}
                </p>
            )}
        </div>
    );
}

function Select<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { id: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div>
            <label className={labelCls} style={labelSty}>
                {label}
            </label>
            <select value={value} onChange={(e) => onChange(e.target.value as T)} className={fieldCls} style={fieldSty}>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export function SlideshowConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const [picking, setPicking] = useState(false);
    const folder = (o.folder as string | undefined) ?? '';
    const transition = (o.transition as SlideshowTransition | undefined) ?? SLIDESHOW_DEFAULTS.transition;
    const includeVideos = o.includeVideos === true;

    return (
        <>
            <ConfigSection title={t('cfg.section.settings')} sectionKey="settings">
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('slideshow.cfg.folder')}
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={folder}
                            onChange={(e) => set({ folder: e.target.value.trim() || undefined })}
                            placeholder="/media/fotos"
                            className={`${fieldCls} flex-1 min-w-0 font-mono`}
                            style={fieldSty}
                        />
                        <button
                            type="button"
                            data-aura-slideshow-pick=""
                            onClick={() => setPicking(true)}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0"
                            style={{ ...fieldSty, color: 'var(--text-secondary)' }}
                            title={t('slideshow.cfg.pickFolder')}
                        >
                            <FolderOpen size={13} />
                        </button>
                    </div>
                    <p className="text-[10px] mt-1" style={hintSty}>
                        {t('slideshow.cfg.folderHint')}
                    </p>
                </div>
                <Check
                    checked={o.recursive === true}
                    onChange={(v) => set({ recursive: v || undefined })}
                    label={t('slideshow.cfg.recursive')}
                />
                <Select
                    label={t('slideshow.cfg.order')}
                    value={(o.order as SlideshowOrder | undefined) ?? SLIDESHOW_DEFAULTS.order}
                    options={SLIDESHOW_ORDERS.map((id) => ({ id, label: t(`slideshow.order.${id}`) }))}
                    onChange={(v) => set({ order: v })}
                />
                <div className="flex gap-2">
                    <NumberField
                        label={t('slideshow.cfg.interval')}
                        value={Number(o.intervalSec) || SLIDESHOW_DEFAULTS.intervalSec}
                        min={2}
                        max={3600}
                        onChange={(v) => set({ intervalSec: v })}
                    />
                    <NumberField
                        label={t('slideshow.cfg.rescan')}
                        value={Number(o.rescanMin) || SLIDESHOW_DEFAULTS.rescanMin}
                        min={1}
                        max={1440}
                        onChange={(v) => set({ rescanMin: v })}
                    />
                </div>
            </ConfigSection>

            <ConfigSection title={t('cfg.section.behavior')} sectionKey="behavior">
                <Select
                    label={t('slideshow.cfg.transition')}
                    value={transition}
                    options={SLIDESHOW_TRANSITIONS.map((id) => ({ id, label: t(`slideshow.transition.${id}`) }))}
                    onChange={(v) => set({ transition: v })}
                />
                {transition !== 'none' && (
                    <NumberField
                        label={t('slideshow.cfg.transitionMs')}
                        value={Number(o.transitionMs) || SLIDESHOW_DEFAULTS.transitionMs}
                        min={100}
                        max={5000}
                        onChange={(v) => set({ transitionMs: v })}
                    />
                )}
                <Check
                    checked={o.controls !== false}
                    onChange={(v) => set({ controls: v ? undefined : false })}
                    label={t('slideshow.cfg.controls')}
                />
                <p className="text-[10px] -mt-1" style={hintSty}>
                    {t('slideshow.cfg.controlsHint')}
                </p>
            </ConfigSection>

            <ConfigSection title={t('cfg.section.look')} sectionKey="look">
                <Select
                    label={t('slideshow.cfg.fit')}
                    value={(o.fit as 'contain' | 'cover' | undefined) ?? SLIDESHOW_DEFAULTS.fit}
                    options={[
                        { id: 'contain', label: t('slideshow.fit.contain') },
                        { id: 'cover', label: t('slideshow.fit.cover') },
                    ]}
                    onChange={(v) => set({ fit: v })}
                />
                <div className="flex items-center gap-2">
                    <ColorPicker
                        value={(o.background as string | undefined) || SLIDESHOW_DEFAULTS.background}
                        onChange={(v) => set({ background: v || undefined })}
                        dual={false}
                        className="w-8 h-7 rounded cursor-pointer shrink-0"
                        style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                    />
                    <span className="text-[11px]" style={labelSty}>
                        {t('slideshow.cfg.background')}
                    </span>
                </div>
                <Check
                    checked={o.blurBackground === true}
                    onChange={(v) => set({ blurBackground: v || undefined })}
                    label={t('slideshow.cfg.blurBackground')}
                />
                <Select
                    label={t('slideshow.cfg.caption')}
                    value={(o.showCaption as SlideshowCaption | undefined) ?? 'none'}
                    options={SLIDESHOW_CAPTIONS.map((id) => ({ id, label: t(`slideshow.caption.${id}`) }))}
                    onChange={(v) => set({ showCaption: v === 'none' ? undefined : v })}
                />
            </ConfigSection>

            <ConfigSection title={t('slideshow.cfg.videoSection')} sectionKey="video">
                <Check
                    checked={includeVideos}
                    onChange={(v) => set({ includeVideos: v || undefined })}
                    label={t('slideshow.cfg.includeVideos')}
                />
                {includeVideos && (
                    <>
                        <Select
                            label={t('slideshow.cfg.videoMode')}
                            value={(o.videoMode as 'full' | 'interval' | undefined) ?? 'full'}
                            options={[
                                { id: 'full', label: t('slideshow.videoMode.full') },
                                { id: 'interval', label: t('slideshow.videoMode.interval') },
                            ]}
                            onChange={(v) => set({ videoMode: v === 'full' ? undefined : v })}
                        />
                        <Check
                            checked={o.videoSound === true}
                            onChange={(v) => set({ videoSound: v || undefined })}
                            label={t('slideshow.cfg.videoSound')}
                        />
                        {o.videoSound === true && (
                            <>
                                <NumberField
                                    label={t('slideshow.cfg.videoVolume')}
                                    value={Number(o.videoVolume ?? SLIDESHOW_DEFAULTS.videoVolume)}
                                    min={0}
                                    max={100}
                                    onChange={(v) => set({ videoVolume: v })}
                                />
                                <p className="text-[10px] -mt-1" style={hintSty}>
                                    {t('slideshow.cfg.videoSoundHint')}
                                </p>
                            </>
                        )}
                    </>
                )}
            </ConfigSection>

            {picking && (
                <DatapointPicker
                    modes={['files']}
                    defaultMode="files"
                    acceptMime={['image/*', 'video/*']}
                    pickFolder
                    currentValue={folder}
                    onPickResult={(r) => {
                        if (r.kind === 'folder') set({ folder: r.path });
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </>
    );
}
