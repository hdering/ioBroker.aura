import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Settings, X } from 'lucide-react';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import type { Tab } from '../../store/dashboardStore';
import { ICON_PICKER_ENTRIES, WIDGET_ICON_MAP } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';

interface TabBarProps {
  readonly?: boolean;
  /** Override tabs for frontend readonly view (specific layout by slug) */
  viewTabs?: Tab[];
  viewActiveTabId?: string;
  onViewTabClick?: (tab: Tab) => void;
  /** Prefix for tab URLs, e.g. "/view/bedroom" */
  layoutUrlBase?: string;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

export function TabBar({ readonly = false, viewTabs, viewActiveTabId, onViewTabClick, layoutUrlBase = '' }: TabBarProps) {
  const t = useT();
  const activeLayout = useActiveLayout();
  const { setActiveTab, addTab, removeTab, renameTab, updateTab, editMode } = useDashboardStore();

  const tabs = viewTabs ?? activeLayout.tabs;
  const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Tab settings panel
  const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const settingsBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingId]);

  // Close settings panel when edit mode is turned off
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

  const settingsPanel = settingsTabId && settingsTab
    ? createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[998]" onClick={() => setSettingsTabId(null)} />
          {/* Panel */}
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
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('tabBar.settings')}</span>
              <button onClick={() => setSettingsTabId(null)} className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70">
                <X size={12} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('tabBar.name')}</label>
              <input
                type="text"
                value={settingsTab.name}
                onChange={(e) => updateTab(settingsTabId, { name: e.target.value })}
                className={iCls}
                style={iSty}
              />
            </div>

            {/* Hide label */}
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

            {/* Icon picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('tabBar.icon')}</label>
                {settingsTab.icon && (
                  <button
                    onClick={() => updateTab(settingsTabId, { icon: undefined })}
                    className="text-[10px] hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('tabBar.remove')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {ICON_PICKER_ENTRIES.map(([name, Icon]) => {
                  const selected = settingsTab.icon === name;
                  return (
                    <button
                      key={name}
                      title={name}
                      onClick={() => updateTab(settingsTabId, { icon: selected ? undefined : name })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        background: selected ? 'var(--accent)' : 'var(--app-bg)',
                        color:      selected ? '#fff' : 'var(--text-secondary)',
                        border:     `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}
                    >
                      <Icon size={13} />
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

  return (
    <>
      <div className="aura-scroll flex items-center gap-1 px-4 overflow-x-auto shrink-0"
        style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const TabIcon = tab.icon ? WIDGET_ICON_MAP[tab.icon] : null;
          return (
            <div key={tab.id}
              className="group relative flex items-center gap-1.5 px-3 py-2.5 text-sm cursor-pointer border-b-2 transition-colors whitespace-nowrap"
              style={{ borderBottomColor: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
              onClick={() => handleTabClick(tab.id)}
            >
              {/* Icon */}
              {TabIcon && (
                <TabIcon size={14} style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
              )}

              {/* Label */}
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

              {/* Settings button (edit mode only) */}
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

              {/* Remove button (edit mode only) */}
              {!readonly && editMode && tabs.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                  style={{ background: 'var(--accent-red)', color: '#fff' }}>✕</button>
              )}
            </div>
          );
        })}
        {!readonly && editMode && (
          <button onClick={() => addTab(`Tab ${tabs.length + 1}`)}
            className="px-3 py-2.5 text-sm transition-colors whitespace-nowrap hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}>
            {t('tabBar.addTab')}
          </button>
        )}
      </div>
      {settingsPanel}
    </>
  );
}
