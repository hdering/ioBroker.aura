import { useState, useEffect } from 'react';
import { Database, X, Plus } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetConfig } from '../../../types';
import type { StaticListEntry } from '../../widgets/ListWidget';
import { ColorField, DetailSection, pinSwitchIconSize } from './listFieldUi';
import { DatapointPicker } from '../DatapointPicker';
import { ValueFormatRow } from '../ValueFormatRow';
import { ValueTransformButton } from '../ValueTransformButton';
import { EntryControlsConfig, entryDisplayTypeLabel } from '../EntryControlsConfig';
import { usesOnOffLabels } from '../../widgets/entryControls';
import { IconPickerModal } from '../IconPickerModal';
import { RowClickEntryField } from '../RowClickSection';
import { ElementConditionEditor, ROW_TARGETS } from '../ElementConditionEditor';
import { SubDpFields } from './SubDpFields';
import { lookupDatapointEntry } from '../../../hooks/useDatapointList';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';
import { EntryThresholdsFields } from './EntryThresholdsFields';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

/**
 * Everything that configures ONE entry of the static list - the block that used to
 * live inside the accordion row. Extracted so the datapoint dialog can show it as a
 * detail pane next to the entry list, with the accordion chrome (padding, border,
 * background) staying with whoever renders it.
 *
 * Must stay a module-level component: the panel above re-renders on every keystroke,
 * and a locally defined one would be a new component type each time - remount, lost
 * focus, closed pickers.
 */
