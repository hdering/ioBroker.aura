import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, TriangleAlert } from 'lucide-react';
import {
    formatItemName,
    parseRegex,
    NAME_FILTER_FIELDS,
    type NameFilterField,
    type NameFilterOp,
    type NameFilterRule,
    type NameSource,
} from '../../utils/nameFilter';
import {
    categoryOf,
    collectHmBatterySerials,
    passesScope,
    CATEGORY_ORDER,
    type StatusOverviewOptions,
} from '../../utils/statusOverview';
import { ensureDatapointCache } from '../../hooks/useDatapointList';

/**
 * Rule-list editor for the status-overview name pattern. Each rule reshapes one token value
 * (<Raum>, <Gerät>, …) before it is substituted into the pattern; rules on "Ergebnis" run on
 * the finished label. Order matters — rules on the same field chain.
 *
 * The preview calls the very same formatItemName the widget uses, on real datapoints from
 * the shared cache, so it cannot drift from what the widget renders. Labels are hard-coded
 * German to match StatusOverviewConfig (that panel is not internationalised).
 */

interface OpMeta {
    op: NameFilterOp;
    label: string;
    /** undefined = no first input */
    valueLabel?: string;
    valuePh?: string;
    valueOptions?: { v: string; label: string }[];
    value2Label?: string;
    value2Ph?: string;
    /** value is a regex → validate and show the error state */
    regex?: boolean;
    hint?: string;
}

const OPS: OpMeta[] = [
    { op: 'remove', label: 'Text entfernen', valueLabel: 'Text', valuePh: 'ACTUAL_' },
    {
        op: 'replace',
        label: 'Text ersetzen',
        valueLabel: 'Suchen',
        valuePh: '_',
        value2Label: 'Ersetzen',
        value2Ph: 'Leerzeichen',
    },
    {
        op: 'keepBefore',
        label: 'Alles vor … behalten',
        valueLabel: 'Trenner',
        valuePh: ' ',
        hint: 'Schneidet ab dem ersten Vorkommen ab.',
    },
    {
        op: 'keepAfter',
        label: 'Alles nach … behalten',
        valueLabel: 'Trenner',
        valuePh: '.',
        hint: 'Nimmt den Teil nach dem letzten Vorkommen.',
    },
    {
        op: 'segment',
        label: 'Segment auswählen',
        valueLabel: 'Trenner',
        valuePh: '.',
        value2Label: 'Nr.',
        value2Ph: '-1',
        hint: '1 = erstes Segment, -1 = letztes.',
    },
    { op: 'stripPrefix', label: 'Präfix entfernen', valueLabel: 'Präfix', valuePh: 'zigbee.0.' },
    { op: 'stripSuffix', label: 'Suffix entfernen', valueLabel: 'Suffix', valuePh: '_STATE' },
    { op: 'firstWords', label: 'Erste N Wörter behalten', valueLabel: 'Anzahl', valuePh: '1' },
    { op: 'lastWords', label: 'Letzte N Wörter behalten', valueLabel: 'Anzahl', valuePh: '2' },
    {
        op: 'stripDigits',
        label: 'Zahlen & Sonderzeichen entfernen',
        hint: 'Entfernt Ziffern, 0x-Adressen und übrig gebliebene Trennzeichen.',
    },
    {
        op: 'case',
        label: 'Groß-/Kleinschreibung',
        valueLabel: 'Variante',
        valueOptions: [
            { v: 'title', label: 'Erster Buchstabe groß' },
            { v: 'lower', label: 'alles klein' },
            { v: 'upper', label: 'ALLES GROSS' },
        ],
    },
    {
        op: 'regexExtract',
        label: 'Regex: Teil herausziehen',
        valueLabel: 'Regex',
        valuePh: '/^(\\w+)_/',
        regex: true,
        hint: 'Nimmt Gruppe 1, ohne Gruppe den ganzen Treffer. Kein Treffer → Text bleibt. /…/ achtet auf Groß-/Kleinschreibung, ohne Schrägstriche nicht.',
    },
    {
        op: 'regexReplace',
        label: 'Regex: ersetzen',
        valueLabel: 'Regex',
        valuePh: '/^(ACTUAL|SET)_/i',
        regex: true,
        value2Label: 'Ersetzen',
        value2Ph: 'leer = entfernen',
        hint: '$1 setzt die erste Gruppe ein, leer lassen = entfernen. /…/ achtet auf Groß-/Kleinschreibung, ohne Schrägstriche nicht.',
    },
];

