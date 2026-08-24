/**
 * EnumConfig — config panel for the "Auswahlfeld" (enum) widget.
 *
 * Maps DP values (e.g. 0/1/2/3) to entries and offers a one-click import from
 * the DP's native common.states. Each entry is edited in a single compact row:
 * value/id · icon · label · color · up/down · remove — mirroring the universal
 * widget's DP-Auswahlfeld cell. How the current selection is rendered
 * (text / icon+text / icon) is a widget-level option (see Darstellung).
 *
 * Alternatively the whole list can come from a datapoint holding JSON
 * (issue #577) — then the entries are read live instead of being maintained
 * here, and this panel only configures the source and its field names.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, HelpCircle, Database, Copy } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { type EnumEntry } from '../widgets/EnumWidget';
import { getObjectDirect, getStateDirect } from '../../hooks/useIoBroker';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { parseEnumEntriesJson } from '../../utils/enumEntriesJson';
import { splitDpRef, extractJsonPath } from '../../utils/dpRef';
import { copyToClipboard } from '../../utils/clipboard';
import { ColorPicker } from '../common/ColorPicker';
import { IconPickerModal } from './IconPickerModal';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';

/** Shown as the "so muss das JSON aussehen" example in the panel and the docs. */
const JSON_EXAMPLE = `[
  { "value": 0, "label": "Aus",   "color": "#ef4444" },
  { "value": 1, "label": "Heizen","color": "#f59e0b", "icon": "Flame" },
  { "value": 2, "label": "Kühlen","color": "#3b82f6", "icon": "Snowflake" }
]`;

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

/** Small on/off switch matching the config-panel style. */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                style={{ left: on ? '14px' : '2px' }}
            />
        </button>
    );
}

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const fieldCls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

/** One "Feldname" row of the JSON mapping (empty = auto-detect). */
function KeyField({
    label,
    value,
    placeholder,
    onChange,
}: {
    label: string;
    value: string;
    placeholder: string;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value.trim() || undefined)}
                placeholder={placeholder}
                className={`${fieldCls} flex-1 min-w-0 font-mono`}
                style={iSty}
            />
        </div>
    );
}

/**
 * Source panel for the JSON mode: DP reference (with optional JSON path),
 * the field names, a live preview of what the current DP value parses into,
 * and the example payload.
 */
