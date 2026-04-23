import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Settings, X } from 'lucide-react';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import type { Tab, TabBarItem, TabBarSettings } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { Icon } from '@iconify/react';
import { CURATED_ICON_IDS, getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { subscribeStateDirect } from '../../hooks/useIoBroker';
import { applyCustomFormat, fmtTime, fmtDate } from '../../utils/clockUtils';

interface TabBarProps {
  readonly?: boolean;
  viewTabs?: Tab[];
  viewActiveTabId?: string;
  onViewTabClick?: (tab: Tab) => void;
  layoutUrlBase?: string;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

const FONT_SIZE_MAP: Record<string, string> = {
  sm: '0.75rem',
  md: '0.875rem',
  lg: '1rem',
};

// ── Item renderers ─────────────────────────────────────────────────────────────

function TabBarClockItem({ item }: { item: TabBarItem }) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (item.clockCustomFormat) {
    return (
      <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
        {applyCustomFormat(now, item.clockCustomFormat, t)}
      </span>
    );
  }

  const timeStr = fmtTime(now, item.clockShowSeconds ?? false);
  const dateStr = fmtDate(now, item.clockDateLength ?? 'short', t);

  if (item.clockDisplay === 'datetime') {
    return (
      <div className="flex flex-col items-end leading-tight shrink-0">
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{timeStr}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
      </div>
    );
  }

  const text = item.clockDisplay === 'date' ? dateStr : timeStr;
  return (
    <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
      {text}
    </span>
  );
}

function TabBarDatapointItem({ item }: { item: TabBarItem }) {
  const [val, setVal] = useState<string>('…');
  useEffect(() => {
    if (!item.datapointId) return;
    const unsub = subscribeStateDirect(item.datapointId, (state) => {
      setVal(state?.val != null ? String(state.val) : '–');
    });
    return unsub;
  }, [item.datapointId]);

  if (item.datapointTemplate) {
    return (
      <span
        className="text-sm font-medium shrink-0"
        style={{ color: 'var(--text-primary)' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: item.datapointTemplate.replace(/\{dp\}/g, val) }}
      />
    );
  }

  return (
    <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
      {val}
    </span>
  );
}

function TabBarTextItem({ item }: { item: TabBarItem }) {
  return (
    <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text-primary)' }}>
      {item.text ?? ''}
    </span>
  );
}

function renderTabBarItem(item: TabBarItem) {
  if (item.type === 'clock') return <TabBarClockItem key={item.id} item={item} />;
  if (item.type === 'datapoint') return <TabBarDatapointItem key={item.id} item={item} />;
  return <TabBarTextItem key={item.id} item={item} />;
}

// ── Computed tab styles based on indicatorStyle ────────────────────────────────

