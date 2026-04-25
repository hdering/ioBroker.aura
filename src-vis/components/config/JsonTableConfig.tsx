import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import type { JsonColumnDef } from '../widgets/JsonTableWidget';
import { getStateDirect } from '../../hooks/useIoBroker';

interface Props {
  datapoint: string;
  options: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

const jCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const jSty: React.CSSProperties = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
      style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}>
      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ left: value ? '18px' : '2px' }} />
    </button>
  );
}

function parseHeadersFromRaw(raw: unknown): string[] | null {
  let data: unknown;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw as string); } catch { return null; }
  } else {
    data = raw;
  }
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
    return Object.keys(data[0] as object);
  }
  if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
    return (data[0] as unknown[]).map(String);
  }
  if (!Array.isArray(data) && typeof data === 'object' && 'headers' in (data as object)) {
    return ((data as { headers: unknown[] }).headers).map(String);
  }
  return null;
}

export function JsonTableConfig({ datapoint, options: o, onChange }: Props) {
  const set = (patch: Record<string, unknown>) => onChange(patch);

  const colDefs: JsonColumnDef[] = (o.columns as JsonColumnDef[] | undefined) ?? [];
  const setColDefs = (cols: JsonColumnDef[]) => set({ columns: cols });

  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(false);

  function boolOpt(key: string, def: boolean): boolean {
    return (o[key] as boolean) ?? def;
  }

  function toggleOpt(key: string, def: boolean) {
    set({ [key]: !boolOpt(key, def) });
  }

  async function loadFromDatapoint() {
    if (!datapoint) return;
    setLoading(true);
    try {
      const state = await getStateDirect(datapoint);
      const headers = parseHeadersFromRaw(state?.val);
      if (headers && headers.length > 0) {
        // Merge with existing colDefs: keep existing defs, add new keys
        const existingKeys = new Set(colDefs.map((c) => c.key));
        const newDefs: JsonColumnDef[] = [...colDefs];
        headers.forEach((h, i) => {
          if (!existingKeys.has(h)) {
            newDefs.push({ key: h, order: colDefs.length + i });
          }
        });
        // Re-assign order to match header sequence
        const orderedDefs = headers.map((h, i) => {
          const existing = newDefs.find((c) => c.key === h);
          return existing ? { ...existing, order: i } : { key: h, order: i };
        });
        setColDefs(orderedDefs);
      }
    } finally {
      setLoading(false);
    }
  }

  function addColumn() {
    const k = newKey.trim();
    if (!k || colDefs.some((c) => c.key === k)) return;
    setColDefs([...colDefs, { key: k, order: colDefs.length }]);
    setNewKey('');
  }

  function updateCol(idx: number, patch: Partial<JsonColumnDef>) {
    const updated = colDefs.map((c, i) => i === idx ? { ...c, ...patch } : c);
    setColDefs(updated);
  }

  function removeCol(idx: number) {
    setColDefs(colDefs.filter((_, i) => i !== idx));
  }

  function moveCol(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= colDefs.length) return;
    const arr = [...colDefs];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    // Update order values to match position
    setColDefs(arr.map((c, i) => ({ ...c, order: i })));
  }

  const firstColHeader = boolOpt('firstColHeader', false);

  return (
    <>
      {/* Auto-height */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Höhe automatisch anpassen</label>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Widget-Höhe folgt der Anzahl der Zeilen</p>
        </div>
        <Toggle value={boolOpt('autoHeight', false)} onToggle={() => toggleOpt('autoHeight', false)} />
      </div>

      {/* Search */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Suche anzeigen</label>
        <Toggle value={boolOpt('showSearch', false)} onToggle={() => toggleOpt('showSearch', false)} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Kopfzeile anzeigen</label>
        <Toggle value={boolOpt('showHeader', true)} onToggle={() => toggleOpt('showHeader', true)} />
      </div>
      {boolOpt('showHeader', true) && (
        <>
          <div className="flex items-center gap-2">
            <input type="color" value={(o.headerBg as string | undefined)?.startsWith('#') ? (o.headerBg as string) : '#6366f1'}
              onChange={(e) => set({ headerBg: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
            <div className="flex-1">
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Header-Hintergrund</label>
              <input type="text" value={(o.headerBg as string) ?? 'var(--accent)'}
                onChange={(e) => set({ headerBg: e.target.value || undefined })}
                placeholder="var(--accent)" className={jCls} style={jSty} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={(o.headerColor as string | undefined)?.startsWith('#') ? (o.headerColor as string) : '#ffffff'}
              onChange={(e) => set({ headerColor: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
            <div className="flex-1">
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Header-Textfarbe</label>
              <input type="text" value={(o.headerColor as string) ?? '#ffffff'}
                onChange={(e) => set({ headerColor: e.target.value || undefined })}
                placeholder="#ffffff" className={jCls} style={jSty} />
            </div>
          </div>
        </>
      )}

      {/* First column as label */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Erste Spalte als Bezeichnung</label>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Hebt die erste Spalte hervor</p>
        </div>
        <Toggle value={firstColHeader} onToggle={() => toggleOpt('firstColHeader', false)} />
      </div>
      {firstColHeader && (
        <>
          <div className="flex items-center gap-2">
            <input type="color" value={(o.firstColBg as string | undefined)?.startsWith('#') ? (o.firstColBg as string) : '#1e1e2e'}
              onChange={(e) => set({ firstColBg: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
            <div className="flex-1">
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bezeichnungsspalte Hintergrund</label>
              <input type="text" value={(o.firstColBg as string) ?? 'var(--app-bg)'}
                onChange={(e) => set({ firstColBg: e.target.value || undefined })}
                placeholder="var(--app-bg)" className={jCls} style={jSty} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={(o.firstColColor as string | undefined)?.startsWith('#') ? (o.firstColColor as string) : '#8b8b9e'}
              onChange={(e) => set({ firstColColor: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
            <div className="flex-1">
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bezeichnungsspalte Textfarbe</label>
              <input type="text" value={(o.firstColColor as string) ?? 'var(--text-secondary)'}
                onChange={(e) => set({ firstColColor: e.target.value || undefined })}
                placeholder="var(--text-secondary)" className={jCls} style={jSty} />
            </div>
          </div>
        </>
      )}

      {/* Striped rows */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Zebra-Streifen</label>
        <Toggle value={boolOpt('striped', true)} onToggle={() => toggleOpt('striped', true)} />
      </div>

      {/* Font size */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Schriftgröße (px)</label>
        <input type="number" min={8} max={20} value={(o.fontSize as number) ?? 12}
          onChange={(e) => set({ fontSize: Number(e.target.value) })}
          className={jCls} style={jSty} />
      </div>

      {/* ── Columns editor ── */}
      <div className="mt-1">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            Spalten ({colDefs.length === 0 ? 'auto' : colDefs.length})
          </label>
          <button onClick={loadFromDatapoint} disabled={!datapoint || loading}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-opacity disabled:opacity-40"
            style={{ background: 'var(--app-border)', color: 'var(--text-primary)' }}
            title="Spalten aus aktuellem Datenpunkt-Wert laden">
            <RefreshCw size={9} className={loading ? 'animate-spin' : ''} />
            Laden
          </button>
        </div>

        {colDefs.length === 0 && (
          <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
            Keine Spalten konfiguriert – Reihenfolge und Namen werden aus den JSON-Daten übernommen.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {colDefs.map((col, idx) => (
            <div key={col.key} className="rounded-lg p-2 flex flex-col gap-1.5"
              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              {/* Row 1: key + move + delete */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono flex-1 truncate" style={{ color: 'var(--text-secondary)' }}
                  title={col.key}>{col.key}</span>
                <button onClick={() => moveCol(idx, -1)} disabled={idx === 0}
                  className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                  style={{ color: 'var(--text-secondary)' }}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveCol(idx, 1)} disabled={idx === colDefs.length - 1}
                  className="p-0.5 rounded hover:opacity-70 disabled:opacity-25"
                  style={{ color: 'var(--text-secondary)' }}>
                  <ChevronDown size={12} />
                </button>
                <button onClick={() => removeCol(idx)}
                  className="p-0.5 rounded hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              {/* Row 2: label input */}
              <input type="text" value={col.label ?? ''}
                onChange={(e) => updateCol(idx, { label: e.target.value || undefined })}
                placeholder={`Anzeigename (Standard: ${col.key})`}
                className={jCls} style={jSty} />
              {/* Row 3: toggles */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Toggle value={col.html ?? false} onToggle={() => updateCol(idx, { html: !(col.html ?? false) })} />
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>HTML</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Toggle value={col.hidden ?? false} onToggle={() => updateCol(idx, { hidden: !(col.hidden ?? false) })} />
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Ausblenden</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Add column manually */}
        <div className="flex gap-1 mt-1.5">
          <input type="text" value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            placeholder="Spalten-Key (z.B. name)"
            className={jCls + ' flex-1'} style={jSty} />
          <button onClick={addColumn} disabled={!newKey.trim()}
            className="px-2 rounded-lg shrink-0 disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            <Plus size={13} />
          </button>
        </div>
      </div>
    </>
  );
}
