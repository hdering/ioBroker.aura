/**
 * Die Werteliste des Raumklima-Widgets (Issue #698).
 *
 * Ein Raumsensor liefert weit mehr als Temperatur und Feuchte. Statt für jeden
 * Messwert einen eigenen Satz Optionen zu bauen, pflegt dieser Editor eine Liste:
 * Vorlage wählen, Datenpunkt setzen, fertig. Alles Weitere — Einheit, Farben,
 * Wertzuordnung, Diagramm — steht aufgeklappt in derselben Karte.
 *
 * Wohnt in einem eigenen Popup (ConfigModal), nicht im Options-Panel: die Karten
 * sind zu verschachtelt für die schmale Spalte.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { ColorField } from './ConditionEditor';
import { ColorThresholdsEditor } from './ColorThresholdsEditor';
import { RuleDragHandle, RuleMoveButtons, useRuleReorder } from './ruleReorder';
import {
    CLIMATE_METRIC_TEMPLATES,
    SLOT_FONT_SIZE,
    metricFromTemplate,
    type ClimateMetricTemplate,
} from '../../utils/climateMetrics';
import type { ClimateMetric, ClimateMetricDisplay, ClimateMetricSlot, ClimateValueMapEntry } from '../../types';
import type { ColorThreshold } from '../../utils/colorThresholds';

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none w-full';

const SOURCES: { value: NonNullable<ClimateMetric['source']>; label: string }[] = [
    { value: 'datapoint', label: 'Datenpunkt' },
    { value: 'dewpoint', label: 'Taupunkt (gerechnet)' },
    { value: 'absoluteHumidity', label: 'Absolute Feuchte (gerechnet)' },
    { value: 'comfort', label: 'Behaglichkeit (gerechnet)' },
];

const DISPLAYS: { value: ClimateMetricDisplay; label: string }[] = [
    { value: 'value', label: 'Wert' },
    { value: 'badge', label: 'Pille' },
    { value: 'dot', label: 'Punkt' },
    { value: 'text', label: 'Text ohne Einheit' },
];

const SLOTS: { value: ClimateMetricSlot; label: string }[] = [
    { value: 'grid', label: 'Raster unter den Hauptwerten' },
    { value: 'secondary', label: 'Rechte Spalte' },
    { value: 'primary', label: 'Groß, neben der Temperatur' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--app-border)' }}>
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-[10px] w-24 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex-1 min-w-0">{children}</div>
        </div>
    );
}

/** Die Zahl-zu-Text-Tabelle: Behaglichkeit 0/1/2, Schulnoten, ein/aus. */
function ValueMapEditor({
    rows,
    onChange,
}: {
    rows: ClimateValueMapEntry[];
    onChange: (next: ClimateValueMapEntry[] | undefined) => void;
}) {
    const patch = (i: number, p: Partial<ClimateValueMapEntry>) => {
        const next = rows.map((r, j) => (j === i ? { ...r, ...p } : r));
        onChange(next);
    };
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Wertzuordnung
                </label>
                <button
                    onClick={() => onChange([...rows, { v: rows.length, label: '' }])}
                    className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                    }}
                >
                    + Hinzufügen
                </button>
            </div>
            {rows.length > 0 && (
                <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Passt der Wert, steht der Text statt der Zahl da. Einheit entfällt.
                </p>
            )}
            <div className="space-y-1">
                {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <button
                            onClick={() => onChange(rows.length === 1 ? undefined : rows.filter((_, j) => j !== i))}
                            className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                            style={{ color: 'var(--text-secondary)', ...inputStyle }}
                        >
                            ×
                        </button>
                        <input
                            type="text"
                            value={String(row.v)}
                            onChange={(e) => {
                                const raw = e.target.value;
                                const num = Number(raw);
                                patch(i, { v: raw !== '' && !isNaN(num) ? num : raw });
                            }}
                            className="text-xs rounded-lg px-2 py-1 focus:outline-none w-16 shrink-0"
                            style={inputStyle}
                            title="Wert des Datenpunkts"
                        />
                        <input
                            type="text"
                            value={row.label}
                            onChange={(e) => patch(i, { label: e.target.value })}
                            placeholder="Text"
                            className="text-xs rounded-lg px-2 py-1 focus:outline-none flex-1 min-w-0"
                            style={inputStyle}
                        />
                        <div className="shrink-0">
                            <ColorField
                                label=""
                                compact
                                value={row.color}
                                onChange={(v) => patch(i, { color: v || undefined })}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MetricCard({
    metric,
    open,
    onToggle,
    onChange,
    onRemove,
    onPick,
    reorder,
    drag,
}: {
    metric: ClimateMetric;
    open: boolean;
    onToggle: () => void;
    onChange: (patch: Partial<ClimateMetric>) => void;
    onRemove: () => void;
    onPick: () => void;
    reorder: React.ReactNode;
    drag: React.ReactNode;
}) {
    const [iconPicker, setIconPicker] = useState(false);
    const source = metric.source ?? 'datapoint';
    const display = metric.display ?? 'value';
    const slot = metric.slot ?? 'grid';
    const hasMap = !!metric.valueMap?.length;

    return (
        <div
            className="rounded-lg p-2"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center gap-1.5">
                {drag}
                <button onClick={onToggle} className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <input
                    type="text"
                    value={metric.label ?? ''}
                    onChange={(e) => onChange({ label: e.target.value || undefined })}
                    placeholder={metric.id}
                    className="text-xs rounded-lg px-2 py-1 focus:outline-none flex-1 min-w-0"
                    style={inputStyle}
                />
                <button
                    onClick={() => onChange({ hidden: metric.hidden ? undefined : true })}
                    className="shrink-0 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                    title={metric.hidden ? 'Wird nicht angezeigt' : 'Wird angezeigt'}
                >
                    {metric.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {reorder}
                <button
                    onClick={onRemove}
                    className="shrink-0 hover:opacity-70"
                    style={{ color: 'var(--accent-red, #ef4444)' }}
                    title="Entfernen"
                >
                    <Trash2 size={13} />
                </button>
            </div>

            {open && (
                <div className="mt-2">
                    <Field label="Quelle">
                        <select
                            value={source}
                            onChange={(e) => onChange({ source: e.target.value as ClimateMetric['source'] })}
                            className={cls}
                            style={inputStyle}
                        >
                            {SOURCES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </Field>

                    {source === 'datapoint' && (
                        <Field label="Datenpunkt">
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={metric.datapoint ?? ''}
                                    onChange={(e) => onChange({ datapoint: e.target.value || undefined })}
                                    placeholder="0_userdata.0…"
                                    className="text-xs rounded-lg px-2 py-1.5 font-mono focus:outline-none flex-1 min-w-0"
                                    style={inputStyle}
                                />
                                <button
                                    onClick={onPick}
                                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                    style={inputStyle}
                                    title="Aus ioBroker wählen"
                                >
                                    <Database size={13} />
                                </button>
                            </div>
                        </Field>
                    )}

                    {source !== 'datapoint' && (
                        <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                            Wird aus Ist-Temperatur und Luftfeuchtigkeit gerechnet — kein Datenpunkt nötig.
                        </p>
                    )}

                    <Field label="Icon">
                        <button
                            onClick={() => setIconPicker(true)}
                            className="text-xs rounded-lg px-2 py-1.5 w-full text-left truncate"
                            style={inputStyle}
                        >
                            {metric.icon || 'Icon auswählen…'}
                        </button>
                    </Field>

                    <div className="flex gap-1.5 mb-1.5">
                        <div className="flex-1">
                            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                Einheit
                            </label>
                            <input
                                type="text"
                                value={metric.unit ?? ''}
                                onChange={(e) => onChange({ unit: e.target.value || undefined })}
                                className={cls}
                                style={inputStyle}
                            />
                        </div>
                        <div className="w-24 shrink-0">
                            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                Nachkomma
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={4}
                                value={metric.decimals ?? ''}
                                placeholder="global"
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onChange({ decimals: isNaN(n) ? undefined : Math.min(4, Math.max(0, n)) });
                                }}
                                className={cls}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <Section title="Darstellung">
                        <Field label="Als">
                            <select
                                value={display}
                                onChange={(e) => onChange({ display: e.target.value as ClimateMetricDisplay })}
                                className={cls}
                                style={inputStyle}
                            >
                                {DISPLAYS.map((d) => (
                                    <option key={d.value} value={d.value}>
                                        {d.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Platz">
                            <select
                                value={slot}
                                onChange={(e) => onChange({ slot: e.target.value as ClimateMetricSlot })}
                                className={cls}
                                style={inputStyle}
                            >
                                {SLOTS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Schriftgröße">
                            <input
                                type="number"
                                min={8}
                                max={48}
                                value={metric.fontSize ?? ''}
                                placeholder={String(SLOT_FONT_SIZE[slot])}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onChange({ fontSize: isNaN(n) ? undefined : Math.min(48, Math.max(8, n)) });
                                }}
                                className={cls}
                                style={inputStyle}
                            />
                        </Field>
                        <ColorField
                            label="Farbe"
                            value={metric.color}
                            onChange={(v) => onChange({ color: v || undefined })}
                        />
                    </Section>

                    <Section title="Umrechnung">
                        <div className="flex gap-1.5">
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    Faktor
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={metric.valueFactor ?? ''}
                                    placeholder="1"
                                    onChange={(e) => {
                                        const n = parseFloat(e.target.value);
                                        onChange({ valueFactor: isNaN(n) ? undefined : n });
                                    }}
                                    className={cls}
                                    style={inputStyle}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    Versatz
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={metric.valueOffset ?? ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                        const n = parseFloat(e.target.value);
                                        onChange({ valueOffset: isNaN(n) ? undefined : n });
                                    }}
                                    className={cls}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    </Section>

                    <Section title="Farben nach Wert">
                        <ColorThresholdsEditor
                            thresholds={(metric.thresholds as ColorThreshold[]) ?? []}
                            onChange={(next) => onChange({ thresholds: next.length ? next : undefined })}
                        />
                        <div className="mt-2">
                            <ValueMapEditor
                                rows={metric.valueMap ?? []}
                                onChange={(next) => onChange({ valueMap: next?.length ? next : undefined })}
                            />
                        </div>
                        {hasMap && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                                Eine passende Zuordnung sticht die Farbschwelle.
                            </p>
                        )}
                    </Section>

                    <Section title="Diagramm">
                        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-primary)' }}>
                            <input
                                type="checkbox"
                                checked={metric.inChart === true}
                                disabled={source !== 'datapoint'}
                                onChange={(e) => onChange({ inChart: e.target.checked ? true : undefined })}
                            />
                            Als eigene Reihe zeichnen
                        </label>
                        {source !== 'datapoint' && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Nur Datenpunkte haben einen Verlauf — gerechnete Werte nicht.
                            </p>
                        )}
                        {metric.inChart && (
                            <div className="mt-1.5">
                                <Field label="Achse">
                                    <select
                                        value={metric.chartAxis ?? 'left'}
                                        onChange={(e) =>
                                            onChange({ chartAxis: e.target.value === 'right' ? 'right' : undefined })
                                        }
                                        className={cls}
                                        style={inputStyle}
                                    >
                                        <option value="left">Links (wie die Temperatur)</option>
                                        <option value="right">Rechts (eigene Skala)</option>
                                    </select>
                                </Field>
                                <Field label="Form">
                                    <select
                                        value={metric.chartType ?? 'line'}
                                        onChange={(e) =>
                                            onChange({ chartType: e.target.value === 'area' ? 'area' : undefined })
                                        }
                                        className={cls}
                                        style={inputStyle}
                                    >
                                        <option value="line">Linie</option>
                                        <option value="area">Fläche</option>
                                    </select>
                                </Field>
                            </div>
                        )}
                    </Section>
                </div>
            )}

            {iconPicker && (
                <IconPickerModal
                    current={metric.icon ?? ''}
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

export function ClimateMetricsEditor({
    metrics,
    onChange,
}: {
    metrics: ClimateMetric[];
    onChange: (next: ClimateMetric[]) => void;
}) {
    const [openId, setOpenId] = useState<string | null>(metrics.length === 1 ? metrics[0].id : null);
    const [pickerFor, setPickerFor] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const { itemProps, reorderProps } = useRuleReorder(metrics, onChange);

    const patch = (id: string, p: Partial<ClimateMetric>) =>
        onChange(metrics.map((m) => (m.id === id ? { ...m, ...p } : m)));

    const add = (tpl: ClimateMetricTemplate) => {
        const next = metricFromTemplate(tpl.key, metrics);
        onChange([...metrics, next]);
        setOpenId(next.id);
        setAdding(false);
    };

    return (
        <div>
            <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                Jeder Eintrag ist ein weiterer Messwert der Kachel — CO₂, VOC, Taupunkt, Helligkeit, Bewegung. Soll,
                Feuchte und Luftdruck bleiben in ihren eigenen Feldern im Options-Panel.
            </p>

            <div className="space-y-1.5">
                {metrics.map((m, i) => (
                    <div key={m.id} {...itemProps(i)}>
                        <MetricCard
                            metric={m}
                            open={openId === m.id}
                            onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                            onChange={(p) => patch(m.id, p)}
                            onRemove={() => onChange(metrics.filter((x) => x.id !== m.id))}
                            onPick={() => setPickerFor(m.id)}
                            drag={<RuleDragHandle {...reorderProps(i)} />}
                            reorder={<RuleMoveButtons {...reorderProps(i)} />}
                        />
                    </div>
                ))}
            </div>

            {metrics.length === 0 && (
                <p className="text-[11px] py-3 text-center" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    Noch kein weiterer Wert.
                </p>
            )}

            <button
                onClick={() => setAdding((v) => !v)}
                className="mt-2 w-full text-[11px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 hover:opacity-80"
                style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                }}
            >
                <Plus size={12} /> Wert hinzufügen
            </button>

            {adding && (
                <div
                    className="mt-1.5 rounded-lg p-1.5 space-y-1"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    {CLIMATE_METRIC_TEMPLATES.map((tpl) => (
                        <button
                            key={tpl.key}
                            onClick={() => add(tpl)}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:opacity-80"
                            style={{ background: 'var(--app-surface)' }}
                        >
                            <span className="text-[11px] block" style={{ color: 'var(--text-primary)' }}>
                                {tpl.label}
                            </span>
                            {tpl.hint && (
                                <span className="text-[10px] block" style={{ color: 'var(--text-secondary)' }}>
                                    {tpl.hint}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {pickerFor && (
                <DatapointPicker
                    currentValue={metrics.find((m) => m.id === pickerFor)?.datapoint ?? ''}
                    onSelect={(id) => patch(pickerFor, { datapoint: id })}
                    onClose={() => setPickerFor(null)}
                />
            )}
        </div>
    );
}
