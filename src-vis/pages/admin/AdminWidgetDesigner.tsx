import { useRef, useState } from 'react';
import { Shapes, Trash2, Download, Upload, Pencil, Check, X, SlidersHorizontal } from 'lucide-react';
import { useT } from '../../i18n';
import type { WidgetPreset } from '../../types';
import { useWidgetPresetsStore } from '../../store/widgetPresetsStore';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
import { DP_TEMPLATE_CATEGORIES } from '../../utils/dpTemplates';
import { exportWidgetPreset, importWidgetPreset } from '../../utils/widgetExportImport';
import { PresetEditDialog } from '../../components/config/PresetEditDialog';

const cardStyle: React.CSSProperties = {
    background: 'var(--app-surface)',
    border: '1px solid var(--app-border)',
};

const iconBtn = 'p-1.5 rounded-lg hover:opacity-80 transition-opacity';

function categoryLabel(id?: string): string {
    if (!id) return '';
    return DP_TEMPLATE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function AdminWidgetDesigner() {
    const t = useT();
    const presets = useWidgetPresetsStore((s) => s.presets);
    const addPreset = useWidgetPresetsStore((s) => s.addPreset);
    const updatePreset = useWidgetPresetsStore((s) => s.updatePreset);
    const removePreset = useWidgetPresetsStore((s) => s.removePreset);

    const fileRef = useRef<HTMLInputElement>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [editPreset, setEditPreset] = useState<WidgetPreset | null>(null);

    const handleImport = (file: File) => {
        setImportError(null);
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                const preset = importWidgetPreset(parsed);
                if (!preset) {
                    setImportError(t('widgetDesigner.importError'));
                    return;
                }
                addPreset(preset);
            } catch {
                setImportError(t('widgetDesigner.importError'));
            }
        };
        reader.readAsText(file);
    };

    const startRename = (id: string, current: string) => {
        setEditingId(id);
        setEditName(current);
    };
    const commitRename = () => {
        if (editingId && editName.trim()) updatePreset(editingId, { name: editName.trim() });
        setEditingId(null);
    };

    return (
        <div className="px-6 py-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Shapes size={20} style={{ color: 'var(--accent)' }} />
                        {t('widgetDesigner.title')}
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {t('widgetDesigner.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {presets.length > 0 && (
                        <span
                            className="text-xs px-2.5 py-1 rounded-full"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                        >
                            {t('widgetDesigner.count').replace('{count}', String(presets.length))}
                        </span>
                    )}
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg hover:opacity-80"
                        style={{ background: 'var(--accent)', color: 'white' }}
                    >
                        <Upload size={14} /> {t('widgetDesigner.import')}
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImport(f);
                            e.target.value = '';
                        }}
                    />
                </div>
            </div>

            {importError && (
                <p className="text-xs" style={{ color: 'var(--danger, #ef4444)' }}>
                    {importError}
                </p>
            )}

            {presets.length === 0 ? (
                <div
                    className="rounded-xl px-6 py-12 text-center text-sm"
                    style={{ ...cardStyle, color: 'var(--text-secondary)' }}
                >
                    {t('widgetDesigner.empty')}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {presets.map((preset) => {
                        const meta = WIDGET_BY_TYPE[preset.widget.type];
                        return (
                            <div key={preset.id} className="rounded-xl p-4 flex flex-col gap-3" style={cardStyle}>
                                <div className="flex items-start gap-3">
                                    <span
                                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                    >
                                        {preset.icon || (meta ? <meta.Icon size={18} /> : <Shapes size={18} />)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {editingId === preset.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    autoFocus
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') commitRename();
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                    className="flex-1 min-w-0 text-sm px-2 py-1 rounded-md outline-none"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-primary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                />
                                                <button
                                                    onClick={commitRename}
                                                    className={iconBtn}
                                                    style={{ color: 'var(--accent)' }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className={iconBtn}
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <p
                                                className="text-sm font-semibold truncate"
                                                style={{ color: 'var(--text-primary)' }}
                                                title={preset.name}
                                            >
                                                {preset.name}
                                            </p>
                                        )}
                                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                            {meta?.label ?? preset.widget.type}
                                            {preset.category ? ` · ${categoryLabel(preset.category)}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    className="flex items-center justify-end gap-1 pt-2"
                                    style={{ borderTop: '1px solid var(--app-border)' }}
                                >
                                    <button
                                        onClick={() => setEditPreset(preset)}
                                        className={iconBtn}
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={t('widgetDesigner.edit')}
                                    >
                                        <SlidersHorizontal size={15} />
                                    </button>
                                    <button
                                        onClick={() => startRename(preset.id, preset.name)}
                                        className={iconBtn}
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={t('widgetDesigner.rename')}
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        onClick={() => exportWidgetPreset(preset)}
                                        className={iconBtn}
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={t('widgetDesigner.export')}
                                    >
                                        <Download size={15} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(t('widgetDesigner.deleteConfirm')))
                                                removePreset(preset.id);
                                        }}
                                        className={iconBtn}
                                        style={{ color: 'var(--danger, #ef4444)' }}
                                        title={t('widgetDesigner.delete')}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {editPreset && <PresetEditDialog preset={editPreset} onClose={() => setEditPreset(null)} />}
        </div>
    );
}
