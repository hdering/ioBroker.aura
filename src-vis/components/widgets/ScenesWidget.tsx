/**
 * Scenes widget (#825) — the dashboard surface of the ioBroker scenes adapter.
 *
 * Aura keeps no scenes of its own: the list, the members and their values live in
 * `scene.0.*` objects of the scenes adapter. Tapping a scene writes `true` to it
 * (the adapter sets the members); "+" and "⋯" open SceneEditModal, whose writes go
 * through the Aura backend (lib/scenes.js) — it checks the device whitelist of the
 * instance config and the optional scenes PIN, and only touches `scene.0.aura.*`.
 *
 * Layouts: `default` = list, `card` = tiles.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clapperboard, MoreHorizontal, Plus, AlertTriangle } from 'lucide-react';
import {
    getStateDirect,
    sendToDirect,
    setStateDirect,
    subscribeStateDirect,
    useIoBroker,
} from '../../hooks/useIoBroker';
import { useContentAutoHeight } from '../../hooks/useContentAutoHeight';
import { useWidgetWriteLock } from '../../hooks/widgetWriteLock';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { NS } from '../../utils/namespace';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import { SceneEditModal, type SceneEditResult } from './SceneEditModal';

export interface SceneDevice {
    id: string;
    name: string;
    label: string;
    type: string;
    unit: string;
    missing?: boolean;
}

export interface SceneInfo {
    id: string;
    name: string;
    own: boolean;
    enabled: boolean;
    memberCount: number;
    /** Own scenes only: members with their stored "on" value. */
    members?: { id: string; value: unknown }[];
}

interface SceneStatus {
    ok: boolean;
    instance: string;
    installed: boolean;
    running: boolean;
    pinRequired: boolean;
    devices: SceneDevice[];
}

type Reply = { ok?: boolean; error?: string; retryAfter?: number; missing?: string[] } & Record<string, unknown>;

/** sendTo to this page's aura instance, normalised to { ok, error } — timeouts and permission strings included. */
async function callBackend(command: string, payload: Record<string, unknown> = {}): Promise<Reply> {
    const r = await sendToDirect<Reply>(NS, command, payload);
    if (r && typeof r === 'object' && '__timeout' in r) return { ok: false, error: 'timeout' };
    if (typeof r === 'string') return { ok: false, error: r };
    if (!r) return { ok: false, error: 'no reply' };
    return r as Reply;
}

