import { useState } from 'react';
import type { WidgetConfig, WidgetType } from '../../types';
import { useT } from '../../i18n';
import { lookupDatapointEntry } from '../../hooks/useDatapointList';
import { getObjectDirect } from '../../hooks/useIoBroker';

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

function resolveObjName(name: unknown, fallback: string): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  if (typeof name === 'object') {
    const n = name as Record<string, string>;
    return n.de ?? n.en ?? Object.values(n)[0] ?? fallback;
  }
  return fallback;
}

export function AddWidgetDialog({ onAdd, onClose }: AddWidgetDialogProps) {
  const t = useT();
  const WIDGET_TYPES = WIDGET_TYPE_KEYS.map((w) => ({ ...w, label: t(w.key as never) }));
  const [type, setType] = useState<WidgetType>('value');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [unit, setUnit] = useState('');

  const resolveEntry = async (id: string): Promise<{ name?: string; unit?: string }> => {
    const cached = lookupDatapointEntry(id);
    if (cached) return { name: cached.name, unit: cached.unit };
    const obj = await getObjectDirect(id);
    if (!obj?.common) return {};
    return {
      name: resolveObjName(obj.common.name, id.split('.').pop() ?? id),
      unit: obj.common.unit as string | undefined,
    };
  };

  const handleAdd = async () => {
    if (!datapoint.trim()) return;
    const id = datapoint.trim();
    const def = WIDGET_TYPES.find((w) => w.type === type)!;
    const supportsUnit = type === 'value' || type === 'chart';

    let resolvedTitle = title;
    let resolvedUnit = unit;

    if (!resolvedTitle.trim() || (supportsUnit && !resolvedUnit.trim())) {
      const entry = await resolveEntry(id);
      if (!resolvedTitle.trim() && entry.name) resolvedTitle = entry.name;
      if (supportsUnit && !resolvedUnit.trim() && entry.unit) resolvedUnit = entry.unit;
    }

    onAdd({
      id: `${type}-${Date.now()}`,
      type,
      title: resolvedTitle || def.label,
      datapoint: id,
      gridPos: { x: 0, y: Infinity, w: def.defaultW, h: def.defaultH },
      options: resolvedUnit ? { unit: resolvedUnit } : {},
    });
    onClose();
  };

  const handleDatapointBlur = async (id: string) => {
    if (!id) return;
    const supportsUnit = type === 'value' || type === 'chart';
    const entry = await resolveEntry(id);
    if (!title.trim() && entry.name) setTitle(entry.name);
    if (supportsUnit && !unit.trim() && entry.unit) setUnit(entry.unit);
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
            onBlur={(e) => void handleDatapointBlur(e.target.value.trim())}
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
            onClick={() => void handleAdd()}
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
