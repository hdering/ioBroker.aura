import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getObjectViewDirect } from '../../hooks/useIoBroker';
import type { WidgetConfig } from '../../types';

interface Props {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

export function EChartsPresetConfig({ config, onConfigChange }: Props) {
  const o   = config.options ?? {};
  const set = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const presetId = (o.presetId as string) ?? '';
  const darkMode = (o.darkMode as boolean) ?? true;

  const [presets, setPresets]   = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);

  const loadPresets = () => {
    setLoading(true);
    // Timeout as safety net in case the socket command is not supported
    const timer = setTimeout(() => setLoading(false), 5000);
    getObjectViewDirect('chart', 'echarts.', 'echarts.香')
      .then((result) => {
        clearTimeout(timer);
        const ids = result.rows.map((r) => r.id).filter((id) => /^echarts\.\d+\./.test(id));
        setPresets(ids);
      })
      .catch(() => { clearTimeout(timer); setPresets([]); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPresets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Preset</label>
          <button
            onClick={loadPresets}
            disabled={loading}
            className="p-1 rounded hover:opacity-80 disabled:opacity-40"
            style={{ color: 'var(--text-secondary)' }}
            title="Presets neu laden"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {presets.length > 0 ? (
          <select
            value={presetId}
            onChange={(e) => set({ presetId: e.target.value || undefined })}
            className={iCls}
            style={iSty}
          >
            <option value="">— Preset wählen —</option>
            {presets.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={presetId}
            onChange={(e) => set({ presetId: e.target.value || undefined })}
            placeholder="echarts.0.preset_1"
            className={iCls}
            style={iSty}
          />
        )}

        {!loading && presets.length === 0 && (
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            Keine Presets gefunden — ID manuell eingeben
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Dark Theme</label>
        <button
          onClick={() => set({ darkMode: !darkMode })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: darkMode ? 'var(--accent)' : 'var(--app-border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: darkMode ? '18px' : '2px' }}
          />
        </button>
      </div>
    </>
  );
}
