import { useState } from 'react';
import { ArrowDown, ArrowUp, Database, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_ORDER, ROW_ACTION_PRESETS, type CategoryKey, type StatusRowAction } from '../../utils/statusOverview';
import { DatapointPicker } from './DatapointPicker';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

/** Example targets of the presets: still there = not adjusted yet. */
const EXAMPLE_TARGETS = new Set(ROW_ACTION_PRESETS.filter((p) => p.needsDp).map((p) => p.action.targetDp));

const CAT_LABEL: Record<CategoryKey, string> = {
    alarm: 'Rauch & Wasser',
    window: 'Fenster & Türen',
    unreach: 'Nicht erreichbar',
    battery: 'Batterien',
    light: 'Lichter',
};

/**
 * Editor for the Statusübersicht's row buttons (option `rowActions`). Lives in a
 * ConfigModal: each action has five fields, which would push the rest of the
 * options panel out of sight.
 */
export function StatusRowActionsEditor({
    actions,
    onChange,
}: {
    actions: StatusRowAction[];
    onChange: (next: StatusRowAction[] | undefined) => void;
}) {
    const [pickFor, setPickFor] = useState<number | null>(null);
    const update = (i: number, patch: Partial<StatusRowAction>) =>
        onChange(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
    const remove = (i: number) => {
        const next = actions.filter((_, j) => j !== i);
        onChange(next.length ? next : undefined);
    };
    const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= actions.length) return;
        const next = [...actions];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const toggleCat = (i: number, cat: CategoryKey) => {
        const cur = actions[i].categories ?? [];
        const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
        update(i, { categories: next.length ? next : undefined });
    };

    return (
        <div className="space-y-3">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Jeder Knopf schreibt einen Wert in einen Datenpunkt. Platzhalter aus der Zeile: <code>{'{id}'}</code>{' '}
                Datenpunkt, <code>{'{device}'}</code> Gerät, <code>{'{serial}'}</code> Seriennummer (letzter Teil der
                Geräte-Id), <code>{'{name}'}</code>, <code>{'{room}'}</code>. Die Knöpfe stehen in den Layouts Standard
                und Kompakt am Zeilenende.
            </p>
            <div className="space-y-1.5" data-row-action-presets="">
                <span className={labelCls} style={labelStyle}>
                    Vorlage hinzufügen
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {ROW_ACTION_PRESETS.map((p) => {
                        const present = actions.some(
                            (a) => a.targetDp === p.action.targetDp && a.value === p.action.value,
                        );
                        return (
                            <button
                                key={p.key}
                                disabled={present}
                                title={present ? 'Schon vorhanden' : p.hint}
                                onClick={() => onChange([...actions, { ...p.action }])}
                                className="inline-flex items-center gap-1 text-[11px] rounded-full px-2.5 py-1 hover:opacity-80 disabled:opacity-40"
                                style={{
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <Plus size={11} /> {p.title}
                            </button>
                        );
                    })}
                </div>
            </div>
            {actions.map((a, i) => (
                <div
                    key={i}
                    className="rounded-lg p-2.5 space-y-2"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    data-row-action={i}
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={a.label}
                            onChange={(e) => update(i, { label: e.target.value })}
                            placeholder="Beschriftung, z. B. Gewechselt"
                            className={inputCls}
                            style={inputStyle}
                            aria-label="Beschriftung"
                        />
                        <button
                            onClick={() => move(i, -1)}
                            disabled={i === 0}
                            className="p-1 rounded hover:opacity-80 disabled:opacity-30"
                            title="Nach oben"
                        >
                            <ArrowUp size={13} style={{ color: 'var(--text-secondary)' }} />
                        </button>
                        <button
                            onClick={() => move(i, 1)}
                            disabled={i === actions.length - 1}
                            className="p-1 rounded hover:opacity-80 disabled:opacity-30"
                            title="Nach unten"
                        >
                            <ArrowDown size={13} style={{ color: 'var(--text-secondary)' }} />
                        </button>
                        <button onClick={() => remove(i)} className="p-1 rounded hover:opacity-80" title="Entfernen">
                            <Trash2 size={13} style={{ color: 'var(--accent-red, #ef4444)' }} />
                        </button>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Ziel-Datenpunkt
                        </label>
                        <div className="flex gap-1.5">
                            <input
                                type="text"
                                value={a.targetDp}
                                onChange={(e) => update(i, { targetDp: e.target.value })}
                                placeholder="0_userdata.0.Batterien.Befehl"
                                className={`${inputCls} font-mono`}
                                style={inputStyle}
                                aria-label="Ziel-Datenpunkt"
                            />
                            <button
                                onClick={() => setPickFor(i)}
                                className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                style={inputStyle}
                                title="Datenpunkt wählen"
                            >
                                <Database size={13} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                        </div>
                        {a.targetDp === '{id}' && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                {'{id}'} = der Datenpunkt der Zeile selbst.
                            </p>
                        )}
                        {EXAMPLE_TARGETS.has(a.targetDp) && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--badge-warn, #f59e0b)' }}>
                                Beispiel aus der Vorlage – auf einen Datenpunkt deiner Installation ändern.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Wert
                        </label>
                        <input
                            type="text"
                            value={a.value}
                            onChange={(e) => update(i, { value: e.target.value })}
                            placeholder="gewechselt:{serial}"
                            className={`${inputCls} font-mono`}
                            style={inputStyle}
                            aria-label="Wert"
                        />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {'„true“, „false“ und reine Zahlen werden typgerecht geschrieben, alles andere als Text.'}
                        </p>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Nur bei (keine Auswahl = alle Zeilen)
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {CATEGORY_ORDER.map((cat) => {
                                const on = a.categories?.includes(cat) ?? false;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => toggleCat(i, cat)}
                                        className="text-[11px] rounded-full px-2 py-0.5"
                                        style={{
                                            background: on ? 'var(--accent)' : 'transparent',
                                            color: on ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {CAT_LABEL[cat]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={!!a.confirm}
                            onChange={(e) => update(i, { confirm: e.target.checked || undefined })}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>
                            Rückfrage: erst nach zweitem Tippen ausführen
                        </span>
                    </label>
                    {a.confirm && (
                        <input
                            type="text"
                            value={a.confirmLabel ?? ''}
                            onChange={(e) => update(i, { confirmLabel: e.target.value || undefined })}
                            placeholder="Wirklich?"
                            className={inputCls}
                            style={inputStyle}
                            aria-label="Text der Rückfrage"
                        />
                    )}
                </div>
            ))}
            <button
                onClick={() => onChange([...actions, { label: '', targetDp: '', value: '' }])}
                className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                <Plus size={13} /> Knopf hinzufügen
            </button>
            {pickFor !== null && (
                <DatapointPicker
                    currentValue={actions[pickFor]?.targetDp ?? ''}
                    onSelect={(id) => {
                        update(pickFor, { targetDp: id });
                        setPickFor(null);
                    }}
                    onClose={() => setPickFor(null)}
                />
            )}
        </div>
    );
}
