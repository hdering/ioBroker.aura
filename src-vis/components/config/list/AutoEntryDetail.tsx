import type { WidgetConfig } from '../../../types';
import type { AutoListEntry } from '../../widgets/AutoListWidget';
import { ColorField, DetailSection } from './listFieldUi';
import { ValueTransformButton } from '../ValueTransformButton';
import { EntryControlsConfig, entryDisplayTypeLabel } from '../EntryControlsConfig';
import { usesOnOffLabels } from '../../widgets/entryControls';
import { RowClickEntryField } from '../RowClickSection';
import { SubDpFields } from './SubDpFields';
import { lookupDatapointEntry } from '../../../hooks/useDatapointList';
import { useT } from '../../../i18n';
import type { EntrySubDp } from '../../widgets/EntrySubLine';

/**
 * Everything that configures ONE entry of the dynamic list - the block that used to
 * live inside the accordion row. Extracted so the datapoint dialog can show it as a
 * detail pane next to the entry list; the accordion chrome stays with the caller.
 *
 * Must stay a module-level component, see StaticEntryDetail for why.
 */
export function AutoEntryDetail({
    entry,
    listConfig,
    onUpdate,
}: {
    entry: AutoListEntry;
    /** The list widget itself - the per-row action editor needs it for its pickers. */
    listConfig: WidgetConfig;
    onUpdate: (patch: Partial<AutoListEntry>) => void;
}) {
    const t = useT();
    // AN/AUS colors only apply to an explicit switch entry; hide for Auto/slider/value/shutter/…
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
    // Second line: this entry's own datapoints replace the list-wide template, so the
    // section says which of the two is in effect here.
    const subDpCount = (entry.subDps ?? []).filter((s) => !!s?.id).length;
    const templateCount = ((listOpts.subDpTemplate as EntrySubDp[] | undefined) ?? []).filter((s) => !!s?.id).length;
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';

    return (
        <>
            <DetailSection title="Datenpunkt">
                {/* Same field as the value widget's datapoint row - read-only here, the
                    id comes from the discovery. Wraps instead of truncating: the pane is
                    wide enough for the whole path, and a cut-off id is unusable. */}
                <div className="flex items-start gap-1">
                    <div
                        className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono break-all select-text"
                        style={iSty}
                        title={entry.id}
                    >
                        {entry.id}
                    </div>
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
                        // The path field grows with the id, so stretching the button
                        // with it would blow it up. Pin it to one field line instead:
                        // py-2 + text-xs line-height + border.
                        className="h-[34px]"
                    />
                </div>
            </DetailSection>

            <DetailSection title="Beschriftung">
                {/* Bezeichnung breit + Einheit schmal nebeneinander */}
                <div className="flex items-end gap-1.5">
                    <div className="flex-1 min-w-0">
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('endpoints.dp.label')}
                        </label>
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder={t('autolist.auto')}
                            value={entry.label ?? ''}
                            onChange={(e) => onUpdate({ label: e.target.value || undefined })}
                        />
                    </div>
                    <div className="w-16 shrink-0">
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('endpoints.dp.unit')}
                        </label>
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder={t('endpoints.dp.unitPh')}
                            value={entry.unit ?? ''}
                            onChange={(e) => onUpdate({ unit: e.target.value || undefined })}
                        />
                    </div>
                </div>
            </DetailSection>

            <DetailSection
                title="Zweite Zeile"
                badge={subDpCount > 0 ? `${subDpCount} DP` : templateCount > 0 ? 'Vorlage' : undefined}
            >
                <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    {templateCount > 0 && subDpCount === 0
                        ? `Die Liste hat eine Vorlage mit ${templateCount} Datenpunkt${templateCount === 1 ? '' : 'en'} — sie gilt hier. Eigene Datenpunkte ersetzen sie für diese Zeile.`
                        : 'Weitere Datenpunkte unter dem Haupt-Datenpunkt — nur Anzeige, Position frei wählbar. Nicht im Badges-Layout. Gesetzte Datenpunkte ersetzen die Vorlage der Liste.'}
                </p>
                <SubDpFields
                    subDps={entry.subDps ?? []}
                    mainDpId={entry.id}
                    listHasTransform={listHasTransform}
                    onChange={(next) => onUpdate({ subDps: next })}
                />
            </DetailSection>

            <DetailSection title="Darstellung" badge={entryDisplayTypeLabel(entry.displayType)}>
                <EntryControlsConfig entry={entry} onUpdate={onUpdate} hideLabel />
                {showOnOffLabels && (
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('autolist.trueText')}
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
                                {t('autolist.falseText')}
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

            <DetailSection title="Verhalten">
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
        </>
    );
}
