import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { ClickAction, WidgetConfig } from '../types';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { useDashboardStore } from '../store/dashboardStore';
import { isInteractiveTarget } from '../utils/interactiveTargets';
import { resolveRowAction, type RowClickSetting, type RowPopupOptions } from '../utils/rowClickAction';
import { WidgetClickPopup } from '../components/widgets/popup/WidgetClickPopup';

/** Props a clickable row spreads onto its container element. */
export interface RowClickProps {
    onClick: (e: MouseEvent) => void;
    /** Keeps WidgetFrame from opening the widget-level popup on top of ours. */
    'data-no-popup': string;
}

interface OpenPopup {
    dpId: string;
    label: string;
    action: ClickAction;
}

/**
 * Row-level detail popups for the list widgets (issue #524).
 *
 * `row()` returns the click props for one entry - or null when the row resolves to
 * no action (explicitly switched off, or an unusable datapoint). `node` renders the
 * open popup and belongs at the end of the widget's JSX.
 *
 * The popup is fed a synthetic widget config whose `datapoint` is the clicked row's
 * datapoint. That is the whole trick: TabEmbedBody derives {{dp}} / {{parent}} /
 * {{name}} from it, so every existing built-in view works per row.
 */
export function useRowPopup(base: WidgetConfig, opts: RowPopupOptions, editMode: boolean) {
    const typeDefaults = usePopupConfigStore((s) => s.typeDefaults);
    const removedTypeDefaults = usePopupConfigStore((s) => s.removedBuiltinTypeDefaults);
    const [open, setOpen] = useState<OpenPopup | null>(null);

    const ctx = useMemo(() => ({ typeDefaults, removedTypeDefaults }), [typeDefaults, removedTypeDefaults]);

    /**
     * Resolved action for a row, or null when the row must not be clickable.
     * `override` is the per-entry setting of a static-list row; it wins over the
     * list-wide one whenever it is set.
     */
    const actionFor = (
        dpId: string,
        hint?: { role?: string; type?: string },
        override?: RowClickSetting,
    ): ClickAction | null => {
        if (editMode) return null;
        return resolveRowAction(dpId, override ?? opts.rowClickAction, ctx, hint);
    };

    const row = (
        dpId: string,
        label: string,
        hint?: { role?: string; type?: string },
        override?: RowClickSetting,
    ): RowClickProps | undefined => {
        const action = actionFor(dpId, hint, override);
        if (!action) return undefined;
        return {
            'data-no-popup': '',
            onClick: (e: MouseEvent) => {
                // A control inside the row (switch, slider, ...) owns its own click.
                if (isInteractiveTarget(e.target, e.currentTarget as HTMLElement)) return;
                e.stopPropagation();
                setOpen({ dpId, label, action });
            },
        };
    };

    const node: ReactNode = open ? (
        <WidgetClickPopup
            widget={
                {
                    ...base,
                    datapoint: open.dpId,
                    options: {
                        popupTitle: opts.rowPopupTitle,
                        popupWidth: opts.rowPopupWidth,
                        popupHeight: opts.rowPopupHeight,
                        popupAutoCloseSec: opts.rowPopupAutoCloseSec,
                    },
                } satisfies WidgetConfig
            }
            action={open.action}
            // Without an explicit title the popup shows the clicked row's name -
            // otherwise it would show the (shared) list widget title.
            titleOverride={opts.rowPopupTitle ? undefined : open.label}
            onClose={() => setOpen(null)}
            allWidgets={useDashboardStore
                .getState()
                .layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs.flatMap((t) => t.widgets)))}
        />
    ) : null;

    return { row, actionFor, node };
}
