import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code2, Braces } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { CustomCssSection } from './layouts/sections/CustomCssSection';
import { CustomJsSection } from './layouts/sections/CustomJsSection';
import { ADMIN_PAGE_PAD, AdminPageTitle, AdminPageSubtitle } from './AdminPageHeader';

type CssJsTab = 'css' | 'js';

const TABS: { id: CssJsTab; labelKey: string; icon: React.ElementType }[] = [
    { id: 'css', labelKey: 'cssjs.tab.css', icon: Code2 },
    { id: 'js', labelKey: 'cssjs.tab.js', icon: Braces },
];

export function AdminCssJs() {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const [searchParams, setSearchParams] = useSearchParams();
    const [contextId, setContextId] = useState<string | null>(null);

    const tabParam = searchParams.get('tab') as CssJsTab | null;
    const activeTab: CssJsTab = tabParam === 'js' ? 'js' : 'css';

    const setTab = (tab: CssJsTab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    const handleContextChange = (id: string | null) => {
        if (id !== null && !layouts.some((l) => l.id === id)) return;
        setContextId(id);
    };

    return (
        <div className={`${ADMIN_PAGE_PAD} space-y-4`}>
            <div>
                <AdminPageTitle>{t('cssjs.title')}</AdminPageTitle>
                <AdminPageSubtitle>{t('cssjs.subtitle')}</AdminPageSubtitle>
            </div>

            <div className="flex gap-1 flex-wrap">
                {TABS.map(({ id, labelKey, icon: Icon }) => {
                    const isActive = activeTab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-colors"
                            style={{
                                background: isActive
                                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                                    : 'transparent',
                                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                            }}
                        >
                            <Icon size={13} />
                            {t(labelKey as never)}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'css' ? (
                <CustomCssSection contextId={contextId} onContextChange={handleContextChange} />
            ) : (
                <CustomJsSection contextId={contextId} onContextChange={handleContextChange} />
            )}
        </div>
    );
}
