import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardStore } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { LayoutsListSection } from './layouts/sections/LayoutsListSection';
import { ContextPickerStrip } from './layouts/sections/ContextPickerStrip';
import { SubTabsNav, type SubTab } from './layouts/sections/SubTabsNav';

import { ThemePresetSection } from './layouts/sections/ThemePresetSection';
import { ThemeVarsSection } from './layouts/sections/ThemeVarsSection';
import { TypographySpacingSection } from './layouts/sections/TypographySpacingSection';
import { GridSection } from './layouts/sections/GridSection';
import { WizardMaxDpsSection } from './layouts/sections/WizardMaxDpsSection';
import { GuidelinesSection } from './layouts/sections/GuidelinesSection';
import { TabBarSection } from './layouts/sections/TabBarSection';

// ── ActiveSection ─────────────────────────────────────────────────────────────

function ActiveSection({ subTab, contextId, onContextChange }: {
  subTab: SubTab;
  contextId: string | null;
  onContextChange: (id: string | null) => void;
}) {
  switch (subTab) {
    case 'theme':
      return (
        <div className="space-y-6">
          <ThemePresetSection contextId={contextId} onContextChange={onContextChange} />
          <ThemeVarsSection contextId={contextId} onContextChange={onContextChange} />
        </div>
      );
    case 'typo':
      return <TypographySpacingSection contextId={contextId} onContextChange={onContextChange} />;
    case 'grid':
      return (
        <div className="space-y-4">
          <GridSection contextId={contextId} onContextChange={onContextChange} />
          {contextId === null && <WizardMaxDpsSection />}
        </div>
      );
    case 'guidelines':
      return <GuidelinesSection contextId={contextId} onContextChange={onContextChange} />;
    case 'tabbar':
      return <TabBarSection contextId={contextId} />;
    default:
      return null;
  }
}

// ── AdminLayouts ──────────────────────────────────────────────────────────────

export function AdminLayouts() {
  const t = useT();
  const { layouts, addLayout } = useDashboardStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  // ── URL-driven state ──────────────────────────────────────────────────
  const ctxParam = searchParams.get('ctx');
  const tabParam = searchParams.get('tab') as SubTab | null;

  // Resolve contextId: validate that the layout still exists
  const rawContextId = ctxParam && ctxParam !== 'global' ? ctxParam : null;
  const contextId = rawContextId && layouts.some((l) => l.id === rawContextId)
    ? rawContextId
    : null;

  // If URL contained a now-deleted layout, clean up the URL
  useEffect(() => {
    if (rawContextId && !layouts.some((l) => l.id === rawContextId)) {
      const next = new URLSearchParams(searchParams);
      next.set('ctx', 'global');
      if (next.get('tab') === 'tabbar') next.set('tab', 'theme');
      setSearchParams(next, { replace: true });
    }
  }, [layouts, rawContextId, searchParams, setSearchParams]);

  const subTab: SubTab = (() => {
    const valid: SubTab[] = ['theme', 'typo', 'grid', 'guidelines', 'tabbar'];
    if (!tabParam || !valid.includes(tabParam)) return 'theme';
    if (tabParam === 'tabbar' && contextId === null) return 'theme';
    return tabParam;
  })();

  const setContext = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.set('ctx', id ?? 'global');
    if (id === null && next.get('tab') === 'tabbar') next.set('tab', 'theme');
    setSearchParams(next, { replace: true });
  };

  const setSubTab = (tab: SubTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const handleCreate = () => {
    const name = newName.trim() || t('layouts.newLayout');
    addLayout(name);
    setNewName('');
    setShowNew(false);
  };

  const currentLayout = contextId ? layouts.find((l) => l.id === contextId) : null;

  return (
    <div className="p-6 space-y-4">
      {/* Layout List */}
      <LayoutsListSection
        onShowNew={() => setShowNew(!showNew)}
        showNew={showNew}
        newName={newName}
        onNewNameChange={setNewName}
        onCreate={handleCreate}
        onCancelNew={() => setShowNew(false)}
      />

      {/* Sticky Context + Sub-Tab Navigation */}
      <div
        className="sticky top-0 z-20 -mx-6 px-6 py-3"
        style={{
          background: 'color-mix(in srgb, var(--app-bg) 92%, transparent)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <ContextPickerStrip contextId={contextId} onChange={setContext} />
        <SubTabsNav active={subTab} onChange={setSubTab} hideTabBar={contextId === null} />
      </div>

      {/* Context hint banner */}
      <div
        className="rounded-lg px-3 py-2 text-xs"
        style={{
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
          color: 'var(--text-secondary)',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        }}
      >
        {contextId === null
          ? t('layouts.context.hintGlobal')
          : <>{t('layouts.context.hintLayout')} <span style={{ color: 'var(--accent)' }}>{currentLayout?.name}</span></>
        }
      </div>

      {/* Active Section */}
      <ActiveSection subTab={subTab} contextId={contextId} onContextChange={setContext} />

    </div>
  );
}
