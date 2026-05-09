import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import { Plus, Trash2, Check, Pencil, Layers, RotateCcw } from 'lucide-react';
import { usePopupConfigStore, BUILTIN_VIEW_IDS, BUILTIN_VIEWS } from '../../store/popupConfigStore';
import { WIDGET_REGISTRY } from '../../widgetRegistry';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import type { WidgetLayout } from '../../types';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
};
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

// ── Layout labels ─────────────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<string, string> = {
  default: 'Standard', card: 'Karte', compact: 'Kompakt', minimal: 'Minimal',
  agenda: 'Agenda', flow: 'Flow', battery: 'Batterie', production: 'Produktion',
  consumption: 'Verbrauch', loadpoints: 'Ladepunkte', custom: 'Benutzerdef.', count: 'Anzahl',
};
const ALL_LAYOUTS = Object.keys(LAYOUT_LABELS) as WidgetLayout[];

// ── Layout multi-picker ───────────────────────────────────────────────────────

function LayoutPicker({ value, onChange }: { value: WidgetLayout[]; onChange: (v: WidgetLayout[]) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const themeVars = usePortalThemeVars();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((o) => !o);
  };

  const toggle = (layout: WidgetLayout) => {
    onChange(value.includes(layout) ? value.filter((l) => l !== layout) : [...value, layout]);
  };

  const label = value.length === 0
    ? 'Alle Layouts'
    : value.map((l) => LAYOUT_LABELS[l] ?? l).join(', ');

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-full text-left text-xs rounded-lg px-2.5 py-2 focus:outline-none truncate"
        style={{ background: 'var(--app-bg)', color: value.length ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--app-border)', minWidth: 0 }}
        title={label}
      >
        {label}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] rounded-xl p-2 grid grid-cols-2 gap-1"
          style={{ ...themeVars, top: pos.top, left: pos.left, background: 'var(--app-surface)', border: '1px solid var(--app-border)', minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}
        >
          <button
            className="col-span-2 text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80 font-medium"
            style={{ color: value.length === 0 ? 'var(--accent)' : 'var(--text-secondary)', background: value.length === 0 ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }}
            onClick={() => onChange([])}
          >
            Alle Layouts (kein Filter)
          </button>
          {ALL_LAYOUTS.map((l) => (
            <button
              key={l}
              onClick={() => toggle(l)}
              className="flex items-center gap-1.5 text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
              style={{ background: value.includes(l) ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: value.includes(l) ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              <span className="w-3 h-3 rounded flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${value.includes(l) ? 'var(--accent)' : 'var(--app-border)'}`, background: value.includes(l) ? 'var(--accent)' : 'transparent' }}>
                {value.includes(l) && <Check size={8} strokeWidth={3} style={{ color: '#fff' }} />}
              </span>
              {LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── PopupView picker ──────────────────────────────────────────────────────────

function ViewSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const views = usePopupConfigStore((s) => s.views);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle}>
      <option value="">— keine View —</option>
      {views.map((v) => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
    </select>
  );
}

// ── Popup-Views section ───────────────────────────────────────────────────────

function PopupViewsSection() {
  const navigate = useNavigate();
  const isSuperAdmin = useSuperAdmin();
  const { views, addView, removeView, updateViewName, copyView, restoreBuiltin, deletedBuiltinIds } = usePopupConfigStore();

  const [newViewName, setNewViewName] = useState('');
  const [addingView, setAddingView] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAddView = () => {
    if (!newViewName.trim()) return;
    const id = addView(newViewName.trim());
    setNewViewName('');
    setAddingView(false);
    navigate(`/admin/popups/${id}`);
  };

  const commitName = (viewId: string) => {
    if (editingName.trim()) updateViewName(viewId, editingName.trim());
    setEditingNameId(null);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Popup-Views</h2>
        {!addingView && (
          <button
            onClick={() => { setAddingView(true); setNewViewName(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={13} /> View hinzufügen
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Add-view form */}
        {addingView && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
          >
            <input
              autoFocus
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddView(); if (e.key === 'Escape') setAddingView(false); }}
              placeholder="View-Name"
              className={inputCls}
              style={inputStyle}
            />
            <button
              onClick={handleAddView}
              disabled={!newViewName.trim()}
              className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setAddingView(false)}
              className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            >
              ✕
            </button>
          </div>
        )}

        {views.length === 0 && !addingView && (
          <div className="px-4 py-6 text-xs text-center rounded-xl" style={{ color: 'var(--text-secondary)', background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
            Noch keine Popup-Views angelegt.
          </div>
        )}

        {views.map((view) => {
          const isBuiltin = BUILTIN_VIEW_IDS.has(view.id);
          return (
          <div
            key={view.id}
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
          >
            {editingNameId === view.id ? (
              <input
                autoFocus
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitName(view.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(view.id); if (e.key === 'Escape') setEditingNameId(null); }}
                className="text-xs rounded-lg px-2 py-1 flex-1 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              />
            ) : (
              <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                {view.name}
              </span>
            )}

            {isBuiltin && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium"
                style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}
              >
                Standard
              </span>
            )}

            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {view.widgets.length} Widget{view.widgets.length !== 1 ? 's' : ''}
            </span>

            {isBuiltin ? (
              <>
                {isSuperAdmin && (
                  <button
                    onClick={() => navigate(`/admin/popups/${view.id}`)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                    title="Standard-View bearbeiten"
                  >
                    <Layers size={11} /> Bearbeiten
                  </button>
                )}
                <button
                  onClick={() => { const id = copyView(view.id); navigate(`/admin/popups/${id}`); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                  style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                  title="Als Kopie bearbeiten"
                >
                  <Plus size={11} /> Kopieren
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate(`/admin/popups/${view.id}`)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                  style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                  title="View bearbeiten"
                >
                  <Layers size={11} /> Bearbeiten
                </button>
                <button
                  onClick={() => { setEditingNameId(view.id); setEditingName(view.name); }}
                  className="flex items-center justify-center w-6 h-6 shrink-0 rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Umbenennen"
                >
                  <Pencil size={11} />
                </button>
              </>
            )}
            {(!isBuiltin || isSuperAdmin) && (
              <button
                onClick={() => removeView(view.id)}
                className="flex items-center justify-center w-6 h-6 shrink-0 rounded hover:opacity-70 transition-opacity"
                style={{ color: 'var(--accent-red, #ef4444)' }}
                title="View löschen"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        );})}

        {/* Deleted builtins — only visible in super-admin mode */}
        {isSuperAdmin && deletedBuiltinIds.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] px-1" style={{ color: 'var(--text-secondary)' }}>Gelöschte Standard-Views</p>
            {deletedBuiltinIds.map((id) => {
              const builtin = BUILTIN_VIEWS.find((v) => v.id === id);
              if (!builtin) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl opacity-60"
                  style={{ background: 'var(--app-surface)', border: '1px dashed var(--app-border)' }}
                >
                  <span className="text-xs flex-1 truncate line-through" style={{ color: 'var(--text-secondary)' }}>
                    {builtin.name}
                  </span>
                  <button
                    onClick={() => restoreBuiltin(id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0 opacity-100"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                    title="Wiederherstellen"
                  >
                    <RotateCcw size={11} /> Wiederherstellen
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Type defaults section ─────────────────────────────────────────────────────

function TypeDefaultsSection() {
  const { typeDefaults, typeDefaultLayouts, setTypeDefault, setTypeDefaultLayouts, removeTypeDefault } = usePopupConfigStore();
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('');
  const [newViewId, setNewViewId] = useState('');

  const configuredTypes = Object.keys(typeDefaults);
  const availableTypes = WIDGET_REGISTRY.filter((m) => !configuredTypes.includes(m.type));

  const handleAdd = () => {
    if (!newType) return;
    setTypeDefault(newType, newViewId);
    setNewType('');
    setNewViewId('');
    setAdding(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Widget-Typ-Standards</h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setNewType(availableTypes[0]?.type ?? ''); setNewViewId(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={13} /> Typ-Standard hinzufügen
          </button>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
        <div
          className="grid gap-3 px-4 py-2 text-[11px] font-medium"
          style={{ gridTemplateColumns: '130px 1fr 1fr 28px', background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}
        >
          <span>Widget-Typ</span><span>Popup-View</span><span>Nur für Layouts</span><span />
        </div>

        {configuredTypes.length === 0 && !adding && (
          <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Noch keine Typ-Standards konfiguriert.
          </div>
        )}

        {configuredTypes.map((wType) => {
          const meta = WIDGET_REGISTRY.find((m) => m.type === wType);
          return (
            <div
              key={wType}
              className="grid items-center gap-3 px-4 py-2"
              style={{ gridTemplateColumns: '130px 1fr 1fr 28px', borderBottom: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{meta?.label ?? wType}</span>
              <ViewSelect value={typeDefaults[wType]} onChange={(v) => setTypeDefault(wType, v)} />
              <LayoutPicker
                value={typeDefaultLayouts[wType] ?? []}
                onChange={(v) => setTypeDefaultLayouts(wType, v)}
              />
              <button
                onClick={() => removeTypeDefault(wType)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                style={{ color: 'var(--accent-red, #ef4444)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {adding && (
          <div
            className="grid items-center gap-3 px-4 py-2"
            style={{ gridTemplateColumns: '130px 1fr 1fr 28px', background: 'var(--app-bg)' }}
          >
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">— Typ wählen —</option>
              {availableTypes.map((m) => <option key={m.type} value={m.type}>{m.label}</option>)}
            </select>
            <ViewSelect value={newViewId} onChange={setNewViewId} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>nach Speichern konfigurierbar</span>
            <button
              onClick={handleAdd}
              disabled={!newType}
              className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Check size={13} />
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] mt-2" style={labelStyle}>
        Gilt für alle Widgets des jeweiligen Typs ohne individuelle Klick-Aktion.
      </p>
    </section>
  );
}

// ── AdminPopups ───────────────────────────────────────────────────────────────

export function AdminPopups() {
  return (
    <div className="px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Popups</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Eigene Popup-Views erstellen und als Standard für Widget-Typen zuweisen
        </p>
      </div>
      <div className="grid grid-cols-2 gap-8 items-start">
        <PopupViewsSection />
        <TypeDefaultsSection />
      </div>
    </div>
  );
}
