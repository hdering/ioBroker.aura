/**
 * EnumConfig — config panel for the "Auswahlfeld" (enum) widget.
 *
 * Maps DP values (e.g. 0/1/2/3) to entries and offers a one-click import from
 * the DP's native common.states. Each entry can be rendered as plain text,
 * an image (file picker), HTML, or an icon (icon picker).
 */
import { useState } from 'react';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { type EnumEntry, type EnumRender, entryRenderMode, EnumEntryLabel } from '../widgets/EnumWidget';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

const RENDER_OPTIONS: { value: EnumRender; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Bild' },
    { value: 'html', label: 'HTML' },
    { value: 'icon', label: 'Icon' },
];

export function EnumConfig({ config, onConfigChange }: Props) {
    const o = config.options ?? {};
    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const entries = (o.entries as EnumEntry[] | undefined) ?? [];
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [imagePickerIdx, setImagePickerIdx] = useState<number | null>(null);
    const [iconPickerIdx, setIconPickerIdx] = useState<number | null>(null);

    const iSty: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };
    const iCls = 'w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none';

    const update = (idx: number, patch: Partial<EnumEntry>) =>
        setO({ entries: entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
    const remove = (idx: number) => setO({ entries: entries.filter((_, i) => i !== idx) });
    const move = (idx: number, dir: -1 | 1) => {
        const next = idx + dir;
        if (next < 0 || next >= entries.length) return;
        const arr = [...entries];
        [arr[idx], arr[next]] = [arr[next], arr[idx]];
        setO({ entries: arr });
    };
    const add = () => {
        const nextValue = entries.length
            ? String((Math.max(...entries.map((e) => Number(e.value)).filter((n) => !isNaN(n))) || 0) + 1)
            : '0';
        setO({ entries: [...entries, { value: nextValue, label: '', render: 'text' }] });
    };

    const importFromStates = async () => {
        if (!config.datapoint) {
            setImportStatus('Kein Datenpunkt gewählt');
            return;
        }
        setImporting(true);
        setImportStatus(null);
        try {
            const obj = await getObjectDirect(config.datapoint);
            const states = (obj?.common as { states?: Record<string, string> | string } | undefined)?.states;
            let parsed: Record<string, string> | null = null;
            if (typeof states === 'object' && states) {
                parsed = states as Record<string, string>;
            } else if (typeof states === 'string') {
                // ioBroker also supports the legacy "0:zu;1:auf" format
                parsed = {};
                states.split(';').forEach((pair) => {
                    const [k, v] = pair.split(':');
                    if (k !== undefined && v !== undefined) parsed![k.trim()] = v.trim();
                });
            }
            if (!parsed || Object.keys(parsed).length === 0) {
                setImportStatus('Keine common.states am Datenpunkt');
                return;
            }
            const imported: EnumEntry[] = Object.entries(parsed).map(([k, v]) => ({
                value: String(k),
                label: String(v),
                render: 'text',
            }));
            setO({ entries: imported });
            setImportStatus(`${imported.length} Einträge importiert`);
        } catch (err) {
            setImportStatus('Fehler beim Lesen des DP');

            console.error('[EnumConfig] import failed', err);
        } finally {
            setImporting(false);
        }
    };

    const sizeInput = (entry: EnumEntry, idx: number) => (
        <input
            type="number"
            min={8}
            max={512}
            value={entry.size ?? ''}
            onChange={(e) => update(idx, { size: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="px"
            title="Größe in Pixeln"
            className={`${iCls} font-mono`}
            style={{ ...iSty, width: '64px', flexShrink: 0 }}
        />
    );

    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    onClick={importFromStates}
                    disabled={importing || !config.datapoint}
                    className="text-[11px] px-2 py-1 rounded-lg hover:opacity-80 disabled:opacity-40"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    {importing ? 'Lese …' : 'Aus common.states importieren'}
                </button>
                {importStatus && (
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {importStatus}
                    </span>
                )}
            </div>

            <div className="space-y-1.5">
                {entries.length === 0 && (
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Noch keine Einträge. Lege Wert→Eintrag-Paare an oder importiere sie aus dem Datenpunkt.
                    </p>
                )}
                {entries.map((entry, idx) => {
                    const mode = entryRenderMode(entry);
                    const IconPreview = entry.icon ? getWidgetIcon(entry.icon, null) : null;
                    return (
                        <div
                            key={idx}
                            className="rounded-lg p-2 space-y-1.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        >
                            {/* Row 1: order · value · render mode · color · delete */}
                            <div className="flex items-center gap-1">
                                <div className="flex flex-col shrink-0">
                                    <button
                                        onClick={() => move(idx, -1)}
                                        disabled={idx === 0}
                                        className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                        title="Nach oben"
                                    >
                                        ▲
                                    </button>
                                    <button
                                        onClick={() => move(idx, 1)}
                                        disabled={idx === entries.length - 1}
                                        className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none mt-0.5"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                        title="Nach unten"
                                    >
                                        ▼
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={entry.value}
                                    onChange={(e) => update(idx, { value: e.target.value })}
                                    placeholder="Wert"
                                    className={`${iCls} font-mono`}
                                    style={{ ...iSty, width: '70px', flexShrink: 0 }}
                                />
                                <select
                                    value={mode}
                                    onChange={(e) => update(idx, { render: e.target.value as EnumRender })}
                                    title="Darstellung"
                                    className={iCls}
                                    style={{ ...iSty, width: '84px', flexShrink: 0 }}
                                >
                                    {RENDER_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="color"
                                    value={entry.color ?? '#666666'}
                                    onChange={(e) => update(idx, { color: e.target.value })}
                                    title="Farbe (Text/Icon, optional)"
                                    className="shrink-0 rounded cursor-pointer"
                                    style={{
                                        width: '24px',
                                        height: '26px',
                                        border: '1px solid var(--app-border)',
                                        background: 'transparent',
                                    }}
                                />
                                {entry.color && (
                                    <button
                                        onClick={() => update(idx, { color: undefined })}
                                        title="Farbe zurücksetzen"
                                        className="text-[9px] shrink-0 px-1 rounded hover:opacity-80"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        ×
                                    </button>
                                )}
                                <button
                                    onClick={() => remove(idx)}
                                    className="hover:opacity-70 shrink-0"
                                    style={{ color: 'var(--accent-red, #ef4444)' }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            {/* Row 2: mode-specific content editor */}
                            {mode === 'text' && (
                                <input
                                    type="text"
                                    value={entry.label}
                                    onChange={(e) => update(idx, { label: e.target.value })}
                                    placeholder="Text"
                                    className={iCls}
                                    style={iSty}
                                />
                            )}

                            {mode === 'html' && (
                                <textarea
                                    value={entry.label}
                                    onChange={(e) => update(idx, { label: e.target.value })}
                                    placeholder="HTML, z.B. <img src='…' width='40'>"
                                    rows={2}
                                    className={`${iCls} resize-y font-mono leading-snug`}
                                    style={iSty}
                                />
                            )}

                            {mode === 'image' && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={entry.image ?? ''}
                                            onChange={(e) => update(idx, { image: e.target.value })}
                                            placeholder="Bild-URL oder Pfad"
                                            className={`${iCls} min-w-0 flex-1`}
                                            style={iSty}
                                        />
                                        <button
                                            onClick={() => setImagePickerIdx(idx)}
                                            title="Bild wählen"
                                            className="shrink-0 px-2 py-1.5 rounded-lg hover:opacity-80"
                                            style={iSty}
                                        >
                                            <FolderOpen size={13} />
                                        </button>
                                        {sizeInput(entry, idx)}
                                    </div>
                                    <input
                                        type="text"
                                        value={entry.label}
                                        onChange={(e) => update(idx, { label: e.target.value })}
                                        placeholder="Name / Alt-Text (optional)"
                                        className={iCls}
                                        style={iSty}
                                    />
                                </div>
                            )}

                            {mode === 'icon' && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setIconPickerIdx(idx)}
                                            className={`${iCls} flex items-center gap-1.5 min-w-0 flex-1`}
                                            style={iSty}
                                        >
                                            {IconPreview ? (
                                                <IconPreview size={16} style={{ color: entry.color }} />
                                            ) : null}
                                            <span className="truncate">{entry.icon || 'Icon wählen …'}</span>
                                        </button>
                                        {sizeInput(entry, idx)}
                                    </div>
                                    <input
                                        type="text"
                                        value={entry.label}
                                        onChange={(e) => update(idx, { label: e.target.value })}
                                        placeholder="Name (optional)"
                                        className={iCls}
                                        style={iSty}
                                    />
                                </div>
                            )}

                            {/* Preview (skip for plain text — the input already shows it) */}
                            {mode !== 'text' && (
                                <div
                                    className="flex items-center gap-1.5 text-[10px]"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <span className="shrink-0 opacity-70">Vorschau:</span>
                                    <EnumEntryLabel entry={entry} className="min-w-0 truncate" />
                                </div>
                            )}
                        </div>
                    );
                })}
                <button
                    onClick={add}
                    className="w-full text-[11px] py-1.5 rounded-lg hover:opacity-80 flex items-center justify-center gap-1"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px dashed var(--app-border)',
                    }}
                >
                    <Plus size={12} /> Eintrag hinzufügen
                </button>
            </div>

            {imagePickerIdx !== null && (
                <DatapointPicker
                    modes={['files']}
                    defaultMode="files"
                    acceptMime={['image/*']}
                    currentValue={entries[imagePickerIdx]?.image ?? ''}
                    onPickResult={(r) => {
                        if (r.kind === 'file') update(imagePickerIdx, { image: `aura-file:${r.path}` });
                        setImagePickerIdx(null);
                    }}
                    onClose={() => setImagePickerIdx(null)}
                />
            )}

            {iconPickerIdx !== null && (
                <IconPickerModal
                    current={entries[iconPickerIdx]?.icon ?? ''}
                    onSelect={(name) => {
                        update(iconPickerIdx, { icon: name || undefined });
                        setIconPickerIdx(null);
                    }}
                    onClose={() => setIconPickerIdx(null)}
                />
            )}
        </>
    );
}
