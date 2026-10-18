import { useT } from '../../i18n';
import { useDatapoint } from '../../hooks/useDatapoint';
import {
    VALUE_TRANSFORM_PRESETS,
    applyValueTransform,
    chooseTransformPreset,
    selectedTransformPreset,
    toggleTransformSign,
    transformSign,
} from '../../utils/valueTransform';
import { TIME_DISPLAY_PRESETS, formatTimeDisplay, hasTimeDisplay } from '../../utils/timeDisplay';
import { applyValueExpr } from '../../utils/valueExpr';
import { useFnsVersion } from '../../hooks/useFnsVersion';
import { exprToString } from '../../utils/expr';
import { formatNum } from '../../utils/formatValue';

/** What the expression preview prints — an empty result says so instead of showing nothing. */
function exprPreview(v: unknown): string {
    const s = exprToString(v);
    return s === '' ? '(leer)' : s;
}

export interface ValueTransformPatch {
    valueFactor?: number;
    valueOffset?: number;
    /** Selected preset id (or 'custom') — disambiguates presets that share factor/offset (e.g. Wh→kWh vs W→kW). */
    valueTransform?: string;
    /** Expression over `dp`, only with `valueTransform: 'expr'` (lists). */
    valueExpr?: string;
    /** Only emitted when `fillUnit` is set and the chosen preset suggests a unit. */
    unit?: string;
    /** Time output preset id (or 'custom'); undefined / 'none' = plain value. */
    valueTimeFormat?: string;
    /** Token pattern, only used when `valueTimeFormat` is 'custom'. */
    valueTimePattern?: string;
}

/**
 * Preset dropdown + optional manual factor/offset inputs for display-only value
 * transformation. Stores the result as `valueFactor` / `valueOffset` (+ the
 * selected `valueTransform` id) on the caller's options/cell object via `onPatch`.
 */
