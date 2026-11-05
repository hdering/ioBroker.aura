/**
 * Ansagen widget (#918) — announcement rules from the dashboard.
 *
 * The rules are the ones of Admin → Ansagen (`config.announcements`), run by the
 * adapter whether or not a dashboard is open. A device creates and changes only
 * its own rules (`owner` = its client id) and, unless the admin allows other
 * devices (`allowOtherDevices`), they speak on that device alone. Admin →
 * Ansagen shows them as "vom Gerät …" and can take them over.
 *
 * Options: `scope` own = this device's rules, device = also the admin's rules that
 * speak here (read only); `allowCreate` / `allowEdit` / `allowDelete`; `triggers` =
 * named datapoints to choose from instead of a datapoint id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Volume2, Pencil } from 'lucide-react';
import { getStateDirect, subscribeStateDirect, useIoBroker } from '../../hooks/useIoBroker';
import { useContentAutoHeight } from '../../hooks/useContentAutoHeight';
import { useWidgetWriteLock } from '../../hooks/widgetWriteLock';
import { useConnectionStore } from '../../store/connectionStore';
import { useT, type TranslationKey } from '../../i18n';
import type { AnnouncementTriggerDef, WidgetProps } from '../../types';
import { parseAnnouncementConfig, type AnnouncementRule } from '../../utils/announcements';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import { AnnouncementEditModal } from './AnnouncementEditModal';
import { ANNOUNCEMENTS_STATE, editAnnouncement, testAnnouncement } from './announcementsApi';

/** The widget's `triggers` option, cleaned: entries with a datapoint, no duplicates. */
export function cleanAnnouncementTriggers(raw: unknown): AnnouncementTriggerDef[] {
    if (!Array.isArray(raw)) return [];
    const out: AnnouncementTriggerDef[] = [];
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const dp = typeof r.dp === 'string' ? r.dp.trim() : '';
        if (!dp || out.some((x) => x.dp === dp)) continue;
        out.push({ dp, name: typeof r.name === 'string' ? r.name.trim() : '' });
    }
    return out;
}

/** Rules the widget lists: its own, with scope `device` also the ones speaking here. */
export function visibleAnnouncementRules(
    rules: AnnouncementRule[],
    clientId: string,
    scope: 'own' | 'device',
): AnnouncementRule[] {
    return rules.filter(
        (r) =>
            r.owner === clientId ||
            (scope === 'device' && !r.owner && (!r.clientIds?.length || r.clientIds.includes(clientId))),
    );
}

