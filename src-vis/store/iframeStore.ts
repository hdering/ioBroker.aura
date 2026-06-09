import { create } from 'zustand';

export interface IframeFullscreenData {
    url: string;
    sandboxAttr?: string;
    iframeKey: string;
    title: string;
    /** ID of the widget that triggered fullscreen – used to auto-close when switching tabs */
    widgetId: string;
}

interface IframeStore {
    fullscreen: IframeFullscreenData | null;
    setFullscreen: (data: IframeFullscreenData | null) => void;
}

export const useIframeStore = create<IframeStore>()((set) => ({
    fullscreen: null,
    setFullscreen: (data) => set({ fullscreen: data }),
}));
