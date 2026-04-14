import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit3, Check, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useGroupStore, type DatapointGroup, type GroupDatapoint } from '../../store/groupStore';
import { useIoBrokerDevices } from '../../hooks/useIoBrokerDevices';
import { useT } from '../../i18n';

// ── Datenpunkt-Picker (Mehrfachauswahl) ────────────────────────────────────
function DatapointPicker({ onAdd, onClose }: { onAdd: (dps: GroupDatapoint[]) => void; onClose: () => void }) {
  const t = useT();
  const { devices, loading, loaded, load } = useIoBrokerDevices();
  const [search, setSearch] = useState('');
  const [adapter, setAdapter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const adapters = useMemo(() => Array.from(new Set(devices.map((d) => d.adapter))).sort(), [devices]);
  const filtered = useMemo(() => devices.filter((d) => {
    if (adapter && d.adapter !== adapter) return false;
    if (search) { const q = search.toLowerCase(); return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.states.some((s) => s.id.toLowerCase().includes(q)); }
    return true;
  }), [devices, search, adapter]);

  const toggle = (stateId: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(stateId)) { next.delete(stateId); } else { next.add(stateId); } return next; });

  const toggleDevice = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    const allSelected = device.states.every((s) => selected.has(s.id));
    setSelected((prev) => {
      const next = new Set(prev);
      device.states.forEach((s) => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  };

  const handleAdd = () => {
    const result: GroupDatapoint[] = [];
    for (const device of devices) {
      for (const state of device.states) {
        if (!selected.has(state.id)) continue;
        result.push({
          id: state.id,
          label: `${device.name} – ${state.id.split('.').pop()}`,
          type: state.obj.common.type === 'boolean' ? 'boolean' : state.obj.common.type === 'number' ? 'number' : 'string',
          unit: state.unit,
          writable: state.obj.common.write !== false,
        });
      }
    }
    onAdd(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('endpoints.picker.title')}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        {!loaded ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12">
            {loading
              ? <><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.picker.loading')}</p></>
              : <button onClick={load} className="px-5 py-2 rounded-lg text-white text-sm hover:opacity-80" style={{ background: 'var(--accent)' }}>{t('endpoints.picker.load')}</button>
            }
          </div>
        ) : (
          <>
            <div className="flex gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
                <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('endpoints.picker.search')} className="flex-1 text-sm bg-transparent focus:outline-none" style={{ color: 'var(--text-primary)' }} />
              </div>
              <select value={adapter} onChange={(e) => setAdapter(e.target.value)} className="text-sm rounded-lg px-2 py-1.5" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                <option value="">{t('endpoints.picker.all')}</option>
                {adapters.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {filtered.map((device) => {
                const deviceSelected = device.states.filter((s) => selected.has(s.id)).length;
                const allChecked = deviceSelected === device.states.length;
                return (
                  <div key={device.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: 'var(--app-bg)' }}>
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = deviceSelected > 0 && !allChecked; }}
                        onChange={() => toggleDevice(device.id)}
                        className="w-4 h-4 shrink-0 cursor-pointer" style={{ accentColor: 'var(--accent)' }} />
                      <button className="flex-1 flex items-center gap-2 text-left hover:opacity-80 min-w-0"
                        onClick={() => setExpanded(expanded === device.id ? null : device.id)}>
                        {expanded === device.id ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{device.name}</span>
                        <span className="text-xs ml-1 shrink-0" style={{ color: deviceSelected > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {deviceSelected > 0 ? `${deviceSelected}/` : ''}{device.states.length} DP
                        </span>
                      </button>
                    </div>
                    {expanded === device.id && device.states.map((state) => (
                      <label key={state.id}
                        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:opacity-80"
                        style={{ borderTop: '1px solid var(--app-border)', background: selected.has(state.id) ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--app-surface)' }}>
                        <input type="checkbox" checked={selected.has(state.id)} onChange={() => toggle(state.id)}
                          className="w-4 h-4 shrink-0" style={{ accentColor: 'var(--accent)' }} />
                        <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{state.id}</span>
                        {state.unit && <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{state.unit}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--app-border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selected.size === 0 ? t('endpoints.picker.none') : t('endpoints.picker.selected', { count: String(selected.size) })}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  {t('endpoints.picker.cancel')}
                </button>
                <button onClick={handleAdd} disabled={selected.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80 disabled:opacity-30"
                  style={{ background: 'var(--accent)' }}>
                  {t('endpoints.picker.add')} {selected.size > 0 && `(${selected.size})`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Gruppe bearbeiten ───────────────────────────────────────────────────────
function GroupEditor({ group }: { group: DatapointGroup }) {
  const t = useT();
  const { removeDatapoint, updateDatapoint, addDatapoint } = useGroupStore();
  const [showPicker, setShowPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const inputStyle = { background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.count', { count: String(group.datapoints.length) })}</span>
        <button onClick={() => setShowPicker(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}>
          <Plus size={13} /> {t('endpoints.dp.add')}
        </button>
      </div>

      {group.datapoints.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.empty')}</p>
      ) : (
        <div className="space-y-1">
          {group.datapoints.map((dp) => (
            <div key={dp.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
              {/* Kompakt-Zeile */}
              <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: 'var(--app-bg)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{dp.label}</p>
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{dp.id}</p>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}>
                  {dp.type === 'boolean'
                    ? (dp.writable ? t('endpoints.dp.typeSwitch') : t('endpoints.dp.typeBool'))
                    : dp.type === 'number'
                      ? `${t('endpoints.dp.typeNum')}${dp.unit ? ` · ${dp.unit}` : ''}`
                      : 'Text'}
                </span>
                <button onClick={() => setEditingId(editingId === dp.id ? null : dp.id)}
                  className="hover:opacity-70 shrink-0"
                  style={{ color: editingId === dp.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  <Edit3 size={13} />
                </button>
                <button onClick={() => removeDatapoint(group.id, dp.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Bearbeitungsformular */}
              {editingId === dp.id && (
                <div className="px-3 py-3 space-y-2.5" style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}>
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.label')}</label>
                    <input
                      type="text"
                      defaultValue={dp.label}
                      onBlur={(e) => updateDatapoint(group.id, dp.id, { label: e.target.value || dp.label })}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      style={inputStyle}
                    />
                  </div>

                  {/* Typ */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.type')}</label>
                    <select
                      value={dp.type}
                      onChange={(e) => updateDatapoint(group.id, dp.id, { type: e.target.value as GroupDatapoint['type'] })}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      style={inputStyle}
                    >
                      <option value="boolean">{t('endpoints.dp.typeBoolean')}</option>
                      <option value="number">{t('endpoints.dp.typeNumber')}</option>
                      <option value="string">{t('endpoints.dp.typeText')}</option>
                    </select>
                  </div>

                  {/* Einheit (nur bei Zahl) */}
                  {dp.type === 'number' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.unit')}</label>
                      <input
                        type="text"
                        defaultValue={dp.unit ?? ''}
                        onBlur={(e) => updateDatapoint(group.id, dp.id, { unit: e.target.value || undefined })}
                        placeholder={t('endpoints.dp.unitPh')}
                        className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* Schreibbar */}
                  {(dp.type === 'boolean' || dp.type === 'number') && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {dp.type === 'boolean' ? t('endpoints.dp.asSwitch') : t('endpoints.dp.writable')}
                      </label>
                      <button
                        onClick={() => updateDatapoint(group.id, dp.id, { writable: !dp.writable })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: dp.writable ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: dp.writable ? '18px' : '2px' }} />
                      </button>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {dp.writable
                          ? dp.type === 'boolean' ? t('endpoints.dp.toggle') : t('endpoints.dp.settable')
                          : t('endpoints.dp.readOnly')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showPicker && <DatapointPicker onAdd={(dps) => dps.forEach((dp) => addDatapoint(group.id, dp))} onClose={() => setShowPicker(false)} />}
    </div>
  );
}

// ── Hauptseite ──────────────────────────────────────────────────────────────
export function AdminEndpoints() {
  const t = useT();
  const { groups, addGroup, removeGroup, renameGroup } = useGroupStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    const id = addGroup(newName.trim());
    setNewName('');
    setExpanded(id);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('endpoints.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {t('endpoints.subtitle')}
        </p>
      </div>

      {/* Neue Gruppe */}
      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={t('endpoints.newGroup')}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
        <button onClick={handleAdd} disabled={!newName.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-80 disabled:opacity-30"
          style={{ background: 'var(--accent)' }}>
          <Plus size={15} /> {t('endpoints.createGroup')}
        </button>
      </div>

      {/* Gruppen-Liste */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ border: '2px dashed var(--app-border)' }}>
          <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.noGroups')}</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.noGroupsHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
              {/* Gruppen-Header */}
              <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'var(--app-surface)' }}>
                <button onClick={() => setExpanded(expanded === group.id ? null : group.id)} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                  {expanded === group.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>

                {renamingId === group.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renameGroup(group.id, renameValue); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }} />
                    <button onClick={() => { renameGroup(group.id, renameValue); setRenamingId(null); }} style={{ color: 'var(--accent-green)' }}><Check size={16} /></button>
                    <button onClick={() => setRenamingId(null)} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(expanded === group.id ? null : group.id)}>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
                    {group.description && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{group.description}</p>}
                  </div>
                )}

                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                  {group.datapoints.length} DP
                </span>
                <button onClick={() => { setRenamingId(group.id); setRenameValue(group.name); }} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}><Edit3 size={15} /></button>
                <button onClick={() => removeGroup(group.id)} className="hover:opacity-70" style={{ color: 'var(--accent-red)' }}><Trash2 size={15} /></button>
              </div>

              {/* Datenpunkte */}
              {expanded === group.id && (
                <div className="px-5 py-4" style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}>
                  <GroupEditor group={group} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
