import { useState } from 'react';
import {
  Trash2, Newspaper, Leaf, Recycle, Package, ShoppingBag,
  GlassWater, Wine, Archive, Scissors, Flame, Battery,
  TreeDeciduous, Truck, type LucideIcon,
} from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { DatapointPicker } from '../config/DatapointPicker';
import type { WidgetProps, WidgetConfig } from '../../types';

// ── Icon registry ──────────────────────────────────────────────────────────

export const TRASH_ICON_OPTIONS: { name: string; label: string }[] = [
  { name: 'Trash2',        label: 'Restmüll' },
  { name: 'Newspaper',     label: 'Papier' },
  { name: 'Archive',       label: 'Altpapier / Pappe' },
  { name: 'Leaf',          label: 'Bio / Grünschnitt' },
  { name: 'TreeDeciduous', label: 'Grünschnitt' },
  { name: 'Scissors',      label: 'Grünschnitt (Scheren)' },
  { name: 'Recycle',       label: 'Recycling' },
  { name: 'Package',       label: 'Verpackung / Pappe' },
  { name: 'ShoppingBag',   label: 'Gelber Sack' },
  { name: 'GlassWater',    label: 'Glas (hell)' },
  { name: 'Wine',          label: 'Glas (dunkel)' },
  { name: 'Battery',       label: 'Batterien / Elektro' },
  { name: 'Flame',         label: 'Sondermüll' },
  { name: 'Truck',         label: 'Sperrmüll' },
];

const ICON_MAP: Record<string, LucideIcon> = {
  Trash2, Newspaper, Archive, Leaf, TreeDeciduous, Scissors,
  Recycle, Package, ShoppingBag, GlassWater, Wine,
  Battery, Flame, Truck,
};

// ── Data model ─────────────────────────────────────────────────────────────

export interface TrashBin {
  id:         string;
  name:       string;
  icon:       string;
  color:      string;
  datapoint:  string;
  /** Hide icon when the datapoint value equals this state */
  hideWhen:   'true' | 'false' | 'never';
}

// ── BinDisplay – reads ONE datapoint per instance ─────────────────────────

function BinDisplay({ bin, size }: { bin: TrashBin; size: number }) {
  const { value } = useDatapoint(bin.datapoint);
  const active = value === true || value === 'true' || value === '1' || value === 1;

  if (bin.hideWhen === 'true'  &&  active) return null;
  if (bin.hideWhen === 'false' && !active) return null;

  const Icon    = ICON_MAP[bin.icon] ?? Trash2;
  const dimmed  = bin.hideWhen === 'never' && !active;
  const lblSize = size <= 44 ? 9 : size <= 56 ? 10 : 11;
  // Icon size must be an integer – fractional SVG dimensions cause blurriness
  const iconPx  = Math.round(size / 2);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width:      size,
          height:     size,
          background: dimmed ? 'transparent' : bin.color,
          border:     `2.5px solid ${bin.color}`,
        }}
      >
        <Icon size={iconPx} color={dimmed ? bin.color : '#ffffff'} strokeWidth={2} />
      </div>
      {bin.name && (
        <span
          className="text-center leading-tight"
          style={{
            fontSize:  lblSize,
            color:     'var(--text-secondary)',
            maxWidth:  size + 8,
            overflow:  'hidden',
            display:   '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          } as React.CSSProperties}
        >
          {bin.name}
        </span>
      )}
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

export function TrashWidget({ config }: WidgetProps) {
  const bins: TrashBin[] = (config.options?.bins as TrashBin[]) ?? [];

  if (bins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <Truck size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          {config.title || 'Müllabfuhr'}
          <br />
          <span className="text-[10px] opacity-60">Keine Tonnen konfiguriert</span>
        </p>
      </div>
    );
  }

  const iconSize = bins.length <= 2 ? 72 : bins.length <= 4 ? 58 : 44;

  return (
    <div className="flex flex-col h-full">
      {config.title && !config.options?.hideTitle && (
        <p className="text-xs mb-2 truncate shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {config.title}
        </p>
      )}
      <div className="flex-1 flex flex-wrap items-center justify-center gap-4 content-center min-h-0">
        {bins.map((bin) => (
          <BinDisplay key={bin.id} bin={bin} size={iconSize} />
        ))}
      </div>
    </div>
  );
}

// ── Config component ───────────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#6b7280', '#3b82f6', '#22c55e', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16',
];

