import { useEffect, useRef } from 'react';
import { useEffectiveSettings } from './useEffectiveSettings';
import { useConfigStore } from '../store/configStore';

/**
 * Apply user-defined custom CSS to the page.
 *
 * @param layoutId  Active layout for per-layout overrides.
 * @param inEditor  When true, the caller is the admin editor — execution is
 *                  gated additionally on `customCSSInEditor`.
 */
export function useCustomCss(layoutId: string | undefined, inEditor: boolean) {
  const effective = useEffectiveSettings(layoutId);
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
    styleRef.current.textContent = active ? css : '';
  }, [css, enabled, inEditor, inEditorAllowed]);
}