function JsonEntriesSection({
    o,
    setO,
}: {
    o: Record<string, unknown>;
    setO: (patch: Record<string, unknown>) => void;
}) {
    const dp = (o.entriesDp as string) ?? '';
    const [showPicker, setShowPicker] = useState(false);
    const [showExample, setShowExample] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    const [preview, setPreview] = useState<{ entries: EnumEntry[]; error: string | null } | null>(null);

    const valueKey = (o.entriesValueKey as string) ?? '';
    const labelKey = (o.entriesLabelKey as string) ?? '';
    const colorKey = (o.entriesColorKey as string) ?? '';
    const iconKey = (o.entriesIconKey as string) ?? '';
    const imageKey = (o.entriesImageKey as string) ?? '';

    // Preview: read the DP once whenever the reference or a field name changes.
    useEffect(() => {
        let cancelled = false;
        const { id, path } = splitDpRef(dp);
        if (!id) {
            setPreview(null);
            return;
        }
        void (async () => {
            try {
                const state = await getStateDirect(id);
                if (cancelled) return;
                if (!state) {
                    setPreview({ entries: [], error: 'Datenpunkt nicht lesbar' });
                    return;
                }
                const raw = path ? extractJsonPath(state.val, path) : state.val;
                const entries = parseEnumEntriesJson(raw, {
                    value: valueKey || undefined,
                    label: labelKey || undefined,
                    color: colorKey || undefined,
                    icon: iconKey || undefined,
                    image: imageKey || undefined,
                });
                setPreview({ entries, error: entries.length ? null : 'Kein verwertbares JSON gefunden' });
            } catch {
                if (!cancelled) setPreview({ entries: [], error: 'Fehler beim Lesen des DP' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dp, valueKey, labelKey, colorKey, iconKey, imageKey]);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    value={dp}
                    onChange={(e) => setO({ entriesDp: e.target.value })}
                    placeholder="0_userdata.0.auswahl.liste"
                    className={`${fieldCls} flex-1 min-w-0 font-mono`}
                    style={iSty}
                />
                <button
                    onClick={() => setShowPicker(true)}
                    className="px-1.5 py-1.5 rounded-lg hover:opacity-80 shrink-0"
                    style={iSty}
                    title="Aus ioBroker wählen"
                >
                    <Database size={12} />
                </button>
                <JsonPathButton value={dp} onChange={(ref) => setO({ entriesDp: ref })} size={12} />
            </div>

            {preview && (
                <div
                    className="text-[10px]"
                    style={{ color: preview.error ? 'var(--accent-yellow, #f59e0b)' : 'var(--text-secondary)' }}
                >
                    {preview.error ?? `${preview.entries.length} Einträge erkannt`}
                    {preview.entries.length > 0 && (
                        <span style={{ opacity: 0.75 }}>
                            {' · '}
                            {preview.entries
                                .slice(0, 5)
                                .map((e) => `${e.value} → ${e.label}`)
                                .join(', ')}
                            {preview.entries.length > 5 ? ' …' : ''}
                        </span>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setShowExample((v) => !v)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                    style={{ ...iSty, color: 'var(--text-secondary)' }}
                >
                    {showExample ? 'Beispiel ausblenden' : 'Beispiel-JSON'}
                </button>
                <button
                    onClick={() => setShowKeys((v) => !v)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                    style={{ ...iSty, color: 'var(--text-secondary)' }}
                >
                    {showKeys ? 'Feldnamen ausblenden' : 'Feldnamen'}
                </button>
            </div>

            {showExample && (
                <div className="rounded-lg p-2 space-y-1" style={{ ...iSty, color: 'var(--text-secondary)' }}>
                    <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto m-0">{JSON_EXAMPLE}</pre>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => copyToClipboard(JSON_EXAMPLE)}
                            className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 flex items-center gap-1"
                            style={iSty}
                        >
                            <Copy size={10} /> Kopieren
                        </button>
                        <span className="text-[10px]" style={{ opacity: 0.8 }}>
                            Auch erlaubt: {'{ "0": "Aus", "1": "An" }'} oder {'["Aus", "An"]'}
                        </span>
                    </div>
                </div>
            )}

            {showKeys && (
                <div className="space-y-1">
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Leer = automatisch erkennen (value/val/id/key bzw. label/name/text …). Pfade wie
                        {' attributes.name'} sind erlaubt.
                    </p>
                    <KeyField
                        label="Wert"
                        value={valueKey}
                        placeholder="value"
                        onChange={(v) => setO({ entriesValueKey: v })}
                    />
                    <KeyField
                        label="Label"
                        value={labelKey}
                        placeholder="label"
                        onChange={(v) => setO({ entriesLabelKey: v })}
                    />
                    <KeyField
                        label="Farbe"
                        value={colorKey}
                        placeholder="color"
                        onChange={(v) => setO({ entriesColorKey: v })}
                    />
                    <KeyField
                        label="Icon"
                        value={iconKey}
                        placeholder="icon"
                        onChange={(v) => setO({ entriesIconKey: v })}
                    />
                    <KeyField
                        label="Bild"
                        value={imageKey}
                        placeholder="image"
                        onChange={(v) => setO({ entriesImageKey: v })}
                    />
                </div>
            )}

            {showPicker && (
                <DatapointPicker
                    currentValue={dp}
                    onSelect={(id) => setO({ entriesDp: id })}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
}

export function EnumConfig({ config, onConfigChange }: Props) {
    const o = config.options ?? {};
    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const entries = (o.entries as EnumEntry[] | undefined) ?? [];
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [iconPickerIdx, setIconPickerIdx] = useState<number | null>(null);
    const fromJson = o.entriesSource === 'json';

    const miniBtn = 'text-[10px] px-1 rounded shrink-0 hover:opacity-80';

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
            {/* Quelle der Einträge: von Hand gepflegt oder aus einem JSON-DP (#577) */}
            <div className="flex items-center justify-between gap-2">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Einträge
                </label>
                <div
                    className="flex rounded-lg overflow-hidden shrink-0"
                    style={{ border: '1px solid var(--app-border)' }}
                >
                    {(
                        [
                            { key: 'manual', label: 'Manuell' },
                            { key: 'json', label: 'JSON-Datenpunkt' },
                        ] as const
                    ).map(({ key, label }) => {
                        const active = (fromJson ? 'json' : 'manual') === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setO({ entriesSource: key })}
                                className="text-[10px] px-2 py-1 transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: 'none',
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {fromJson && <JsonEntriesSection o={o} setO={setO} />}

            {!fromJson && (
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

                    <div className="space-y-1">
                        {entries.length === 0 && (
                            <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Noch keine Einträge. Lege Wert→Eintrag-Paare an oder importiere sie aus dem Datenpunkt.
                            </p>
                        )}
                        {entries.map((entry, idx) => {
                            const EntryIcon = entry.icon ? getWidgetIcon(entry.icon, HelpCircle) : null;
                            return (
                                <div key={idx} className="flex items-center gap-1">
                                    {/* Wert / ID */}
                                    <input
                                        type="text"
                                        value={entry.value}
                                        onChange={(e) => update(idx, { value: e.target.value })}
                                        placeholder="Wert"
                                        title="DP-Wert"
                                        className={`${fieldCls} font-mono`}
                                        style={{ ...iSty, width: '64px', flexShrink: 0 }}
                                    />
                                    {/* Icon */}
                                    <button
                                        onClick={() => setIconPickerIdx(idx)}
                                        title={entry.icon ? `Icon: ${entry.icon}` : 'Icon wählen…'}
                                        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                                        style={{
                                            ...iSty,
                                            color: entry.icon ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {EntryIcon ? (
                                            <EntryIcon size={15} style={{ color: entry.color }} />
                                        ) : (
                                            <HelpCircle size={15} style={{ opacity: 0.4 }} />
                                        )}
                                    </button>
                                    {entry.icon && (
                                        <button
                                            onClick={() => update(idx, { icon: undefined })}
                                            title="Icon entfernen"
                                            className={miniBtn}
                                            style={{ ...iSty, paddingTop: 4, paddingBottom: 4 }}
                                        >
                                            ×
                                        </button>
                                    )}
                                    {/* Label */}
                                    <input
                                        type="text"
                                        value={entry.label}
                                        onChange={(e) => update(idx, { label: e.target.value })}
                                        placeholder="Label"
                                        className={`${fieldCls} flex-1 min-w-0`}
                                        style={iSty}
                                    />
                                    {/* Farbe */}
                                    <ColorPicker
                                        value={entry.color ?? '#666666'}
                                        onChange={(v) => update(idx, { color: v })}
                                        title="Farbe (Text/Icon, optional)"
                                        className="shrink-0 rounded cursor-pointer"
                                        style={{
                                            width: '28px',
                                            height: '30px',
                                            border: '1px solid var(--app-border)',
                                            background: 'transparent',
                                        }}
                                    />
                                    {entry.color && (
                                        <button
                                            onClick={() => update(idx, { color: undefined })}
                                            title="Farbe zurücksetzen"
                                            className={miniBtn}
                                            style={{ ...iSty, paddingTop: 4, paddingBottom: 4 }}
                                        >
                                            ×
                                        </button>
                                    )}
                                    {/* Hoch / Runter */}
                                    <div className="flex flex-col shrink-0">
                                        <button
                                            onClick={() => move(idx, -1)}
                                            disabled={idx === 0}
                                            className="text-[9px] px-1 rounded hover:opacity-80 disabled:opacity-30 leading-none"
                                            style={iSty}
                                            title="Nach oben"
                                        >
                                            ▲
                                        </button>
                                        <button
                                            onClick={() => move(idx, 1)}
                                            disabled={idx === entries.length - 1}
                                            className="text-[9px] px-1 rounded hover:opacity-80 disabled:opacity-30 leading-none mt-0.5"
                                            style={iSty}
                                            title="Nach unten"
                                        >
                                            ▼
                                        </button>
                                    </div>
                                    {/* Entfernen */}
                                    <button
                                        onClick={() => remove(idx)}
                                        className="hover:opacity-70 shrink-0"
                                        title="Eintrag löschen"
                                        style={{ color: 'var(--accent-red, #ef4444)' }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
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
                </>
            )}

            {/* ── Anzeige-Optionen (wie im Universal-Widget) ── */}
            <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Aktuelles Label anzeigen
                    </label>
                    <Toggle on={o.showValue !== false} onClick={() => setO({ showValue: !(o.showValue !== false) })} />
                </div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Dropdown ausblenden (nur Einträge)
                    </label>
                    <Toggle on={o.showSelect === false} onClick={() => setO({ showSelect: o.showSelect === false })} />
                </div>
                <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Anzeige aktueller Eintrag
                    </label>
                    <div
                        className="flex rounded-lg overflow-hidden shrink-0"
                        style={{ border: '1px solid var(--app-border)' }}
                    >
                        {(
                            [
                                { key: 'text', label: 'Text' },
                                { key: 'icon-text', label: 'Icon + Text' },
                                { key: 'icon', label: 'Icon' },
                            ] as const
                        ).map(({ key, label }) => {
                            const active = ((o.entryDisplay as string) ?? 'text') === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setO({ entryDisplay: key })}
                                    className="text-[10px] px-2 py-1 transition-colors"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: 'none',
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {iconPickerIdx !== null && entries[iconPickerIdx] && (
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
