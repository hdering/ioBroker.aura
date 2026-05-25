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

const IMPORT_RE = /^@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;?\s*$/;

function parseImports(code: string): { urls: string[]; rest: string } {
  const urls: string[] = [];
  const lines = code.split('\n');
  const restLines = lines.slice();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    const m = trimmed.match(IMPORT_RE);
    if (!m) break;
    urls.push(m[1]);
    restLines[i] = '';
  }
  return { urls, rest: restLines.join('\n') };
}

const importedScripts = new Map<string, { el: HTMLScriptElement; ready: Promise<void> }>();

function ensureScript(url: string): Promise<void> {
  const existing = importedScripts.get(url);
  if (existing) return existing.ready;
  const el = document.createElement('script');
  el.src = url;
  el.async = false;
  el.dataset.auraImport = url;
  const ready = new Promise<void>((resolve) => {
    el.onload = () => resolve();
    el.onerror = () => {
      // eslint-disable-next-line no-console
      console.error('[aura] @import failed:', url);
      resolve();
    };
  });
  document.head.appendChild(el);
  importedScripts.set(url, { el, ready });
  return ready;
}

function pruneScripts(keep: Set<string>) {
  for (const [url, entry] of importedScripts) {
    if (keep.has(url)) continue;
    entry.el.remove();
    importedScripts.delete(url);
  }
}

/**
 * Evaluate user-defined custom JS. Uses indirect eval so function declarations
 * attach to window (so widget onClick="userFn(...)" handlers can resolve them).
 * Errors are caught and logged but do not break the host page.
 *
 * Supports `@import url('https://…');` (or `@import '…';`) directives at the top
 * of the code, mirroring CSS `@import` — listed URLs are loaded as classic
 * <script> tags in document.head before the rest of the code is evaluated.
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

    const { urls, rest } = parseImports(code);
    const wanted = new Set(urls);
    pruneScripts(wanted);

    let cancelled = false;
    Promise.all(urls.map(ensureScript)).then(() => {
      if (cancelled) return;
      if (!rest.trim()) return;
      try {
        // eslint-disable-next-line no-eval
        (0, eval)(rest);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[aura] custom JS error:', err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, enabled, inEditor, inEditorAllowed]);
}
