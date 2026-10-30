/// <reference types="vite/client" />

import 'react';

declare global {
    /** Build time of this bundle (vite.config.ts `define`), e.g. "2026-10-30 16:40 UTC". */
    const __AURA_BUILD__: string;
}

// Default colours of the custom-CSS hooks (index.css): set inline as a variable, so a
// plain stylesheet rule on the class can still override them.
declare module 'react' {
    interface CSSProperties {
        '--aura-title-color'?: string;
        '--aura-icon-color'?: string;
        '--aura-header-item-color'?: string;
        '--aura-header-item-icon-color'?: string;
        // Explicit size of a custom-grid component cell (CustomGridView, #768).
        '--aura-cell-size'?: string;
        // Colour a custom-grid cell hands to its component (icons follow it, #768).
        '--aura-cell-color'?: string;
    }
}
