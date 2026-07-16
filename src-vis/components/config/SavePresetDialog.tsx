import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Shapes } from 'lucide-react';
import { useT } from '../../i18n';
import type { WidgetConfig } from '../../types';
import { buildPresetFromWidget } from '../../utils/widgetExportImport';
import { useWidgetPresetsStore } from '../../store/widgetPresetsStore';
import { DP_TEMPLATE_CATEGORIES } from '../../utils/dpTemplates';

/**
 * Small modal shown from a widget's edit menu. Captures the current widget config
 * (and any referenced group defs) as a reusable Widget-Designer preset.
 */
export function SavePresetDialog({ widget, onClose }: { widget: WidgetConfig; onClose: () => void }) {
    const t = useT();
    const addPreset = useWidgetPresetsStore((s) => s.addPreset);
    const [name, setName] = useState(widget.title?.trim() || '');
    const [icon, setIcon] = useState('');
    const [category, setCategory] = useState('');
    const [saved, setSaved] = useState(false);

    const canSave = name.trim().length > 0;

    const handleSave = () => {
        if (!canSave) return;
        addPreset(
            buildPresetFromWidget(widget, {
                name: name.trim(),
                ...(icon.trim() ? { icon: icon.trim() } : {}),
                ...(category ? { category } : {}),
            }),
        );
        setSaved(true);
        setTimeout(onClose, 700);
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4" onClick={onClose}>
            <div
                className="rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4"
                style={{
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Shapes size={18} style={{ color: 'var(--accent)' }} />
                        {t('preset.save.title')}
                    </h2>
                    <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        <X size={18} />
                    </button>
                </div>

                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('preset.save.subtitle')}
                </p>

                <div className="space-y-3">
                    <label className="block">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {t('preset.save.name')}
                        </span>
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </label>

                    <div className="flex gap-3">
                        <label className="block w-24">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {t('preset.save.icon')}
                            </span>
                            <input
                                value={icon}
                                onChange={(e) => setIcon(e.target.value)}
                                maxLength={4}
                                placeholder="🧩"
                                className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none text-center"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                        </label>
                        <label className="block flex-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {t('preset.save.category')}
                            </span>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('preset.save.categoryNone')}</option>
                                {DP_TEMPLATE_CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Shapes size={13} /> {saved ? t('preset.save.saved') : t('preset.save.submit')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
