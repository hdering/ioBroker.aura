/**
 * Create / edit popup of the Ansagen widget (#918).
 *
 * The same rule as Admin → Ansagen — trigger, text, devices, time window, lock —
 * cut down to one condition, the way a household sets up "doorbell → say it
 * here". Further conditions an admin added stay untouched. With the widget's
 * `triggers` list the trigger is a named choice instead of a datapoint id.
 *
 * Saving goes through the adapter (sendTo announcementEdit): a device changes only
 * the rules it created, and without `allowOtherDevices` they speak on it alone.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Database, Trash2, Volume2, X } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useT, type TranslationKey } from '../../i18n';
import { useEscapeLayer } from '../../utils/escapeStack';
import { useClientList } from '../../hooks/useClientList';
import type { AnnouncementTriggerDef, ConditionOperator } from '../../types';
import type { AnnouncementRule } from '../../utils/announcements';
import { DatapointPicker } from '../config/DatapointPicker';
import { ConfirmOverlay } from './ConfirmOverlay';
import { editAnnouncement, newAnnouncementId, testAnnouncement, type AnnouncementReply } from './announcementsApi';

interface Props {
    /** null = new rule */
    rule: AnnouncementRule | null;
    clientId: string;
    triggers: AnnouncementTriggerDef[];
    allowOtherDevices: boolean;
    allowDelete: boolean;
    onClose: () => void;
}

const inputCls = 'w-full text-sm rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const secondaryBtn: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-xs mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

const OPERATORS: { value: ConditionOperator; key: TranslationKey; noValue?: boolean }[] = [
    { value: 'true', key: 'cond.isTrue', noValue: true },
    { value: 'false', key: 'cond.isFalse', noValue: true },
    { value: '==', key: 'cond.equal' },
    { value: '!=', key: 'cond.notEqual' },
    { value: '>', key: 'cond.greater' },
    { value: '>=', key: 'cond.greaterEq' },
    { value: '<', key: 'cond.less' },
    { value: '<=', key: 'cond.lessEq' },
    { value: 'contains', key: 'cond.contains' },
    { value: 'active', key: 'cond.isActive', noValue: true },
    { value: 'inactive', key: 'cond.isInactive', noValue: true },
    { value: 'changed', key: 'cond.changed', noValue: true },
];

