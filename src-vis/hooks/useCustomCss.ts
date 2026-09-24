import { useEffect, useRef } from 'react';
import { useEffectiveSettings } from './useEffectiveSettings';
import { useConfigStore } from '../store/configStore';
import { scopeCss } from '../utils/scopeCss';

/** Marks the editor's dashboard preview — the only place custom CSS may style there (#710). */
export const EDITOR_CSS_SCOPE_ATTR = 'data-aura-css-scope';

/**
 * Apply user-defined custom CSS to the page.
 *
 * @param layoutId  Active layout for per-layout overrides.
 * @param sectionId Active section for per-section overrides.
 * @param inEditor  When true, the caller is the admin editor — execution is
 *                  gated additionally on `customCSSInEditor`, and the CSS is
 *                  confined to the preview (`EDITOR_CSS_SCOPE_ATTR`) so it
 *                  doesn't restyle the admin UI around it.
 */
export function useCustomCss(layoutId: string | undefined, sectionId: string | undefined, inEditor: boolean) {
    const effective = useEffectiveSettings(layoutId, sectionId);
    const frontend = useConfigStore((s) => s.frontend);
    const styleRef = useRef<HTMLStyleElement | null>(null);

    useEffect(() => {
        let el = document.getElementById('aura-custom-css') as HTMLStyleElement | null;
        if (!el) {
            el = document.createElement('style');
            el.id = 'aura-custom-css';
            document.head.appendChild(el);
        }
        styleRef.current = el;
        return () => {
            const node = styleRef.current;
            if (node && node.parentNode) node.parentNode.removeChild(node);
            styleRef.current = null;
        };
    }, []);

    const css = effective.customCSS ?? frontend.customCSS ?? '';
    const enabled = effective.customCSSEnabled ?? true;
    const inEditorAllowed = effective.customCSSInEditor ?? false;

    useEffect(() => {
        if (!styleRef.current) return;
        const active = enabled && (!inEditor || inEditorAllowed);
        if (!active) styleRef.current.textContent = '';
        else styleRef.current.textContent = inEditor ? scopeCss(css, `[${EDITOR_CSS_SCOPE_ATTR}]`) : css;
    }, [css, enabled, inEditor, inEditorAllowed]);
}
