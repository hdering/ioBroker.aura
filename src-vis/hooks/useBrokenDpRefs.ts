import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore } from '../store/popupConfigStore';
import { isDirty, subscribeDirty } from '../store/persistManager';
import { sendToDirect } from './useIoBroker';
import type { WidgetConfig } from '../types';

export interface BrokenRef {
  widgetId: string;
  widgetTitle: string;
  widgetType: string;
  location: string; // e.g. "Layout / Tab"
  field: string;    // e.g. "datapoint" or "options.targetDp"
  dp: string;
}

/** Collect all DP-bearing string fields in a widget config. Picks up the
 *  top-level `datapoint` plus any nested key ending in `Dp` or `Datapoint`
 *  inside options (handles TimerWidget events[].targetDp, light_*Dp, etc.). */
function collectRefs(widget: WidgetConfig, location: string): BrokenRef[] {
  const refs: BrokenRef[] = [];
  const push = (field: string, dp: string) => {
    if (typeof dp !== 'string') return;
    const trimmed = dp.trim();
    if (!trimmed) return;
    // Popup widgets use handlebars-style placeholders like "{{dp}}" that are
    // resolved at render time — they are not real ioBroker IDs and would
    // always show up as "missing" if we checked them.
    if (trimmed.includes('{{') || trimmed.includes('}}')) return;
    refs.push({
      widgetId: widget.id,
      widgetTitle: widget.title || '(ohne Titel)',
      widgetType: widget.type,
      location,
      field,
      dp: trimmed,
    });
  };

  if (typeof widget.datapoint === 'string' && widget.datapoint.trim()) {
    push('datapoint', widget.datapoint);
  }

  const walk = (obj: unknown, path: string): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const here = `${path}.${key}`;
      if (typeof val === 'string' && (key.endsWith('Dp') || key.endsWith('Datapoint'))) {
        push(here, val);
      } else if (val && typeof val === 'object') {
        walk(val, here);
      }
    }
  };
  walk(widget.options, 'options');

  return refs;
}

function collectAllRefs(): BrokenRef[] {
  const out: BrokenRef[] = [];
  const layouts = useDashboardStore.getState().layouts;
  for (const l of layouts) {
    for (const tab of l.tabs) {
      for (const w of tab.widgets) {
        out.push(...collectRefs(w, `${l.name} / ${tab.name}`));
      }
    }
  }
  const defs = useGroupDefsStore.getState().defs;
  for (const [defId, children] of Object.entries(defs)) {
    for (const w of children) {
      out.push(...collectRefs(w, `Group ${defId.slice(0, 8)}`));
    }
  }
  const views = usePopupConfigStore.getState().views;
  for (const v of views) {
    for (const w of v.widgets) {
      out.push(...collectRefs(w, `Popup ${v.name || v.id}`));
    }
  }
  return out;
}

export interface BrokenDpRefsState {
  broken: BrokenRef[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useBrokenDpRefs(): BrokenDpRefsState {
  const [broken, setBroken] = useState<BrokenRef[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const refs = collectAllRefs();
      const unique = Array.from(new Set(refs.map((r) => r.dp)));
      if (unique.length === 0) { setBroken([]); return; }
      const r = await sendToDirect<{ ok: boolean; missing?: string[] }>('aura.0', 'checkDps', { ids: unique });
      const missing = new Set<string>(
        r && typeof r === 'object' && 'missing' in r && Array.isArray((r as { missing?: string[] }).missing)
          ? (r as { missing: string[] }).missing
          : []
      );
      setBroken(refs.filter((ref) => missing.has(ref.dp)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const wasDirtyRef = useRef(isDirty());
  useEffect(() => {
    return subscribeDirty(() => {
      const now = isDirty();
      if (wasDirtyRef.current && !now) void refresh();
      wasDirtyRef.current = now;
    });
  }, [refresh]);

  return { broken, loading, refresh };
}
