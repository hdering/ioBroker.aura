/**
 * "Grenzen" sub-editor of the fill widget (#613).
 *
 * A limit row carries a datapoint, an icon, two colours and four switches — far too
 * much for the options panel, so it lives behind a button in its own dialog. The
 * rows stay in configuration order while editing; the widget sorts them up the scale
 * at render time, so moving a limit past its neighbour needs no bookkeeping here.
 */
import { useState } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { ConfigModal } from './ConfigModal';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { ColorField } from './ConditionEditor';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { FillLimit } from '../../utils/fillLimits';

const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none w-full';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function newFillLimit(): FillLimit {
    return { id: `lim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, editable: true, step: 1 };
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </label>
    );
}

function Toggle({
    label,
    value,
    onChange,
    disabled,
    hint,
}: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    hint?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-2" style={{ opacity: disabled ? 0.45 : 1 }}>
            <div className="min-w-0">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                {hint && (
                    <span className="text-[10px] block opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        {hint}
                    </span>
                )}
            </div>
            <button
                disabled={disabled}
                onClick={() => onChange(!value)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: value && !disabled ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: value && !disabled ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

// ── One limit ────────────────────────────────────────────────────────────────

function LimitRow({
    limit,
    index,
    unit,
    onChange,
    onDelete,
}: {
    limit: FillLimit;
    index: number;
    unit: string;
    onChange: (patch: Partial<FillLimit>) => void;
    onDelete: () => void;
}) {
    const [picker, setPicker] = useState(false);
    const [iconPicker, setIconPicker] = useState(false);
    const hasDp = !!limit.datapoint?.trim();
    const Icon = limit.icon ? getWidgetIcon(limit.icon, null) : null;

    return (
        <div className="rounded-lg p-2.5 space-y-2.5" style={{ border: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-2">
                <span
                    className="text-[10px] font-semibold w-4 shrink-0 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {index + 1}
                </span>
                <input
                    value={limit.label ?? ''}
                    onChange={(e) => onChange({ label: e.target.value || undefined })}
                    placeholder="Bezeichnung, z. B. Ladelimit"
                    className={cls}
                    style={inputStyle}
                />
                <button
                    onClick={onDelete}
                    className="w-7 h-7 flex items-center justify-center rounded shrink-0 hover:opacity-80"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title="Grenze entfernen"
                >
                    <Trash2 size={13} />
                </button>
            </div>

            <div>
                <Label>Datenpunkt der Grenze</Label>
                <div className="flex gap-1">
                    <input
                        value={limit.datapoint ?? ''}
                        onChange={(e) => onChange({ datapoint: e.target.value || undefined })}
                        placeholder="leer = fester Wert"
                        className={cls}
                        style={inputStyle}
                    />
                    <button
                        onClick={() => setPicker(true)}
                        className="px-2 rounded-lg shrink-0 hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title="Aus ioBroker wählen"
                    >
                        <Database size={13} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {!hasDp && (
                    <div>
                        <Label>Fester Wert{unit ? ` (${unit})` : ''}</Label>
                        <input
                            type="number"
                            value={limit.value ?? ''}
                            onChange={(e) =>
                                onChange({ value: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                            className={cls}
                            style={inputStyle}
                        />
                    </div>
                )}
                <div>
                    <Label>Schrittweite beim Ziehen</Label>
                    <input
                        type="number"
                        min={0}
                        step="any"
                        value={limit.step ?? 1}
                        onChange={(e) => onChange({ step: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className={cls}
                        style={inputStyle}
                    />
                </div>
            </div>

            <div>
                <Label>Icon im Abschnitt darüber</Label>
                <button
                    onClick={() => setIconPicker(true)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 w-full hover:opacity-80"
                    style={inputStyle}
                >
                    {Icon ? <Icon size={15} /> : null}
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {limit.icon || 'kein Icon'}
                    </span>
                </button>
            </div>

            {/* ColorField, not a bare ColorPicker: an optional colour needs a way back
                to "unset", which the picker alone cannot express. */}
            <div className="space-y-1.5">
                <ColorField label="Linie" value={limit.color} onChange={(v) => onChange({ color: v })} />
                <ColorField label="Abschnitt" value={limit.bandColor} onChange={(v) => onChange({ bandColor: v })} />
                <ColorField
                    label="Erreicht"
                    value={limit.reachedColor}
                    onChange={(v) => onChange({ reachedColor: v })}
                />
                <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    Linie = die Markierung selbst · Abschnitt = Füllfarbe über der Grenze · Erreicht = Füllfarbe, sobald
                    der Wert die Grenze erreicht. Leer = Standard.
                </p>
            </div>

            <Toggle
                label="Im Dashboard verstellbar"
                value={limit.editable !== false}
                disabled={!hasDp}
                hint={hasDp ? undefined : 'Braucht einen Datenpunkt – ein fester Wert ist Konfiguration.'}
                onChange={(v) => onChange({ editable: v })}
            />
            <Toggle
                label="Wert an der Grenze anzeigen"
                value={limit.showValue !== false}
                onChange={(v) => onChange({ showValue: v })}
            />

            {picker && (
                <DatapointPicker
                    currentValue={limit.datapoint ?? ''}
                    onSelect={(id) => onChange({ datapoint: id })}
                    onClose={() => setPicker(false)}
                />
            )}
            {iconPicker && (
                <IconPickerModal
                    current={limit.icon ?? ''}
                    onSelect={(name) => {
                        onChange({ icon: name || undefined });
                        setIconPicker(false);
                    }}
                    onClose={() => setIconPicker(false)}
                />
            )}
        </div>
    );
}

// ── Editor ───────────────────────────────────────────────────────────────────

export interface FillLimitsEditorProps {
    limits: FillLimit[];
    unit: string;
    /** True while the widget also has its colour zones on — the sections then win. */
    zonesActive: boolean;
    baseIcon?: string;
    baseBandColor?: string;
    limitsEditable: boolean;
    commitOnRelease: boolean;
    clampNeighbours: boolean;
    onChange: (patch: Record<string, unknown>) => void;
    onClose: () => void;
}

export function FillLimitsEditor({
    limits,
    unit,
    zonesActive,
    baseIcon,
    baseBandColor,
    limitsEditable,
    commitOnRelease,
    clampNeighbours,
    onChange,
    onClose,
}: FillLimitsEditorProps) {
    const [baseIconPicker, setBaseIconPicker] = useState(false);
    const set = (next: FillLimit[]) => onChange({ limits: next });
    const BaseIcon = baseIcon ? getWidgetIcon(baseIcon, null) : null;

    return (
        <ConfigModal
            title="Grenzen"
            maxWidth={560}
            maxHeight={780}
            padded
            storageKey="fill-limits-editor"
            onClose={onClose}
        >
            <div className="space-y-3">
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    Jede Grenze ist eine Linie über dem Balken. Mit Datenpunkt kann sie im Dashboard gezogen werden und
                    schreibt den neuen Wert zurück. Icon und Abschnittsfarbe gelten für den Abschnitt <b>über</b> der
                    Grenze.
                </p>

                {zonesActive && limits.length > 0 && (
                    <p
                        className="text-[10px] leading-snug rounded-lg px-2 py-1.5"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'color-mix(in srgb, #f59e0b 14%, transparent)',
                        }}
                    >
                        Farbzonen sind ebenfalls aktiv. Sobald ein Abschnitt eine eigene Farbe hat, gewinnen die
                        Abschnitte – die Zonen werden dann nicht gezeichnet.
                    </p>
                )}

                {limits.map((limit, i) => (
                    <LimitRow
                        key={limit.id}
                        limit={limit}
                        index={i}
                        unit={unit}
                        onChange={(patch) => set(limits.map((l, j) => (j === i ? { ...l, ...patch } : l)))}
                        onDelete={() => set(limits.filter((_, j) => j !== i))}
                    />
                ))}

                <button
                    onClick={() => set([...limits, newFillLimit()])}
                    className="flex items-center gap-1 text-[11px] hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                >
                    <Plus size={12} /> Grenze hinzufügen
                </button>

                <div className="pt-2 space-y-2.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <div
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Unterster Abschnitt
                    </div>
                    <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Der Abschnitt unter der niedrigsten Grenze hat keine Grenze über sich, an der er hängen könnte —
                        Icon und Farbe stehen deshalb hier.
                    </p>
                    <div>
                        <Label>Icon</Label>
                        <button
                            onClick={() => setBaseIconPicker(true)}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 w-full hover:opacity-80"
                            style={inputStyle}
                        >
                            {BaseIcon ? <BaseIcon size={15} /> : null}
                            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                {baseIcon || 'kein Icon'}
                            </span>
                        </button>
                    </div>
                    <ColorField label="Farbe" value={baseBandColor} onChange={(v) => onChange({ baseBandColor: v })} />
                </div>

                <div className="pt-2 space-y-2.5" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <div
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Verhalten
                    </div>
                    <Toggle
                        label="Grenzen im Dashboard verstellbar"
                        value={limitsEditable}
                        hint="Aus = nur Anzeige, unabhängig von den einzelnen Grenzen."
                        onChange={(v) => onChange({ limitsEditable: v })}
                    />
                    <Toggle
                        label="Erst beim Loslassen schreiben"
                        value={commitOnRelease}
                        hint="Aus = jede Bewegung schreibt den Datenpunkt."
                        onChange={(v) => onChange({ limitCommitOnRelease: v })}
                    />
                    <Toggle
                        label="Nachbargrenzen nicht überholen"
                        value={clampNeighbours}
                        onChange={(v) => onChange({ limitClampNeighbours: v })}
                    />
                </div>
            </div>

            {baseIconPicker && (
                <IconPickerModal
                    current={baseIcon ?? ''}
                    onSelect={(name) => {
                        onChange({ baseIcon: name || undefined });
                        setBaseIconPicker(false);
                    }}
                    onClose={() => setBaseIconPicker(false)}
                />
            )}
        </ConfigModal>
    );
}

// ── Options-panel entry ──────────────────────────────────────────────────────

/**
 * The "Grenzen" block of the fill widget's options panel: a count and a button.
 * A component of its own, not an inline block — it owns the dialog's open state, and
 * a hook inside the panel's conditional IIFE would change hook order the moment the
 * user switches the widget's type.
 */
export function FillLimitsSection({
    options,
    set,
}: {
    options: Record<string, unknown>;
    set: (patch: Record<string, unknown>) => void;
}) {
    const [open, setOpen] = useState(false);
    const limits = (options.limits as FillLimit[] | undefined) ?? [];
    const draggable = limits.filter((l) => !!l.datapoint?.trim() && l.editable !== false).length;

    return (
        <>
            <div
                className="text-[10px] font-semibold uppercase tracking-wider pt-1"
                style={{ color: 'var(--text-secondary)' }}
            >
                Grenzen
            </div>
            <button
                onClick={() => setOpen(true)}
                className="w-full text-xs rounded-lg px-2.5 py-2 text-left hover:opacity-80"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                }}
            >
                {limits.length === 0
                    ? 'Grenzen einrichten …'
                    : `${limits.length} ${limits.length === 1 ? 'Grenze' : 'Grenzen'} bearbeiten …`}
            </button>
            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {limits.length === 0
                    ? 'Verstellbare Linien im Balken — Ladelimit, Entladegrenze, Priorisierungsschwelle. Jede Grenze mit eigenem Datenpunkt, Icon und Abschnittsfarbe.'
                    : `${draggable} davon im Dashboard verstellbar.`}
            </p>
            {open && (
                <FillLimitsEditor
                    limits={limits}
                    unit={(options.unit as string) ?? '%'}
                    zonesActive={(options.colorZones as boolean) ?? false}
                    baseIcon={options.baseIcon as string | undefined}
                    baseBandColor={options.baseBandColor as string | undefined}
                    limitsEditable={options.limitsEditable !== false}
                    commitOnRelease={options.limitCommitOnRelease !== false}
                    clampNeighbours={options.limitClampNeighbours !== false}
                    onChange={set}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
