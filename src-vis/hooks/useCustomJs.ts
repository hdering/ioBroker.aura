import { useEffect } from 'react';
import { setStateDirect, getStateDirect, subscribeStateDirect } from './useIoBroker';
import { useEffectiveSettings } from './useEffectiveSettings';
import { useConfigStore } from '../store/configStore';

let auraInstalled = false;

function installAuraApi() {
  if (auraInstalled) return;
  auraInstalled = true;
  (window as unknown as { aura?: unknown }).aura = {
    setState: (id: string, val: boolean | number | string, ack = false) => setStateDirect(id, val, ack),
    getState: (id: string) => getStateDirect(id),
    subscribeState: (id: string, cb: (state: unknown) => void) => subscribeStateDirect(id, cb),
  };
}

/**
 * Evaluate user-defined custom JS. Uses indirect eval so function declarations
 * attach to window (so widget onClick="userFn(...)" handlers can resolve them).
 * Errors are caught and logged but do not break the host page.
 *
 * @param layoutId  Active layout for per-layout overrides.
 * @param inEditor  When true, the caller is the admin editor — execution is
 *                  gated additionally on `customJSInEditor`.
 */
export function useCustomJs(layoutId: string | undefined, inEditor: boolean) {
  const effective = useEffectiveSettings(layoutId);
  const frontend = useConfigStore((s) => s.frontend);

  useEffect(() => {
    installAuraApi();
  }, []);

  const code = effective.customJS ?? frontend.customJS ?? '';
  const enabled = effective.customJSEnabled ?? false;
  const inEditorAllowed = effective.customJSInEditor ?? false;

  useEffect(() => {
    if (!enabled || !code.trim()) return;
    if (inEditor && !inEditorAllowed) return;
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(code);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[aura] custom JS error:', err);
    }
  }, [code, enabled, inEditor, inEditorAllowed]);
}
