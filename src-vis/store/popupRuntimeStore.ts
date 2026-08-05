import { create } from 'zustand';
import type { ClickAction, WidgetConfig } from '../types';

/**
 * The single runtime slot for popups that are *not* opened by clicking a widget:
 * datapoint triggers (Admin → Popups) and the `popup.open` datapoints.
 *
 * Deliberately one slot only. Two triggers firing in quick succession would
 * otherwise stack overlays on top of each other with no way to tell them apart;
 * the newer one simply replaces the older ("last wins").
 *
 * Not persisted — this is transient UI state.
 */
export interface ActivePopup {
    /** Identifies the opener (trigger id, or 'dp:<state id>'); used for targeted closing. */
    key: string;
    /** Headless host config — carries popupTitle / popupWidth / popupAutoCloseSec / `{{dp}}` context. */
    widget: WidgetConfig;
    action: ClickAction;
    titleOverride?: string;
}

interface PopupRuntimeState {
    active: ActivePopup | null;
    openPopup: (popup: ActivePopup) => void;
    /** Close the active popup. With `key`, only when that opener owns it. */
    closePopup: (key?: string) => void;
}

export const usePopupRuntimeStore = create<PopupRuntimeState>()((set) => ({
    active: null,
    openPopup: (popup) => set({ active: popup }),
    closePopup: (key) => set((s) => (!key || s.active?.key === key ? { active: null } : s)),
}));
