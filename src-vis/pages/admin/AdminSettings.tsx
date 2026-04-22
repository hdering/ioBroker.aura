import { useState, useEffect, useCallback } from 'react';
import { setupPin } from '../../store/authStore';
import { useActiveLayout, useDashboardStore } from '../../store/dashboardStore';
import { useConnectionStore } from '../../store/connectionStore';
import { useConfigStore } from '../../store/configStore';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { reconnectSocket, getObjectViewDirect, getStateDirect, setStateDirect } from '../../hooks/useIoBroker';
import { Eye, EyeOff, AlertTriangle, RefreshCw, Tablet, Edit3, Check, X, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import type { LayoutSettings } from '../../store/dashboardStore';
import type { FrontendSettings } from '../../store/configStore';

// ── Shared primitives ──────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
      style={{ background: value ? 'var(--accent-green)' : 'var(--app-border)' }}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: 'var(--app-border)' }}>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      {children}
    </div>
  );
}

function SliderSetting({
  label, value, min, max, step, unit = '', onChange, presets, isOverridden, onClearOverride,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
  presets: { label: string; value: number }[];
  isOverridden?: boolean;
  onClearOverride?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {isOverridden && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              Layout
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isOverridden && onClearOverride && (
            <button onClick={onClearOverride} title="Auf Global zurücksetzen" className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
              ↩ Global
            </button>
          )}
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
            style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
            {value}{unit}
          </span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)] mb-2" />
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => {
          const active = value === p.value;
          return (
            <button key={p.value} onClick={() => onChange(p.value)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
              style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Clients card (merged: current device + all known clients) ─────────────────

interface ClientInfo {
  channelId: string;
  clientId: string;
  name: string;
  lastSeen: number;
}

function ClientsCard() {
  const t = useT();
  const { clientId: myClientId, clientName: myClientName, setClientName } = useConnectionStore();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getObjectViewDirect('channel', 'aura.0.clients.', 'aura.0.clients.\u9999');
      // Only direct client channels: aura.0.clients.{clientId} → exactly 4 dot-segments
      const channelRows = result.rows.filter((r) => r.id.split('.').length === 4);
      const data = await Promise.all(
        channelRows.map(async (row) => {
          const cId = row.id.split('.')[3];
          const [nameState, lastSeenState] = await Promise.all([
            getStateDirect(`${row.id}.info.name`),
            getStateDirect(`${row.id}.info.lastSeen`),
          ]);
          return {
            channelId: row.id,
            clientId: cId,
            name: nameState?.val ? String(nameState.val) : cId.slice(0, 8),
            lastSeen: lastSeenState?.val ? Number(lastSeenState.val) : 0,
          };
        }),
      );
      // Sort: current device first, then by lastSeen descending
      data.sort((a, b) => {
        if (a.clientId === myClientId) return -1;
        if (b.clientId === myClientId) return 1;
        return b.lastSeen - a.lastSeen;
      });
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, [myClientId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (c: ClientInfo) => {
    setEditingId(c.clientId);
    setEditValue(c.clientId === myClientId && myClientName ? myClientName : c.name);
  };

  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const saveName = (c: ClientInfo) => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    // Write directly to ioBroker DP (works for all clients, not just current device)
    setStateDirect(`${c.channelId}.info.name`, trimmed);
    // For the current device, also persist to localStorage (used as fallback)
    if (c.clientId === myClientId) setClientName(trimmed);
    // Update local list immediately
    setClients((prev) => prev.map((x) => x.clientId === c.clientId ? { ...x, name: trimmed } : x));
    cancelEdit();
  };

  const deleteClient = (c: ClientInfo) => {
    setConfirmDeleteId(null);
    // Relay deletion via adapter: write clientId to deleteRequest state.
    // main.js listens, calls delForeignObjectAsync recursively, then clears the state.
    setStateDirect('aura.0.clients.deleteRequest', c.clientId);
    setClients((prev) => prev.filter((x) => x.clientId !== c.clientId));
  };

  const fmtLastSeen = (ts: number) => {
    if (!ts) return '–';
    const diff = Date.now() - ts;
    if (diff < 60_000) return t('settings.clients.justNow');
    if (diff < 3_600_000) return t('settings.clients.minsAgo', { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t('settings.clients.hoursAgo', { n: Math.floor(diff / 3_600_000) });
    return t('settings.clients.daysAgo', { n: Math.floor(diff / 86_400_000) });
  };

  const inputStyle = { background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--accent)' };

  return (
    <Card title={t('settings.clients.title')}>
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('settings.clients.hint')}</p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center justify-center w-6 h-6 rounded hover:opacity-80 disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {clients.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
          {loading ? '…' : t('settings.clients.none')}
        </p>
      ) : (
        <div className="space-y-2 mt-1">
          {clients.map((c) => {
            const isMine = c.clientId === myClientId;
            const isEditing = editingId === c.clientId;
            return (
              <div
                key={c.clientId}
                className="rounded-lg overflow-hidden"
                style={{ border: `1px solid ${isMine ? 'var(--accent)' : 'var(--app-border)'}` }}
              >
                {/* Row */}
                <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: 'var(--app-bg)' }}>
                  <Tablet size={13} style={{ color: isMine ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      {isMine && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                          {t('settings.clients.thisDevice')}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                      {c.channelId}.navigate.url
                    </p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {fmtLastSeen(c.lastSeen)}
                  </span>
                  <button
                    onClick={() => isEditing ? cancelEdit() : startEdit(c)}
                    className="hover:opacity-70 shrink-0"
                    style={{ color: isEditing ? 'var(--accent)' : 'var(--text-secondary)' }}
                  >
                    <Edit3 size={13} />
                  </button>
                  {!isMine && (
                    <button
                      onClick={() => setConfirmDeleteId(confirmDeleteId === c.clientId ? null : c.clientId)}
                      className="hover:opacity-70 shrink-0"
                      style={{ color: confirmDeleteId === c.clientId ? 'var(--accent-red, #ef4444)' : 'var(--text-secondary)' }}
                      title="Gerät löschen"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Inline edit */}
                {isEditing && (
                  <div className="flex items-center gap-2 px-3 py-2.5"
                    style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveName(c); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder={t('settings.client.namePh')}
                      className="flex-1 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => saveName(c)}
                      disabled={!editValue.trim() || editValue.trim() === c.name}
                      className="hover:opacity-70 disabled:opacity-30"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      <Check size={15} />
                    </button>
                    <button onClick={cancelEdit} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      <X size={15} />
                    </button>
                  </div>
                )}

                {/* Delete confirmation */}
                {confirmDeleteId === c.clientId && (
                  <div className="flex items-center gap-2 px-3 py-2.5"
                    style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}>
                    <p className="flex-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Gerät «{c.name}» wirklich löschen?
                    </p>
                    <button
                      onClick={() => deleteClient(c)}
                      className="text-xs px-2.5 py-1 rounded-lg hover:opacity-80"
                      style={{ background: 'var(--accent-red, #ef4444)', color: '#fff' }}
                    >
                      Löschen
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="hover:opacity-70"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Expert settings ────────────────────────────────────────────────────────────

function ExpertSettings() {
  const t = useT();
  const { ioBrokerUrl, setIoBrokerUrl } = useConnectionStore();
  const [urlInput, setUrlInput] = useState(ioBrokerUrl);
  const [saved, setSaved] = useState(false);

  const saveUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setIoBrokerUrl(trimmed);
    await reconnectSocket(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card title={t('settings.expert.title')}>
      <div>
        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.expert.url')}
        </p>
        <div className="flex gap-2">
          <input type="text" value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setSaved(false); }}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none min-w-0"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
          <button onClick={saveUrl}
            disabled={urlInput.trim() === ioBrokerUrl && !saved}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80 disabled:opacity-40 shrink-0"
            style={{ background: saved ? 'var(--accent-green)' : 'var(--accent)' }}>
            <RefreshCw size={12} />
            {saved ? t('common.ok') : t('settings.expert.connect')}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Layout-aware Grid card ─────────────────────────────────────────────────────

function GridCard({
  frontend, updateFrontend, rescaleAllWidgetsX, updateLayoutSettings, contextId, onContextChange, t, MARGIN,
}: {
  frontend: FrontendSettings;
  updateFrontend: (p: Partial<FrontendSettings>) => void;
  rescaleAllWidgetsX: (factor: number) => void;
  updateLayoutSettings: (layoutId: string, patch: Partial<LayoutSettings>) => void;
  contextId: string | null;
  onContextChange: (id: string | null) => void;
  t: ReturnType<typeof useT>;
  MARGIN: number;
}) {
  const layouts = useDashboardStore((s) => s.layouts);
  const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

  const ls = contextId ? layouts.find((l) => l.id === contextId)?.settings : undefined;

  // For a given key: value = layout override (if set) else global, isOv = has override
  function eff<K extends keyof LayoutSettings & keyof FrontendSettings>(key: K): [FrontendSettings[K], boolean] {
    const ov = ls?.[key];
    return [(ov !== undefined ? ov : frontend[key]) as FrontendSettings[K], contextId !== null && ov !== undefined];
  }

  function set<K extends keyof LayoutSettings & keyof FrontendSettings>(key: K, v: FrontendSettings[K]) {
    if (!contextId) updateFrontend({ [key]: v } as Partial<FrontendSettings>);
    else updateLayoutSettings(contextId, { [key]: v } as Partial<LayoutSettings>);
  }

  function clear(key: keyof LayoutSettings) {
    if (contextId) clearLayoutSettings(contextId, key);
  }

  const [rowH, rowHOv] = eff('gridRowHeight');
  const [snapX, snapXOv] = eff('gridSnapX');
  const [mob, mobOv]   = eff('mobileBreakpoint');

  return (
    <Card title={t('settings.grid.title')}>
      <div className="pb-2 mb-1 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
      </div>
      <SliderSetting
        label={t('settings.grid.rowHeight')}
        value={rowH ?? 20}
        min={10} max={160} step={10} unit=" px"
        onChange={(v) => set('gridRowHeight', v)}
        isOverridden={rowHOv}
        onClearOverride={() => clear('gridRowHeight')}
        presets={[{ label: '20', value: 20 }, { label: '40', value: 40 }, { label: '60', value: 60 }, { label: '80', value: 80 }, { label: '120', value: 120 }]}
      />
      <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
        <SliderSetting
          label={t('settings.grid.snapX')}
          value={snapX ?? rowH ?? 20}
          min={10} max={160} step={10} unit=" px"
          onChange={(v) => {
            const oldSnap = (snapX ?? rowH ?? 20) as number;
            const factor = (oldSnap + MARGIN) / (v + MARGIN);
            if (!contextId) rescaleAllWidgetsX(factor);
            set('gridSnapX', v);
          }}
          isOverridden={snapXOv}
          onClearOverride={() => clear('gridSnapX')}
          presets={[{ label: '20', value: 20 }, { label: '40', value: 40 }, { label: '60', value: 60 }, { label: '80', value: 80 }, { label: '120', value: 120 }]}
        />
      </div>
      <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
        <SliderSetting
          label={t('settings.grid.mobileBreak')}
          value={mob ?? 600}
          min={0} max={1024} step={10} unit=" px"
          onChange={(v) => set('mobileBreakpoint', v)}
          isOverridden={mobOv}
          onClearOverride={() => clear('mobileBreakpoint')}
          presets={[{ label: '480', value: 480 }, { label: '600', value: 600 }, { label: '768', value: 768 }, { label: t('settings.grid.mobileOff'), value: 0 }]}
        />
      </div>
      {/* Wizard max DPs — global only (not layout-specific) */}
      {!contextId && (
        <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
          <SliderSetting
            label={t('settings.grid.wizardMaxDp')}
            value={frontend.wizardMaxDatapoints ?? 500}
            min={100} max={5000} step={100}
            onChange={(v) => updateFrontend({ wizardMaxDatapoints: v })}
            presets={[{ label: '200', value: 200 }, { label: '500', value: 500 }, { label: '1k', value: 1000 }, { label: '2k', value: 2000 }, { label: '5k', value: 5000 }]}
          />
        </div>
      )}
    </Card>
  );
}

// ── Layout-aware Hilfslinien card ──────────────────────────────────────────────

function GuidelinesCard({
  frontend, updateFrontend, updateLayoutSettings, contextId, onContextChange,
}: {
  frontend: FrontendSettings;
  updateFrontend: (p: Partial<FrontendSettings>) => void;
  updateLayoutSettings: (layoutId: string, patch: Partial<LayoutSettings>) => void;
  contextId: string | null;
  onContextChange: (id: string | null) => void;
}) {
  const layouts = useDashboardStore((s) => s.layouts);
  const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

  const ls = contextId ? layouts.find((l) => l.id === contextId)?.settings : undefined;

  function eff<K extends keyof LayoutSettings & keyof FrontendSettings>(key: K): [FrontendSettings[K], boolean] {
    const ov = ls?.[key];
    return [(ov !== undefined ? ov : frontend[key]) as FrontendSettings[K], contextId !== null && ov !== undefined];
  }

  function set<K extends keyof LayoutSettings & keyof FrontendSettings>(key: K, v: FrontendSettings[K]) {
    if (!contextId) updateFrontend({ [key]: v } as Partial<FrontendSettings>);
    else updateLayoutSettings(contextId, { [key]: v } as Partial<LayoutSettings>);
  }

  function clear(key: keyof LayoutSettings) {
    if (contextId) clearLayoutSettings(contextId, key);
  }

  const [w, wOv]           = eff('guidelinesWidth');
  const [h, hOv]           = eff('guidelinesHeight');
  const [showFe, showFeOv] = eff('guidelinesShowInFrontend');
  const [enabled, enabledOv] = eff('guidelinesEnabled');

  return (
    <Card title="Hilfslinien">
      <div className="pb-2 mb-1 border-b" style={{ borderColor: 'var(--app-border)' }}>
        <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        Zeigt rote gestrichelte Linien im Editor (und optional im Frontend) zur Orientierung bei der Layout-Planung für ein Zielgerät.
      </p>
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Aktiv</p>
            {enabledOv && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                Layout
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {enabledOv && contextId && (
              <button onClick={() => clear('guidelinesEnabled')} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                ↩ Global
              </button>
            )}
            <Toggle value={enabled ?? false} onChange={(v) => set('guidelinesEnabled', v)} />
          </div>
        </div>
      </div>
      <SliderSetting
        label="Breite"
        value={w ?? 1280}
        min={320} max={3840} step={10} unit=" px"
        onChange={(v) => set('guidelinesWidth', v)}
        isOverridden={wOv}
        onClearOverride={() => clear('guidelinesWidth')}
        presets={[{ label: '768', value: 768 }, { label: '1024', value: 1024 }, { label: '1280', value: 1280 }, { label: '1920', value: 1920 }]}
      />
      <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
        <SliderSetting
          label="Höhe"
          value={h ?? 800}
          min={320} max={2160} step={10} unit=" px"
          onChange={(v) => set('guidelinesHeight', v)}
          isOverridden={hOv}
          onClearOverride={() => clear('guidelinesHeight')}
          presets={[{ label: '600', value: 600 }, { label: '768', value: 768 }, { label: '800', value: 800 }, { label: '1024', value: 1024 }, { label: '1080', value: 1080 }]}
        />
      </div>
      <div className="border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
        <div className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-1.5">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Im Frontend anzeigen</p>
            {showFeOv && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                Layout
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {showFeOv && contextId && (
              <button onClick={() => clear('guidelinesShowInFrontend')} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                ↩ Global
              </button>
            )}
            <Toggle value={showFe ?? false} onChange={(v) => set('guidelinesShowInFrontend', v)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Layout context switcher ────────────────────────────────────────────────────

function LayoutContextSwitcher({
  selectedId,
  onChange,
}: {
  selectedId: string | null; // null = global
  onChange: (id: string | null) => void;
}) {
  const layouts = useDashboardStore((s) => s.layouts);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Kontext:</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange(null)}
          className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
          style={{
            background: selectedId === null ? 'var(--accent)' : 'var(--app-bg)',
            color: selectedId === null ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${selectedId === null ? 'var(--accent)' : 'var(--app-border)'}`,
          }}
        >
          Global
        </button>
        {layouts.map((l) => (
          <button
            key={l.id}
            onClick={() => onChange(l.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
            style={{
              background: selectedId === l.id ? 'var(--accent)' : 'var(--app-bg)',
              color: selectedId === l.id ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${selectedId === l.id ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── DP Name Filter ─────────────────────────────────────────────────────────────

function DpNameFilterCard() {
  const { dpNameSuffixes, dpNameReplaceDots, setDpNameSuffixes, setDpNameReplaceDots } = useGlobalSettingsStore();
  return (
    <Card title="DP-Namen bereinigen">
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        Gilt global überall wo DP-Namen angezeigt werden.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Suffixe entfernen (kommagetrennt)
          </label>
          <input
            value={dpNameSuffixes}
            onChange={e => setDpNameSuffixes(e.target.value)}
            placeholder=".STATE, .LEVEL, :1, :2, :3"
            className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
            Wird am Ende des Namens abgeschnitten (Groß-/Kleinschreibung egal)
          </p>
        </div>
        <ToggleRow
          label="Punkte durch Leerzeichen ersetzen"
          value={dpNameReplaceDots}
          onChange={setDpNameReplaceDots}
        />
      </div>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdminSettings() {
  const t = useT();
  const tabs = useActiveLayout().tabs;
  const { frontend, updateFrontend } = useConfigStore();
  const rescaleAllWidgetsX = useDashboardStore((s) => s.rescaleAllWidgetsX);
  const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
  const MARGIN = frontend.gridGap ?? 10;

  // Layout context for Grid & Hilfslinien cards
  const [gridContextId, setGridContextId] = useState<string | null>(null);
  const [guidelinesContextId, setGuidelinesContextId] = useState<string | null>(null);
  const { autoSave, autoSaveDelay, setAutoSave, setAutoSaveDelay } = useAdminPrefsStore();
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pinMsg, setPinMsg] = useState('');
  const [showReset, setShowReset] = useState(false);

  const handlePinChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) { setPinMsg(t('settings.pin.tooShort')); return; }
    if (newPin !== confirm) { setPinMsg(t('settings.pin.mismatch')); return; }
    setupPin(newPin);
    setPinMsg(t('settings.pin.success'));
    setNewPin(''); setConfirm('');
    setTimeout(() => setPinMsg(''), 3000);
  };

  const exportConfig = () => {
    const data = {
      dashboard: JSON.parse(localStorage.getItem('aura-dashboard') ?? '{}'),
      theme: JSON.parse(localStorage.getItem('aura-theme') ?? '{}'),
      config: JSON.parse(localStorage.getItem('aura-config') ?? '{}'),
      exported: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aura-backup-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.dashboard) localStorage.setItem('aura-dashboard', JSON.stringify(data.dashboard));
        if (data.theme) localStorage.setItem('aura-theme', JSON.stringify(data.theme));
        if (data.config) localStorage.setItem('aura-config', JSON.stringify(data.config));
        window.location.reload();
      } catch { alert(t('settings.backup.invalidFile')); }
    };
    reader.readAsText(file);
  };

  const tabCount = tabs.length;

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{t('settings.title')}</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.subtitle')}</p>
      </div>

      {/* Row 0: Language + Editor side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Language */}
        <Card title={t('settings.language.title')}>
          <div className="flex gap-2">
            {(['de', 'en'] as const).map((lang) => {
              const active = (frontend.language ?? 'de') === lang;
              return (
                <button key={lang} onClick={() => updateFrontend({ language: lang })}
                  className="flex-1 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}>
                  {lang === 'de' ? `🇩🇪 ${t('settings.language.de')}` : `🇬🇧 ${t('settings.language.en')}`}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Editor */}
        <Card title={t('settings.editor.title')}>
          <ToggleRow label={t('settings.editor.autoSave')} value={autoSave} onChange={setAutoSave} />
          {autoSave && (
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.editor.delay')}</p>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                  style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
                  {autoSaveDelay}s
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[10, 30, 60, 120, 300].map((s) => {
                  const active = autoSaveDelay === s;
                  const label = s < 60 ? `${s}s` : `${s / 60} min`;
                  return (
                    <button key={s} onClick={() => setAutoSaveDelay(s)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-xs pt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            {t('settings.editor.ctrlS')}
          </p>
        </Card>

        {/* Admin-PIN */}
        <Card title={t('settings.pin.title')}>
          <form onSubmit={handlePinChange} className="space-y-2">
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t('settings.pin.newPin')}
                className="w-full rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
              <button type="button" onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <input type={show ? 'text' : 'password'} value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('settings.pin.confirm')}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
            {pinMsg && (
              <p className="text-xs" style={{ color: pinMsg.includes('erfolgreich') || pinMsg.includes('successfully') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {pinMsg}
              </p>
            )}
            <button type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80"
              style={{ background: 'var(--accent)' }}>
              {t('settings.pin.save')}
            </button>
          </form>
        </Card>

        {/* Backup */}
        <Card title={t('settings.backup.title')}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.backup.description', { count: tabCount, s: tabCount !== 1 ? 's' : '' })}
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={exportConfig}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80"
              style={{ background: 'var(--accent)' }}>
              {t('settings.backup.download')}
            </button>
            <label className="px-4 py-2 rounded-lg text-sm font-medium text-center cursor-pointer hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
              {t('settings.backup.import')}
              <input type="file" accept=".json" onChange={importConfig} className="hidden" />
            </label>
          </div>
        </Card>
      </div>

      {/* Row 1: Frontend + Grid + Hilfslinien */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Frontend-Vorgaben */}
        <Card title={t('settings.frontend.title')}>
          <ToggleRow label={t('settings.frontend.showHeader')} value={frontend.showHeader} onChange={(v) => updateFrontend({ showHeader: v })} />
          {frontend.showHeader && (
            <>
              <div className="py-2 border-b" style={{ borderColor: 'var(--app-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.dashboardTitle')}</p>
                <input value={frontend.headerTitle}
                  onChange={(e) => updateFrontend({ headerTitle: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
              </div>
              <ToggleRow label={t('settings.frontend.connectionBadge')} value={frontend.showConnectionBadge} onChange={(v) => updateFrontend({ showConnectionBadge: v })} />
              <ToggleRow label={t('settings.frontend.showAdminLink')} value={frontend.showAdminLink ?? false} onChange={(v) => updateFrontend({ showAdminLink: v })} />

              {/* ── Header clock ── */}
              <ToggleRow label={t('settings.frontend.headerClock')} value={frontend.headerClockEnabled} onChange={(v) => updateFrontend({ headerClockEnabled: v })} />
              {frontend.headerClockEnabled && (
                <div className="space-y-2 pl-1 pb-1">
                  {/* Display mode */}
                  <div>
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.headerClockDisplay')}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(['time', 'date', 'datetime'] as const).map((v) => {
                        const labels = { time: t('wf.clock.timeOnly'), date: t('wf.clock.dateOnly'), datetime: t('wf.clock.datetime') };
                        const active = (frontend.headerClockDisplay ?? 'time') === v;
                        return (
                          <button key={v} onClick={() => updateFrontend({ headerClockDisplay: v })}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                            style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                            {labels[v]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Seconds */}
                  {frontend.headerClockDisplay !== 'date' && (
                    <ToggleRow label={t('settings.frontend.headerClockSeconds')} value={frontend.headerClockShowSeconds} onChange={(v) => updateFrontend({ headerClockShowSeconds: v })} />
                  )}
                  {/* Date length */}
                  {frontend.headerClockDisplay !== 'time' && (
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.headerClockDateLen')}</p>
                      <div className="flex gap-1.5">
                        {(['short', 'long'] as const).map((v) => {
                          const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                          const active = (frontend.headerClockDateLength ?? 'short') === v;
                          return (
                            <button key={v} onClick={() => updateFrontend({ headerClockDateLength: v })}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                              style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                              {labels[v]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Custom format */}
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.headerClockCustom')}</p>
                    <input value={frontend.headerClockCustomFormat}
                      onChange={(e) => updateFrontend({ headerClockCustomFormat: e.target.value })}
                      placeholder="HH:mm · EE dd.MM."
                      className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  </div>
                </div>
              )}

              {/* ── Header datapoint ── */}
              <div className="pt-1">
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.headerDatapoint')}</p>
                <input value={frontend.headerDatapoint}
                  onChange={(e) => updateFrontend({ headerDatapoint: e.target.value })}
                  placeholder={t('settings.frontend.headerDatapointPh')}
                  className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
              </div>
              {frontend.headerDatapoint && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.frontend.headerDatapointTemplate')}</p>
                  <input value={frontend.headerDatapointTemplate ?? ''}
                    onChange={(e) => updateFrontend({ headerDatapointTemplate: e.target.value })}
                    placeholder={t('settings.frontend.headerDatapointTemplatePh')}
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{t('settings.frontend.headerDatapointTemplateHint')}</p>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Grid + Mobile + Wizard */}
        <GridCard
          frontend={frontend}
          updateFrontend={updateFrontend}
          rescaleAllWidgetsX={rescaleAllWidgetsX}
          updateLayoutSettings={updateLayoutSettings}
          contextId={gridContextId}
          onContextChange={setGridContextId}
          t={t}
          MARGIN={MARGIN}
        />

        {/* Hilfslinien */}
        <GuidelinesCard
          frontend={frontend}
          updateFrontend={updateFrontend}
          updateLayoutSettings={updateLayoutSettings}
          contextId={guidelinesContextId}
          onContextChange={setGuidelinesContextId}
        />
      </div>

      {/* Row 2: Clients + Expert + DP-Namen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClientsCard />
        <ExpertSettings />
        <DpNameFilterCard />
      </div>

      {/* Reset */}
      <div className="rounded-xl p-4" style={{ background: 'var(--app-surface)', border: '1px solid var(--accent-red)44' }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={15} style={{ color: 'var(--accent-red)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--accent-red)' }}>{t('settings.reset.title')}</p>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.reset.description')}
        </p>
        {!showReset ? (
          <button onClick={() => setShowReset(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ background: 'var(--accent-red)22', color: 'var(--accent-red)', border: '1px solid var(--accent-red)44' }}>
            {t('settings.reset.button')}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => {
              ['aura-dashboard', 'aura-theme', 'aura-config'].forEach((k) => localStorage.removeItem(k));
              window.location.href = '/';
            }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
              style={{ background: 'var(--accent-red)' }}>
              {t('settings.reset.confirm')}
            </button>
            <button onClick={() => setShowReset(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