function tabStyle(
  isActive: boolean,
  settings: TabBarSettings | undefined,
): React.CSSProperties {
  const style = settings?.indicatorStyle ?? 'underline';
  const activeClr = settings?.activeColor ?? 'var(--accent)';
  const inactiveClr = settings?.inactiveColor ?? 'var(--text-secondary)';

  if (style === 'pills') {
    return {
      background: isActive ? activeClr : 'transparent',
      color: isActive ? '#fff' : inactiveClr,
      borderRadius: '9999px',
      padding: '4px 12px',
      borderBottom: 'none',
    };
  }

  if (style === 'filled') {
    return {
      background: isActive ? `color-mix(in srgb, ${activeClr} 15%, transparent)` : 'transparent',
      color: isActive ? activeClr : inactiveClr,
      borderRadius: '8px',
      borderBottom: 'none',
    };
  }

  // underline (default)
  return {
    borderBottomColor: isActive ? activeClr : 'transparent',
    color: isActive ? activeClr : inactiveClr,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TabBar({ readonly = false, viewTabs, viewActiveTabId, onViewTabClick, layoutUrlBase = '' }: TabBarProps) {
  const t = useT();
  const activeLayout = useActiveLayout();
  const { setActiveTab, addTab, removeTab, renameTab, updateTab, reorderTabs, editMode } = useDashboardStore();

  const tabs = viewTabs ?? activeLayout.tabs;
  const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;
  const tbSettings = activeLayout.settings?.tabBar;
  const items = tbSettings?.items ?? [];

  const leftItems   = items.filter((i) => i.position === 'left');
  const centerItems = items.filter((i) => i.position === 'center');
  const rightItems  = items.filter((i) => i.position === 'right');
  const hasExtras   = centerItems.length > 0 || rightItems.length > 0;

  const mobileBreakpoint = useConfigStore((s) => s.frontend.mobileBreakpoint ?? 600);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < mobileBreakpoint);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [mobileBreakpoint]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const settingsBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragDidMoveRef = useRef(false);

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingId]);

  useEffect(() => {
    if (!editMode) setSettingsTabId(null);
  }, [editMode]);

  const commitRename = () => {
    if (editingId && editingName.trim()) renameTab(editingId, editingName.trim());
    setEditingId(null);
  };

  const handleTabClick = (tabId: string) => {
    if (readonly) {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (onViewTabClick) {
        onViewTabClick(tab);
      } else {
        navigate(`${layoutUrlBase}/tab/${tab.slug ?? tab.id}`);
      }
    } else {
      setActiveTab(tabId);
    }
  };

  const openSettings = (tabId: string) => {
    const btn = settingsBtnRefs.current.get(tabId);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 6, left: rect.left });
    setSettingsTabId((prev) => (prev === tabId ? null : tabId));
  };

  if (tabs.length <= 1 && readonly) return null;

  const settingsTab = tabs.find((t) => t.id === settingsTabId);

  // ── Container style ──────────────────────────────────────────────────────────
  const barHeight = tbSettings?.height;
  const barBg = tbSettings?.background ?? 'var(--app-surface)';
  const containerStyle: React.CSSProperties = {
    background: barBg,
    borderBottom: '1px solid var(--app-border)',
    fontSize: FONT_SIZE_MAP[tbSettings?.fontSize ?? 'md'],
    ...(barHeight ? { minHeight: `${barHeight}px` } : {}),
  };

  // ── Tab rendering ────────────────────────────────────────────────────────────
  const renderTabs = () => tabs.map((tab, idx) => {
    const isActive = tab.id === activeTabId;
    const TabIconComp = tab.icon ? getWidgetIcon(tab.icon, null as never) : null;
    const ts = tabStyle(isActive, tbSettings);
    const indicatorStyle = tbSettings?.indicatorStyle ?? 'underline';

    const isDraggingThis = editMode && !readonly && dragIdx === idx;
    const isDragTarget   = editMode && !readonly && dragOverIdx === idx && dragIdx !== idx;

    const dragHandlers = editMode && !readonly ? {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragDidMoveRef.current = false;
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      },
      onDragEnd: () => { setDragIdx(null); setDragOverIdx(null); },
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); dragDidMoveRef.current = true; setDragOverIdx(idx); },
      onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDragOverIdx(idx); },
      onDragLeave: () => { setDragOverIdx((prev) => (prev === idx ? null : prev)); },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragIdx !== null && dragIdx !== idx) reorderTabs(dragIdx, idx);
        setDragIdx(null);
        setDragOverIdx(null);
      },
    } : {};

    return (
      <div key={tab.id}
        {...dragHandlers}
        className={`group relative flex items-center gap-1.5 px-3 transition-colors whitespace-nowrap select-none ${indicatorStyle === 'underline' ? 'py-2.5 border-b-2' : 'py-1.5'} ${editMode && !readonly ? 'cursor-grab' : 'cursor-pointer'}`}
        style={{
          ...ts,
          opacity: isDraggingThis ? 0.4 : 1,
          ...(isDragTarget ? { boxShadow: '-2px 0 0 0 var(--accent)' } : {}),
        }}
        onClick={() => { if (dragDidMoveRef.current) return; setConfirmDeleteId(null); handleTabClick(tab.id); }}
      >
        {TabIconComp && (
          <TabIconComp size={14} style={{ color: 'currentColor', flexShrink: 0 }} />
        )}

        {!readonly && editingId === tab.id ? (
          <input ref={inputRef} value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
            onClick={(e) => e.stopPropagation()}
            className="w-24 text-sm rounded px-1.5 py-0.5 focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }} />
        ) : (
          (!readonly || !tab.hideLabel) && (
            <span onDoubleClick={(e) => { if (!readonly) { e.stopPropagation(); setEditingId(tab.id); setEditingName(tab.name); } }}>
              {tab.name}
            </span>
          )
        )}

        {!readonly && editMode && (
          <button
            ref={(el) => { if (el) settingsBtnRefs.current.set(tab.id, el); else settingsBtnRefs.current.delete(tab.id); }}
            onClick={(e) => { e.stopPropagation(); openSettings(tab.id); }}
            className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded transition-all hover:opacity-80"
            style={{ color: settingsTabId === tab.id ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Settings size={11} />
          </button>
        )}

        {!readonly && editMode && tabs.length > 1 && (
          confirmDeleteId === tab.id ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                className="w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}>✕</button>
              <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id); setConfirmDeleteId(null); }}
                className="w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--accent-red)', color: '#fff' }}>✓</button>
            </>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tab.id); }}
              className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
              style={{ background: 'var(--accent-red)', color: '#fff' }}>✕</button>
          )
        )}
      </div>
    );
  });

  // ── Tab settings portal ──────────────────────────────────────────────────────
  const settingsPanel = settingsTabId && settingsTab
    ? createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setSettingsTabId(null)} />
          <div
            className="fixed z-[999] rounded-xl shadow-2xl p-3 space-y-3 w-64"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              background: 'var(--app-surface)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--app-border)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('tabBar.settings')}</span>
              <button onClick={() => setSettingsTabId(null)} className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70">
                <X size={12} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('tabBar.name')}</label>
              <input type="text" value={settingsTab.name}
                onChange={(e) => updateTab(settingsTabId, { name: e.target.value })}
                className={iCls} style={iSty} />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('tabBar.hideLabel')}</label>
              <button
                onClick={() => updateTab(settingsTabId, { hideLabel: !settingsTab.hideLabel })}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: settingsTab.hideLabel ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: settingsTab.hideLabel ? '18px' : '2px' }} />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('tabBar.icon')}</label>
                {settingsTab.icon && (
                  <button onClick={() => updateTab(settingsTabId, { icon: undefined })}
                    className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    {t('tabBar.remove')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {CURATED_ICON_IDS.map((iconId) => {
                  const selected = settingsTab.icon === iconId;
                  return (
                    <button key={iconId} title={iconId}
                      onClick={() => updateTab(settingsTabId, { icon: selected ? undefined : iconId })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        background: selected ? 'var(--accent)' : 'var(--app-bg)',
                        color:      selected ? '#fff' : 'var(--text-secondary)',
                        border:     `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}>
                      <Icon icon={iconId} width={13} height={13} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  const tabsAlignment = isMobile ? 'left' : (tbSettings?.tabsAlignment ?? 'left');
  const needsGrid = hasExtras || tabsAlignment !== 'left';

  const addTabBtn = !readonly && editMode && (
    <button onClick={() => addTab(`Tab ${tabs.length + 1}`)}
      className="px-3 py-2.5 text-sm transition-colors whitespace-nowrap hover:opacity-80"
      style={{ color: 'var(--text-secondary)' }}>
      {t('tabBar.addTab')}
    </button>
  );

  if (needsGrid) {
    return (
      <>
        <div
          className="aura-tabs shrink-0"
          style={{
            ...containerStyle,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            alignItems: 'stretch',
          }}
        >
          {/* Zone 1: left items + tabs when alignment=left */}
          <div className="aura-scroll flex items-center gap-1 px-2 overflow-x-auto" style={{ minWidth: 0 }}>
            {leftItems.map(renderTabBarItem)}
            {tabsAlignment === 'left' && leftItems.length > 0 && (
              <div className="w-px self-stretch mx-1 shrink-0" style={{ background: 'var(--app-border)' }} />
            )}
            {tabsAlignment === 'left' && renderTabs()}
            {tabsAlignment === 'left' && addTabBtn}
          </div>

          {/* Zone 2: center items + tabs when alignment=center */}
          <div className="aura-scroll flex items-center justify-center gap-1 px-2 overflow-x-auto shrink-0">
            {tabsAlignment === 'center' && renderTabs()}
            {tabsAlignment === 'center' && addTabBtn}
            {tabsAlignment === 'center' && centerItems.length > 0 && (
              <div className="w-px self-stretch mx-2 shrink-0" style={{ background: 'var(--app-border)' }} />
            )}
            {centerItems.map(renderTabBarItem)}
          </div>

          {/* Zone 3: right items + tabs when alignment=right */}
          <div className="aura-scroll flex items-center justify-end gap-1 px-2 overflow-x-auto shrink-0">
            {tabsAlignment === 'right' && renderTabs()}
            {tabsAlignment === 'right' && addTabBtn}
            {tabsAlignment === 'right' && rightItems.length > 0 && (
              <div className="w-px self-stretch mx-2 shrink-0" style={{ background: 'var(--app-border)' }} />
            )}
            {rightItems.map(renderTabBarItem)}
          </div>
        </div>
        {settingsPanel}
      </>
    );
  }

  // Simple layout: alignment=left, no center/right items
  return (
    <>
      <div
        className="aura-tabs aura-scroll flex items-center gap-1 px-4 overflow-x-auto shrink-0"
        style={containerStyle}
      >
        {leftItems.map(renderTabBarItem)}
        {leftItems.length > 0 && <div className="w-px self-stretch mx-1 shrink-0" style={{ background: 'var(--app-border)' }} />}
        {renderTabs()}
        {addTabBtn}
      </div>
      {settingsPanel}
    </>
  );
}
