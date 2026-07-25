import { Suspense } from 'react';
import { AlertTriangle, CopyPlus } from 'lucide-react';
import type { WidgetConfig, WidgetProps } from '../../types';
import { getWidgetMap } from './widgetMap';
import { useDashboardStore } from '../../store/dashboardStore';

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
 * "Spiegel" widget — renders an existing widget (the source) a second time at
 * another position. It stores only the source's id in `options.targetWidgetId`
 * and resolves it live from the store on every render, so the mirror always
 * reflects the current state/config of the source (no copy, no drift).
 *
 * Mirrors the proven reference logic of WidgetEmbedBody: spread the target config
 * but keep the mirror's own gridPos, render the target's inner component, and
 * persist option edits back to the *source* id so the mirror never clobbers the
 * source's real dashboard position.
 */
export function MirrorWidget({ config, editMode }: WidgetProps) {
    const layouts = useDashboardStore((s) => s.layouts);
    const updateWidget = useDashboardStore((s) => s.updateWidget);

    const targetId = config.options?.targetWidgetId as string | undefined;

    if (!targetId) {
        return editMode ? (
            <Notice
                icon={<CopyPlus size={22} />}
                title="Quell-Widget im Editor wählen"
                detail="Optionen → Gespiegeltes Widget"
            />
        ) : (
            <div className="h-full w-full" />
        );
    }

    // Self-reference guard — a mirror pointing at itself would recurse forever.
    if (targetId === config.id) {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title="Spiegel kann sich nicht selbst spiegeln"
            />
        );
    }

    // Resolve the source live from the whole dashboard (every layout/section/tab).
    const allWidgets: WidgetConfig[] = layouts.flatMap((l) =>
        l.sections.flatMap((sec) => sec.tabs.flatMap((t) => t.widgets)),
    );
    const target = allWidgets.find((w) => w.id === targetId);

    if (!target) {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title="Quell-Widget existiert nicht mehr"
                detail={targetId}
            />
        );
    }

    // Chain guard — spiegeln eines Spiegels würde Zyklen erlauben.
    if (target.type === 'mirror') {
        return (
            <Notice
                icon={<AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />}
                title="Ein Spiegel kann keinen Spiegel spiegeln"
            />
        );
    }

    const wm = getWidgetMap();
    const Widget = wm[target.type as keyof typeof wm];

    if (!Widget) {
        return <Notice icon={<AlertTriangle size={22} />} title={`Unbekannter Widget-Typ: ${target.type}`} />;
    }

    // Take the source's content but keep the mirror's own placement.
    const mirroredConfig: WidgetConfig = { ...target, gridPos: config.gridPos };

    return (
        <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
            <Widget
                config={mirroredConfig}
                editMode={false}
                onConfigChange={(next) => {
                    // Persist only options — mirroredConfig overrides gridPos, so writing
                    // the whole config back would clobber the source's real position.
                    updateWidget(target.id, { options: next.options });
                }}
            />
        </Suspense>
    );
}
