import { useMemo, useState } from 'react';
import { Copy, Database, Plus, Trash2, X } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { useDashboardStore } from '../../store/dashboardStore';
import { usePopupConfigStore } from '../../store/popupConfigStore';
import type {
    MessageAlign,
    MessageAppearance,
    MessageDraft,
    MessagePosition,
    MessageSeverity,
    MessageTimeFormat,
} from '../../types';

/**
 * Form → JSON builder for a message payload.
 *
 * This is the answer to "how do I enter a message" from issue #429: every field
 * of the wire format has a control, and the JSON it produces is shown next to it,
 * ready to copy into a script. It deliberately emits only the fields that differ
 * from the defaults — a payload full of redundant keys is harder to read and
 * pins values the admin defaults were meant to supply.
 *
 * Shared by Admin → Meldungen and the "Meldung senden" condition effect.
 */

export const MESSAGE_POSITIONS: { value: MessagePosition; label: string }[] = [
    { value: 'top-left', label: 'Oben links' },
    { value: 'top-center', label: 'Oben mitte' },
    { value: 'top-right', label: 'Oben rechts' },
    { value: 'center-left', label: 'Mitte links' },
    { value: 'center', label: 'Mitte' },
    { value: 'center-right', label: 'Mitte rechts' },
    { value: 'bottom-left', label: 'Unten links' },
    { value: 'bottom-center', label: 'Unten mitte' },
    { value: 'bottom-right', label: 'Unten rechts' },
];

export const MESSAGE_APPEARANCES: { value: MessageAppearance; label: string; hint: string }[] = [
    { value: 'bar', label: 'Balken links', hint: 'Farbiger Streifen an der linken Kante' },
    { value: 'filled', label: 'Ganz gefüllt', hint: 'Die ganze Karte in der Farbe' },
    { value: 'outline', label: 'Rahmen', hint: 'Farbiger Rahmen rundum' },
    { value: 'plain', label: 'Ohne Farbe', hint: 'Nur Icon und Text' },
];

export const MESSAGE_ALIGNS: { value: MessageAlign; label: string }[] = [
    { value: 'left', label: 'Links' },
    { value: 'center', label: 'Mitte' },
    { value: 'right', label: 'Rechts' },
];

export const MESSAGE_TIME_FORMATS: { value: MessageTimeFormat; label: string }[] = [
    { value: 'time', label: 'Uhrzeit' },
    { value: 'datetime', label: 'Datum + Uhrzeit' },
];

export const MESSAGE_SEVERITIES: { value: MessageSeverity; label: string; color: string }[] = [
    { value: 'info', label: 'Info', color: '#3b82f6' },
    { value: 'success', label: 'Erfolg', color: '#22c55e' },
    { value: 'warning', label: 'Warnung', color: '#f59e0b' },
    { value: 'error', label: 'Fehler', color: '#ef4444' },
];

export type { MessageDraft };

/** Starting point for the "Tabelle einfügen" button — the shape people ask for most. */
const TABLE_SNIPPET = `<table>
  <tr><th>Raum</th><th>Temperatur</th></tr>
  <tr><td>Bad</td><td>[[alias.0.Bad.TIST]] °C</td></tr>
  <tr><td>Küche</td><td>[[alias.0.Kueche.TIST]] °C</td></tr>
</table>`;

export function emptyDraft(): MessageDraft {
    return {
        id: '',
        severity: 'info',
        title: '',
        text: '',
        html: '',
        image: '',
        icon: '',
        view: '',
        dp: '',
        position: '',
        durationSec: '',
        requireAck: false,
        priority: '',
        width: '',
        height: '',
        transparency: '',
        appearance: '',
        align: '',
        showTime: '',
        color: '',
        background: '',
        textColor: '',
        ackDp: '',
        ackValue: '',
        persist: true,
        actions: [],
        targetClients: '',
        targetLayout: '',
        targetTab: '',
    };
}

/**
 * Draft → the JSON a script would write. Only non-default fields are emitted.
 *
 * Reads persisted data (a condition's stored `notify` draft), so it must survive
 * a draft written before a field existed — every accessor tolerates undefined
 * rather than assuming the current shape.
 */
