import { useState } from 'react';
import type { WidgetConfig, WidgetType } from '../../types';

interface AddWidgetDialogProps {
  onAdd: (config: WidgetConfig) => void;
  onClose: () => void;
}

const WIDGET_TYPES: { type: WidgetType; label: string; defaultW: number; defaultH: number }[] = [
  { type: 'switch', label: 'Schalter', defaultW: 2, defaultH: 2 },
  { type: 'value', label: 'Wert-Anzeige', defaultW: 2, defaultH: 2 },
  { type: 'dimmer', label: 'Dimmer', defaultW: 2, defaultH: 2 },
  { type: 'thermostat', label: 'Thermostat', defaultW: 2, defaultH: 2 },
  { type: 'chart', label: 'Diagramm', defaultW: 4, defaultH: 3 },
];

export function AddWidgetDialog({ onAdd, onClose }: AddWidgetDialogProps) {
  const [type, setType] = useState<WidgetType>('value');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [unit, setUnit] = useState('');

  const handleAdd = () => {
    if (!datapoint.trim()) return;
    const def = WIDGET_TYPES.find((w) => w.type === type)!;
    onAdd({
      id: `${type}-${Date.now()}`,
      type,
      title: title || def.label,
      datapoint: datapoint.trim(),
      gridPos: { x: 0, y: Infinity, w: def.defaultW, h: def.defaultH },
      options: unit ? { unit } : {},
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white font-bold text-lg">Widget hinzufügen</h2>

        <div className="space-y-1">
          <label className="text-gray-400 text-xs">Typ</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WidgetType)}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
          >
            {WIDGET_TYPES.map((w) => (
              <option key={w.type} value={w.type}>{w.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-gray-400 text-xs">Titel</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Wohnzimmer Licht"
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm placeholder-gray-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-gray-400 text-xs">Datenpunkt-ID *</label>
          <input
            value={datapoint}
            onChange={(e) => setDatapoint(e.target.value)}
            placeholder="z.B. system.adapter.admin.0.alive"
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm placeholder-gray-500"
          />
        </div>

        {(type === 'value' || type === 'chart') && (
          <div className="space-y-1">
            <label className="text-gray-400 text-xs">Einheit (optional)</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="z.B. °C, %, W"
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm placeholder-gray-500"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleAdd}
            disabled={!datapoint.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded px-4 py-2 text-sm font-medium"
          >
            Hinzufügen
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded bg-gray-700 hover:bg-gray-600"
          >
            Abbruch
          </button>
        </div>
      </div>
    </div>
  );
}
