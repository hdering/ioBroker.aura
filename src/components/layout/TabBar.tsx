import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import type { Tab } from '../../store/dashboardStore';

interface TabBarProps {
  readonly?: boolean;
  /** Override tabs for frontend readonly view (specific layout by slug) */
  viewTabs?: Tab[];
  viewActiveTabId?: string;
  onViewTabClick?: (tab: Tab) => void;
  /** Prefix for tab URLs, e.g. "/view/bedroom" */
  layoutUrlBase?: string;
}

export function TabBar({ readonly = false, viewTabs, viewActiveTabId, onViewTabClick, layoutUrlBase = '' }: TabBarProps) {
  const activeLayout = useActiveLayout();
  const { setActiveTab, addTab, removeTab, renameTab } = useDashboardStore();

  // In readonly frontend view, use provided override; otherwise use active editor layout
  const tabs = viewTabs ?? activeLayout.tabs;
  const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingId]);

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

  if (tabs.length <= 1 && readonly) return null;

  return (
    <div className="flex items-center gap-1 px-4 overflow-x-auto shrink-0"
      style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div key={tab.id}
            className="group flex items-center gap-1.5 px-3 py-2.5 text-sm cursor-pointer border-b-2 transition-colors whitespace-nowrap"
            style={{ borderBottomColor: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
            onClick={() => handleTabClick(tab.id)}
          >
            {!readonly && editingId === tab.id ? (
              <input ref={inputRef} value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="w-24 text-sm rounded px-1.5 py-0.5 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }} />
            ) : (
              <span onDoubleClick={(e) => { if (!readonly) { e.stopPropagation(); setEditingId(tab.id); setEditingName(tab.name); } }}>
                {tab.name}
              </span>
            )}
            {!readonly && tabs.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--accent-red)', color: '#fff' }}>✕</button>
            )}
          </div>
        );
      })}
      {!readonly && (
        <button onClick={() => addTab(`Tab ${tabs.length + 1}`)}
          className="px-3 py-2.5 text-sm transition-colors whitespace-nowrap hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}>
          + Tab
        </button>
      )}
    </div>
  );
}
