import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';
import { IconPickerModal } from '../IconPickerModal';
import { ColorField } from './listFieldUi';
import type { EntryStateMap } from '../../widgets/entryControls';

/**
 * A value → text table (issue #572): `true` becomes "ONLINE", `2` becomes "gekippt".
 *
 * The same shape the "Zustände" display type already uses, so there is one concept
 * instead of two. It is applied in entryValueText(), which both the main value and
 * the second line go through — configure it once, it reads the same in both.
 */

const iCls = 'w-full text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

export function StateMapFields({
    states,
    onChange,
}: {
    states?: EntryStateMap[];
    onChange: (next: EntryStateMap[] | undefined) => void;
}) {
    const [iconFor, setIconFor] = useState<number | null>(null);
    const list = states ?? [];

    const patch = (i: number, p: Partial<EntryStateMap>) =>
        onChange(list.map((s, j) => (j === i ? { ...s, ...p } : s)));
    const remove = (i: number) => {
        const next = list.filter((_, j) => j !== i);
        onChange(next.length ? next : undefined);
    };

    return (
        <div className="mt-1.5 space-y-1">
            <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                Werte-Zuordnung — ersetzt den angezeigten Wert (die Einheit entfällt dann).
            </p>
            {list.map((st, i) => (
                <div key={i} className="flex items-end gap-1">
                    <div className="w-14 shrink-0">
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="Wert"
                            value={String(st.value ?? '')}
                            onChange={(e) => patch(i, { value: e.target.value })}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="Text"
                            value={st.label ?? ''}
                            onChange={(e) => patch(i, { label: e.target.value || undefined })}
                        />
                    </div>
                    <button
                        onClick={() => setIconFor(i)}
                        title={st.icon || 'Icon wählen'}
                        className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                        style={{ ...iSty, width: 26, height: 22 }}
                    >
                        {st.icon ? (
                            <Icon icon={toIconifyId(st.icon)} width={13} height={13} />
                        ) : (
                            <Plus size={11} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                        )}
                    </button>
                    <div className="shrink-0">
                        <ColorField
                            label=""
                            value={st.color}
                            fallback="#94a3b8"
                            onChange={(v) => patch(i, { color: v })}
                        />
                    </div>
                    <button
                        onClick={() => remove(i)}
                        className="shrink-0 hover:opacity-70 pb-1"
                        style={{ color: 'var(--accent-red)' }}
                        title="Zuordnung entfernen"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            ))}
            <button
                onClick={() => onChange([...list, { value: '' }])}
                className="flex items-center gap-1 text-[10px] hover:opacity-80"
                style={{ color: 'var(--accent)' }}
            >
                <Plus size={11} /> Wert zuordnen
            </button>
            {iconFor !== null && (
                <IconPickerModal
                    current={list[iconFor]?.icon ?? ''}
                    onSelect={(name) => {
                        patch(iconFor, { icon: name || undefined });
                        setIconFor(null);
                    }}
                    onClose={() => setIconFor(null)}
                />
            )}
        </div>
    );
}
