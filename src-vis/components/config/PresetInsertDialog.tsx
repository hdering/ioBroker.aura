import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Database, Shapes, Check } from 'lucide-react';
import { useT } from '../../i18n';
import type { WidgetConfig, WidgetPreset } from '../../types';
import { instantiatePreset, commitPresetGroupDefs } from '../../utils/widgetExportImport';
import { collectDpSlots, type DpSlot } from '../../utils/widgetPresetDps';
import { autoDetectStatusDps } from '../../utils/dpTemplates';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { DatapointPicker } from './DatapointPicker';

/**
 * Shown when a Widget-Designer preset is inserted. Materialises the preset into a
 * fresh widget graph, then asks the user to map each datapoint slot to a concrete
 * DP (pre-filled with the preset's originals). Battery/status DPs are auto-detected
 * from the chosen primary DP's siblings and never shown. On confirm the group defs
 * are committed and the finished widget is handed back via onInsert.
 */
export function PresetInsertDialog({
    preset,
    onInsert,
    onCancel,
}: {
    preset: WidgetPreset;
    onInsert: (widget: WidgetConfig) => void;
    onCancel: () => void;
}) {
    const t = useT();
    const themeVars = usePortalThemeVars();

    // Materialise once (fresh ids) — never recompute on re-render.
    const { widget, groupDefs, slots } = useMemo(() => {
        const inst = instantiatePreset(preset);
        return { ...inst, slots: collectDpSlots(inst.widget, inst.groupDefs) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset.id]);

    const visibleSlots = slots.filter((s) => !s.isAuto);

    const [chosen, setChosen] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const s of slots) init[s.id] = s.originalDpId;
        return init;
    });
    const [activeSlot, setActiveSlot] = useState<DpSlot | null>(null);

    // When a primary DP changes, auto-detect battery/unreach siblings for the same owner.
    const applyAutoDetect = async (slot: DpSlot, newDp: string) => {
        if (!slot.isMain) return;
        const autoSlots = slots.filter((s) => s.ownerKey === slot.ownerKey && s.isAuto);
        if (autoSlots.length === 0) return;
        try {
            const entries = await ensureDatapointCache();
            const detected = autoDetectStatusDps(newDp, entries);
            setChosen((prev) => {
                const next = { ...prev };
                for (const a of autoSlots) {
                    if (a.optionKey === 'batteryDp' && detected.batteryDp) next[a.id] = detected.batteryDp;
                    if (a.optionKey === 'unreachDp' && detected.unreachDp) next[a.id] = detected.unreachDp;
                }
                return next;
            });
        } catch {
            /* ignore — auto-detect is best-effort */
        }
    };

    const pickDp = (slot: DpSlot, dp: string) => {
        setChosen((prev) => ({ ...prev, [slot.id]: dp }));
        void applyAutoDetect(slot, dp);
        setActiveSlot(null);
    };

    const handleInsert = () => {
        for (const s of slots) {
            const v = chosen[s.id];
            if (v && v.trim()) s.apply(v.trim());
        }
        widget.gridPos = { ...widget.gridPos, x: 0, y: 9999 };
        commitPresetGroupDefs(groupDefs);
        onInsert(widget);
    };

    // Group visible slots by their heading for a tidy layout.
    const grouped = useMemo(() => {
        const map = new Map<string, DpSlot[]>();
        for (const s of visibleSlots) {
            const arr = map.get(s.group) ?? [];
            arr.push(s);
            map.set(s.group, arr);
        }
        return [...map.entries()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset.id]);

    return createPortal(
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4"
            style={themeVars}
            onClick={onCancel}
        >
            <div
                className="rounded-xl w-full max-w-lg shadow-2xl flex flex-col"
                style={{
                    maxHeight: '90vh',
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="flex items-center justify-between px-6 pt-5 pb-4"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                    <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Shapes size={18} style={{ color: 'var(--accent)' }} />
                        {preset.icon ? `${preset.icon} ` : ''}
                        {preset.name}
                    </h2>
                    <button onClick={onCancel} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-4 overflow-y-auto space-y-4">
                    {visibleSlots.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {t('preset.insert.noSlots')}
                        </p>
                    ) : (
                        <>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {t('preset.insert.subtitle')}
                            </p>
                            {grouped.map(([group, groupSlots]) => (
                                <div key={group} className="space-y-2">
                                    <p
                                        className="text-xs font-semibold flex items-center gap-1.5"
                                        style={{ color: 'var(--accent)' }}
                                    >
                                        <Shapes size={12} />
                                        {group}
                                    </p>
                                    {groupSlots.map((slot) => (
                                        <div key={slot.id} className="flex items-center gap-2">
                                            <span
                                                className="text-xs w-32 shrink-0 truncate"
                                                style={{ color: 'var(--text-primary)' }}
                                                title={slot.label}
                                            >
                                                {slot.label}
                                            </span>
                                            <span
                                                className="flex-1 min-w-0 font-mono text-xs px-2.5 py-2 rounded-lg truncate"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    color: chosen[slot.id]
                                                        ? 'var(--text-primary)'
                                                        : 'var(--text-secondary)',
                                                    border: '1px solid var(--app-border)',
                                                }}
                                                title={chosen[slot.id] || ''}
                                            >
                                                {chosen[slot.id] || '—'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveSlot(slot)}
                                                className="px-2.5 py-2 rounded-lg hover:opacity-80 shrink-0"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    color: 'var(--text-secondary)',
                                                    border: '1px solid var(--app-border)',
                                                }}
                                            >
                                                <Database size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            <p
                                className="text-[11px] flex items-center gap-1 pt-1"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Check size={11} style={{ color: 'var(--accent)' }} />
                                {t('preset.insert.autoNote')}
                            </p>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleInsert}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Shapes size={13} /> {t('preset.insert.submit')}
                    </button>
                </div>
            </div>

            {activeSlot && (
                <DatapointPicker
                    currentValue={chosen[activeSlot.id] || ''}
                    onSelect={(id) => pickDp(activeSlot, id)}
                    onClose={() => setActiveSlot(null)}
                />
            )}
        </div>,
        document.body,
    );
}
