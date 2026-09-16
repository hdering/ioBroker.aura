import { create } from 'zustand';

export interface IframeFullscreenData {
    url: string;
    sandboxAttr?: string;
    iframeKey: string;
    title: string;
    /** ID of the widget that triggered fullscreen – used to auto-close when switching tabs */
    widgetId: string;
    /** `color-scheme` the widget hands to its embedded page; undefined = inherit Aura's (#663) */
    colorScheme?: string;
}

interface IframeStore {
    fullscreen: IframeFullscreenData | null;
    setFullscreen: (data: IframeFullscreenData | null) => void;
}

export const useIframeStore = create<IframeStore>()((set) => ({
    fullscreen: null,
    setFullscreen: (data) => set({ fullscreen: data }),
}));
