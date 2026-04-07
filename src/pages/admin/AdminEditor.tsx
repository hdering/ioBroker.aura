import { useState } from 'react';
import { Plus, Trash2, Edit3, Check, Cpu, PenLine } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useGroupStore } from '../../store/groupStore';
import { Dashboard } from '../../components/layout/Dashboard';
import { DeviceWizard } from '../../components/config/DeviceWizard';
import type { WidgetConfig, WidgetType } from '../../types';

const WIDGET_TYPES: { type: WidgetType; label: string; defaultW: number; defaultH: number }[] = [
  { type: 'switch', label: 'Schalter', defaultW: 2, defaultH: 2 },
  { type: 'value', label: 'Wert-Anzeige', defaultW: 2, defaultH: 2 },
  { type: 'dimmer', label: 'Dimmer', defaultW: 2, defaultH: 2 },
  { type: 'thermostat', label: 'Thermostat', defaultW: 2, defaultH: 2 },
  { type: 'chart', label: 'Diagramm', defaultW: 4, defaultH: 3 },
  { type: 'list', label: 'Gruppenliste', defaultW: 3, defaultH: 4 },
];

function ManualWidgetDialog({ onAdd, onClose }: { onAdd: (w: WidgetConfig) => void; onClose: () => void }) {
  const [type, setType] = useState<WidgetType>('value');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unit, setUnit] = useState('');
  const { groups } = useGroupStore();

  const def = WIDGET_TYPES.find((w) => w.type === type)!;
  const isList = type === 'list';
  const canAdd = isList ? !!groupId : !!datapoint.trim();

  const handleAdd = () => {
    if (!canAdd) return;
    const selectedGroup = isList ? groups.find((g) => g.id === groupId) : undefined;
    onAdd({
      id: `${type}-${Date.now()}`,
      type,
      title: title || (isList && selectedGroup ? selectedGroup.name : def.label),
      datapoint: isList ? groupId : datapoint.trim(),
      gridPos: { x: 0, y: Infinity, w: def.defaultW, h: def.defaultH },
      options: unit ? { unit } : {},
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Widget manuell hinzufügen</h2>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Typ</label>
          <select value={type} onChange={(e) => { setType(e.target.value as WidgetType); setGroupId(''); setDatapoint(''); }}
            className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
            {WIDGET_TYPES.map((w) => <option key={w.type} value={w.type}>{w.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Titel</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={def.label}
            className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
        </div>

        {isList ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Gruppe *</label>
            {groups.length === 0 ? (
              <p className="text-xs rounded-xl px-3 py-2.5"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                Keine Gruppen vorhanden – zuerst unter "Endpunkte" anlegen
              </p>
            ) : (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                <option value="">– Gruppe wählen –</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.datapoints.length} Datenpunkte)</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Datenpunkt-ID *</label>
            <input value={datapoint} onChange={(e) => setDatapoint(e.target.value)}
              placeholder="z.B. hm-rpc.0.ABC123.STATE"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
          </div>
        )}

        {(type === 'value' || type === 'chart') && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Einheit (optional)</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="z.B. °C, %, W"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={handleAdd} disabled={!canAdd}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-80 disabled:opacity-30"
            style={{ background: 'var(--accent)' }}>
            Hinzufügen
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            Abbruch
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminEditor() {
  const { tabs, activeTabId, addWidget, removeWidget, addTab, setActiveTab, renameTab, removeTab } = useDashboardStore();
  const [showWizard, setShowWizard] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 shrink-0 flex-wrap"
        style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold text-sm mr-2" style={{ color: 'var(--text-primary)' }}>Dashboard-Editor</h2>
        <div className="flex-1" />
        <button onClick={() => setShowManual(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
          <PenLine size={15} /> Manuell
        </button>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent-green)' }}>
          <Cpu size={15} /> Aus ioBroker
        </button>
      </div>

      {/* Tab-Verwaltung */}
      <div className="flex items-center gap-2 px-6 py-2 shrink-0 flex-wrap"
        style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div key={tab.id} className="flex items-center gap-1">
              {renamingId === tab.id ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { renameTab(tab.id, renamingValue); setRenamingId(null); }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="text-xs rounded px-2 py-1 w-28 focus:outline-none"
                    style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }} />
                  <button onClick={() => { renameTab(tab.id, renamingValue); setRenamingId(null); }}
                    className="p-1 rounded hover:opacity-70" style={{ color: 'var(--accent-green)' }}>
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-lg px-2 py-1"
                  style={{ background: isActive ? 'var(--accent)22' : 'var(--app-surface)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--app-border)'}` }}>
                  <button onClick={() => setActiveTab(tab.id)}
                    className="text-xs font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {tab.name}
                  </button>
                  <button onClick={() => { setRenamingId(tab.id); setRenamingValue(tab.name); }}
                    className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    <Edit3 size={11} />
                  </button>
                  {tabs.length > 1 && (
                    <button onClick={() => removeTab(tab.id)}
                      className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--accent-red)' }}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button onClick={() => addTab(`Tab ${tabs.length + 1}`)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:opacity-80"
          style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
          <Plus size={12} /> Tab
        </button>
      </div>

      {/* Widget-Liste */}
      {activeTab && activeTab.widgets.length > 0 && (
        <div className="px-6 py-2 shrink-0 flex gap-2 flex-wrap"
          style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}>
          {activeTab.widgets.map((w) => (
            <div key={w.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{w.type}</span>
              <span style={{ color: 'var(--text-primary)' }}>{w.title}</span>
              <button onClick={() => removeWidget(w.id)} className="hover:opacity-70" style={{ color: 'var(--accent-red)' }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dashboard-Vorschau mit Edit-Modus */}
      <div className="flex-1 overflow-auto" style={{ background: 'var(--app-bg)' }}>
        <Dashboard editMode={true} />
      </div>

      {showWizard && (
        <DeviceWizard onAdd={(ws: WidgetConfig[]) => ws.forEach(addWidget)} onClose={() => setShowWizard(false)} />
      )}
      {showManual && (
        <ManualWidgetDialog onAdd={addWidget} onClose={() => setShowManual(false)} />
      )}
    </div>
  );
}
