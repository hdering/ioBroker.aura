import { useState } from 'react';
import { X, Database, Upload } from 'lucide-react';
import type { WidgetConfig, WidgetType } from '../../types';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
import { DatapointPicker } from './DatapointPicker';
import { useT } from '../../i18n';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
};

export function ImportWidgetDialog({
  onAdd,
  onClose,
  /** Optional: if provided, shows a tab selector */
  tabs,
}: {
  onAdd: (widget: WidgetConfig, tabId?: string) => void;
  onClose: () => void;
  tabs?: { id: string; name: string }[];
}) {
  const t = useT();
  const [jsonText, setJsonText] = useState('');
  const [parsed, setParsed] = useState<WidgetConfig | null>(null);
  const [parseError, setParseError] = useState('');
  const [targetTabId, setTargetTabId] = useState(tabs?.[0]?.id ?? '');
  const [datapoint, setDatapoint] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const tryParse = (text: string) => {
    setJsonText(text);
    try {
      const obj = JSON.parse(text);
      if (!obj.type || typeof obj.type !== 'string') throw new Error(t('import.invalidWidget'));
      setParsed(obj as WidgetConfig);
      setDatapoint(obj.datapoint ?? '');
      setParseError('');
    } catch (e) {
      setParsed(null);
      setParseError((e as Error).message);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => tryParse(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleAdd = () => {
    if (!parsed) return;
    onAdd(
      {
        ...parsed,
        id: `${parsed.type}-${Date.now()}`,
        datapoint: datapoint.trim(),
        gridPos: { ...parsed.gridPos, x: 0, y: Infinity },
      },
      targetTabId || undefined,
    );
    onClose();
  };

  const meta = parsed ? WIDGET_BY_TYPE[parsed.type as WidgetType] : null;
  const needsDatapoint = meta?.addMode === 'datapoint';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('import.title')}</h2>
          <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* File upload */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('import.fileLabel')}</label>
          <input type="file" accept=".json,application/json" onChange={handleFile}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={inputStyle} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('import.or')}</span>
          <div className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
        </div>

        {/* Paste JSON */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('import.pasteJson')}</label>
          <textarea value={jsonText} onChange={(e) => tryParse(e.target.value)}
            rows={5} placeholder={'{\n  "type": "value",\n  "title": "Temperatur",\n  ...\n}'}
            className="w-full text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none resize-none"
            style={inputStyle} />
          {parseError && jsonText.length > 0 && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--accent-red)' }}>{parseError}</p>
          )}
        </div>

        {parsed && (
          <>
            {/* Widget info */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              {meta && (
                <span className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ background: meta.color + '22', color: meta.color }}>
                  <meta.Icon size={13} />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {meta?.label ?? parsed.type} — {parsed.title || <em>{t('widgets.noTitle')}</em>}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {parsed.gridPos.w}×{parsed.gridPos.h} · {parsed.layout ?? 'default'}
                </p>
              </div>
            </div>

            {/* Datapoint override */}
            {needsDatapoint && (
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                  {t('editor.manual.datapointId')} <span style={{ color: 'var(--accent-red)' }}>*</span>
                </label>
                <div className="flex gap-1.5">
                  <input value={datapoint} onChange={(e) => setDatapoint(e.target.value)}
                    placeholder="z.B. hm-rpc.0.ABC123.STATE"
                    className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                    style={inputStyle} />
                  <button onClick={() => setShowPicker(true)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                    <Database size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Target tab (optional) */}
            {tabs && tabs.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('widgets.targetTab')}</label>
                <select value={targetTabId} onChange={(e) => setTargetTabId(e.target.value)}
                  className={inputCls} style={inputStyle}>
                  {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                {t('common.cancel')}
              </button>
              <button onClick={handleAdd} disabled={needsDatapoint && !datapoint.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-30"
                style={{ background: 'var(--accent)' }}>
                <Upload size={13} /> {t('widgets.import')}
              </button>
            </div>
          </>
        )}

        {showPicker && (
          <DatapointPicker
            currentValue={datapoint}
            onSelect={(id) => setDatapoint(id)}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
