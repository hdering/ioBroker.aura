import { useState } from 'react';
import type { WidgetConfig, WidgetType } from '../../types';
import { useT } from '../../i18n';

interface AddWidgetDialogProps {
  onAdd: (config: WidgetConfig) => void;
  onClose: () => void;
}

const WIDGET_TYPE_KEYS: { type: WidgetType; key: string; defaultW: number; defaultH: number }[] = [
  { type: 'switch', key: 'widget.switch', defaultW: 2, defaultH: 2 },
  { type: 'value', key: 'widget.value', defaultW: 2, defaultH: 2 },
  { type: 'dimmer', key: 'widget.dimmer', defaultW: 2, defaultH: 2 },
  { type: 'thermostat', key: 'widget.thermostat', defaultW: 2, defaultH: 2 },
  { type: 'chart', key: 'widget.chart', defaultW: 4, defaultH: 3 },
];

export function AddWidgetDialog({ onAdd, onClose }: AddWidgetDialogProps) {
  const t = useT();
  const WIDGET_TYPES = WIDGET_TYPE_KEYS.map((w) => ({ ...w, label: t(w.key as never) }));
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
        <h2 className="text-white font-bold text-lg">{t('editor.manual.title')}</h2>

        <div className="space-y-1">
          <label className="text-gray-400 text-xs">{t('editor.manual.type')}</label>
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
          <label className="text-gray-400 text-xs">{t('editor.manual.titleField')}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('editor.manual.titleField')}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm placeholder-gray-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-gray-400 text-xs">{t('editor.manual.datapointId')}</label>
          <input
            value={datapoint}
            onChange={(e) => setDatapoint(e.target.value)}
            placeholder="z.B. system.adapter.admin.0.alive"
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm placeholder-gray-500"
          />
        </div>

        {(type === 'value' || type === 'chart') && (
          <div className="space-y-1">
            <label className="text-gray-400 text-xs">{t('editor.manual.unit')}</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={t('endpoints.dp.unitPh')}
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
            {t('editor.manual.add')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded bg-gray-700 hover:bg-gray-600"
          >
            {t('editor.manual.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
