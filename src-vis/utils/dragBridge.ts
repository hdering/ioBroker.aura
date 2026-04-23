import type { WidgetConfig } from '../types';

export interface DragBridge {
  widget: WidgetConfig;
  remove: (id: string) => void;
}

let _current: DragBridge | null = null;

export function setDragBridge(b: DragBridge | null): void { _current = b; }
export function getDragBridge(): DragBridge | null { return _current; }
