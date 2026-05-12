import { useEffect, useRef } from 'react';
import { version as bundledVersion } from '../../package.json';
import { useIoBroker, getObjectViewDirect } from './useIoBroker';

const RELOAD_DELAY_MS = 1500;

async function fetchAuraAdapterVersion(): Promise<string | null> {
  try {
    const result = await getObjectViewDirect(
      'instance',
      'system.adapter.aura.',
      'system.adapter.aura.香',
    );
    const row = result.rows[0];
    if (!row) return null;
    const common = (row.value as unknown as { common?: { version?: string } }).common;
    return common?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * On every (re-)connect, compare the bundled package.json version to the
 * version reported by the live aura adapter instance. If they diverge, the
 * served bundle is stale (adapter was upgraded) — reload the page so the
 * browser fetches the new assets.
 *
 * Skipped in dev: the dev bundle's version may legitimately differ from the
 * running adapter's installed version.
 */
export function useVersionGuard(): void {
  const { connected } = useIoBroker();
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!connected || reloadingRef.current) return;
    let cancelled = false;
    void (async () => {
      const live = await fetchAuraAdapterVersion();
      if (cancelled || !live) return;
      if (live === bundledVersion) return;
      reloadingRef.current = true;
      // eslint-disable-next-line no-console
      console.info(`[Aura] adapter version ${live} differs from bundle ${bundledVersion} — reloading`);
      setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    })();
    return () => { cancelled = true; };
  }, [connected]);
}