export function TrashConfig({
  config,
  onConfigChange,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
}) {
  const [pickerBinId, setPickerBinId] = useState<string | null>(null);

  const bins: TrashBin[] = (config.options?.bins as TrashBin[]) ?? [];

  const setBins = (newBins: TrashBin[]) =>
    onConfigChange({ ...config, options: { ...(config.options ?? {}), bins: newBins } });

  const addBin = () => {
    const color = DEFAULT_COLORS[bins.length % DEFAULT_COLORS.length];
    setBins([
      ...bins,
      {
        id:        `bin-${Date.now()}`,
        name:      '',
        icon:      'Trash2',
        color,
        datapoint: '',
        hideWhen:  'false',
      },
    ]);
  };

  const updateBin = (id: string, patch: Partial<TrashBin>) =>
    setBins(bins.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeBin = (id: string) =>
    setBins(bins.filter((b) => b.id !== id));

  const moveBin = (id: string, dir: -1 | 1) => {
    const idx = bins.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= bins.length) return;
    const updated = [...bins];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    setBins(updated);
  };

  const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
  const iSty = {
    background: 'var(--app-bg)',
    color:      'var(--text-primary)',
    border:     '1px solid var(--app-border)',
  };

  return (
    <>
      {/* DatapointPicker portal */}
      {pickerBinId && (
        <DatapointPicker
          currentValue={bins.find((b) => b.id === pickerBinId)?.datapoint ?? ''}
          onSelect={(dp) => { updateBin(pickerBinId, { datapoint: dp }); setPickerBinId(null); }}
          onClose={() => setPickerBinId(null)}
        />
      )}

      <div className="space-y-3">
        {bins.map((bin, idx) => {
          const Icon = ICON_MAP[bin.icon] ?? Trash2;
          return (
            <div key={bin.id} className="rounded-xl p-3 space-y-3"
              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>

              {/* Header row: preview + name + reorder + remove */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${bin.color}22`, border: `2px solid ${bin.color}88` }}>
                  <Icon size={16} color={bin.color} strokeWidth={1.5} />
                </div>
                <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                  {bin.name || `Tonne ${idx + 1}`}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveBin(bin.id, -1)} disabled={idx === 0}
                    className="text-[11px] w-5 h-5 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-secondary)', background: 'var(--widget-bg)', border: '1px solid var(--app-border)', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveBin(bin.id, 1)} disabled={idx === bins.length - 1}
                    className="text-[11px] w-5 h-5 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-secondary)', background: 'var(--widget-bg)', border: '1px solid var(--app-border)', opacity: idx === bins.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => removeBin(bin.id)}
                    className="text-[11px] w-5 h-5 flex items-center justify-center rounded"
                    style={{ color: 'var(--text-secondary)', background: 'var(--widget-bg)', border: '1px solid var(--app-border)' }}>×</button>
                </div>
              </div>

              {/* Bezeichnung */}
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bezeichnung</label>
                <input type="text" value={bin.name}
                  onChange={(e) => updateBin(bin.id, { name: e.target.value })}
                  placeholder="z.B. Restmüll"
                  className={iCls} style={iSty} />
              </div>

              {/* Icon picker */}
              <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Icon</label>
                <div className="grid grid-cols-7 gap-1">
                  {TRASH_ICON_OPTIONS.map((opt) => {
                    const Ic       = ICON_MAP[opt.name] ?? Trash2;
                    const selected = bin.icon === opt.name;
                    return (
                      <button key={opt.name} title={opt.label}
                        onClick={() => updateBin(bin.id, { icon: opt.name })}
                        className="aspect-square flex items-center justify-center rounded-lg transition-colors"
                        style={{
                          background: selected ? `${bin.color}30` : 'var(--widget-bg)',
                          border:     selected ? `2px solid ${bin.color}` : '1px solid var(--app-border)',
                        }}>
                        <Ic size={15} color={selected ? bin.color : 'var(--text-secondary)'} strokeWidth={1.5} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Farbe */}
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Farbe</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={bin.color}
                    onChange={(e) => updateBin(bin.id, { color: e.target.value })}
                    className="w-9 h-8 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '2px' }} />
                  <input type="text" value={bin.color}
                    onChange={(e) => updateBin(bin.id, { color: e.target.value })}
                    placeholder="#6b7280"
                    className={`flex-1 ${iCls} font-mono`} style={iSty} />
                </div>
              </div>

              {/* Datenpunkt */}
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Datenpunkt (true/false)</label>
                <div className="flex gap-1.5">
                  <input type="text" value={bin.datapoint}
                    onChange={(e) => updateBin(bin.id, { datapoint: e.target.value })}
                    placeholder="z.B. trashschedule.0.type1.active"
                    className={`flex-1 ${iCls} font-mono min-w-0`} style={iSty} />
                  <button onClick={() => setPickerBinId(bin.id)}
                    className="px-2 rounded-lg shrink-0 hover:opacity-80 text-[11px]"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                    ⊕
                  </button>
                </div>
              </div>

              {/* Ausblenden wenn */}
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Icon ausblenden wenn Wert ist</label>
                <select value={bin.hideWhen}
                  onChange={(e) => updateBin(bin.id, { hideWhen: e.target.value as TrashBin['hideWhen'] })}
                  className={iCls} style={{ ...iSty, cursor: 'pointer' }}>
                  <option value="false">false — anzeigen wenn aktiv (Abholungstag)</option>
                  <option value="true">true — anzeigen wenn inaktiv</option>
                  <option value="never">Nie — immer anzeigen (gedimmt wenn inaktiv)</option>
                </select>
              </div>
            </div>
          );
        })}

        <button onClick={addBin}
          className="w-full text-[11px] py-2 rounded-xl transition-colors hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
          + Tonne / Gelber Sack hinzufügen
        </button>
      </div>
    </>
  );
}