const OP_META = new Map<NameFilterOp, OpMeta>(OPS.map((o) => [o.op, o]));

const FIELD_LABEL: Record<NameFilterField, string> = {
    Raum: '<Raum>',
    Gerät: '<Gerät>',
    DPName: '<DPName>',
    Name: '<Name>',
    ID: '<ID>',
    Ergebnis: 'Ergebnis',
};

/** One-click starters — the entry point for users who do not want to touch regex. */
const PRESETS: { label: string; rules: Omit<NameFilterRule, 'id'>[] }[] = [
    {
        label: 'ACTUAL_/SET_ Präfix weg',
        rules: [{ field: 'DPName', op: 'regexReplace', value: '/^(ACTUAL|SET|CURRENT)_/i', value2: '' }],
    },
    { label: 'Unterstriche zu Leerzeichen', rules: [{ field: 'DPName', op: 'replace', value: '_', value2: ' ' }] },
    { label: 'Erster Buchstabe groß', rules: [{ field: 'DPName', op: 'case', value: 'title' }] },
    { label: 'Nur letztes ID-Segment', rules: [{ field: 'ID', op: 'segment', value: '.', value2: '-1' }] },
    {
        // Serials are trailing alphanumeric blocks that contain at least one digit — the
        // lookahead keeps normal upper-case words ("… SCHLAFEN") from being stripped.
        label: 'Geräte-Seriennummer weg',
        rules: [{ field: 'Gerät', op: 'regexReplace', value: '/\\s+(?=[A-Z0-9]*\\d)[A-Z0-9]{6,}$/', value2: '' }],
    },
    { label: 'Erstes Wort behalten', rules: [{ field: 'Gerät', op: 'firstWords', value: '1' }] },
    { label: 'Zahlen weg', rules: [{ field: 'Gerät', op: 'stripDigits' }] },
];

