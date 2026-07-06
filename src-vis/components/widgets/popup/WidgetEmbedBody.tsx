import { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WidgetConfig, ClickAction } from '../../../types';
import { getWidgetMap } from '../widgetMap';
import { useDashboardStore } from '../../../store/dashboardStore';

interface Props {
    widget: WidgetConfig;
    action: Extract<ClickAction, { kind: 'popup-widget' }>;
    allWidgets: WidgetConfig[];
}

export function WidgetEmbedBody({ widget, action, allWidgets }: Props) {
    const updateWidget = useDashboardStore((s) => s.updateWidget);
    const targetId = action.widgetId;
    const target: WidgetConfig = targetId ? (allWidgets.find((w) => w.id === targetId) ?? widget) : widget;

    if (targetId && !allWidgets.find((w) => w.id === targetId)) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
                <span className="text-sm">Ziel-Widget existiert nicht mehr</span>
                <span className="text-xs opacity-60 font-mono">{targetId}</span>
            </div>
        );
    }

    const wm = getWidgetMap();
    const Widget = wm[target.type as keyof typeof wm];

    if (!Widget) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} />
                <span className="text-sm">Unbekannter Widget-Typ: {target.type}</span>
            </div>
        );
    }

    const embedConfig: WidgetConfig = {
        ...target,
        gridPos: { x: 0, y: 0, w: 6, h: 6 },
    };

    return (
        <div
            style={{
                width: 'min(80vw, 500px)',
                height: 'min(70vh, 500px)',
                padding: 16,
                background: 'var(--widget-bg)',
                borderRadius: 'var(--widget-radius)',
                border: '1px solid var(--app-border)',
                overflow: 'auto',
            }}
        >
            <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
                <Widget
                    config={embedConfig}
                    editMode={false}
                    onConfigChange={(next) => {
                        // Persist only options — embedConfig overrides gridPos for the
                        // popup layout, so writing the whole config back would clobber
                        // the widget's real dashboard position.
                        updateWidget(target.id, { options: next.options });
                    }}
                />
            </Suspense>
        </div>
    );
}
