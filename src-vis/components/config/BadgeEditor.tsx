import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Database } from 'lucide-react';
import { Icon } from '@iconify/react';
import { DatapointPicker } from './DatapointPicker';
import { JsonPathButton } from './JsonPathButton';
import { IconPickerModal } from './IconPickerModal';
import { ClauseRow, ColorField, newClause } from './ConditionEditor';
import { Badge } from '../common/Badge';
import type { BadgeDef, BadgeStyle, BadgeCorner, BadgeSize, ConditionClause } from '../../types';
import { useT } from '../../i18n';

const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

const STYLES: { value: BadgeStyle; labelKey: string }[] = [
    { value: 'dot', labelKey: 'badge.styleDot' },
    { value: 'count', labelKey: 'badge.styleCount' },
    { value: 'label', labelKey: 'badge.styleLabel' },
];
const CORNERS: { value: BadgeCorner; labelKey: string }[] = [
    { value: 'top-left', labelKey: 'badge.cornerTL' },
    { value: 'top-right', labelKey: 'badge.cornerTR' },
    { value: 'bottom-left', labelKey: 'badge.cornerBL' },
    { value: 'bottom-right', labelKey: 'badge.cornerBR' },
];
const SIZES: { value: BadgeSize; labelKey: string }[] = [
    { value: 'sm', labelKey: 'badge.sizeSm' },
    { value: 'md', labelKey: 'badge.sizeMd' },
    { value: 'lg', labelKey: 'badge.sizeLg' },
];

export function newBadge(): BadgeDef {
    return { id: `badge-${Date.now()}`, style: 'dot', corner: 'top-right', visibility: 'always' };
}

// ── Single badge rule ─────────────────────────────────────────────────────────

