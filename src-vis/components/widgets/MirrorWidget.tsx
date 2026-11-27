import { useMemo } from 'react';
import { AlertTriangle, CopyPlus } from 'lucide-react';
import type { WidgetConfig, WidgetProps } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { EmbeddedWidget } from './EmbeddedWidget';
import { TabMirror } from './TabMirror';
import { useT } from '../../i18n';
import { mirrorAutoHeight } from '../../utils/autoHeight';
import { stripMirrorHead, withMirrorHead } from '../../utils/mirrorSource';
import { ContentAutoHeightIdContext } from '../../hooks/useContentAutoHeight';

/** Small centered notice card used for the mirror's various "cannot render" states. */
function Notice({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
    return (
        <div
            className="flex flex-col items-center justify-center gap-2 h-full w-full text-center p-3"
            style={{ color: 'var(--text-secondary)' }}
        >
            {icon}
            <span className="text-sm">{title}</span>
            {detail && <span className="text-xs opacity-60 font-mono break-all">{detail}</span>}
        </div>
    );
}

/**
 * "Spiegel" widget — `options.sourceKind: 'tab'` shows a whole tab (TabMirror);
 * otherwise (below) it renders an existing widget (the source) a second time at
 * another position. It stores only the source's id in `options.targetWidgetId`
 * and resolves it live from the store on every render, so the mirror always
 * reflects the current state/config of the source (no copy, no drift).
 *
 * Mirrors the proven reference logic of WidgetEmbedBody: spread the target config
 * but keep the mirror's own gridPos, render the target's inner component, and
 * persist option edits back to the *source* id so the mirror never clobbers the
 * source's real dashboard position.
 */
export function MirrorWidget(props: WidgetProps) {
    // Two components, not one with a branch: switching the source kind must not
    // change the hook order.
    return props.config.options?.sourceKind === 'tab' ? <TabMirror {...props} /> : <WidgetMirror {...props} />;
}

function WidgetMirror({ config, editMode, onLastChange }: WidgetProps) {
    const layouts = useDashboardStore((s) => s.layouts);
    const updateWidget = useDashboardStore((s) => s.updateWidget);
    const t = useT();

    const targetId = config.options?.targetWidgetId as string | undefined;

    // Resolve the source live from the whole dashboard (every layout/section/tab).
    // Done before the early returns below so the hook order stays stable.
    const allWidgets: WidgetConfig[] = layouts.flatMap((l) =>
        l.sections.flatMap((sec) => sec.tabs.flatMap((t) => t.widgets)),
    );
    const target = targetId && targetId !== config.id ? allWidgets.find((w) => w.id === targetId) : undefined;
    // The body gets the mirror's own auto-height choice (#1041): unset follows the
    // source, otherwise on/off for the mirror alone. Its height reports under the
    // mirror's id (ContentAutoHeightIdContext), never over the source's.
    const mirrorAuto = config.options?.autoHeight;
    // Header options the mirror set itself (#1042) lie on top of the source's.
    const shownTarget = useMemo(() => {
        if (!target || target.type === 'mirror') return target;
        const headed = withMirrorHead(target, config);
        return { ...headed, options: { ...headed.options, autoHeight: mirrorAutoHeight(mirrorAuto, target) } };
    }, [target, mirrorAuto, config]);

    if (!targetId) {
        return editMode ? (
            <Notice icon={<CopyPlus size={22} />} title={t('mirror.pickWidget')} detail={t('mirror.pickWidgetHint')} />
        ) : (
            <div className="h-full w-full" />
        );
    }

    // Self-reference guard — a mirror pointing at itself would recurse forever.
    if (targetId === config.id) {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title={t('mirror.self')}
            />
        );
    }

    if (!target) {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title={t('mirror.widgetGone')}
                detail={targetId}
            />
        );
    }

    // Chain guard — spiegeln eines Spiegels würde Zyklen erlauben.
    if (target.type === 'mirror') {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title={t('mirror.chain')}
            />
        );
    }

    // Take the source's content but keep the mirror's own placement; option edits
    // go back to the source — never the whole config, that would clobber its gridPos.
    return (
        <ContentAutoHeightIdContext.Provider value={config.id}>
            <EmbeddedWidget
                target={shownTarget ?? target}
                gridPos={config.gridPos}
                // The body saw the mirror's autoHeight and header options — the source keeps its own.
                onOptionsChange={(options) => {
                    const next = { ...stripMirrorHead(options, target, config) };
                    if (target.options && 'autoHeight' in target.options) next.autoHeight = target.options.autoHeight;
                    else delete next.autoHeight;
                    updateWidget(target.id, { options: next });
                }}
                // Let the mirror's frame overlay show the source's last-change
                // for sources that self-report it (e.g. calendar).
                onLastChange={onLastChange}
                unknownType={
                    <Notice icon={<AlertTriangle size={22} />} title={t('mirror.unknownType', { type: target.type })} />
                }
            />
        </ContentAutoHeightIdContext.Provider>
    );
}