export function draftToPayload(d: MessageDraft): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const str = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
    const num = (v: string | undefined) => {
        if (typeof v !== 'string' || v.trim() === '') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };

    if (str(d.id)) out.id = str(d.id);
    if (d.severity !== 'info') out.severity = d.severity;
    for (const key of ['title', 'text', 'html', 'image', 'icon', 'view', 'dp', 'ackDp'] as const) {
        if (str(d[key])) out[key] = str(d[key]);
    }
    if (out.ackDp && str(d.ackValue)) out.ackValue = str(d.ackValue);
    if (d.position) out.position = d.position;
    const duration = num(d.durationSec);
    if (duration !== undefined) out.durationSec = duration;
    if (d.requireAck) out.requireAck = true;
    const priority = num(d.priority);
    if (priority) out.priority = priority;
    for (const key of ['width', 'height', 'transparency'] as const) {
        const n = num(d[key]);
        if (n) out[key] = n;
    }
    if (d.appearance) out.appearance = d.appearance;
    if (d.align) out.align = d.align;
    // 'off' has to travel as an explicit false — leaving it out would let the admin
    // default switch the timestamp back on.
    if (d.showTime === 'off') out.showTime = false;
    else if (d.showTime) {
        out.showTime = true;
        out.timeFormat = d.showTime;
    }
    for (const key of ['color', 'background', 'textColor'] as const) {
        if (str(d[key])) out[key] = str(d[key]);
    }
    if (!d.persist) out.persist = false;

    const actions = (Array.isArray(d.actions) ? d.actions : [])
        .filter((a) => str(a?.label) && str(a?.dp))
        .map((a) => ({
            label: str(a.label),
            dp: str(a.dp),
            ...(str(a.value) ? { value: str(a.value) } : {}),
            ...(a.close === false ? { close: false } : {}),
        }));
    if (actions.length) out.actions = actions;

    const target: Record<string, unknown> = {};
    const clients = str(d.targetClients)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    if (clients.length) target.clients = clients;
    if (str(d.targetLayout)) target.layout = str(d.targetLayout);
    if (str(d.targetTab)) target.tab = str(d.targetTab);
    if (Object.keys(target).length) out.target = target;

    return out;
}

// ── Shared field styles (mirrors AdminPopups) ─────────────────────────────────

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>
                {label}
            </label>
            {children}
            {hint && (
                <p className="text-[10px] mt-1 opacity-70" style={labelStyle}>
                    {hint}
                </p>
            )}
        </div>
    );
}

/** Text field plus the ioBroker browse button — same shape as ConditionEditor's clause row. */
function DpField({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const [picking, setPicking] = useState(false);
    return (
        <div className="flex items-center gap-1">
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder ?? 'adapter.0.gerät.zustand'}
                className={`${inputCls} font-mono flex-1 min-w-0`}
                style={inputStyle}
            />
            <button
                onClick={() => setPicking(true)}
                className="px-2 py-2 rounded-lg hover:opacity-80 shrink-0"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                }}
                title="Aus ioBroker wählen"
            >
                <Database size={12} />
            </button>
            {picking && <DatapointPicker currentValue={value} onSelect={onChange} onClose={() => setPicking(false)} />}
        </div>
    );
}

/** Colour swatch plus a free-text field — a CSS name or var(--accent) is valid too. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-1">
            <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ef4444'}
                onChange={(e) => onChange(e.target.value)}
                className="w-7 h-7 rounded shrink-0 cursor-pointer"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                title="Farbe wählen"
            />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="—"
                className={`${inputCls} font-mono min-w-0`}
                style={inputStyle}
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Zurücksetzen"
                >
                    <X size={11} />
                </button>
            )}
        </div>
    );
}

function Toggle({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
                <span className="text-[11px]" style={labelStyle}>
                    {label}
                </span>
                {hint && (
                    <span className="text-[10px] opacity-60" style={labelStyle}>
                        {hint}
                    </span>
                )}
            </div>
            <button
                onClick={() => onChange(!value)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: value ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

interface Props {
    draft: MessageDraft;
    onChange: (draft: MessageDraft) => void;
    /** Extra buttons under the JSON preview (e.g. "Test senden"). */
    actions?: React.ReactNode;
}