function BadgeRule({
    badge,
    onChange,
    onDelete,
}: {
    badge: BadgeDef;
    onChange: (b: BadgeDef) => void;
    onDelete: () => void;
}) {
    const t = useT();
    const [open, setOpen] = useState(true);
    const [showPicker, setShowPicker] = useState(false);
    const [showIcon, setShowIcon] = useState(false);

    const update = (patch: Partial<BadgeDef>) => onChange({ ...badge, ...patch });

    const clauses = badge.clauses ?? [];
    const updateClause = (i: number, c: ConditionClause) =>
        update({ clauses: clauses.map((cl, j) => (j === i ? c : cl)) });
    const deleteClause = (i: number) => update({ clauses: clauses.filter((_, j) => j !== i) });
    const addClause = () => update({ clauses: [...clauses, newClause()] });
    const toggleLogic = () => update({ logic: (badge.logic ?? 'AND') === 'AND' ? 'OR' : 'AND' });

    const condVisible = badge.visibility === 'condition';

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:opacity-80"
                style={{ background: 'var(--app-surface)' }}
                onClick={() => setOpen(!open)}
            >
                <span style={{ color: 'var(--text-secondary)' }}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Badge
                        style={badge.style}
                        size={badge.size}
                        color={badge.color}
                        icon={badge.style === 'label' ? badge.icon : undefined}
                        text={badge.style === 'count' ? '1' : badge.style === 'label' ? badge.label || 'A' : undefined}
                    />
                </div>
                <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {t(STYLES.find((s) => s.value === badge.style)!.labelKey as Parameters<typeof t>[0])}
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="hover:opacity-70 shrink-0"
                    style={{ color: 'var(--accent-red)' }}
                >
                    <Trash2 size={13} />
                </button>
            </div>

            {open && (
                <div className="p-3 space-y-3" style={{ background: 'var(--app-bg)' }}>
                    {/* Style + corner */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {t('badge.style')}
                        </label>
                        <select
                            value={badge.style}
                            onChange={(e) => update({ style: e.target.value as BadgeStyle })}
                            className={`${cls} flex-1`}
                            style={inputStyle}
                        >
                            {STYLES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {t(s.labelKey as Parameters<typeof t>[0])}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {t('badge.corner')}
                        </label>
                        <select
                            value={badge.corner}
                            onChange={(e) => update({ corner: e.target.value as BadgeCorner })}
                            className={`${cls} flex-1`}
                            style={inputStyle}
                        >
                            {CORNERS.map((c) => (
                                <option key={c.value} value={c.value}>
                                    {t(c.labelKey as Parameters<typeof t>[0])}
                                </option>
                            ))}
                        </select>
                        <select
                            value={badge.size ?? 'md'}
                            onChange={(e) => update({ size: e.target.value as BadgeSize })}
                            className={`${cls} shrink-0`}
                            style={{ ...inputStyle, width: '88px' }}
                        >
                            {SIZES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {t(s.labelKey as Parameters<typeof t>[0])}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Colour */}
                    <ColorField label={t('badge.color')} value={badge.color} onChange={(v) => update({ color: v })} />

                    {/* Count: datapoint */}
                    {badge.style === 'count' && (
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                {t('badge.datapoint')}
                            </label>
                            <div className="flex gap-0.5 flex-1 min-w-0">
                                <input
                                    type="text"
                                    value={badge.dp ?? ''}
                                    onChange={(e) => update({ dp: e.target.value })}
                                    placeholder={t('cond.datapointId')}
                                    className={`${cls} flex-1 font-mono min-w-0`}
                                    style={inputStyle}
                                />
                                <button
                                    onClick={() => setShowPicker(true)}
                                    className="px-1.5 rounded-lg hover:opacity-80 shrink-0"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    title={t('cond.fromIoBroker')}
                                >
                                    <Database size={11} />
                                </button>
                                <JsonPathButton
                                    value={badge.dp ?? ''}
                                    onChange={(ref) => update({ dp: ref })}
                                    size={11}
                                />
                            </div>
                        </div>
                    )}

                    {/* Label: text + icon */}
                    {badge.style === 'label' && (
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                {t('badge.label')}
                            </label>
                            <input
                                type="text"
                                value={badge.label ?? ''}
                                onChange={(e) => update({ label: e.target.value })}
                                placeholder={t('badge.label')}
                                className={`${cls} flex-1 min-w-0`}
                                style={inputStyle}
                            />
                            <button
                                onClick={() => setShowIcon(true)}
                                className="px-1.5 h-[30px] rounded-lg hover:opacity-80 shrink-0 flex items-center gap-1"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('badge.icon')}
                            >
                                {badge.icon ? <Icon icon={badge.icon} width={13} height={13} /> : <Plus size={11} />}
                            </button>
                            {badge.icon && (
                                <button
                                    onClick={() => update({ icon: undefined })}
                                    className="shrink-0 hover:opacity-60"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {/* Visibility */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {t('badge.visibility')}
                        </label>
                        <select
                            value={badge.visibility ?? 'always'}
                            onChange={(e) =>
                                update({
                                    visibility: e.target.value as BadgeDef['visibility'],
                                    clauses:
                                        e.target.value === 'condition' && !clauses.length
                                            ? [newClause()]
                                            : badge.clauses,
                                })
                            }
                            className={`${cls} flex-1`}
                            style={inputStyle}
                        >
                            <option value="always">{t('badge.visAlways')}</option>
                            <option value="condition">{t('badge.visCondition')}</option>
                        </select>
                    </div>

                    {condVisible && (
                        <div className="space-y-1.5 pl-3 border-l-2" style={{ borderColor: 'var(--accent)44' }}>
                            {clauses.map((clause, i) => (
                                <ClauseRow
                                    key={i}
                                    clause={clause}
                                    isFirst={i === 0}
                                    logic={badge.logic ?? 'AND'}
                                    onLogicToggle={toggleLogic}
                                    onChange={(c) => updateClause(i, c)}
                                    onDelete={() => deleteClause(i)}
                                />
                            ))}
                            <button
                                onClick={addClause}
                                className="flex items-center gap-1 text-[10px] hover:opacity-80"
                                style={{ color: 'var(--accent)' }}
                            >
                                <Plus size={11} /> {t('cond.addClause')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {showPicker && (
                <DatapointPicker
                    currentValue={badge.dp ?? ''}
                    onSelect={(id) => update({ dp: id })}
                    onClose={() => setShowPicker(false)}
                />
            )}
            {showIcon && (
                <IconPickerModal
                    current={badge.icon ?? ''}
                    onSelect={(name) => {
                        update({ icon: name || undefined });
                        setShowIcon(false);
                    }}
                    onClose={() => setShowIcon(false)}
                />
            )}
        </div>
    );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface BadgeEditorProps {
    badges: BadgeDef[];
    onChange: (badges: BadgeDef[]) => void;
    style?: React.CSSProperties;
}

export function BadgeEditor({ badges, onChange, style }: BadgeEditorProps) {
    const t = useT();
    const update = (i: number, b: BadgeDef) => onChange(badges.map((x, j) => (j === i ? b : x)));
    const remove = (i: number) => onChange(badges.filter((_, j) => j !== i));

    return (
        <div className="p-3 space-y-2.5" style={{ width: '100%', ...style }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('badge.rules')}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('badge.rulesHint')}
                </p>
            </div>

            {badges.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('badge.noRules')}
                </p>
            )}

            {badges.map((b, i) => (
                <BadgeRule key={b.id} badge={b} onChange={(nb) => update(i, nb)} onDelete={() => remove(i)} />
            ))}

            <button
                onClick={() => onChange([...badges, newBadge()])}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
                style={{
                    background: 'var(--app-surface)',
                    color: 'var(--accent)',
                    border: '1px dashed var(--accent)55',
                }}
            >
                <Plus size={13} /> {t('badge.newRule')}
            </button>
        </div>
    );
}
