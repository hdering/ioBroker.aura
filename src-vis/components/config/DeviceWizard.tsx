import { useState, useMemo } from 'react';
import { useIoBrokerDevices, type Device, type DeviceState } from '../../hooks/useIoBrokerDevices';
import type { WidgetConfig, WidgetType } from '../../types';
import { WidgetPreview } from './WidgetPreview';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
import { useT } from '../../i18n';

// Derived from central registry
const WIDGET_LABELS = Object.fromEntries(
  Object.entries(WIDGET_BY_TYPE).map(([t, m]) => [t, m.label]),
) as Record<WidgetType, string>;

interface Selection {
  state: DeviceState;
  device: Device;
  widgetType: WidgetType;
  title: string;
  actualDatapoint?: string;
}

interface DeviceWizardProps {
  onAdd: (widgets: WidgetConfig[]) => void;
  onClose: () => void;
}

const inputStyle = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
} as React.CSSProperties;

export function DeviceWizard({ onAdd, onClose }: DeviceWizardProps) {
  const t = useT();
  const { devices, loading, loaded, load } = useIoBrokerDevices();
  const [search, setSearch] = useState('');
  const [selectedAdapter, setSelectedAdapter] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedFunc, setSelectedFunc] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [selections, setSelections] = useState<Map<string, Selection>>(new Map());

  const adapters = useMemo(() => Array.from(new Set(devices.map((d) => d.adapter))).sort(), [devices]);
  const rooms = useMemo(() => Array.from(new Set(devices.flatMap((d) => d.rooms))).sort(), [devices]);
  const funcs = useMemo(() => Array.from(new Set(devices.flatMap((d) => d.funcs))).sort(), [devices]);
  const roles = useMemo(() => Array.from(new Set(devices.flatMap((d) => d.roles))).sort(), [devices]);

  const filtered = useMemo(() => devices.filter((d) => {
    if (selectedAdapter && d.adapter !== selectedAdapter) return false;
    if (selectedRoom && !d.rooms.includes(selectedRoom)) return false;
    if (selectedFunc && !d.funcs.includes(selectedFunc)) return false;
    if (selectedRole && !d.roles.includes(selectedRole)) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) ||
        d.states.some((s) => s.id.toLowerCase().includes(q));
    }
    return true;
  }), [devices, search, selectedAdapter, selectedRoom, selectedFunc, selectedRole]);

  const toggleState = (device: Device, state: DeviceState) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(state.id)) next.delete(state.id);
      else next.set(state.id, {
        state, device, widgetType: state.suggestedWidget,
        title: `${device.name} – ${state.obj._id.split('.').pop()}`,
      });
      return next;
    });
  };

  const updateSel = (key: string, patch: Partial<Selection>) =>
    setSelections((prev) => { const next = new Map(prev); const cur = next.get(key); if (cur) next.set(key, { ...cur, ...patch }); return next; });

  const handleAdd = () => {
    onAdd(Array.from(selections.values()).map((sel, i) => ({
      id: `w-${Date.now()}-${i}`,
      type: sel.widgetType,
      title: sel.title,
      datapoint: sel.state.id,
      gridPos: { x: (i * 2) % 12, y: 9999, w: sel.widgetType === 'chart' ? 4 : 2, h: sel.widgetType === 'chart' ? 3 : 2 },
      options: {
        icon: WIDGET_BY_TYPE[sel.widgetType].iconName,
        ...(sel.state.unit ? { unit: sel.state.unit } : {}),
        ...(sel.actualDatapoint ? { actualDatapoint: sel.actualDatapoint } : {}),
      },
    })));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('wizard.device.title')}</h2>
          <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>✕</button>
        </div>

        {!loaded ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12">
            {loading ? (
              <>
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('wizard.device.loading')}</p>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)' }}>{t('wizard.device.hint')}</p>
                <button onClick={load} className="px-6 py-2 text-white rounded-lg font-medium hover:opacity-80" style={{ background: 'var(--accent)' }}>
                  {t('wizard.device.load')}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Filter */}
            <div className="px-6 py-3 space-y-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <div className="flex gap-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('wizard.device.search')}
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                  style={{ ...inputStyle, outlineColor: 'var(--accent)' }} />
                <select value={selectedAdapter} onChange={(e) => setSelectedAdapter(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm" style={inputStyle}>
                  <option value="">{t('wizard.device.allAdapters')}</option>
                  {adapters.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-sm self-center whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{filtered.length} {t('wizard.device.devices')}</span>
              </div>
              {(rooms.length > 0 || funcs.length > 0 || roles.length > 0) && (
                <div className="flex gap-2 flex-wrap">
                  {rooms.length > 0 && (
                    <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}
                      className="rounded-lg px-3 py-1.5 text-xs" style={inputStyle}>
                      <option value="">{t('wizard.device.allRooms')}</option>
                      {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                  {funcs.length > 0 && (
                    <select value={selectedFunc} onChange={(e) => setSelectedFunc(e.target.value)}
                      className="rounded-lg px-3 py-1.5 text-xs" style={inputStyle}>
                      <option value="">{t('wizard.device.allFuncs')}</option>
                      {funcs.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  )}
                  {roles.length > 0 && (
                    <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
                      className="rounded-lg px-3 py-1.5 text-xs" style={inputStyle}>
                      <option value="">{t('wizard.device.allRoles')}</option>
                      {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Liste */}
            <div className="aura-scroll flex-1 overflow-y-auto px-6 py-3 space-y-2">
              {filtered.map((device) => {
                const cnt = Array.from(selections.values()).filter((s) => s.device.id === device.id).length;
                return (
                  <div key={device.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:opacity-80 transition-opacity"
                      style={{ background: 'var(--app-bg)' }}
                      onClick={() => setExpandedDevice(expandedDevice === device.id ? null : device.id)}
                    >
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{device.name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{device.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {cnt > 0 && <span className="px-2 py-0.5 text-xs text-white rounded-full" style={{ background: 'var(--accent)' }}>{cnt}</span>}
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{device.states.length} DP {expandedDevice === device.id ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {expandedDevice === device.id && device.states.map((state) => {
                      const sel = selections.get(state.id);
                      return (
                        <div key={state.id}>
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-opacity hover:opacity-80"
                            style={{ background: sel ? 'var(--accent)11' : 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}
                            onClick={() => toggleState(device, state)}
                          >
                            <input type="checkbox" checked={!!sel} readOnly style={{ accentColor: 'var(--accent)' }} className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{state.id.split('.').pop()}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{state.id}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {state.unit && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{state.unit}</span>}
                              {sel ? (
                                <select value={sel.widgetType} onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateSel(state.id, { widgetType: e.target.value as WidgetType })}
                                  className="text-xs rounded px-2 py-1" style={inputStyle}>
                                  {Object.entries(WIDGET_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                                </select>
                              ) : (
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{WIDGET_LABELS[state.suggestedWidget]}</span>
                              )}
                            </div>
                          </div>
                          {sel && (
                            <div className="px-4 pb-3 pt-2 flex gap-3 items-start" style={{ background: 'var(--accent)08', borderTop: '1px solid var(--app-border)' }}
                              onClick={(e) => e.stopPropagation()}>
                              <div className="flex-1 space-y-2 min-w-0">
                                <input value={sel.title} onChange={(e) => updateSel(state.id, { title: e.target.value })}
                                  placeholder="Titel" className="w-full text-xs rounded px-2 py-1.5 focus:outline-none" style={inputStyle} />
                                {sel.widgetType === 'thermostat' && (
                                  <input value={sel.actualDatapoint ?? ''} onChange={(e) => updateSel(state.id, { actualDatapoint: e.target.value })}
                                    placeholder={t('wizard.device.tempDp')} className="w-full text-xs rounded px-2 py-1.5 focus:outline-none" style={inputStyle} />
                                )}
                              </div>
                              <WidgetPreview type={sel.widgetType} title={sel.title} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--app-border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selections.size === 0 ? t('wizard.device.noneSelected') : `${selections.size} ${selections.size !== 1 ? t('wizard.device.widgets') : t('wizard.device.widget')}`}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  {t('wizard.device.cancel')}
                </button>
                <button onClick={handleAdd} disabled={selections.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-30"
                  style={{ background: 'var(--accent)' }}>
                  {t('wizard.device.add')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
