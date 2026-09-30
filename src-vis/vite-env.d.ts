/// <reference types="vite/client" />

import 'react';

// Default colours of the custom-CSS hooks (index.css): set inline as a variable, so a
// plain stylesheet rule on the class can still override them.
declare module 'react' {
    interface CSSProperties {
        '--aura-title-color'?: string;
        '--aura-icon-color'?: string;
        '--aura-header-item-color'?: string;
        '--aura-header-item-icon-color'?: string;
    }
}