export function MessageBuilder({ draft, onChange, actions }: Props) {
    const layouts = useDashboardStore((s) => s.layouts);
    const views = usePopupConfigStore((s) => s.views);
    const [copied, setCopied] = useState(false);

    const set = (patch: Partial<MessageDraft>) => onChange({ ...draft, ...patch });
    const json = useMemo(() => JSON.stringify(draftToPayload(draft), null, 2), [draft]);
    const appearanceHint =
        MESSAGE_APPEARANCES.find((a) => a.value === draft.appearance)?.hint ?? 'Wie die Farbe auf der Karte sitzt';

    const tabsOfLayout = useMemo(() => {
        const layout = layouts.find((l) => (l.slug ?? l.id) === draft.targetLayout);
        return (layout?.sections ?? []).flatMap((sec) => sec.tabs.map((tab) => ({ tab, sectionName: sec.name })));
    }, [layouts, draft.targetLayout]);

    const copy = () => {
        void navigator.clipboard?.writeText(json).then(
            () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            },
            () => setCopied(false),
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* ── Form ── */}
            <div className="flex flex-col gap-3">
                <Field label="Schweregrad">
                    <div className="flex gap-1 flex-wrap">
                        {MESSAGE_SEVERITIES.map((s) => {
                            const on = draft.severity === s.value;
                            return (
                                <button
                                    key={s.value}
                                    onClick={() => set({ severity: s.value })}
                                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                    style={{
                                        background: on ? s.color : 'var(--app-bg)',
                                        color: on ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${on ? s.color : 'var(--app-border)'}`,
                                    }}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>
                </Field>

                <Field label="Titel" hint="HTML erlaubt, z. B. <b>fett</b>.">
                    <input
                        value={draft.title}
                        onChange={(e) => set({ title: e.target.value })}
                        placeholder="Waschmaschine"
                        className={inputCls}
                        style={inputStyle}
                    />
                </Field>

                <Field
                    label="Text"
                    hint="HTML erlaubt (Tabelle, Liste, Fettung) — Skripte werden entfernt. [[dp.id]] wird live durch den Wert ersetzt."
                >
                    <textarea
                        value={draft.text}
                        onChange={(e) => set({ text: e.target.value })}
                        rows={3}
                        placeholder="Programm fertig"
                        className={inputCls}
                        style={inputStyle}
                    />
                    <button
                        onClick={() => set({ text: TABLE_SNIPPET })}
                        className="mt-1 text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title="Ersetzt den Text durch ein Tabellen-Gerüst"
                    >
                        Tabelle einfügen
                    </button>
                </Field>

                <details>
                    <summary className="text-[11px] cursor-pointer select-none" style={labelStyle}>
                        Anderer Inhalt statt Text (Bild, Popup-View)
                    </summary>
                    <div className="flex flex-col gap-3 pt-2">
                        <Field label="Bild-URL" hint="Adapter-Dateien über /webfs/… einbinden.">
                            <input
                                value={draft.image}
                                onChange={(e) => set({ image: e.target.value })}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </Field>
                        <Field
                            label="Popup-View als Inhalt"
                            hint="Rendert eine fertige View mit Widgets — ersetzt Text/HTML/Bild."
                        >
                            <select
                                value={draft.view}
                                onChange={(e) => set({ view: e.target.value })}
                                className={inputCls}
                                style={inputStyle}
                            >
                                <option value="">— keine —</option>
                                {views.map((v) => (
                                    <option key={v.id} value={v.name}>
                                        {v.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {draft.view && (
                            <Field label="Datenpunkt für {{dp}} in der View">
                                <DpField value={draft.dp} onChange={(v) => set({ dp: v })} />
                            </Field>
                        )}
                        <Field label="Icon" hint="Lucide- oder Iconify-ID, z. B. mdi:washing-machine.">
                            <input
                                value={draft.icon}
                                onChange={(e) => set({ icon: e.target.value })}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </Field>
                    </div>
                </details>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Position" hint="Leer = Standard aus den Vorgaben.">
                        <select
                            value={draft.position}
                            onChange={(e) => set({ position: e.target.value as MessageDraft['position'] })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">Standard</option>
                            {MESSAGE_POSITIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Anzeigedauer (Sek.)" hint="Leer = Vorgabe, 0 = bleibt offen.">
                        <input
                            type="number"
                            min={0}
                            value={draft.durationSec}
                            onChange={(e) => set({ durationSec: e.target.value })}
                            placeholder="Vorgabe"
                            className={`${inputCls} font-mono`}
                            style={inputStyle}
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Darstellung" hint={appearanceHint}>
                        <select
                            value={draft.appearance}
                            onChange={(e) => set({ appearance: e.target.value as MessageDraft['appearance'] })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">Standard</option>
                            {MESSAGE_APPEARANCES.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Textausrichtung">
                        <select
                            value={draft.align}
                            onChange={(e) => set({ align: e.target.value as MessageDraft['align'] })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">Standard</option>
                            {MESSAGE_ALIGNS.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Zeitpunkt" hint="Wann die Meldung gesendet wurde, klein unter dem Text.">
                        <select
                            value={draft.showTime ?? ''}
                            onChange={(e) => set({ showTime: e.target.value as MessageDraft['showTime'] })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">Standard</option>
                            <option value="off">Nicht anzeigen</option>
                            {MESSAGE_TIME_FORMATS.map((f) => (
                                <option key={f.value} value={f.value}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <Field label="Farbe" hint="leer = Schweregrad">
                        <ColorField value={draft.color} onChange={(v) => set({ color: v })} />
                    </Field>
                    <Field label="Hintergrund" hint="leer = Darstellung">
                        <ColorField value={draft.background} onChange={(v) => set({ background: v })} />
                    </Field>
                    <Field label="Textfarbe" hint="leer = automatisch">
                        <ColorField value={draft.textColor} onChange={(v) => set({ textColor: v })} />
                    </Field>
                </div>

                <Toggle
                    label="Bestätigung erzwingen"
                    hint="Kein Auto-Schließen, kein Klick daneben — nur der Button."
                    value={draft.requireAck}
                    onChange={(v) => set({ requireAck: v })}
                />
                <Toggle
                    label="In den Verlauf aufnehmen"
                    hint="Aus: nur anzeigen, nicht archivieren."
                    value={draft.persist}
                    onChange={(v) => set({ persist: v })}
                />

                <details>
                    <summary className="text-[11px] cursor-pointer select-none" style={labelStyle}>
                        Größe, Priorität und Bestätigungs-Datenpunkt
                    </summary>
                    <div className="flex flex-col gap-3 pt-2">
                        <div className="grid grid-cols-3 gap-2">
                            <Field label="Breite (px)">
                                <input
                                    type="number"
                                    min={0}
                                    value={draft.width}
                                    onChange={(e) => set({ width: e.target.value })}
                                    className={`${inputCls} font-mono`}
                                    style={inputStyle}
                                />
                            </Field>
                            <Field label="Höhe (px)">
                                <input
                                    type="number"
                                    min={0}
                                    value={draft.height}
                                    onChange={(e) => set({ height: e.target.value })}
                                    className={`${inputCls} font-mono`}
                                    style={inputStyle}
                                />
                            </Field>
                            <Field label="Transparenz (%)">
                                <input
                                    type="number"
                                    min={0}
                                    max={95}
                                    value={draft.transparency}
                                    onChange={(e) => set({ transparency: e.target.value })}
                                    className={`${inputCls} font-mono`}
                                    style={inputStyle}
                                />
                            </Field>
                        </div>
                        <Field
                            label="Priorität (0–100)"
                            hint="Höher drängt sich an wartenden Meldungen derselben Position vorbei."
                        >
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={draft.priority}
                                onChange={(e) => set({ priority: e.target.value })}
                                className={`${inputCls} font-mono`}
                                style={{ ...inputStyle, maxWidth: 160 }}
                            />
                        </Field>
                        <Field
                            label="Wiederverwendbare ID"
                            hint="Gleiche ID ersetzt die vorherige Meldung, statt eine zweite zu stapeln."
                        >
                            <input
                                value={draft.id}
                                onChange={(e) => set({ id: e.target.value })}
                                placeholder="waschmaschine"
                                className={inputCls}
                                style={inputStyle}
                            />
                        </Field>
                        <Field label="Datenpunkt bei Bestätigung schreiben">
                            <DpField value={draft.ackDp} onChange={(v) => set({ ackDp: v })} />
                        </Field>
                        {draft.ackDp && (
                            <Field label="Wert bei Bestätigung" hint="Leer = true.">
                                <input
                                    value={draft.ackValue}
                                    onChange={(e) => set({ ackValue: e.target.value })}
                                    placeholder="true"
                                    className={inputCls}
                                    style={inputStyle}
                                />
                            </Field>
                        )}
                    </div>
                </details>

                <details>
                    <summary className="text-[11px] cursor-pointer select-none" style={labelStyle}>
                        Aktions-Buttons ({draft.actions.length})
                    </summary>
                    <div className="flex flex-col gap-3 pt-2">
                        {draft.actions.map((action, i) => (
                            <div
                                key={i}
                                className="rounded-lg p-2 flex flex-col gap-2"
                                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        value={action.label}
                                        onChange={(e) =>
                                            set({
                                                actions: draft.actions.map((a, j) =>
                                                    j === i ? { ...a, label: e.target.value } : a,
                                                ),
                                            })
                                        }
                                        placeholder="Beschriftung"
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                    <button
                                        onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Entfernen"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                                <DpField
                                    value={action.dp}
                                    onChange={(v) =>
                                        set({ actions: draft.actions.map((a, j) => (j === i ? { ...a, dp: v } : a)) })
                                    }
                                />
                                <div className="flex items-center gap-2">
                                    <input
                                        value={action.value}
                                        onChange={(e) =>
                                            set({
                                                actions: draft.actions.map((a, j) =>
                                                    j === i ? { ...a, value: e.target.value } : a,
                                                ),
                                            })
                                        }
                                        placeholder="Wert (true)"
                                        className={inputCls}
                                        style={inputStyle}
                                    />
                                    <label className="flex items-center gap-1 text-[11px] shrink-0" style={labelStyle}>
                                        <input
                                            type="checkbox"
                                            checked={action.close}
                                            onChange={(e) =>
                                                set({
                                                    actions: draft.actions.map((a, j) =>
                                                        j === i ? { ...a, close: e.target.checked } : a,
                                                    ),
                                                })
                                            }
                                        />
                                        schließt
                                    </label>
                                </div>
                            </div>
                        ))}
                        {draft.actions.length < 6 && (
                            <button
                                onClick={() =>
                                    set({ actions: [...draft.actions, { label: '', dp: '', value: '', close: true }] })
                                }
                                className="self-start flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <Plus size={12} /> Button
                            </button>
                        )}
                    </div>
                </details>

                <details>
                    <summary className="text-[11px] cursor-pointer select-none" style={labelStyle}>
                        Nur an bestimmte Empfänger
                    </summary>
                    <div className="flex flex-col gap-3 pt-2">
                        <Field label="Client-IDs" hint="Komma-getrennt. Leer = alle Geräte.">
                            <input
                                value={draft.targetClients}
                                onChange={(e) => set({ targetClients: e.target.value })}
                                className={`${inputCls} font-mono`}
                                style={inputStyle}
                            />
                        </Field>
                        <Field label="Layout">
                            <select
                                value={draft.targetLayout}
                                onChange={(e) => set({ targetLayout: e.target.value, targetTab: '' })}
                                className={inputCls}
                                style={inputStyle}
                            >
                                <option value="">Alle Layouts</option>
                                {layouts.map((l) => (
                                    <option key={l.id} value={l.slug ?? l.id}>
                                        {l.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {draft.targetLayout && (
                            <Field label="Tab">
                                <select
                                    value={draft.targetTab}
                                    onChange={(e) => set({ targetTab: e.target.value })}
                                    className={inputCls}
                                    style={inputStyle}
                                >
                                    <option value="">Alle Tabs</option>
                                    {tabsOfLayout.map(({ tab, sectionName }) => (
                                        <option key={tab.id} value={tab.slug ?? tab.id}>
                                            {sectionName} › {tab.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>
                </details>
            </div>

            {/* ── Live JSON ── */}
            <div className="flex flex-col gap-2 lg:sticky lg:top-4">
                <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={labelStyle}>
                        JSON für <code>messages.send</code>
                    </span>
                    <button
                        onClick={copy}
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <Copy size={11} /> {copied ? 'Kopiert' : 'Kopieren'}
                    </button>
                </div>
                <pre
                    className="text-[11px] font-mono rounded-lg p-3 overflow-auto whitespace-pre"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                        maxHeight: 420,
                    }}
                >
                    {json}
                </pre>
                {actions}
            </div>
        </div>
    );
}
