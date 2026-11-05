/**
 * Configuration panel of the Ansagen widget (#918): which rules it lists and the
 * named triggers a household picks from instead of a datapoint id. The switches
 * (create / edit / delete / other devices) are visible fields in WidgetFrame.
 */
import { useState } from 'react';
import { Database, Plus, X } from 'lucide-react';
import type { AnnouncementTriggerDef, WidgetConfig } from '../../types';
import { useT } from '../../i18n';
import { DatapointPicker } from './DatapointPicker';
import { ConfigSection, SubGroup } from './ConfigSection';
import { cleanAnnouncementTriggers } from '../widgets/AnnouncementsWidget';

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintCls = 'text-[10px] mt-0.5';
const hintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };
const iconBtnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

export function AnnouncementsConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const scope = o.scope === 'device' ? 'device' : 'own';
    // Rows being typed may still lack a datapoint, so the raw list is edited, the clean one is read.
    const rows: AnnouncementTriggerDef[] = Array.isArray(o.triggers) ? (o.triggers as AnnouncementTriggerDef[]) : [];
    const [picking, setPicking] = useState<number | null>(null);

    const setOpts = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const setRows = (next: AnnouncementTriggerDef[]) => setOpts({ triggers: next.length ? next : undefined });
    const setRow = (i: number, p: Partial<AnnouncementTriggerDef>) =>
        setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

    return (
        <>
            {picking !== null && (
                <DatapointPicker
                    currentValue={rows[picking]?.dp ?? ''}
                    onSelect={(id) => {
                        setRow(picking, { dp: id });
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            )}
            <div className="space-y-2.5">
                <ConfigSection title={t('cfg.section.settings')} sectionKey="settings">
                    <SubGroup title={t('announce.cfg.scope')}>
                        <select
                            value={scope}
                            onChange={(e) => setOpts({ scope: e.target.value === 'device' ? 'device' : undefined })}
                            className={inputCls}
                            style={inputStyle}
                            data-field="scope"
                        >
                            <option value="own">{t('announce.cfg.scope.own')}</option>
                            <option value="device">{t('announce.cfg.scope.device')}</option>
                        </select>
                        <p className={hintCls} style={hintStyle}>
                            {t('announce.cfg.scopeHint')}
                        </p>
                    </SubGroup>
                    <SubGroup title={t('announce.cfg.triggers')}>
                        <p className={hintCls} style={hintStyle}>
                            {t('announce.cfg.triggersHint')}
                        </p>
                        {rows.map((r, i) => (
                            <div key={i} className="space-y-1" data-testid="announcement-trigger-row">
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        value={r.name ?? ''}
                                        onChange={(e) => setRow(i, { name: e.target.value })}
                                        placeholder={t('announce.cfg.triggerName')}
                                        className={`${inputCls} flex-1 min-w-0`}
                                        style={inputStyle}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                                        className="px-2 rounded-lg shrink-0"
                                        style={iconBtnStyle}
                                        title={t('common.delete')}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        value={r.dp ?? ''}
                                        onChange={(e) => setRow(i, { dp: e.target.value })}
                                        placeholder="hm-rpc.0.…"
                                        className={`${inputCls} font-mono flex-1 min-w-0`}
                                        style={inputStyle}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setPicking(i)}
                                        className="px-2 rounded-lg shrink-0"
                                        style={iconBtnStyle}
                                    >
                                        <Database size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => setRows([...rows, { dp: '', name: '' }])}
                            className="flex items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5"
                            style={iconBtnStyle}
                            data-action="add-trigger"
                        >
                            <Plus size={12} /> {t('announce.cfg.addTrigger')}
                        </button>
                        {rows.length > 0 && cleanAnnouncementTriggers(rows).length === 0 && (
                            <p className={hintCls} style={{ color: 'var(--accent-red)' }}>
                                {t('announce.cfg.triggersEmpty')}
                            </p>
                        )}
                    </SubGroup>
                    <p className={labelCls} style={labelStyle}>
                        {t('announce.cfg.adminHint')}
                    </p>
                </ConfigSection>
            </div>
        </>
    );
}