/** Monday first, as on a calendar; values are Date.getDay(). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
            style={{
                background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--app-bg)',
                color: on ? 'var(--accent)' : 'var(--text-primary)',
                border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--app-border)'}`,
            }}
        >
            {on && <Check size={10} strokeWidth={3} />}
            {children}
        </button>
    );
}

export function AnnouncementEditModal({ rule, clientId, triggers, allowOtherDevices, allowDelete, onClose }: Props) {
    const t = useT();
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const clients = useClientList();
    const [draft, setDraft] = useState<AnnouncementRule>(
        () =>
            rule ?? {
                id: newAnnouncementId(clientId),
                name: '',
                enabled: true,
                clause: { datapoint: triggers[0]?.dp ?? '', operator: 'true', value: '' },
                text: '',
            },
    );
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [picker, setPicker] = useState<'trigger' | 'value' | null>(null);
    useEscapeLayer(() => {
        if (!picker) onClose();
    });

    const patch = (p: Partial<AnnouncementRule>) => setDraft((d) => ({ ...d, ...p }));
    const clause = draft.clause;
    const op = OPERATORS.find((o) => o.value === clause.operator) ?? OPERATORS[0];
    const ownClients = draft.clientIds?.length ? draft.clientIds : [clientId];

    const errorText = (r: AnnouncementReply): string => {
        if (r.error === 'forbidden') return t('announce.err.forbidden');
        if (r.error === 'limit') return t('announce.err.limit');
        if (r.error === 'timeout') return t('announce.err.timeout');
        return r.error ? `${t('announce.err.generic')} (${r.error})` : t('announce.err.generic');
    };

    const run = async (edit: Parameters<typeof editAnnouncement>[1]) => {
        if (busy) return;
        setBusy(true);
        setMsg(null);
        try {
            const r = await editAnnouncement(clientId, edit);
            if (r.ok) onClose();
            else setMsg({ kind: 'error', text: errorText(r) });
        } finally {
            setBusy(false);
        }
    };

    const runTest = async () => {
        if (busy) return;
        setBusy(true);
        setMsg(null);
        try {
            const r = await testAnnouncement({ ...draft, clientIds: ownClients });
            setMsg(
                r.ok
                    ? { kind: 'info', text: r.text ? t('announce.tested', { text: r.text }) : t('announce.testEmpty') }
                    : { kind: 'error', text: errorText(r) },
            );
        } finally {
            setBusy(false);
        }
    };

    const toggleDay = (day: number) => {
        const cur = draft.days ?? [];
        const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
        patch({ days: next.length && next.length < 7 ? next.sort() : undefined });
    };
    const toggleClient = (id: string) => {
        const next = ownClients.includes(id) ? ownClients.filter((c) => c !== id) : [...ownClients, id];
        patch({ clientIds: next.length ? next : undefined });
    };

    const known = triggers.some((tr) => tr.dp === clause.datapoint);
    const canSave = !!draft.name.trim() && !!clause.datapoint.trim() && !!draft.text.trim() && !busy;

    return createPortal(
        <div
            data-aura-app="frontend"
            className="aura-announcement-modal fixed inset-0 z-[10010] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={onClose}
        >
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-full"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                onClick={(e) => e.stopPropagation()}
                data-testid="announcement-modal"
            >
                <div
                    className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <p className="text-sm font-semibold flex-1">{rule ? t('announce.edit') : t('announce.new')}</p>
                    <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3 overflow-y-auto min-h-0">
                    <label className="block">
                        <span className={labelCls} style={labelStyle}>
                            {t('announce.name')}
                        </span>
                        <input
                            value={draft.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            maxLength={80}
                            placeholder={t('announce.namePlaceholder')}
                            className={inputCls}
                            style={inputStyle}
                            data-testid="announcement-name"
                            autoFocus={!rule}
                        />
                    </label>

                    <div>
                        <span className={labelCls} style={labelStyle}>
                            {t('announce.when')}
                        </span>
                        {triggers.length > 0 ? (
                            <select
                                value={clause.datapoint}
                                onChange={(e) => patch({ clause: { ...clause, datapoint: e.target.value } })}
                                className={inputCls}
                                style={inputStyle}
                                data-testid="announcement-trigger"
                            >
                                {!known && <option value={clause.datapoint}>{clause.datapoint || '–'}</option>}
                                {triggers.map((tr) => (
                                    <option key={tr.dp} value={tr.dp}>
                                        {tr.name || tr.dp}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="flex gap-1">
                                <input
                                    value={clause.datapoint}
                                    onChange={(e) => patch({ clause: { ...clause, datapoint: e.target.value.trim() } })}
                                    placeholder="hm-rpc.0.…"
                                    className={`${inputCls} font-mono min-w-0 flex-1`}
                                    style={inputStyle}
                                    data-testid="announcement-trigger"
                                />
                                <button
                                    type="button"
                                    onClick={() => setPicker('trigger')}
                                    className="px-2 rounded-lg shrink-0"
                                    style={secondaryBtn}
                                >
                                    <Database size={14} />
                                </button>
                            </div>
                        )}
                        <div className="flex gap-1.5 mt-1.5">
                            <select
                                value={op.value}
                                onChange={(e) =>
                                    patch({ clause: { ...clause, operator: e.target.value as ConditionOperator } })
                                }
                                className={`${inputCls} ${op.noValue ? '' : 'max-w-[55%]'}`}
                                style={inputStyle}
                                data-testid="announcement-operator"
                            >
                                {OPERATORS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {t(o.key)}
                                    </option>
                                ))}
                            </select>
                            {!op.noValue && (
                                <input
                                    value={clause.value}
                                    onChange={(e) => patch({ clause: { ...clause, value: e.target.value } })}
                                    className={`${inputCls} min-w-0 flex-1`}
                                    style={inputStyle}
                                    data-testid="announcement-value"
                                />
                            )}
                        </div>
                        {!!draft.extraClauses?.length && (
                            <p className="text-xs mt-1" style={labelStyle}>
                                {t('announce.extraClauses', { n: draft.extraClauses.length })}
                            </p>
                        )}
                        <select
                            value={draft.mode ?? 'edge'}
                            onChange={(e) => patch({ mode: e.target.value === 'update' ? 'update' : undefined })}
                            className={`${inputCls} mt-1.5`}
                            style={inputStyle}
                        >
                            <option value="edge">{t('announce.mode.edge')}</option>
                            <option value="update">{t('announce.mode.update')}</option>
                        </select>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={labelStyle}>
                                {t('announce.text')}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPicker('value')}
                                className="text-xs px-2 py-0.5 rounded-lg"
                                style={{ ...secondaryBtn, color: 'var(--accent)' }}
                            >
                                {t('announce.insertValue')}
                            </button>
                        </div>
                        <textarea
                            value={draft.text}
                            onChange={(e) => patch({ text: e.target.value })}
                            rows={2}
                            placeholder={t('announce.textPlaceholder')}
                            className={inputCls}
                            style={inputStyle}
                            data-testid="announcement-text"
                        />
                        <p className="text-xs mt-1" style={{ ...labelStyle, opacity: 0.8 }}>
                            {t('announce.textHint')}
                        </p>
                        <button
                            type="button"
                            onClick={() => void runTest()}
                            disabled={busy || !draft.text.trim()}
                            className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-40"
                            style={secondaryBtn}
                            data-testid="announcement-test"
                        >
                            <Volume2 size={12} /> {t('announce.test')}
                        </button>
                    </div>

                    <div>
                        <span className={labelCls} style={labelStyle}>
                            {t('announce.devices')}
                        </span>
                        {allowOtherDevices ? (
                            <div className="flex flex-wrap gap-1" data-testid="announcement-devices">
                                {clients.map((c) => (
                                    <Chip
                                        key={c.clientId}
                                        on={ownClients.includes(c.clientId)}
                                        onClick={() => toggleClient(c.clientId)}
                                    >
                                        {c.name}
                                    </Chip>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs" style={labelStyle}>
                                {t('announce.thisDevice')}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className={labelCls} style={labelStyle}>
                                {t('announce.volume')}
                            </span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={draft.volume ?? ''}
                                onChange={(e) =>
                                    patch({
                                        volume:
                                            e.target.value === ''
                                                ? undefined
                                                : Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
                                    })
                                }
                                placeholder={t('announce.volumeDevice')}
                                className={`${inputCls} tabular-nums`}
                                style={inputStyle}
                            />
                        </label>
                        <label className="flex items-end gap-2 text-xs pb-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={!!draft.interrupt}
                                onChange={(e) => patch({ interrupt: e.target.checked || undefined })}
                            />
                            <span>{t('announce.interrupt')}</span>
                        </label>
                    </div>

                    <div>
                        <span className={labelCls} style={labelStyle}>
                            {t('announce.window')}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="time"
                                value={draft.timeFrom ?? ''}
                                onChange={(e) => patch({ timeFrom: e.target.value || undefined })}
                                className={`${inputCls} tabular-nums`}
                                style={inputStyle}
                                aria-label={t('announce.from')}
                            />
                            <span className="text-xs" style={labelStyle}>
                                –
                            </span>
                            <input
                                type="time"
                                value={draft.timeTo ?? ''}
                                onChange={(e) => patch({ timeTo: e.target.value || undefined })}
                                className={`${inputCls} tabular-nums`}
                                style={inputStyle}
                                aria-label={t('announce.to')}
                            />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {WEEKDAYS.map((d) => (
                                <Chip key={d} on={!!draft.days?.includes(d)} onClick={() => toggleDay(d)}>
                                    {t(`cal.day.${d}` as TranslationKey)}
                                </Chip>
                            ))}
                        </div>
                        <p className="text-xs mt-1" style={{ ...labelStyle, opacity: 0.8 }}>
                            {t('announce.windowHint')}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={!!draft.oncePerDay}
                                onChange={(e) => patch({ oncePerDay: e.target.checked || undefined })}
                            />
                            <span>{t('announce.oncePerDay')}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <span>{t('announce.cooldown')}</span>
                            <input
                                type="number"
                                min={0}
                                value={draft.cooldownMin ?? ''}
                                onChange={(e) => {
                                    const n = Math.round(Number(e.target.value) || 0);
                                    patch({ cooldownMin: n > 0 ? n : undefined });
                                }}
                                className="text-sm rounded-lg px-2 py-1 w-16 tabular-nums focus:outline-none"
                                style={inputStyle}
                            />
                            <span style={labelStyle}>{t('announce.minutes')}</span>
                        </label>
                    </div>

                    {msg && (
                        <p
                            className="text-xs px-2 py-1.5 rounded-lg"
                            style={
                                msg.kind === 'error'
                                    ? { background: '#ef444422', color: '#ef4444', border: '1px solid #ef444455' }
                                    : {
                                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                          color: 'var(--text-primary)',
                                          border: '1px solid var(--app-border)',
                                      }
                            }
                            data-testid="announcement-msg"
                        >
                            {msg.text}
                        </p>
                    )}
                </div>

                <div
                    className="flex items-center gap-2 px-4 py-3 border-t"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    {rule && allowDelete && (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            disabled={busy}
                            className="p-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                            style={{ ...secondaryBtn, color: '#ef4444' }}
                            title={t('common.delete')}
                            data-testid="announcement-delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                    <span className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-3 py-2 text-xs rounded-lg hover:opacity-80"
                        style={secondaryBtn}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() =>
                            void run({
                                op: 'upsert',
                                rule: {
                                    ...draft,
                                    name: draft.name.trim(),
                                    clientIds: allowOtherDevices ? draft.clientIds : [clientId],
                                },
                            })
                        }
                        disabled={!canSave}
                        className="px-3 py-2 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                        data-testid="announcement-save"
                    >
                        {t('common.save')}
                    </button>
                </div>

                {confirmDelete && rule && (
                    <ConfirmOverlay
                        text={t('announce.deleteConfirm', { name: rule.name })}
                        onConfirm={() => {
                            setConfirmDelete(false);
                            void run({ op: 'delete', id: rule.id });
                        }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}
            </div>
            {picker && (
                <div onClick={(e) => e.stopPropagation()}>
                    <DatapointPicker
                        currentValue={picker === 'trigger' ? clause.datapoint : ''}
                        onSelect={(id) => {
                            if (picker === 'trigger') patch({ clause: { ...clause, datapoint: id } });
                            else {
                                const sep = draft.text && !/\s$/.test(draft.text) ? ' ' : '';
                                patch({ text: `${draft.text}${sep}[[${id}]]` });
                            }
                            setPicker(null);
                        }}
                        onClose={() => setPicker(null)}
                    />
                </div>
            )}
        </div>,
        portal,
    );
}