export function AnnouncementsWidget({ config }: WidgetProps) {
    const t = useT();
    const writeLocked = useWidgetWriteLock();
    const { connected } = useIoBroker();
    const clientId = useConnectionStore((s) => s.clientId);
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const scope = o.scope === 'device' ? 'device' : 'own';
    const allowCreate = o.allowCreate !== false;
    const allowEdit = o.allowEdit !== false;
    const allowDelete = o.allowDelete !== false;
    const allowOtherDevices = o.allowOtherDevices === true;
    const showSummary = o.showSummary !== false;
    const triggers = useMemo(() => cleanAnnouncementTriggers(o.triggers), [o.triggers]);
    const Icon = getWidgetIcon((o.icon as string) ?? 'Megaphone', Megaphone);
    const { fit: autoHeight, measureRef } = useContentAutoHeight(config);
    const rootRef = useCallback((el: HTMLDivElement | null) => measureRef(el), [measureRef]);

    const [raw, setRaw] = useState<unknown>(undefined);
    const [editing, setEditing] = useState<AnnouncementRule | 'new' | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void getStateDirect(ANNOUNCEMENTS_STATE).then((st) => alive && setRaw(st?.val ?? ''));
        const unsub = subscribeStateDirect(ANNOUNCEMENTS_STATE, (st) => setRaw(st?.val ?? ''));
        return () => {
            alive = false;
            unsub();
        };
    }, [connected]);

    const rules = useMemo(
        () =>
            raw === undefined ? null : visibleAnnouncementRules(parseAnnouncementConfig(raw).rules, clientId, scope),
        [raw, clientId, scope],
    );

    const triggerName = (dp: string) => {
        const named = triggers.find((tr) => tr.dp === dp)?.name;
        if (named) return named;
        const parts = dp.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : dp;
    };

    const summary = (r: AnnouncementRule): string => {
        const parts = [triggerName(r.clause.datapoint)];
        if (r.timeFrom && r.timeTo) parts.push(`${r.timeFrom}–${r.timeTo}`);
        if (r.days?.length) parts.push(r.days.map((d) => t(`cal.day.${d}` as TranslationKey)).join(' '));
        if (r.oncePerDay) parts.push(t('announce.oncePerDayShort'));
        if (r.cooldownMin) parts.push(t('announce.cooldownShort', { n: r.cooldownMin }));
        return parts.join(' · ');
    };

    const toggle = async (r: AnnouncementRule) => {
        if (writeLocked) return;
        const res = await editAnnouncement(clientId, { op: 'toggle', id: r.id, enabled: !r.enabled });
        setNotice(res.ok ? null : t('announce.err.generic'));
    };

    const test = async (r: AnnouncementRule) => {
        if (writeLocked) return;
        // Own rules speak where they would; the admin's ones only here, not in the whole house.
        const res = await testAnnouncement(r.owner ? r : { ...r, clientIds: [clientId] });
        setNotice(res.ok ? (res.text ? null : t('announce.testEmpty')) : t('announce.err.generic'));
    };

    const header = (
        <HeaderGroup>
            {(showTitle || showIcon) && (
                <TitleRow align={titleAlign} className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <Icon
                            size={iconSize}
                            style={{ '--aura-icon-color': 'var(--accent)' }}
                            className="aura-widget-icon shrink-0"
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs flex-1 min-w-0 truncate"
                            style={{
                                '--aura-title-color': 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title || t('announce.title')}
                        </p>
                    )}
                    <HeaderSlotsInline />
                </TitleRow>
            )}
            <HeaderSlotsRow2 />
        </HeaderGroup>
    );

    const hint = (text: string) => (
        <p
            className="text-xs px-1 shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            data-testid="announcements-hint"
        >
            {text}
        </p>
    );

    let body: React.ReactNode = null;
    if (rules === null) {
        body = connected ? null : hint(t('announce.notConnected'));
    } else {
        body = (
            <div
                className={`flex flex-col gap-1 ${autoHeight ? '' : 'flex-1 min-h-0 overflow-y-auto'}`}
                data-testid="announcements-list"
            >
                {rules.length === 0 && hint(allowCreate ? t('announce.emptyCreate') : t('announce.empty'))}
                {rules.map((r) => {
                    const own = r.owner === clientId;
                    const canToggle = own && allowEdit;
                    return (
                        <div
                            key={r.id}
                            className="aura-announcement flex items-center gap-2 rounded-lg px-2 py-1.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                            data-testid="announcement"
                            data-id={r.id}
                            data-enabled={r.enabled || undefined}
                        >
                            <button
                                type="button"
                                onClick={() => canToggle && void toggle(r)}
                                disabled={!canToggle}
                                className="relative w-8 h-4 rounded-full shrink-0 transition-colors disabled:cursor-default"
                                style={{
                                    background: r.enabled ? 'var(--accent)' : 'var(--app-border)',
                                    opacity: canToggle ? 1 : 0.5,
                                }}
                                title={own ? t('announce.toggle') : t('announce.adminRule')}
                                aria-pressed={r.enabled}
                                data-testid="announcement-toggle"
                            >
                                <span
                                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-[left]"
                                    style={{ left: r.enabled ? 'calc(100% - 14px)' : '2px' }}
                                />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                    {r.name || r.text}
                                </p>
                                {showSummary && (
                                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                        {own ? summary(r) : `${t('announce.adminRule')} · ${summary(r)}`}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => void test(r)}
                                className="shrink-0 p-1 rounded-md hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                                title={t('announce.test')}
                                data-testid="announcement-test-row"
                            >
                                <Volume2 size={15} />
                            </button>
                            {own && allowEdit && (
                                <button
                                    type="button"
                                    onClick={() => !writeLocked && setEditing(r)}
                                    className="shrink-0 p-1 rounded-md hover:opacity-70"
                                    style={{ color: 'var(--text-secondary)' }}
                                    title={t('announce.edit')}
                                    data-testid="announcement-edit"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}
                {allowCreate && (
                    <button
                        onClick={() => !writeLocked && setEditing('new')}
                        className="flex items-center justify-center gap-1.5 text-xs rounded-lg px-2 py-2 hover:opacity-80"
                        style={{ border: '1px dashed var(--app-border)', color: 'var(--text-secondary)' }}
                        data-testid="announcement-add"
                    >
                        <Plus size={14} />
                        {t('announce.new')}
                    </button>
                )}
                {notice && hint(notice)}
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className={`aura-widget-row w-full flex flex-col gap-2 ${autoHeight ? '' : 'h-full overflow-hidden'}`}
        >
            {header}
            {body}
            {editing && (
                <AnnouncementEditModal
                    rule={editing === 'new' ? null : editing}
                    clientId={clientId}
                    triggers={triggers}
                    allowOtherDevices={allowOtherDevices}
                    allowDelete={allowDelete}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
