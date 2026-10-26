/**
 * EnumEntriesEditor — the value → entry list of the Auswahlfeld, one compact row per
 * entry: value · icon · label · colour · up/down · remove.
 *
 * Shared by the Auswahlfeld panel and the JSON table's per-column "Zuordnung" (#852),
 * so both edit the same EnumEntry shape and look alike.
 */
import { useState } from 'react';
import { Plus, Trash2, HelpCircle } from 'lucide-react';
import { type EnumEntry } from '../widgets/enumEntry';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { ColorPicker } from '../common/ColorPicker';
import { IconPickerModal } from './IconPickerModal';

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const fieldCls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const miniBtn = 'text-[10px] px-1 rounded shrink-0 hover:opacity-80';

export function EnumEntriesEditor({
    entries,
    onChange,
    emptyHint,
    labelPlaceholder = 'Label',
}: {
    entries: EnumEntry[];
    onChange: (entries: EnumEntry[]) => void;
    /** Shown while the list is empty. */
    emptyHint: string;
    labelPlaceholder?: string;
}) {
    const [iconPickerIdx, setIconPickerIdx] = useState<number | null>(null);

    // Breite der Wert-Spalte: 64 px reichen für Zahlen, aber nicht für Text-Werte
    // — dort stand nur noch der Anfang im Feld (#679). Die Spalte wächst deshalb
    // mit dem längsten Wert (Monospace bei text-xs ≈ 7,2 px/Zeichen + 20 px
    // Innenabstand) und nimmt dem Label höchstens die halbe Zeile weg.
    const longestValue = Math.max(0, ...entries.map((e) => String(e.value ?? '').length));
    const valueColWidth = `min(50%, ${Math.max(64, Math.round(longestValue * 7.2) + 20)}px)`;

    const update = (idx: number, patch: Partial<EnumEntry>) =>
        onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
    const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx));
    const move = (idx: number, dir: -1 | 1) => {
        const next = idx + dir;
        if (next < 0 || next >= entries.length) return;
        const arr = [...entries];
        [arr[idx], arr[next]] = [arr[next], arr[idx]];
        onChange(arr);
    };
    const add = () => {
        const nextValue = entries.length
            ? String((Math.max(...entries.map((e) => Number(e.value)).filter((n) => !isNaN(n))) || 0) + 1)
            : '0';
        onChange([...entries, { value: nextValue, label: '' }]);
    };

    return (
        <div className="space-y-1">
            {entries.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {emptyHint}
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
                            style={{ ...iSty, width: valueColWidth, flexShrink: 0 }}
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
                            placeholder={labelPlaceholder}
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
        </div>
    );
}
