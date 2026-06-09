/**
 * EnumConfig — config panel for the "Auswahlfeld" (enum) widget.
 *
 * Maps DP values (e.g. 0/1/2/3) to text labels and offers a one-click
 * import from the DP's native common.states.
 */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import type { EnumEntry } from '../widgets/EnumWidget';
import { getObjectDirect } from '../../hooks/useIoBroker';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

export function EnumConfig({ config, onConfigChange }: Props) {
    const o = config.options ?? {};
    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const entries = (o.entries as EnumEntry[] | undefined) ?? [];
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);

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
        setO({ entries: [...entries, { value: nextValue, label: '' }] });
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
                        Noch keine Einträge. Lege Wert→Label-Paare an oder importiere sie aus dem Datenpunkt.
                    </p>
                )}
                {entries.map((entry, idx) => (
                    <div
                        key={idx}
                        className="rounded-lg p-2 space-y-1.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
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
                                style={{ ...iSty, width: '80px', flexShrink: 0 }}
                            />
                            <input
                                type="text"
                                value={entry.label}
                                onChange={(e) => update(idx, { label: e.target.value })}
                                placeholder="Label"
                                className={`flex-1 ${iCls} min-w-0`}
                                style={iSty}
                            />
                            <input
                                type="color"
                                value={entry.color ?? '#666666'}
                                onChange={(e) => update(idx, { color: e.target.value })}
                                title="Farbe für dieses Label (optional)"
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
                    </div>
                ))}
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
        </>
    );
}
