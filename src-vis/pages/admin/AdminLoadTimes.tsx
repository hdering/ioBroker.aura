import { LoadTimesWidget } from '../../components/widgets/LoadTimesWidget';
import type { WidgetConfig } from '../../types';

// Throwaway config: the LoadTimesWidget only reads config.options for display
// defaults (all have fallbacks) and config.title for its header. Rendering it
// here with editMode=false makes it poll the backend continuously (live view).
// clientFilter defaults to 'all' because the frontend being measured usually
// runs in a *different* browser tab (different client) than this backend page.
const WIDGET_CONFIG: WidgetConfig = {
    id: 'admin-loadtimes',
    type: 'loadtimes',
    title: '',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 0, h: 0 },
    options: { clientFilter: 'all', view: 'breakdown', showTitle: false, showIcon: false },
};

export function AdminLoadTimes() {
    return (
        <div className="p-8 space-y-6">
            <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Ladezeiten
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Backend hier offen lassen und das Frontend in einem zweiten Browser-Tab bedienen — die Werte
                    aktualisieren sich hier live, ohne die Messung zu stören. Für die Pro-Widget-Details muss in den
                    Aura-Adapter-Einstellungen „Timing pro Widget aufzeichnen“ aktiv sein.
                </p>
            </div>

            <div
                className="rounded-xl p-4"
                style={{
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    height: 'calc(100vh - 200px)',
                    minHeight: 480,
                }}
            >
                <LoadTimesWidget config={WIDGET_CONFIG} editMode={false} onConfigChange={() => {}} />
            </div>
        </div>
    );
}
