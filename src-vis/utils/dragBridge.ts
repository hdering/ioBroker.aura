import type { WidgetConfig } from '../types';

export interface DragBridge {
    widget: WidgetConfig;
    remove: (id: string) => void;
}

let _current: DragBridge | null = null;

export function setDragBridge(b: DragBridge | null): void {
    _current = b;
}
export function getDragBridge(): DragBridge | null {
    return _current;
}

/**
 * Where a widget pulled out of a group (or panels) goes: the active tab of the
 * Dashboard that is in edit mode. Dashboard registers the step it performs when
 * such a widget is dropped on its scroller — append at the bottom, then `remove`
 * it from the source — so the grip on a child can run the very same step on a
 * plain click. Null outside the editor (frontend, admin previews): there the
 * grip stays drag-only.
 */
export type TabDropAccept = (widget: WidgetConfig, remove: (id: string) => void) => void;

let _tabDrop: TabDropAccept | null = null;

export function setTabDropAccept(fn: TabDropAccept | null): void {
    _tabDrop = fn;
}
export function getTabDropAccept(): TabDropAccept | null {
    return _tabDrop;
}