export function ValueTransformFields({
    factor,
    offset,
    presetId,
    timeFormat,
    timePattern,
    allowTimeFormat = false,
    writable = false,
    dpId,
    onPatch,
    fillUnit = false,
    explicitNone = false,
    expr,
    allowExpr = false,
    inputStyle,
    inputClassName = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none',
}: {
    factor?: number;
    offset?: number;
    /** Stored expression (preset 'expr'). */
    expr?: string;
    /** Offer "Ausdruck…" — only where the renderer applies it (the lists, issue #794). */
    allowExpr?: boolean;
    /** Stored selection id; takes precedence over factor/offset matching. */
    presetId?: string;
    /** Stored time output preset id (or 'custom'). */
    timeFormat?: string;
    /** Stored token pattern for the 'custom' time format. */
    timePattern?: string;
    /** Show the time-formatting section — only for targets that render the value as text. */
    allowTimeFormat?: boolean;
    /** The target also WRITES its datapoint (slider, knob, dimmer, number input): the
     *  conversion then runs both ways and the wording says so (issue #682). */
    writable?: boolean;
    /** Datapoint reference of the edited target; drives the live preview. */
    dpId?: string;
    onPatch: (patch: ValueTransformPatch) => void;
    /** When true, selecting a preset also fills the `unit` field. */
    fillUnit?: boolean;
    /** Store "Keine" as the literal 'none' instead of clearing the field. Needed
     *  where a wider default exists (list-wide transform) that must be switched
     *  off for this target rather than merely left unset. */
    explicitNone?: boolean;
    inputStyle?: React.CSSProperties;
    inputClassName?: string;
}) {
    const t = useT();
    // Live value of the edited datapoint so the automatic time detection is verifiable
    // right here. Passing an empty ref is a no-op in the hook.
    const { value: previewVal } = useDatapoint(allowTimeFormat || allowExpr ? (dpId ?? '') : '');
    // "Draw as negative" is the SIGN of the factor, not a flag of its own — see `transformSign`.
    // The dropdown picks the conversion, the checkbox flips it below the zero line (issue #594).
    const inverted = transformSign(factor) === -1;
    const rawSelected = selectedTransformPreset(presetId, factor, offset);
    // A config carried over from a list into a widget without expressions falls back to "Keine".
    const selected = rawSelected === 'expr' && !allowExpr ? 'none' : rawSelected;
    const isExpr = selected === 'expr';
    const ops = { formatNum: (n: number, d: number) => formatNum(n, d), decimals: 2, t };
    // Re-render the preview once Custom JS registered a `callback()` function (#794).
    useFnsVersion();

    const sty: React.CSSProperties = inputStyle ?? {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };
    const labelSty = { color: 'var(--text-secondary)' };

    const choose = (id: string) => {
        const { unit, ...patch } = chooseTransformPreset(id, { factor, offset }, explicitNone);
        onPatch(fillUnit && unit ? { ...patch, unit } : patch);
    };

    /** Flip the sign of whatever conversion is configured; ×1 becomes ×−1 and back. */
    const toggleInvert = () => onPatch(toggleTransformSign({ factor, offset, presetId }));

    const selectedTime = hasTimeDisplay(timeFormat) ? (timeFormat as string) : 'none';
    const chooseTime = (id: string) => {
        if (id === 'none') {
            onPatch({ valueTimeFormat: explicitNone ? 'none' : undefined, valueTimePattern: undefined });
            return;
        }
        onPatch({
            valueTimeFormat: id,
            valueTimePattern: id === 'custom' ? (timePattern ?? 'dd.MM.yyyy HH:mm') : undefined,
        });
    };

    // Preview runs the same order as the renderers: factor/offset first, then time format.
    const previewText = (() => {
        if (!allowTimeFormat || selectedTime === 'none') return null;
        if (!dpId?.trim()) return 'Kein Datenpunkt gewählt';
        const transformed = isExpr
            ? applyValueExpr(previewVal, expr, ops)
            : applyValueTransform(previewVal, factor, offset);
        const formatted = formatTimeDisplay(transformed, selectedTime, t, timePattern);
        return formatted ?? 'Wert ist keine Zeit';
    })();

    return (
        <div className="flex flex-col gap-2">
            <div>
                <label className="text-[11px] mb-1 block" style={labelSty}>
                    {writable ? 'Umrechnung (Anzeige & Eingabe)' : 'Umrechnung (nur Anzeige)'}
                </label>
                <select
                    value={selected}
                    onChange={(e) => choose(e.target.value)}
                    className={inputClassName}
                    style={sty}
                >
                    {VALUE_TRANSFORM_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.label}
                        </option>
                    ))}
                    <option value="custom">Eigene…</option>
                    {allowExpr && <option value="expr">Ausdruck…</option>}
                </select>
            </div>
            {isExpr && (
                <div>
                    <label className="text-[11px] mb-1 block" style={labelSty}>
                        Ausdruck
                    </label>
                    <input
                        type="text"
                        value={expr ?? ''}
                        onChange={(e) => onPatch({ valueTransform: 'expr', valueExpr: e.target.value || undefined })}
                        placeholder="dp.objektName * 0.4 | fixed(2)"
                        spellCheck={false}
                        className={`${inputClassName} font-mono`}
                        style={sty}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        <code>dp</code> = Wert des Datenpunkts, JSON-Felder mit <code>dp.feld</code> bzw.{' '}
                        <code>dp.liste[0].feld</code>. Rechnen mit + − × ÷, <code>? :</code>, <code>round()</code> u.
                        a.; Filter mit <code>|</code>: <code>fixed(2)</code>, <code>round(1)</code>,{' '}
                        <code>formatValue(2)</code>, <code>upper</code>…
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Eigene Logik: Funktion in Custom JS mit <code>aura.registerFn('name', (dp) =&gt; …)</code>{' '}
                        anmelden und hier mit <code>callback("name", dp)</code> aufrufen.
                    </p>
                    {dpId?.trim() && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Vorschau:{' '}
                            <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                                {exprPreview(applyValueExpr(previewVal, expr, ops))}
                            </span>
                        </p>
                    )}
                </div>
            )}
            {/* Drawing below the zero line is a chart idea (#594) — on a control it would only
                mean "scale runs backwards", which "Eigene…" with a negative factor already says. */}
            {!writable && !isExpr && (
                <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={labelSty}>
                    <input type="checkbox" checked={inverted} onChange={toggleInvert} className="cursor-pointer" />
                    Negativ darstellen (× −1)
                </label>
            )}
            {selected === 'custom' && (
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={labelSty}>
                            Anzeigefaktor
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={factor ?? 1}
                            onChange={(e) =>
                                onPatch({
                                    valueTransform: 'custom',
                                    valueFactor: e.target.value === '' ? undefined : Number(e.target.value),
                                    valueOffset: offset,
                                })
                            }
                            className={inputClassName}
                            style={sty}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={labelSty}>
                            Anzeige-Offset
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={offset ?? 0}
                            onChange={(e) =>
                                onPatch({
                                    valueTransform: 'custom',
                                    valueFactor: factor,
                                    valueOffset: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                            }
                            className={inputClassName}
                            style={sty}
                        />
                    </div>
                </div>
            )}
            {!isExpr && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {writable
                        ? 'Anzeige = Wert × Faktor + Offset. Min/Max/Schritt und der angezeigte Wert gelten in der umgerechneten Einheit; beim Schreiben wird zurückgerechnet.'
                        : 'Nur für die Anzeige. Der Datenpunktwert wird nicht verändert. Anzeige = Wert × Faktor + Offset'}
                </p>
            )}
            {allowTimeFormat && (
                <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <div>
                        <label className="text-[11px] mb-1 block" style={labelSty}>
                            Zeit-Formatierung
                        </label>
                        <select
                            value={selectedTime}
                            onChange={(e) => chooseTime(e.target.value)}
                            className={inputClassName}
                            style={sty}
                        >
                            {TIME_DISPLAY_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom">Eigenes Format…</option>
                        </select>
                    </div>
                    {selectedTime === 'custom' && (
                        <div>
                            <input
                                type="text"
                                value={timePattern ?? ''}
                                onChange={(e) =>
                                    onPatch({
                                        valueTimeFormat: 'custom',
                                        valueTimePattern: e.target.value || undefined,
                                    })
                                }
                                placeholder="dd.MM.yyyy HH:mm"
                                className={`${inputClassName} font-mono`}
                                style={sty}
                            />
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                Tokens: HH mm ss · dd MM yyyy yy · EEEE (Wochentag) · EE · MMMM (Monat) · ww (KW)
                            </p>
                        </div>
                    )}
                    {previewText && (
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Vorschau: <span style={{ color: 'var(--text-primary)' }}>{previewText}</span>
                        </p>
                    )}
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Zeitstempel (Sekunden/Millisekunden), ISO-Zeitangaben und HH:mm werden automatisch erkannt.
                    </p>
                </div>
            )}
        </div>
    );
}
