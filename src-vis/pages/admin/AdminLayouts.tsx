import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Copy, Trash2, Check, X, ExternalLink, LayoutDashboard, Star } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DashboardLayout, TabBarSettings, TabBarItem } from '../../store/dashboardStore';
import { useT } from '../../i18n';

function layoutUrl(layout: DashboardLayout, isFirst: boolean): string {
  return isFirst ? '#/' : `#/view/${layout.slug}`;
}

const inputCls = 'text-sm rounded-xl px-3 py-2 focus:outline-none w-full';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

// ── Layout row ────────────────────────────────────────────────────────────────

function LayoutRow({
  layout,
  isOnly,
  isFirst,
}: {
  layout: DashboardLayout;
  isOnly: boolean;
  isFirst: boolean;
}) {
  const t = useT();
  const { renameLayout, setLayoutSlug, duplicateLayout, removeLayout, setActiveLayout, setDefaultTab } = useDashboardStore();
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(layout.name);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugVal, setSlugVal] = useState(layout.slug);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dupName, setDupName] = useState(`${layout.name} (Kopie)`);
  const [showDup, setShowDup] = useState(false);

  const widgetCount = layout.tabs.reduce((n, tab) => n + tab.widgets.length, 0);
  const hash = layoutUrl(layout, isFirst);

  const commitName = () => {
    if (nameVal.trim()) renameLayout(layout.id, nameVal.trim());
    else setNameVal(layout.name);
    setEditingName(false);
  };

  const commitSlug = () => {
    const s = slugVal.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (s) setLayoutSlug(layout.id, s);
    else setSlugVal(layout.slug);
    setEditingSlug(false);
  };

  const openInEditor = () => {
    setActiveLayout(layout.id);
    navigate('/admin/editor');
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--app-surface)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
          <LayoutDashboard size={16} />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(layout.name); setEditingName(false); } }}
                className="text-sm rounded-lg px-2 py-1 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              />
              <button onClick={commitName} className="hover:opacity-70" style={{ color: 'var(--accent-green)' }}><Check size={14} /></button>
              <button onClick={() => { setNameVal(layout.name); setEditingName(false); }} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{layout.name}</span>
              <button onClick={() => setEditingName(true)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                <Pencil size={12} />
              </button>
            </div>
          )}

          {/* Slug / URL */}
          {!isFirst && editingSlug ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>#/view/</span>
              <input
                autoFocus
                value={slugVal}
                onChange={(e) => setSlugVal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                onKeyDown={(e) => { if (e.key === 'Enter') commitSlug(); if (e.key === 'Escape') { setSlugVal(layout.slug); setEditingSlug(false); } }}
                onBlur={commitSlug}
                className="text-[10px] font-mono rounded px-1.5 py-0.5 focus:outline-none w-32"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5">
              <a
                href={hash}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {hash}
              </a>
              {!isFirst && (
                <button onClick={() => { setSlugVal(layout.slug); setEditingSlug(true); }}
                  className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  <Pencil size={10} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="text-right shrink-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{layout.tabs.length} Tab{layout.tabs.length !== 1 ? 's' : ''}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{widgetCount} Widget{widgetCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={hash}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('layouts.open')}
          >
            <ExternalLink size={13} />
          </a>
          <button
            onClick={openInEditor}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Pencil size={12} /> {t('layouts.edit')}
          </button>
          <button
            onClick={() => setShowDup(!showDup)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('common.duplicate')}
          >
            <Copy size={13} />
          </button>
          {!isOnly && (
            confirmDelete ? (
              <>
                <button onClick={() => removeLayout(layout.id)}
                  className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent-red)' }}>{t('common.delete')}</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  <X size={13} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--accent-red)', border: '1px solid var(--app-border)' }}
                title={t('layouts.delete')}
              >
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Duplicate panel */}
      {showDup && (
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('layouts.duplicateName')}</span>
          <input
            value={dupName}
            onChange={(e) => setDupName(e.target.value)}
            className={`${inputCls} flex-1`}
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter') { duplicateLayout(layout.id, dupName); setShowDup(false); } }}
          />
          <button
            onClick={() => { duplicateLayout(layout.id, dupName); setShowDup(false); }}
            className="px-3 py-2 rounded-xl text-xs font-medium text-white hover:opacity-80 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            {t('layouts.duplicate')}
          </button>
          <button onClick={() => setShowDup(false)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tab list */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 items-center" style={{ borderTop: '1px solid var(--app-border)' }}>
        <span className="text-[10px] shrink-0 mr-1" style={{ color: 'var(--text-secondary)' }}>{t('layouts.defaultTab')}:</span>
        {layout.tabs.map((tab) => {
          const isDefault = (layout.defaultTabId ?? layout.tabs[0]?.id) === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setDefaultTab(layout.id, tab.id)}
              title={t('layouts.setDefaultTab')}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors"
              style={{
                background: isDefault ? 'var(--accent)22' : 'var(--app-surface)',
                color: isDefault ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${isDefault ? 'var(--accent)' : 'var(--app-border)'}`,
              }}
            >
              {isDefault && <Star size={9} fill="currentColor" />}
              {tab.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab bar settings ───────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={isHex ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-7 rounded cursor-pointer border-0 p-0.5 shrink-0"
          style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="var(--accent) oder #hex"
          className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
        />
        {value && (
          <button onClick={() => onChange('')} className="shrink-0 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function TabBarItemRow({
  item,
  onUpdate,
  onRemove,
  t,
}: {
  item: TabBarItem;
  onUpdate: (patch: Partial<TabBarItem>) => void;
  onRemove: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [expanded, setExpanded] = useState(false);
  const posLabels: Record<string, string> = {
    left: t('settings.tabBar.posLeft'),
    center: t('settings.tabBar.posCenter'),
    right: t('settings.tabBar.posRight'),
  };
  const typeLabel = item.type === 'clock'
    ? t('settings.tabBar.itemTypeClock')
    : item.type === 'datapoint'
      ? t('settings.tabBar.itemTypeDatapoint')
      : t('settings.tabBar.itemTypeText');

  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
        <div className="flex gap-0.5 shrink-0">
          {(['left', 'center', 'right'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => onUpdate({ position: pos })}
              title={posLabels[pos]}
              className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
              style={{
                background: item.position === pos ? 'var(--accent)' : 'var(--app-surface)',
                color: item.position === pos ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${item.position === pos ? 'var(--accent)' : 'var(--app-border)'}`,
              }}
            >
              {pos === 'left' ? 'L' : pos === 'center' ? 'M' : 'R'}
            </button>
          ))}
        </div>
        <span className="text-xs flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>{typeLabel}</span>
        <button onClick={() => setExpanded((e) => !e)} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onRemove} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
          <X size={13} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 py-2 space-y-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
          {item.type === 'clock' && (
            <>
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.clockDisplay')}</p>
                <div className="flex gap-1 flex-wrap">
                  {(['time', 'date', 'datetime'] as const).map((v) => {
                    const labels = { time: t('wf.clock.timeOnly'), date: t('wf.clock.dateOnly'), datetime: t('wf.clock.datetime') };
                    const active = (item.clockDisplay ?? 'time') === v;
                    return (
                      <button key={v} onClick={() => onUpdate({ clockDisplay: v })}
                        className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                        {labels[v]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(item.clockDisplay ?? 'time') !== 'date' && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.clockSeconds')}</span>
                  <button onClick={() => onUpdate({ clockShowSeconds: !item.clockShowSeconds })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: item.clockShowSeconds ? 'var(--accent)' : 'var(--app-border)' }}>
                    <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                      style={{ left: item.clockShowSeconds ? '18px' : '2px' }} />
                  </button>
                </div>
              )}
              {(item.clockDisplay ?? 'time') !== 'time' && (
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.clockDateLen')}</p>
                  <div className="flex gap-1">
                    {(['short', 'long'] as const).map((v) => {
                      const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                      const active = (item.clockDateLength ?? 'short') === v;
                      return (
                        <button key={v} onClick={() => onUpdate({ clockDateLength: v })}
                          className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                          style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                          {labels[v]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.clockCustom')}</p>
                <input type="text" value={item.clockCustomFormat ?? ''}
                  onChange={(e) => onUpdate({ clockCustomFormat: e.target.value || undefined })}
                  placeholder="HH:mm:ss" className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono" style={iSty} />
              </div>
            </>
          )}
          {item.type === 'datapoint' && (
            <>
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.datapointId')}</p>
                <input type="text" value={item.datapointId ?? ''}
                  onChange={(e) => onUpdate({ datapointId: e.target.value || undefined })}
                  placeholder="hm-rpc.0.ABC.1.TEMPERATURE" className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono" style={iSty} />
              </div>
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.datapointTemplate')}</p>
                <input type="text" value={item.datapointTemplate ?? ''}
                  onChange={(e) => onUpdate({ datapointTemplate: e.target.value || undefined })}
                  placeholder="{dp} °C" className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono" style={iSty} />
              </div>
            </>
          )}
          {item.type === 'text' && (
            <div>
              <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('settings.tabBar.staticText')}</p>
              <input type="text" value={item.text ?? ''}
                onChange={(e) => onUpdate({ text: e.target.value || undefined })}
                placeholder="Mein Dashboard" className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none" style={iSty} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBarCard() {
  const t = useT();
  const layouts = useDashboardStore((s) => s.layouts);
  const activeLayoutId = useDashboardStore((s) => s.activeLayoutId);
  const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
  const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

  const [selectedId, setSelectedId] = useState(activeLayoutId);
  const layout = layouts.find((l) => l.id === selectedId) ?? layouts[0];
  const tbs: TabBarSettings = layout?.settings?.tabBar ?? {};

  const update = (patch: Partial<TabBarSettings>) => {
    if (!layout) return;
    updateLayoutSettings(layout.id, { tabBar: { ...(layout.settings?.tabBar ?? {}), ...patch } });
  };

  const updateItem = (id: string, patch: Partial<TabBarItem>) => {
    const items = (tbs.items ?? []).map((it) => it.id === id ? { ...it, ...patch } : it);
    update({ items });
  };

  const removeItem = (id: string) => {
    update({ items: (tbs.items ?? []).filter((it) => it.id !== id) });
  };

  const addItem = (type: TabBarItem['type']) => {
    const newItem: TabBarItem = {
      id: `tbi-${Date.now()}`,
      type,
      position: 'right',
      ...(type === 'clock' ? { clockDisplay: 'time' } : {}),
    };
    update({ items: [...(tbs.items ?? []), newItem] });
  };

  const clearAll = () => {
    if (layout) clearLayoutSettings(layout.id, 'tabBar');
  };

  const hasOverride = !!layout?.settings?.tabBar && Object.keys(layout.settings.tabBar).length > 0;

  const styleOptions: Array<{ key: TabBarSettings['indicatorStyle']; label: string }> = [
    { key: 'underline', label: t('settings.tabBar.styleUnderline') },
    { key: 'filled',    label: t('settings.tabBar.styleFilled') },
    { key: 'pills',     label: t('settings.tabBar.stylePills') },
  ];

  const fontOptions: Array<{ key: TabBarSettings['fontSize']; label: string }> = [
    { key: 'sm', label: t('settings.tabBar.fontSm') },
    { key: 'md', label: t('settings.tabBar.fontMd') },
    { key: 'lg', label: t('settings.tabBar.fontLg') },
  ];

  const alignOptions: Array<{ key: TabBarSettings['tabsAlignment']; label: string }> = [
    { key: 'left',   label: t('settings.tabBar.alignLeft') },
    { key: 'center', label: t('settings.tabBar.alignCenter') },
    { key: 'right',  label: t('settings.tabBar.alignRight') },
  ];

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.tabBar.title')}
        </p>
        {hasOverride && (
          <button onClick={clearAll} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.tabBar.clearAll')}
          </button>
        )}
      </div>

      {/* Layout selector */}
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none w-full"
        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
      >
        {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Col 1: Height + Style + Font */}
        <div className="space-y-4">
          {/* Height */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.tabBar.height')}</p>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
                {tbs.height ?? 40}px
              </span>
            </div>
            <input type="range" min={28} max={72} step={2} value={tbs.height ?? 40}
              onChange={(e) => update({ height: Number(e.target.value) })}
              className="w-full accent-[var(--accent)] mb-2" />
            <div className="flex gap-1.5 flex-wrap">
              {[32, 36, 40, 48, 56].map((v) => {
                const active = (tbs.height ?? 40) === v;
                return (
                  <button key={v} onClick={() => update({ height: v })}
                    className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Indicator style */}
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.tabBar.style')}</p>
            <div className="flex gap-1.5">
              {styleOptions.map(({ key, label }) => {
                const active = (tbs.indicatorStyle ?? 'underline') === key;
                return (
                  <button key={key} onClick={() => update({ indicatorStyle: key })}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font size */}
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.tabBar.fontSize')}</p>
            <div className="flex gap-1.5">
              {fontOptions.map(({ key, label }) => {
                const active = (tbs.fontSize ?? 'md') === key;
                return (
                  <button key={key} onClick={() => update({ fontSize: key })}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu alignment */}
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.tabBar.tabsAlignment')}</p>
            <div className="flex gap-1.5">
              {alignOptions.map(({ key, label }) => {
                const active = (tbs.tabsAlignment ?? 'left') === key;
                return (
                  <button key={key} onClick={() => update({ tabsAlignment: key })}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Col 2: Colors */}
        <div className="space-y-3">
          <ColorInput label={t('settings.tabBar.background')} value={tbs.background ?? ''} onChange={(v) => update({ background: v || undefined })} />
          <ColorInput label={t('settings.tabBar.activeColor')} value={tbs.activeColor ?? ''} onChange={(v) => update({ activeColor: v || undefined })} />
          <ColorInput label={t('settings.tabBar.inactiveColor')} value={tbs.inactiveColor ?? ''} onChange={(v) => update({ inactiveColor: v || undefined })} />
        </div>

        {/* Col 3: Items */}
        <div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.tabBar.items')}</p>
          <div className="space-y-1.5">
            {(tbs.items ?? []).map((item) => (
              <TabBarItemRow
                key={item.id}
                item={item}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                t={t}
              />
            ))}
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(['clock', 'datapoint', 'text'] as const).map((type) => {
              const label = type === 'clock'
                ? t('settings.tabBar.itemTypeClock')
                : type === 'datapoint'
                  ? t('settings.tabBar.itemTypeDatapoint')
                  : t('settings.tabBar.itemTypeText');
              return (
                <button key={type} onClick={() => addItem(type)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  <Plus size={11} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminLayouts() {
  const t = useT();
  const { layouts, addLayout } = useDashboardStore();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const handleCreate = () => {
    const name = newName.trim() || t('layouts.newLayout');
    addLayout(name);
    setNewName('');
    setShowNew(false);
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{t('layouts.title')}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('layouts.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={14} /> {t('layouts.newLayout')}
        </button>
      </div>

      {/* New layout form */}
      {showNew && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
            placeholder={t('layouts.placeholder')}
            className={`${inputCls} flex-1`}
            style={inputStyle}
          />
          <button onClick={handleCreate}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80 shrink-0"
            style={{ background: 'var(--accent)' }}>
            {t('layouts.create')}
          </button>
          <button onClick={() => setShowNew(false)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Layout list */}
      <div className="space-y-3">
        {layouts.map((layout) => (
          <LayoutRow key={layout.id} layout={layout} isOnly={layouts.length === 1} isFirst={layouts[0]?.id === layout.id} />
        ))}
      </div>

      {/* Tab bar settings */}
      <TabBarCard />

      {/* URL reference */}
      <div className="rounded-xl p-4 text-xs space-y-1" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}>
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('layouts.urlSchema')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/</span> — {t('layouts.default')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/view/:slug</span> — {t('layouts.specific')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/view/:slug/tab/:tabSlug</span> — {t('layouts.specificTab')}</p>
      </div>
    </div>
  );
}
