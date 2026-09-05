/**
 * EnumJsonSourceSection — the "Einträge aus einem JSON-Datenpunkt" editor
 * (issue #577): DP reference with optional JSON path, the optional field-name
 * overrides, a live preview of what the current DP value parses into, and the
 * example payload.
 *
 * Shared by the standalone Auswahlfeld widget (EnumConfig) and the Auswahl cell
 * of the Universal Widget (CustomCellEditor), so both sides of the same feature
 * stay one implementation. The caller owns where the values are stored and only
 * hands in the current reference plus the field names (issue #615).
 */
import { useEffect, useState } from 'react';
import { Database, Copy } from 'lucide-react';
import { getStateDirect } from '../../hooks/useIoBroker';
import { parseEnumEntriesJson, type EnumJsonKeys } from '../../utils/enumEntriesJson';
import { splitDpRef, extractJsonPath } from '../../utils/dpRef';
import { copyToClipboard } from '../../utils/clipboard';
import type { EnumEntry } from '../widgets/enumEntry';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';

/** Shown as the "so muss das JSON aussehen" example in the panel and the docs. */
export const ENUM_JSON_EXAMPLE = `[
  { "value": 0, "label": "Aus",   "color": "#ef4444" },
  { "value": 1, "label": "Heizen","color": "#f59e0b", "icon": "Flame" },
  { "value": 2, "label": "Kühlen","color": "#3b82f6", "icon": "Snowflake" }
]`;

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const fieldCls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

/** The field-name rows, in the order they are offered. */
const KEY_FIELDS: { field: keyof EnumJsonKeys; label: string; placeholder: string }[] = [
    { field: 'value', label: 'Wert', placeholder: 'value' },
    { field: 'label', label: 'Label', placeholder: 'label' },
    { field: 'color', label: 'Farbe', placeholder: 'color' },
    { field: 'icon', label: 'Icon', placeholder: 'icon' },
    { field: 'image', label: 'Bild', placeholder: 'image' },
];

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

export function EnumJsonSourceSection({
    dp,
    keys,
    onDpChange,
    onKeyChange,
}: {
    /** DP reference holding the JSON, optionally with a `?path` suffix. */
    dp: string;
    /** Field-name overrides; empty/undefined = the parser's own guesses. */
    keys: EnumJsonKeys;
    onDpChange: (dp: string) => void;
    onKeyChange: (field: keyof EnumJsonKeys, value: string | undefined) => void;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const [showExample, setShowExample] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    const [preview, setPreview] = useState<{ entries: EnumEntry[]; error: string | null } | null>(null);

    const valueKey = keys.value ?? '';
    const labelKey = keys.label ?? '';
    const colorKey = keys.color ?? '';
    const iconKey = keys.icon ?? '';
    const imageKey = keys.image ?? '';

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
                    onChange={(e) => onDpChange(e.target.value)}
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
                <JsonPathButton value={dp} onChange={(ref) => onDpChange(ref)} size={12} />
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
                    <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto m-0">{ENUM_JSON_EXAMPLE}</pre>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => copyToClipboard(ENUM_JSON_EXAMPLE)}
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
                    {KEY_FIELDS.map(({ field, label, placeholder }) => (
                        <KeyField
                            key={field}
                            label={label}
                            value={keys[field] ?? ''}
                            placeholder={placeholder}
                            onChange={(v) => onKeyChange(field, v)}
                        />
                    ))}
                </div>
            )}

            {showPicker && (
                <DatapointPicker
                    currentValue={dp}
                    onSelect={(id) => onDpChange(id)}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
}