export function ScenesWidget({ config }: WidgetProps) {
    const t = useT();
    const writeLocked = useWidgetWriteLock();
    const { connected } = useIoBroker();
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as 'left' | 'center' | 'right') ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const showForeign = o.showForeignScenes === true;
    const allowEdit = o.allowEdit !== false;
    const showDeviceCount = o.showDeviceCount !== false;
    const tiles = config.layout === 'card';
    const Icon = getWidgetIcon((o.icon as string) ?? 'Clapperboard', Clapperboard);
    const { fit: autoHeight, measureRef } = useContentAutoHeight(config);
    const rootRef = useCallback((el: HTMLDivElement | null) => measureRef(el), [measureRef]);

    const [status, setStatus] = useState<SceneStatus | null>(null);
    const [scenes, setScenes] = useState<SceneInfo[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [editing, setEditing] = useState<SceneInfo | 'new' | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const reload = useCallback(async (): Promise<SceneInfo[]> => {
        const [st, list] = await Promise.all([callBackend('sceneStatus'), callBackend('listScenes')]);
        if (!st.ok) {
            setLoadError(st.error === 'timeout' ? t('scenes.err.timeout') : (st.error ?? t('scenes.err.generic')));
            return [];
        }
        const next = list.ok && Array.isArray(list.scenes) ? (list.scenes as SceneInfo[]) : [];
        setLoadError(null);
        setStatus(st as unknown as SceneStatus);
        setScenes(next);
        return next;
    }, [t]);

    useEffect(() => {
        // Also before the socket is up: the screenshot harness answers sendTo itself,
        // and a real reconnect re-runs this anyway.
        void reload();
    }, [connected, reload]);

    const visible = useMemo(() => scenes.filter((s) => s.own || showForeign), [scenes, showForeign]);

    // Scene state: true = all members at their "on" value (the adapter keeps it current).
    const idsKey = visible.map((s) => s.id).join('|');
    useEffect(() => {
        if (!visible.length) return;
        const unsubs = visible.map((s) => {
            void getStateDirect(s.id).then((st) => setValues((p) => ({ ...p, [s.id]: st?.val })));
            return subscribeStateDirect(s.id, (st) => setValues((p) => ({ ...p, [s.id]: st?.val })));
        });
        return () => unsubs.forEach((u) => u());
    }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const trigger = (s: SceneInfo) => {
        // A locked editor click is meant for the layout, never for the house (#655).
        if (writeLocked) return;
        setStateDirect(s.id, true);
    };

    const deviceNames = (ids: string[]) =>
        ids.map((id) => status?.devices.find((d) => d.id === id)?.name ?? id).join(', ');

    const afterWrite = async (r: Reply): Promise<SceneEditResult> => {
        if (r.ok) {
            setNotice(r.missing?.length ? t('scenes.learnMissing', { list: deviceNames(r.missing) }) : null);
            await reload();
        }
        return r as SceneEditResult;
    };

    const editingScene = editing && editing !== 'new' ? editing : null;
    const canEdit = allowEdit && !!status?.installed;

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
                            {config.title || t('scenes.title')}
                        </p>
                    )}
                    <HeaderSlotsInline />
                </TitleRow>
            )}
            <HeaderSlotsRow2 />
        </HeaderGroup>
    );

    const hint = (text: string, warn = false) => (
        <div
            className="flex items-start gap-1.5 text-xs px-2 py-1.5 rounded-lg shrink-0"
            style={
                warn
                    ? { background: '#f59e0b22', color: 'var(--text-primary)', border: '1px solid #f59e0b55' }
                    : { color: 'var(--text-secondary)' }
            }
            data-testid="scenes-hint"
        >
            {warn && <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />}
            <span className="flex-1 break-words">{text}</span>
        </div>
    );

    const editButton = (s: SceneInfo) =>
        canEdit && s.own ? (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (!writeLocked) setEditing(s);
                }}
                className="shrink-0 p-1 rounded-md hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}
                title={t('scenes.edit')}
                data-testid="scene-edit"
            >
                <MoreHorizontal size={16} />
            </button>
        ) : null;

    const activeStyle = (active: boolean): React.CSSProperties => ({
        background: active ? 'color-mix(in srgb, var(--accent) 16%, var(--app-bg))' : 'var(--app-bg)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
    });

    const addButton = canEdit ? (
        <button
            onClick={() => !writeLocked && setEditing('new')}
            className={`flex items-center justify-center gap-1.5 text-xs rounded-lg hover:opacity-80 ${
                tiles ? 'flex-col min-h-[72px]' : 'px-2 py-2'
            }`}
            style={{ border: '1px dashed var(--app-border)', color: 'var(--text-secondary)' }}
            data-testid="scene-add"
        >
            <Plus size={tiles ? 18 : 14} />
            {t('scenes.new')}
        </button>
    ) : null;

    let body: React.ReactNode;
    if (loadError) {
        body = hint(loadError, true);
    } else if (!status) {
        body = connected ? null : hint(t('scenes.notConnected'));
    } else if (!status.installed) {
        body = hint(t('scenes.notInstalled'), true);
    } else {
        body = (
            <>
                {!status.running && hint(t('scenes.notRunning', { instance: status.instance }), true)}
                {canEdit && status.devices.length === 0 && hint(t('scenes.noDevices'))}
                {visible.length === 0 && !canEdit && hint(t('scenes.empty'))}
                <div
                    className={
                        tiles
                            ? `grid gap-1.5 content-start ${autoHeight ? '' : 'flex-1 min-h-0 overflow-y-auto'}`
                            : `flex flex-col gap-1 ${autoHeight ? '' : 'flex-1 min-h-0 overflow-y-auto'}`
                    }
                    style={tiles ? { gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' } : undefined}
                    data-testid="scenes-list"
                >
                    {visible.map((s) => {
                        const active = values[s.id] === true;
                        return tiles ? (
                            <div
                                key={s.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => trigger(s)}
                                onKeyDown={(e) => e.key === 'Enter' && trigger(s)}
                                className="aura-scene relative flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 min-h-[72px] cursor-pointer text-center"
                                style={activeStyle(active)}
                                data-active={active || undefined}
                                data-testid="scene"
                            >
                                <Clapperboard
                                    size={20}
                                    style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                                />
                                <span
                                    className="text-sm leading-tight line-clamp-2"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {s.name}
                                </span>
                                {s.own && canEdit && (
                                    <span className="absolute top-0.5 right-0.5">{editButton(s)}</span>
                                )}
                            </div>
                        ) : (
                            <div
                                key={s.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => trigger(s)}
                                onKeyDown={(e) => e.key === 'Enter' && trigger(s)}
                                className="aura-scene flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer"
                                style={activeStyle(active)}
                                data-active={active || undefined}
                                data-testid="scene"
                            >
                                <span
                                    className="shrink-0 inline-block rounded-full"
                                    style={{
                                        width: 8,
                                        height: 8,
                                        background: active ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                />
                                <span
                                    className="flex-1 min-w-0 truncate text-sm"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {s.name}
                                </span>
                                {showDeviceCount && (
                                    <span className="shrink-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                        {s.memberCount === 1
                                            ? t('scenes.deviceCountOne')
                                            : t('scenes.deviceCount', { n: s.memberCount })}
                                    </span>
                                )}
                                {editButton(s)}
                            </div>
                        );
                    })}
                    {addButton}
                </div>
                {notice && hint(notice, true)}
            </>
        );
    }

    return (
        <div
            ref={rootRef}
            className={`aura-widget-row w-full flex flex-col gap-2 ${autoHeight ? '' : 'h-full overflow-hidden'}`}
        >
            {header}
            {body}
            {editing && status && (
                <SceneEditModal
                    scene={editingScene}
                    devices={status.devices}
                    pinRequired={status.pinRequired}
                    onClose={() => setEditing(null)}
                    onSave={async (name, members, pin) =>
                        afterWrite(
                            await callBackend('saveScene', {
                                ...(editingScene ? { id: editingScene.id } : {}),
                                name,
                                members,
                                pin,
                            }),
                        )
                    }
                    onLearn={async (pin) => {
                        const r = await callBackend('learnScene', { id: editingScene?.id, pin });
                        if (r.ok) {
                            // Show the freshly learned values in the open popup.
                            const fresh = (await reload()).find((s) => s.id === editingScene?.id);
                            if (fresh) setEditing(fresh);
                        }
                        return r as SceneEditResult;
                    }}
                    onDelete={async (pin) =>
                        afterWrite(await callBackend('deleteScene', { id: editingScene?.id, pin }))
                    }
                />
            )}
        </div>
    );
}