const newId = () => `nf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** A value made of spaces looks like an empty field — say so next to the label. */
function wsNote(v?: string): string {
    if (!v || !/^\s+$/.test(v)) return '';
    return v.length === 1 ? ' · Leerzeichen' : ` · ${v.length} Leerzeichen`;
}

const inputCls = 'w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const microLabelCls = 'text-[10px] mb-0.5 block';
const microLabelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function IconBtn({
    onClick,
    title,
    disabled,
    danger,
    children,
}: {
    onClick: () => void;
    title: string;
    disabled?: boolean;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            disabled={disabled}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:opacity-80 shrink-0"
            style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: danger ? '#ef4444' : 'var(--text-secondary)',
                opacity: disabled ? 0.35 : 1,
                cursor: disabled ? 'default' : 'pointer',
            }}
        >
            {children}
        </button>
    );
}

interface Props {
    rules: NameFilterRule[];
    pattern?: string;
    /** Effective widget options — used to pick preview datapoints exactly like the widget does. */
    opts: StatusOverviewOptions;
    onChange: (rules: NameFilterRule[]) => void;
}

export function NameFilterEditor({ rules, pattern, opts, onChange }: Props) {
    const [samples, setSamples] = useState<NameSource[]>([]);
    const [total, setTotal] = useState(0);

    // Same discovery the widget runs (StatusOverviewWidget), so the preview shows datapoints
    // that this widget will actually list. The cache is module-level (5 min TTL) → cheap.
    const scopeKey = JSON.stringify([
        opts.catBattery,
        opts.catWindow,
        opts.catLight,
        opts.catUnreach,
        opts.catAlarm,
        opts.includeLowbatBoolean,
        opts.lightRoleScope,
        opts.lightsOnlyFunction,
        opts.filterRooms,
        opts.filterFuncs,
        opts.filterAdapters,
        opts.excludeIds,
        opts.excludeIdPatterns,
        opts.offlineExtraPatterns,
        opts.offlineInvert,
    ]);
    useEffect(() => {
        let cancelled = false;
        ensureDatapointCache().then((cache) => {
            if (cancelled) return;
            const hm = collectHmBatterySerials(cache);
            const byCat = new Map<string, NameSource[]>();
            let count = 0;
            for (const dp of cache) {
                const cat = categoryOf(dp, opts, hm);
                if (!cat) continue;
                if (!passesScope(dp, opts)) continue;
                count++;
                const list = byCat.get(cat) ?? [];
                if (list.length < 2) list.push({ id: dp.id, name: dp.name, room: dp.rooms[0] });
                byCat.set(cat, list);
            }
            // Spread the examples over the active categories instead of showing six batteries.
            const spread: NameSource[] = [];
            for (const cat of CATEGORY_ORDER) spread.push(...(byCat.get(cat) ?? []));
            setSamples(spread.slice(0, 6));
            setTotal(count);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    const rulesKey = JSON.stringify(rules);
    const preview = useMemo(
        () => samples.map((s) => ({ id: s.id, before: s.name, after: formatItemName(s, pattern, rules) })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [samples, pattern, rulesKey],
    );

    // A rule that changes nothing in any example is almost always a typo — flag it.
    const ineffective = useMemo(() => {
        const flags = rules.map(() => false);
        if (!samples.length) return flags;
        rules.forEach((r, i) => {
            if (r.disabled) return;
            const without = rules.map((x, j) => (j === i ? { ...x, disabled: true } : x));
            flags[i] = samples.every((s) => formatItemName(s, pattern, rules) === formatItemName(s, pattern, without));
        });
        return flags;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [samples, pattern, rulesKey]);

    const update = (i: number, patch: Partial<NameFilterRule>) =>
        onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const remove = (i: number) => onChange(rules.filter((_, j) => j !== i));
    const move = (i: number, dir: -1 | 1) => {
        const next = [...rules];
        const j = i + dir;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const add = () => onChange([...rules, { id: newId(), field: 'DPName', op: 'remove', value: '' }]);
    const addPreset = (p: (typeof PRESETS)[number]) =>
        onChange([...rules, ...p.rules.map((r) => ({ ...r, id: newId() }))]);

    return (
        <div className="space-y-3">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Regeln bearbeiten den Text eines Platzhalters, bevor er ins Namensmuster eingesetzt wird. Sie werden von
                oben nach unten angewendet — mehrere Regeln auf dasselbe Feld bauen aufeinander auf.{' '}
                <strong>Ergebnis</strong> wirkt auf das fertige Label. Welche Geräte angezeigt werden, ändert das nicht.
            </p>

            {/* ── Rules ── */}
            {rules.length === 0 && (
                <p
                    className="text-[11px] rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    Noch keine Regel. Am schnellsten geht es über eine Vorlage unten.
                </p>
            )}
            <div className="space-y-2">
                {rules.map((rule, i) => {
                    const meta = OP_META.get(rule.op);
                    const regexBad = !!meta?.regex && !!rule.value?.trim() && !parseRegex(rule.value);
                    return (
                        <div
                            key={rule.id}
                            className="rounded-lg p-2 space-y-1.5"
                            style={{
                                background: 'var(--app-bg)',
                                border: `1px solid ${regexBad ? '#ef4444' : 'var(--app-border)'}`,
                                opacity: rule.disabled ? 0.5 : 1,
                            }}
                        >
                            <div className="flex items-start gap-1.5">
                                <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                                    <div>
                                        <label className={microLabelCls} style={microLabelStyle}>
                                            Feld
                                        </label>
                                        <select
                                            value={rule.field}
                                            onChange={(e) => update(i, { field: e.target.value as NameFilterField })}
                                            className={inputCls}
                                            style={inputStyle}
                                        >
                                            {NAME_FILTER_FIELDS.map((f) => (
                                                <option key={f} value={f}>
                                                    {FIELD_LABEL[f]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={microLabelCls} style={microLabelStyle}>
                                            Aktion
                                        </label>
                                        <select
                                            value={rule.op}
                                            onChange={(e) => {
                                                const op = e.target.value as NameFilterOp;
                                                const m = OP_META.get(op);
                                                // Reset the inputs — a value from another action rarely fits.
                                                update(i, { op, value: m?.valueOptions?.[0]?.v ?? '', value2: '' });
                                            }}
                                            className={inputCls}
                                            style={inputStyle}
                                        >
                                            {OPS.map((o) => (
                                                <option key={o.op} value={o.op}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {(meta?.valueLabel || meta?.value2Label) && (
                                        <>
                                            {meta.valueLabel && (
                                                <div>
                                                    <label className={microLabelCls} style={microLabelStyle}>
                                                        {meta.valueLabel}
                                                        {wsNote(rule.value)}
                                                    </label>
                                                    {meta.valueOptions ? (
                                                        <select
                                                            value={rule.value ?? meta.valueOptions[0].v}
                                                            onChange={(e) => update(i, { value: e.target.value })}
                                                            className={inputCls}
                                                            style={inputStyle}
                                                        >
                                                            {meta.valueOptions.map((o) => (
                                                                <option key={o.v} value={o.v}>
                                                                    {o.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={rule.value ?? ''}
                                                            onChange={(e) => update(i, { value: e.target.value })}
                                                            placeholder={meta.valuePh}
                                                            className={inputCls}
                                                            style={inputStyle}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                            {meta.value2Label && (
                                                <div>
                                                    <label className={microLabelCls} style={microLabelStyle}>
                                                        {meta.value2Label}
                                                        {wsNote(rule.value2)}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={rule.value2 ?? ''}
                                                        onChange={(e) => update(i, { value2: e.target.value })}
                                                        placeholder={meta.value2Ph}
                                                        className={inputCls}
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1 pt-4">
                                    <div className="flex gap-1">
                                        <IconBtn onClick={() => move(i, -1)} title="Nach oben" disabled={i === 0}>
                                            <ChevronUp size={13} />
                                        </IconBtn>
                                        <IconBtn
                                            onClick={() => move(i, 1)}
                                            title="Nach unten"
                                            disabled={i === rules.length - 1}
                                        >
                                            <ChevronDown size={13} />
                                        </IconBtn>
                                    </div>
                                    <div className="flex gap-1">
                                        <IconBtn
                                            onClick={() => update(i, { disabled: !rule.disabled })}
                                            title={rule.disabled ? 'Regel aktivieren' : 'Regel vorübergehend aus'}
                                        >
                                            {rule.disabled ? <EyeOff size={13} /> : <Eye size={13} />}
                                        </IconBtn>
                                        <IconBtn onClick={() => remove(i)} title="Regel löschen" danger>
                                            <Trash2 size={13} />
                                        </IconBtn>
                                    </div>
                                </div>
                            </div>
                            {regexBad ? (
                                <p className="text-[10px] flex items-center gap-1" style={{ color: '#ef4444' }}>
                                    <TriangleAlert size={11} /> Ungültiger Regex — die Regel wird übersprungen.
                                </p>
                            ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {meta?.hint && (
                                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            {meta.hint}
                                        </p>
                                    )}
                                    {ineffective[i] && (
                                        <span
                                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                                            style={{
                                                background:
                                                    'color-mix(in srgb, var(--text-secondary) 15%, transparent)',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            ohne Wirkung
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Add + presets ── */}
            <div className="space-y-1.5">
                <button
                    type="button"
                    onClick={add}
                    className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                >
                    <Plus size={13} /> Regel hinzufügen
                </button>
                <div>
                    <p className={microLabelCls} style={microLabelStyle}>
                        Vorlagen (fügen fertige Regeln an)
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {PRESETS.map((p) => (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => addPreset(p)}
                                className="text-[10px] px-2 py-1 rounded-full hover:opacity-80"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                + {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Live preview ── */}
            <div className="pt-2" style={{ borderTop: '1px solid var(--app-border)' }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Vorschau{' '}
                    <span className="font-normal opacity-70">
                        {total > 0 ? `(${preview.length} von ${total} Datenpunkten)` : ''}
                    </span>
                </p>
                {preview.length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Keine passenden Datenpunkte gefunden — Kategorien und Filter prüfen.
                    </p>
                ) : (
                    <div className="space-y-1">
                        {preview.map((p) => (
                            <div key={p.id} className="text-[11px] leading-tight">
                                <div className="truncate" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                    {p.before}
                                </div>
                                <div className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                                    → {p.after}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
