/**
 * Build-time feature flags.
 *
 * Gate in-progress features here so their code can live on `main` (and in the
 * committed `www/` build) without being reachable by end users.
 *
 * A flag that is `import.meta.env.DEV || <opt-in>` is visible in `npm run dev`
 * but stays hidden in the production build shipped to users. When the feature
 * is ready to release, hard-set the flag to `true` and rebuild.
 */
export const FEATURES = {
    /**
     * Widget-Designer — parked. Hidden everywhere, including `npm run dev`.
     * Set back to `import.meta.env.DEV` to continue working on it.
     */
    widgetDesigner: false,
} as const;