export function StaticEntryDetail({
    entry,
    listConfig,
    onUpdate,
    onChangeId,
}: {
    entry: StaticListEntry;
    /** The list widget itself - the per-row action editor needs it for its pickers. */
    listConfig: WidgetConfig;
    onUpdate: (patch: Partial<StaticListEntry>) => void;
    onChangeId: (newId: string, unit?: string, role?: string, writable?: boolean) => void;
}) {
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [dpPickerOpen, setDpPickerOpen] = useState(false);
    // The datapoint id doubles as the entry's React key, so writing it on every
    // keystroke remounted the row and stole the focus after a single character.
    // Buffer locally, commit on blur/Enter through onChangeId (which owns the
    // duplicate check), and resolve the new datapoint's metadata like the picker does.
    const [idDraft, setIdDraft] = useState(entry.id ?? '');
    useEffect(() => {
        setIdDraft(entry.id ?? '');
    }, [entry.id]);
    const commitId = () => {
        const next = idDraft.trim();
        if (!next || next === entry.id) {
            setIdDraft(entry.id ?? '');
            return;
        }
        const dp = lookupDatapointEntry(next);
        onChangeId(next, dp?.unit, dp?.role, dp?.write !== false ? undefined : false);
    };
    // AN/AUS styling (switch style, icon size, on/off colors) only applies when the
    // entry is explicitly rendered as a switch; all other types (incl. Auto) hide it.
    const dt = entry.displayType ?? 'auto';
    const isSwitch = dt === 'switch';
    // Time formatting is part of the value text — the other display types either
    // bring their own (Datum/Zeit) or render a control instead of a value.
    const allowTimeFormat = dt === 'auto' || dt === 'value';
    // The list can carry a conversion of its own; "Keine" must then mean "off here",
    // not "unset" (which would inherit it again).
    const listOpts = (listConfig.options ?? {}) as Record<string, unknown>;
    const listHasTransform =
        listOpts.valueTransform !== undefined ||
        listOpts.valueFactor !== undefined ||
        listOpts.valueTimeFormat !== undefined;
    // The on/off label pair is only ever read for boolean-ish entries.
    const showOnOffLabels = usesOnOffLabels(entry, lookupDatapointEntry(entry.id)?.type);
    const subDpCount = (entry.subDps ?? []).filter((s) => !!s?.id).length;
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';

    return (
        <>
            <DetailSection title="Datenpunkt">
                {/* Same field as the value widget's datapoint row: a long ID needs the
                    room to be read, so this one block breaks out of the compact 10px
                    grid the rest of the detail pane uses. */}
                <div className="flex gap-1 mb-1">
                    <input
                        type="text"
                        value={idDraft}
                        onChange={(e) => setIdDraft(e.target.value)}
                        onBlur={commitId}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            else if (e.key === 'Escape') setIdDraft(entry.id ?? '');
                        }}
                        title={idDraft}
                        placeholder="Datenpunkt-ID"
                        className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                        style={iSty}
                    />
                    <button
                        onClick={() => setDpPickerOpen(true)}
                        title="Aus ioBroker wählen"
                        className="px-2 rounded-lg hover:opacity-80 shrink-0 flex items-center justify-center"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <Database size={13} />
                    </button>
                    <ValueTransformButton
                        factor={entry.valueFactor}
                        offset={entry.valueOffset}
                        presetId={entry.valueTransform}
                        timeFormat={entry.valueTimeFormat}
                        timePattern={entry.valueTimePattern}
                        allowTimeFormat={allowTimeFormat}
                        explicitNone={listHasTransform}
                        dpId={entry.id}
                        onPatch={onUpdate}
                    />
                </div>
            </DetailSection>

            <DetailSection title="Beschriftung">
                {/* Icon (kompakt) + Bezeichnung + Einheit in einer Zeile */}
                <div className="flex items-end gap-1.5">
                    <div className="shrink-0">
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Icon
                        </label>
                        <div className="relative" style={{ width: 40 }}>
                            <button
                                onClick={() => setIconPickerOpen(true)}
                                title={entry.icon || 'Icon wählen'}
                                className="w-full flex items-center justify-center rounded hover:opacity-80"
                                style={{ ...iSty, height: 23 }}
                            >
                                {entry.icon ? (
                                    <Icon icon={toIconifyId(entry.icon)} width={15} height={15} />
                                ) : (
                                    <Plus size={13} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                )}
                            </button>
                            {entry.icon && (
                                <button
                                    onClick={() => onUpdate({ icon: undefined })}
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
                    {/* Größe des Zeilen-Icons, wie in der dynamischen Liste — für jede
                        Darstellung, auch für den Schalter (Issue #616). Das Feld unter
                        "Darstellung" gehört dem Schalter-Icon, nicht diesem hier. */}
                    {entry.icon && (
                        <div className="w-11 shrink-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                px
                            </label>
                            <input
                                type="number"
                                min={8}
                                max={64}
                                className={iCls}
                                style={iSty}
                                placeholder="11"
                                title="Icon-Größe in px"
                                value={entry.iconSize ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({
                                        iconSize: isFinite(n) && n > 0 ? n : undefined,
                                        ...pinSwitchIconSize(entry, isSwitch),
                                    });
                                }}
                            />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Bezeichnung
                        </label>
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="Auto"
                            value={entry.label ?? ''}
                            onChange={(e) => onUpdate({ label: e.target.value || undefined })}
                        />
                    </div>
                </div>
                <div className="flex items-end gap-1.5">
                    <div className="flex-1 min-w-0">
                        <ValueFormatRow
                            unit={entry.unit}
                            unitPlaceholder="°C"
                            onUnitChange={(v) => onUpdate({ unit: v })}
                            decimals={entry.decimals}
                            numberFormat={entry.numberFormat}
                            onChange={onUpdate}
                            inputClassName={iCls}
                            inputStyle={iSty}
                            compact
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Schriftgröße (px)
                        </label>
                        <input
                            type="number"
                            min={8}
                            max={96}
                            className={iCls}
                            style={iSty}
                            placeholder="Auto"
                            value={entry.fontSize ?? ''}
                            onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                onUpdate({ fontSize: isFinite(n) && n > 0 ? n : undefined });
                            }}
                        />
                    </div>
                </div>
            </DetailSection>

            <DetailSection title="Darstellung" badge={entryDisplayTypeLabel(entry.displayType)}>
                <EntryControlsConfig entry={entry} onUpdate={onUpdate} hideLabel />
                {showOnOffLabels && (
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Text aktiv
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AN"
                                value={entry.trueLabel ?? ''}
                                onChange={(e) => onUpdate({ trueLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Text inaktiv
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AUS"
                                value={entry.falseLabel ?? ''}
                                onChange={(e) => onUpdate({ falseLabel: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                )}

                {isSwitch && (
                    <div className="grid grid-cols-2 gap-1.5">
                        <ColorField
                            label="Textfarbe AN"
                            value={entry.activeColor}
                            fallback="#22c55e"
                            onChange={(v) => onUpdate({ activeColor: v })}
                        />
                        <ColorField
                            label="Textfarbe AUS"
                            value={entry.inactiveColor}
                            fallback="#94a3b8"
                            onChange={(v) => onUpdate({ inactiveColor: v })}
                        />
                        <ColorField
                            label="Hintergrund AN"
                            value={entry.activeBg}
                            fallback="#22c55e"
                            onChange={(v) => onUpdate({ activeBg: v })}
                        />
                        <ColorField
                            label="Hintergrund AUS"
                            value={entry.inactiveBg}
                            fallback="#1f2937"
                            onChange={(v) => onUpdate({ inactiveBg: v })}
                        />
                    </div>
                )}
            </DetailSection>

            <DetailSection title="Zweite Zeile" badge={subDpCount > 0 ? `${subDpCount} DP` : undefined}>
                <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Weitere Datenpunkte unter dem Wert dieser Zeile — beliebige Datenpunkte, nicht nur die des Geräts.
                    Nur Anzeige, Position frei wählbar. Nicht im Badges-Layout.
                </p>
                <SubDpFields
                    subDps={entry.subDps ?? []}
                    mainDpId={entry.id}
                    listHasTransform={listHasTransform}
                    onChange={(next) => onUpdate({ subDps: next })}
                />
            </DetailSection>

            <DetailSection
                title="Bedingungen"
                badge={entry.conditions?.length ? String(entry.conditions.length) : undefined}
            >
                <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Nur für diese Zeile. Listenweite Regeln (Dialog → Tab {'„Bedingungen“'}) laufen davor, diese hier
                    gewinnen je Eigenschaft.
                </p>
                <ElementConditionEditor
                    rules={entry.conditions ?? []}
                    onChange={(next) => onUpdate({ conditions: next.length ? next : undefined })}
                    targets={ROW_TARGETS}
                    allowIconSize
                    allowNotify
                    sampleDp={entry.id}
                    ownHint="{dp} = Wert dieser Zeile; Pille umschalten für einen anderen Datenpunkt."
                    intro="Noch keine Regel. Regeln reagieren auf den Zeilenwert (oder einen fremden Datenpunkt) und ändern Farbe, Icon, Text oder blenden die Zeile aus."
                />
            </DetailSection>

            <DetailSection title="Farbschwellen">
                <EntryThresholdsFields
                    thresholds={entry.colorThresholds}
                    onChange={(next) => onUpdate({ colorThresholds: next })}
                />
            </DetailSection>

            <DetailSection title="Verhalten">
                {/* Letzte Änderung anzeigen */}
                <div className="flex items-center justify-between">
                    <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        Letzte Änderung anzeigen
                    </label>
                    <button
                        onClick={() => onUpdate({ showLastChange: !entry.showLastChange })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: entry.showLastChange ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: entry.showLastChange ? '18px' : '2px' }}
                        />
                    </button>
                </div>

                {/* Klick auf Zeile (Override) */}
                <RowClickEntryField
                    config={listConfig}
                    value={entry.clickAction}
                    onChange={(next) => onUpdate({ clickAction: next })}
                    popupTitle={entry.popupTitle}
                    onPopupTitleChange={(next) => onUpdate({ popupTitle: next })}
                    titlePlaceholder={
                        (listConfig.options?.rowPopupTitle as string) || entry.label || 'Name des Datenpunkts'
                    }
                    popupHideTitle={entry.popupHideTitle}
                    onPopupHideTitleChange={(next) => onUpdate({ popupHideTitle: next })}
                    listHidesTitle={!!listConfig.options?.rowPopupHideTitle}
                />
            </DetailSection>

            {iconPickerOpen && (
                <IconPickerModal
                    current={entry.icon ?? ''}
                    onSelect={(name) => {
                        onUpdate({ icon: name || undefined });
                        setIconPickerOpen(false);
                    }}
                    onClose={() => setIconPickerOpen(false)}
                />
            )}
            {dpPickerOpen && (
                <DatapointPicker
                    currentValue={entry.id}
                    onSelect={(id, unit, _name, role) => {
                        if (id && id !== entry.id) {
                            const dp = lookupDatapointEntry(id);
                            const writable = dp?.write !== false ? undefined : false;
                            onChangeId(id, unit, role ?? dp?.role, writable);
                        }
                        setDpPickerOpen(false);
                    }}
                    onClose={() => setDpPickerOpen(false)}
                />
            )}
        </>
    );
}
