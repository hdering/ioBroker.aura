/**
 * Edit-dialog section of the Scenes widget (#825): the place to manage scenes. Lists the
 * scenes made in Aura (`scene.0.aura.*`); "+ New scene" and "⋯" open SceneManagerModal,
 * the "Datenpunkte verwalten"-style editor (order, datapoint and value per device). The
 * widget's runtime popup with `allowEdit` is the smaller SceneEditModal. Scenes of the
 * scenes adapter's own admin are only counted — they are edited there.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MoreHorizontal, Plus } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';
import { SceneManagerModal } from './SceneManagerModal';
import { loadScenes, sceneDeviceName, type SceneInfo, type SceneReply, type SceneStatus } from '../widgets/scenesApi';
import { ConfigSection } from './ConfigSection';

const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

export function ScenesConfig() {
    const t = useT();
    const { connected } = useIoBroker();
    const [status, setStatus] = useState<SceneStatus | null>(null);
    const [scenes, setScenes] = useState<SceneInfo[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<SceneInfo | 'new' | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const r = await loadScenes();
        setError(r.error ? (r.error === 'timeout' ? t('scenes.err.timeout') : r.error) : null);
        setStatus(r.status);
        setScenes(r.scenes);
    }, [t]);

    useEffect(() => {
        void reload();
    }, [connected, reload]);

    const own = scenes.filter((s) => s.own);
    const foreign = scenes.length - own.length;

    const afterWrite = (r: SceneReply) => {
        setNotice(
            r.missing?.length ? t('scenes.learnMissing', { list: r.missing.map(sceneDeviceName).join(', ') }) : null,
        );
        void reload();
    };

    const warn = (text: string) => (
        <p
            className="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
            style={{ background: '#f59e0b22', color: 'var(--text-primary)', border: '1px solid #f59e0b55' }}
            data-testid="scenes-cfg-hint"
        >
            <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
            <span>{text}</span>
        </p>
    );

    return (
        <ConfigSection
            title={t('scenes.cfg.section')}
            sectionKey="scenes"
            count={status ? String(own.length) : undefined}
        >
            <div className="space-y-2 pt-2" data-testid="scenes-cfg">
                {error && warn(error)}
                {status && !status.installed && warn(t('scenes.notInstalled'))}
                {status?.installed && !status.running && warn(t('scenes.notRunning', { instance: status.instance }))}

                {status?.installed && (
                    <>
                        {own.length === 0 ? (
                            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('scenes.cfg.none')}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {own.map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-lg text-xs"
                                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                                        data-testid="scenes-cfg-scene"
                                    >
                                        <span
                                            className="flex-1 min-w-0 truncate"
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            {s.name}
                                        </span>
                                        <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                            {s.memberCount === 1
                                                ? t('scenes.deviceCountOne')
                                                : t('scenes.deviceCount', { n: s.memberCount })}
                                        </span>
                                        <button
                                            onClick={() => setEditing(s)}
                                            className="shrink-0 p-1 rounded-md hover:opacity-70"
                                            style={{ color: 'var(--text-secondary)' }}
                                            title={t('scenes.edit')}
                                            data-testid="scenes-cfg-edit"
                                        >
                                            <MoreHorizontal size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button
                            onClick={() => setEditing('new')}
                            className="w-full flex items-center justify-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                            style={{ ...btnStyle, borderStyle: 'dashed' }}
                            data-testid="scenes-cfg-add"
                        >
                            <Plus size={12} />
                            {t('scenes.new')}
                        </button>
                        <p
                            className="text-[10px]"
                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                            data-testid="scenes-cfg-foreign"
                        >
                            {foreign > 0 ? t('scenes.cfg.foreign', { n: foreign }) : t('scenes.cfg.noForeign')}
                        </p>
                        {notice && warn(notice)}
                    </>
                )}
            </div>
            {editing && (
                <SceneManagerModal
                    scene={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onDone={afterWrite}
                />
            )}
        </ConfigSection>
    );
}
