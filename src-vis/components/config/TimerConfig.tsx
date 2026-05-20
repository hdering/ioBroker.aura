/**
 * Configuration panel for the Zeitschaltuhr widget — shown in the widget edit
 * sidebar. Event management itself happens directly on the widget face via
 * TimerEventModal, so this panel only exposes the global special-day DPs
 * (holidays / vacation) used by the per-event filters.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';

interface Props {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
}

const inputCls   = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color:      'var(--text-primary)',
  border:     '1px solid var(--app-border)',
};

export function TimerConfig({ config, onConfigChange }: Props) {
  const o = config.options ?? {};
  const holidaysDp = (o.holidaysDp as string | undefined) ?? '';
  const vacationDp = (o.vacationDp as string | undefined) ?? '';

  const [pickerTarget, setPickerTarget] = useState<'holidays' | 'vacation' | null>(null);

  const setOpts = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const currentPickerValue = pickerTarget === 'holidays' ? holidaysDp : pickerTarget === 'vacation' ? vacationDp : '';

  return (
    <>
      {pickerTarget && (
        <DatapointPicker
          currentValue={currentPickerValue}
          onSelect={(id) => {
            if (pickerTarget === 'holidays') setOpts({ holidaysDp: id });
            else setOpts({ vacationDp: id });
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      <div className="space-y-3">
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Ereignisse werden direkt auf dem Widget über „+ Ereignis" verwaltet.
          Hier nur die globalen Sondertage-DPs für die Filter „Feiertage" / „Urlaub" / „ohne Sondertage".
        </p>

        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Feiertage-DP (optional)
          </label>
          <div className="flex gap-1">
            <input type="text" value={holidaysDp}
              onChange={(e) => setOpts({ holidaysDp: e.target.value || undefined })}
              placeholder="z.B. 0_userdata.0.feiertage"
              className={`flex-1 font-mono min-w-0 ${inputCls}`} style={inputStyle} />
            <button type="button" onClick={() => setPickerTarget('holidays')}
              className="px-2 rounded-lg shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              <Database size={13} />
            </button>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            JSON-Array <code className="font-mono">["YYYY-MM-DD", …]</code>
          </p>
        </div>

        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Urlaub-DP (optional)
          </label>
          <div className="flex gap-1">
            <input type="text" value={vacationDp}
              onChange={(e) => setOpts({ vacationDp: e.target.value || undefined })}
              placeholder="z.B. 0_userdata.0.urlaub"
              className={`flex-1 font-mono min-w-0 ${inputCls}`} style={inputStyle} />
            <button type="button" onClick={() => setPickerTarget('vacation')}
              className="px-2 rounded-lg shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              <Database size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
