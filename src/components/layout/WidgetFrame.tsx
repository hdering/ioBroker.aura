import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, X, Palette } from 'lucide-react';
import type { WidgetConfig, WidgetLayout } from '../../types';
import { SwitchWidget } from '../widgets/SwitchWidget';
import { ValueWidget } from '../widgets/ValueWidget';
import { DimmerWidget } from '../widgets/DimmerWidget';
import { ThermostatWidget } from '../widgets/ThermostatWidget';
import { ChartWidget } from '../widgets/ChartWidget';
import { ListWidget } from '../widgets/ListWidget';

const WIDGET_MAP = {
  switch: SwitchWidget,
  value: ValueWidget,
  dimmer: DimmerWidget,
  thermostat: ThermostatWidget,
  chart: ChartWidget,
  list: ListWidget,
};

const LAYOUTS: { id: WidgetLayout; label: string }[] = [
  { id: 'default', label: 'Standard' },
  { id: 'card', label: 'Karte' },
  { id: 'compact', label: 'Kompakt' },
  { id: 'minimal', label: 'Minimal' },
];

const STYLE_FIELDS: { key: string; label: string; type: 'color' | 'text' }[] = [
  { key: 'bg', label: 'Hintergrund', type: 'color' },
  { key: 'accent', label: 'Akzentfarbe', type: 'color' },
  { key: 'textPrimary', label: 'Text', type: 'color' },
  { key: 'textSecondary', label: 'Text sekundär', type: 'color' },
  { key: 'radius', label: 'Eckenradius', type: 'text' },
];

interface WidgetFrameProps {
  config: WidgetConfig;
  editMode: boolean;
  onRemove: (id: string) => void;
  onConfigChange: (config: WidgetConfig) => void;
}

// Dropdown als Portal – rendert außerhalb des Grid-Containers
function PortalDropdown({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      className="fixed z-[9999] rounded-lg shadow-2xl"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)', background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function WidgetFrame({ config, editMode, onRemove, onConfigChange }: WidgetFrameProps) {
  const [openPanel, setOpenPanel] = useState<'layout' | 'style' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const layoutBtnRef = useRef<HTMLButtonElement>(null);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const Widget = WIDGET_MAP[config.type];
  const currentLayout = config.layout ?? 'default';
  const overrides = config.options?.styleOverride as Record<string, string> | undefined;

  const cssOverride = overrides
    ? (Object.fromEntries(
        Object.entries({
          '--widget-bg': overrides.bg,
          '--widget-border': overrides.border,
          '--widget-radius': overrides.radius,
          '--text-primary': overrides.textPrimary,
          '--text-secondary': overrides.textSecondary,
          '--accent': overrides.accent,
        }).filter(([, v]) => v !== undefined && v !== ''),
      ) as React.CSSProperties)
    : {};

  // Verhindert Drag bei Klick auf Controls
  const stopDrag = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  return (
    <div
      style={{
        background: 'var(--widget-bg)',
        borderRadius: 'var(--widget-radius)',
        boxShadow: 'var(--widget-shadow)',
        borderWidth: 'var(--widget-border-width)',
        borderStyle: 'solid',
        borderColor: 'var(--widget-border)',
        ...cssOverride,
      }}
      className={`relative h-full p-4 transition-all overflow-visible ${editMode ? 'ring-2 ring-accent/40' : ''}`}
    >
      {editMode && (
        <div
          className="nodrag absolute top-1.5 right-1.5 flex gap-1 z-10"
          onMouseDown={stopDrag}
          onPointerDown={stopDrag}
        >
          {/* Layout-Picker */}
          <button
            ref={layoutBtnRef}
            onClick={() => { setOpenPanel(openPanel === 'layout' ? null : 'layout'); setConfirmDelete(false); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 text-xs font-bold"
            style={{ background: openPanel === 'layout' ? 'var(--accent)' : 'var(--app-bg)', color: openPanel === 'layout' ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title="Layout wählen"
          >
            <LayoutGrid size={13} />
          </button>

          {/* Style Override */}
          <button
            ref={styleBtnRef}
            onClick={() => { setOpenPanel(openPanel === 'style' ? null : 'style'); setConfirmDelete(false); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80"
            style={{ background: openPanel === 'style' ? 'var(--accent)' : 'var(--app-bg)', color: openPanel === 'style' ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title="Stil anpassen"
          >
            <Palette size={13} />
          </button>

          {/* Löschen */}
          {confirmDelete ? (
            <>
              <button onClick={() => onRemove(config.id)}
                className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                style={{ background: 'var(--accent-red)' }}>Löschen</button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-2 h-7 text-xs rounded-lg hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>✕</button>
            </>
          ) : (
            <button
              onClick={() => { setConfirmDelete(true); setOpenPanel(null); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {editMode && currentLayout !== 'default' && (
        <div className="nodrag absolute bottom-1.5 left-2 text-[10px] pointer-events-none opacity-40" style={{ color: 'var(--text-secondary)' }}>
          {currentLayout}
        </div>
      )}

      <Widget config={config} editMode={editMode} onConfigChange={onConfigChange} />

      {/* Layout Dropdown Portal */}
      {openPanel === 'layout' && layoutBtnRef.current && (
        <PortalDropdown anchorRef={layoutBtnRef as React.RefObject<HTMLElement>} onClose={() => setOpenPanel(null)}>
          <div className="p-1.5 flex flex-col gap-0.5 min-w-[110px]">
            {LAYOUTS.map((l) => (
              <button key={l.id}
                onClick={() => { onConfigChange({ ...config, layout: l.id }); setOpenPanel(null); }}
                className="px-3 py-2 text-sm text-left rounded-md transition-opacity hover:opacity-80 flex items-center justify-between gap-4"
                style={{ background: currentLayout === l.id ? 'var(--accent)22' : 'transparent', color: currentLayout === l.id ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {l.label}
                {currentLayout === l.id && <span>✓</span>}
              </button>
            ))}
          </div>
        </PortalDropdown>
      )}

      {/* Style Dropdown Portal */}
      {openPanel === 'style' && styleBtnRef.current && (
        <PortalDropdown anchorRef={styleBtnRef as React.RefObject<HTMLElement>} onClose={() => setOpenPanel(null)}>
          <div className="p-3 w-56" onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>Widget-Stil</p>
            <div className="space-y-2">
              {STYLE_FIELDS.map(({ key, label, type }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs w-24 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                  {type === 'color' ? (
                    <div className="flex gap-1 flex-1">
                      <input type="color" value={overrides?.[key] ?? '#3b82f6'}
                        onChange={(e) => onConfigChange({ ...config, options: { ...config.options, styleOverride: { ...overrides, [key]: e.target.value } } })}
                        className="w-7 h-6 rounded cursor-pointer border-0 p-0 shrink-0" />
                      <input type="text" value={overrides?.[key] ?? ''}
                        onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                        placeholder="auto"
                        className="flex-1 text-xs rounded px-1.5 py-1 min-w-0 focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                    </div>
                  ) : (
                    <input type="text" value={overrides?.[key] ?? ''}
                      onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                      placeholder="auto"
                      className="flex-1 text-xs rounded px-1.5 py-1 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  )}
                </div>
              ))}
            </div>
            {overrides && Object.keys(overrides).length > 0 && (
              <button
                onClick={() => { const { styleOverride: _, ...rest } = config.options ?? {}; onConfigChange({ ...config, options: rest }); }}
                className="w-full mt-3 py-1.5 text-xs rounded-md hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                Zurücksetzen
              </button>
            )}
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
