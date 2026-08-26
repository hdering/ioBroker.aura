/**
 * Editor for the extra datapoints shown in a list entry's second line.
 *
 * Lives inline in the entry detail pane, not behind another dialog: the pane is
 * already inside the datapoint dialog, and one more popup would mean four stacked
 * layers before the object browser even opens. Each extra datapoint is one
 * collapsible card so the pane stays scannable.
 *
 * Datapoints from the same device are offered as a dropdown (battery, RSSI, setpoint
 * are almost always siblings of the main one), the object browser next to it reaches
 * every other datapoint. Both are labelled buttons: with the object browser reduced to
 * a bare icon, the section read as "this device's datapoints only".
 *
 * `templateMode` reuses the very same editor for the dynamic list's list-wide
 * template: picked siblings are stored as `{{parent}}.BATTERY` so one configuration
 * applies to every discovered row (see utils/subDpTemplate).
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Database, Plus, Trash2, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { EntrySubDp } from '../../widgets/EntrySubLine';
import { DatapointPicker } from '../DatapointPicker';
import { IconPickerModal } from '../IconPickerModal';
import { ValueFormatRow } from '../ValueFormatRow';
import { ValueTransformButton } from '../ValueTransformButton';
import { ColorField } from './listFieldUi';
import { ElementConditionEditor } from '../ElementConditionEditor';
import { StateMapFields } from './StateMapFields';
import { ensureDatapointCache, lookupDatapointEntry, type DatapointEntry } from '../../../hooks/useDatapointList';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';
import { subAll } from '../../../utils/popupPlaceholders';
import { subDpTokenMap, toSubDpTemplateId } from '../../../utils/subDpTemplate';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

const ALIGNS = [
    ['left', 'Links'],
    ['center', 'Mitte'],
    ['right', 'Rechts'],
] as const;

const ALIGN_LABEL: Record<string, string> = { left: 'Links', center: 'Mitte', right: 'Rechts' };

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';

export function SubDpFields({
    subDps,
    mainDpId,
    listHasTransform,
    templateMode,
    onChange,
}: {
    subDps: EntrySubDp[];
    /** The entry's own datapoint — its siblings are offered as quick picks. In
     *  `templateMode` any entry of the list serves as that sample. */
    mainDpId: string;
    /** The list carries a conversion of its own, so "Keine" must mean "off here". */
    listHasTransform: boolean;
    /** Store picked siblings as `{{parent}}.<segment>` and preview what they resolve
     *  to for `mainDpId`. Used by the dynamic list's list-wide template. */
    templateMode?: boolean;
    onChange: (next: EntrySubDp[] | undefined) => void;
}) {
    // Index-keyed, not id-keyed: a row may briefly hold an empty or duplicate id while
    // it is being typed, and it must not remount underneath the caret.
    const [openIdx, setOpenIdx] = useState<number | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [iconPickerFor, setIconPickerFor] = useState<number | null>(null);
    const [cache, setCache] = useState<DatapointEntry[] | null>(null);

    useEffect(() => {
        ensureDatapointCache()
            .then(setCache)
            .catch(() => {
                /* offline / no connection — the object browser button still works */
            });
    }, []);

    // In template mode the stored ids carry tokens, so both the duplicate check and
    // the sibling list have to compare against what they resolve to for the sample.
    const resolveId = (id: string) => (templateMode && mainDpId ? subAll(id, subDpTokenMap(mainDpId)) : id);
    const usedIds = subDps.map((s) => resolveId(s.id));
    const siblings = useMemo(() => {
        if (!cache || !mainDpId) return [];
        const parent = mainDpId.split('.').slice(0, -1).join('.');
        if (!parent) return [];
        return cache
            .filter(
                (e) =>
                    e.id !== mainDpId &&
                    e.id.startsWith(`${parent}.`) &&
                    !e.id.slice(parent.length + 1).includes('.') &&
                    !usedIds.includes(e.id),
            )
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cache, mainDpId, usedIds.join(',')]);

    const commit = (next: EntrySubDp[]) => onChange(next.length ? next : undefined);
    const patch = (i: number, p: Partial<EntrySubDp>) => commit(subDps.map((s, j) => (j === i ? { ...s, ...p } : s)));
    const remove = (i: number) => {
        commit(subDps.filter((_, j) => j !== i));
        setOpenIdx(null);
    };
    const move = (i: number, dir: -1 | 1) => {
        const to = i + dir;
        if (to < 0 || to >= subDps.length) return;
        const next = [...subDps];
        [next[i], next[to]] = [next[to], next[i]];
        commit(next);
        setOpenIdx(to);
    };
    // Pre-fill the unit from the object's common.unit like the entry picker does —
    // a bare "87" with no % is the first thing users would fix by hand otherwise.
    // In template mode the unit comes from the sample device and stands in for the
    // others; the widget fills it in per row where it is still empty.
    const add = (picks: { id: string; unit?: string }[]) => {
        const fresh = picks
            .filter((p) => !!p.id && !usedIds.includes(p.id))
            .map<EntrySubDp>((p) => ({
                id: templateMode ? toSubDpTemplateId(p.id, mainDpId) : p.id,
                unit: p.unit || lookupDatapointEntry(p.id)?.unit || undefined,
            }));
        if (!fresh.length) return;
        commit([...subDps, ...fresh]);
        // Open the new one right away: position and unit are what users set next.
        setOpenIdx(subDps.length);
    };

    return (
        <>
            {subDps.map((sub, i) => {
                const open = openIdx === i;
                const name = sub.label || sub.id.split('.').pop() || `Datenpunkt ${i + 1}`;
                return (
                    <div
                        key={i}
                        className="rounded overflow-hidden"
                        style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
                    >
                        <div className="flex items-center gap-1 px-1.5 py-1">
                            <button
                                onClick={() => setOpenIdx(open ? null : i)}
                                className="flex items-center gap-1 min-w-0 flex-1 text-left hover:opacity-80"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                <ChevronRight
                                    size={11}
                                    className="shrink-0 transition-transform"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        transform: open ? 'rotate(90deg)' : undefined,
                                    }}
                                />
                                <span className="text-[10px] truncate" title={sub.id}>
                                    {name}
                                </span>
                                <span
                                    className="text-[9px] shrink-0 opacity-60"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {ALIGN_LABEL[sub.align ?? 'left']}
                                </span>
                            </button>
                            <button
                                onClick={() => move(i, -1)}
                                disabled={i === 0}
                                title="Nach oben"
                                className="w-4 h-4 flex items-center justify-center text-[10px] rounded disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => move(i, 1)}
                                disabled={i === subDps.length - 1}
                                title="Nach unten"
                                className="w-4 h-4 flex items-center justify-center text-[10px] rounded disabled:opacity-25"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => remove(i)}
                                title="Entfernen"
                                className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>

                        {open && (
                            <div
                                className="px-1.5 pb-1.5 space-y-1.5"
                                style={{ borderTop: '1px solid var(--app-border)' }}
                            >
                                {/* Datenpunkt + Umrechnung */}
                                <div className="pt-1.5">
                                    <div className="flex gap-1">
                                        <input
                                            type="text"
                                            value={sub.id}
                                            onChange={(e) => patch(i, { id: e.target.value })}
                                            title={sub.id}
                                            placeholder={templateMode ? '{{parent}}.BATTERY' : 'Datenpunkt-ID'}
                                            className="flex-1 min-w-0 text-[10px] rounded px-2 py-1 font-mono focus:outline-none"
                                            style={iSty}
                                        />
                                        <ValueTransformButton
                                            factor={sub.valueFactor}
                                            offset={sub.valueOffset}
                                            presetId={sub.valueTransform}
                                            timeFormat={sub.valueTimeFormat}
                                            timePattern={sub.valueTimePattern}
                                            allowTimeFormat
                                            explicitNone={listHasTransform}
                                            dpId={resolveId(sub.id)}
                                            size={12}
                                            onPatch={(p) => patch(i, p)}
                                        />
                                    </div>
                                    {/* What the tokens resolve to for the sample entry — a typo in the
                                        pattern is otherwise invisible until the list renders. */}
                                    {templateMode && !!mainDpId && (
                                        <p
                                            className="text-[9px] mt-0.5 font-mono truncate"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                            title={resolveId(sub.id)}
                                        >
                                            → {resolveId(sub.id) || '…'}
                                            {cache && sub.id && !cache.some((e) => e.id === resolveId(sub.id))
                                                ? ' (am Beispiel nicht vorhanden)'
                                                : ''}
                                        </p>
                                    )}
                                </div>

                                {/* Icon + Bezeichnung */}
                                <div className="flex items-end gap-1.5">
                                    <div className="shrink-0">
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Icon
                                        </label>
                                        <div className="relative" style={{ width: 40 }}>
                                            <button
                                                onClick={() => setIconPickerFor(i)}
                                                title={sub.icon || 'Icon wählen'}
                                                className="w-full flex items-center justify-center rounded hover:opacity-80"
                                                style={{ ...iSty, height: 23 }}
                                            >
                                                {sub.icon ? (
                                                    <Icon icon={toIconifyId(sub.icon)} width={14} height={14} />
                                                ) : (
                                                    <Plus
                                                        size={12}
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                    />
                                                )}
                                            </button>
                                            {sub.icon && (
                                                <button
                                                    onClick={() => patch(i, { icon: undefined })}
                                                    title="Icon entfernen"
                                                    className="absolute -top-1 -right-1 flex items-center justify-center rounded-full hover:opacity-80"
                                                    style={{
                                                        width: 13,
                                                        height: 13,
                                                        background: 'var(--app-bg)',
                                                        border: '1px solid var(--app-border)',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    <X size={8} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Bezeichnung
                                        </label>
                                        <input
                                            className={iCls}
                                            style={iSty}
                                            placeholder="leer = nur Wert"
                                            value={sub.label ?? ''}
                                            onChange={(e) => patch(i, { label: e.target.value || undefined })}
                                        />
                                    </div>
                                </div>

                                {/* Einheit + Dezimalstellen + Zahlenformat */}
                                <ValueFormatRow
                                    unit={sub.unit}
                                    unitPlaceholder="°C"
                                    onUnitChange={(v) => patch(i, { unit: v })}
                                    decimals={sub.decimals}
                                    numberFormat={sub.numberFormat}
                                    onChange={(p) => patch(i, p)}
                                    inputClassName={iCls}
                                    inputStyle={iSty}
                                    compact
                                />

                                {/* Position */}
                                <div>
                                    <label
                                        className="text-[9px] block mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Position
                                    </label>
                                    <div
                                        className="flex rounded overflow-hidden"
                                        style={{ border: '1px solid var(--app-border)' }}
                                    >
                                        {ALIGNS.map(([v, lbl]) => {
                                            const active = (sub.align ?? 'left') === v;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => patch(i, { align: v === 'left' ? undefined : v })}
                                                    className="flex-1 text-[10px] py-1 transition-colors"
                                                    style={{
                                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                        color: active ? '#fff' : 'var(--text-secondary)',
                                                        borderRight:
                                                            v !== 'right' ? '1px solid var(--app-border)' : undefined,
                                                    }}
                                                >
                                                    {lbl}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Schriftgröße + Farbe */}
                                <div className="flex items-end gap-1.5">
                                    <div className="flex-1 min-w-0">
                                        <label
                                            className="text-[9px] block mb-0.5 truncate"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Schriftgröße (px)
                                        </label>
                                        <input
                                            type="number"
                                            min={6}
                                            max={96}
                                            className={iCls}
                                            style={iSty}
                                            placeholder="9"
                                            value={sub.fontSize ?? ''}
                                            onChange={(e) => {
                                                const n = parseInt(e.target.value, 10);
                                                patch(i, { fontSize: isFinite(n) && n > 0 ? n : undefined });
                                            }}
                                        />
                                    </div>
                                    <div className="shrink-0">
                                        <ColorField
                                            label="Textfarbe"
                                            value={sub.color}
                                            fallback="#94a3b8"
                                            onChange={(v) => patch(i, { color: v })}
                                        />
                                    </div>
                                </div>

                                {/* Value → text table and rules for this datapoint (issue #572).
                                    The table runs through the same display pipeline as the main
                                    value, so "true → ONLINE" is configured once and reads the same
                                    in both lines. */}
                                <StateMapFields states={sub.states} onChange={(next) => patch(i, { states: next })} />
                                <details className="mt-1.5">
                                    <summary
                                        className="text-[10px] cursor-pointer select-none"
                                        style={{ color: 'var(--accent)' }}
                                    >
                                        Bedingungen{sub.conditions?.length ? ` (${sub.conditions.length})` : ''}
                                    </summary>
                                    <ElementConditionEditor
                                        rules={sub.conditions ?? []}
                                        onChange={(next) => patch(i, { conditions: next.length ? next : undefined })}
                                        allowIconSize
                                        ownHint="{dp} = Wert dieses Datenpunkts; Pille umschalten für einen anderen."
                                        intro="Noch keine Regel. Regeln ändern Farbe, Icon oder Text dieses Werts."
                                    />
                                </details>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Hinzufügen: Geschwister-DP per Auswahl, alles andere über den Objektbaum.
                Beide Wege stehen als gleichwertige, beschriftete Schaltflächen nebeneinander —
                als reines Icon war der Objektbaum-Weg praktisch unsichtbar und der Eindruck
                entstand, die zweite Zeile könne nur Datenpunkte desselben Geräts zeigen. */}
            <div className="flex gap-1">
                <select
                    value=""
                    disabled={siblings.length === 0}
                    onChange={(e) => {
                        const dp = siblings.find((s) => s.id === e.target.value);
                        if (dp) add([{ id: dp.id, unit: dp.unit }]);
                    }}
                    className="flex-1 min-w-0 text-[10px] rounded px-2 py-1 focus:outline-none"
                    style={{ ...iSty, opacity: siblings.length === 0 ? 0.5 : 1 }}
                    title={
                        siblings.length === 0
                            ? 'Keine weiteren Datenpunkte am selben Gerät'
                            : templateMode
                              ? 'Datenpunkt des Beispiel-Geräts als Muster übernehmen'
                              : 'Datenpunkt des gleichen Geräts hinzufügen'
                    }
                >
                    <option value="">
                        {siblings.length === 0
                            ? 'Keine weiteren DPs am Gerät'
                            : `+ DP des Geräts (${siblings.length}) …`}
                    </option>
                    {siblings.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                            {s.unit ? ` (${s.unit})` : ''}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => setPickerOpen(true)}
                    title={
                        templateMode
                            ? 'Beliebigen Datenpunkt aus dem ioBroker-Objektbaum wählen (bleibt absolut und gilt für alle Zeilen)'
                            : 'Beliebigen Datenpunkt aus dem ioBroker-Objektbaum wählen — auch von einem anderen Gerät'
                    }
                    className="px-2 py-1 rounded hover:opacity-80 shrink-0 flex items-center justify-center gap-1 text-[10px] whitespace-nowrap"
                    style={{ ...iSty, color: 'var(--text-secondary)' }}
                >
                    <Database size={11} /> + Beliebiger DP …
                </button>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                {templateMode
                    ? 'Die zweite Zeile ist nicht auf das Gerät beschränkt: über „Beliebiger DP“ lässt sich jeder Datenpunkt wählen. Eine absolute ID zeigt in jeder Zeile denselben Wert, ein Muster mit {{parent}} den passenden DP je Zeile.'
                    : 'Die zweite Zeile ist nicht auf das Gerät beschränkt: über „Beliebiger DP“ lässt sich jeder Datenpunkt aus ioBroker wählen — auch von einem anderen Gerät oder Adapter. Die ID lässt sich außerdem direkt ins Feld tippen.'}
            </p>

            {pickerOpen && (
                <DatapointPicker
                    currentValue=""
                    onSelect={(id, unit) => {
                        add([{ id, unit }]);
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                    multiSelect
                    onMultiSelect={(picks) => {
                        add(picks);
                        setPickerOpen(false);
                    }}
                />
            )}
            {iconPickerFor !== null && (
                <IconPickerModal
                    current={subDps[iconPickerFor]?.icon ?? ''}
                    onSelect={(name) => {
                        patch(iconPickerFor, { icon: name || undefined });
                        setIconPickerFor(null);
                    }}
                    onClose={() => setIconPickerFor(null)}
                />
            )}
        </>
    );
}
