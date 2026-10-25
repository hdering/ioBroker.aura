/**
 * Draws another widget's body inside the current one — the mirror widget's
 * source and the chart of a custom-grid 'widget' cell (#838).
 *
 * The config handed in comes straight from the store (or from the cell), not
 * through a WidgetFrame, so its light/dark colour pairs (#689) and colour
 * bindings (#747) are resolved here; option edits the body makes are restored
 * to their stored form before they are passed on.
 */
import { Suspense, useMemo } from 'react';
import type { WidgetConfig } from '../../types';
import { getWidgetMap } from './widgetMap';
import { resolveDualDeep, restoreDualDeep } from '../../utils/dualColor';
import { useColorBindings } from '../../hooks/useColorBindings';
import { useIsDarkTheme } from '../../contexts/BrightnessContext';
import { useWidgetRefreshNonce } from '../../store/widgetRefreshStore';
import { useResolvedTitle } from './DynamicTitle';
import { HeaderSlotsContext } from '../layout/HeaderSlotsContext';

export function EmbeddedWidget({
    target,
    gridPos,
    onOptionsChange,
    onLastChange,
    unknownType,
    isolateHeader = false,
}: {
    target: WidgetConfig;
    /** Placement the body sees — the host's, never the source's real position. */
    gridPos: WidgetConfig['gridPos'];
    /** The body changed its options (already restored to their stored form); unset = ignored. */
    onOptionsChange?: (options: WidgetConfig['options']) => void;
    onLastChange?: (ts: number) => void;
    /** Shown when the widget map has no component for the type. */
    unknownType: React.ReactNode;
    /**
     * Keep the host frame's header items out of the body's title row — a cell is not
     * the widget's header. The mirror leaves them on: there they are the mirror's own.
     */
    isolateHeader?: boolean;
}) {
    // `[[dp]]` in the title resolves at every render boundary (same as WidgetFrame).
    const resolvedTitle = useResolvedTitle(target.title ?? '');
    // The body follows the source's reload rules as well as the host frame's.
    const refreshNonce = useWidgetRefreshNonce(target.id);
    const dark = useIsDarkTheme();
    const dualTarget = useMemo(() => resolveDualDeep(target, dark), [target, dark]);
    const { value: bound, restore: restoreColorBindings } = useColorBindings(dualTarget);

    const wm = getWidgetMap();
    const Widget = wm[target.type as keyof typeof wm];
    if (!Widget) return <>{unknownType}</>;

    const shown: WidgetConfig = { ...(bound ?? target), title: resolvedTitle, gridPos };
    const widget = (
        <Widget
            key={`r${refreshNonce}`}
            config={shown}
            editMode={false}
            onConfigChange={(next) => {
                // restoreDualDeep: the body spreads the RESOLVED config, so without
                // it the other half of a light/dark pair would be lost (#689).
                onOptionsChange?.(restoreDualDeep(restoreColorBindings(next, target), target).options);
            }}
            onLastChange={onLastChange}
        />
    );
    return (
        <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
            {isolateHeader ? <HeaderSlotsContext.Provider value={null}>{widget}</HeaderSlotsContext.Provider> : widget}
        </Suspense>
    );
}
