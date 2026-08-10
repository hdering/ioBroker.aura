import type { WidgetConfig } from '../../../types';
import type { AutoListEntry } from '../../widgets/AutoListWidget';
import { ColorField } from './listFieldUi';
import { EntryControlsConfig } from '../EntryControlsConfig';
import { usesOnOffLabels } from '../../widgets/entryControls';
import { RowClickEntryField } from '../RowClickSection';
import { lookupDatapointEntry } from '../../../hooks/useDatapointList';
import { useT } from '../../../i18n';

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
    const isSwitch = (entry.displayType ?? 'auto') === 'switch';
    // The on/off label pair is only ever read for boolean-ish entries.
    const showOnOffLabels = usesOnOffLabels(entry, lookupDatapointEntry(entry.id)?.type);
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';

    return (
        <>
            <div className="text-[9px] font-mono truncate mb-1" style={{ color: 'var(--text-secondary)' }}>
                {entry.id}
            </div>
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
            <EntryControlsConfig entry={entry} onUpdate={onUpdate} />
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
            <RowClickEntryField
                config={listConfig}
                value={entry.clickAction}
                onChange={(next) => onUpdate({ clickAction: next })}
            />
        </>
    );
}
