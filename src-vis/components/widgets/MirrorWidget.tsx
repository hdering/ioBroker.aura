import { AlertTriangle, CopyPlus } from 'lucide-react';
import type { WidgetConfig, WidgetProps } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { EmbeddedWidget } from './EmbeddedWidget';
import { TabMirror } from './TabMirror';
import { useT } from '../../i18n';

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
        <EmbeddedWidget
            target={target}
            gridPos={config.gridPos}
            onOptionsChange={(options) => updateWidget(target.id, { options })}
            // Let the mirror's frame overlay show the source's last-change
            // for sources that self-report it (e.g. calendar).
            onLastChange={onLastChange}
            unknownType={
                <Notice icon={<AlertTriangle size={22} />} title={t('mirror.unknownType', { type: target.type })} />
            }
        />
    );
}
