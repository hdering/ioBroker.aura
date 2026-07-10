import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe2, LayoutDashboard, PanelTop, Menu, Compass } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { SubTabsNav, type SubTab } from './layouts/sections/SubTabsNav';

import { ThemePresetSection } from './layouts/sections/ThemePresetSection';
import { ThemeVarsSection } from './layouts/sections/ThemeVarsSection';
import { BrowserThemeSyncSection } from './layouts/sections/BrowserThemeSyncSection';
import { TypographySpacingSection } from './layouts/sections/TypographySpacingSection';
import { GridSection } from './layouts/sections/GridSection';
import { WizardMaxDpsSection } from './layouts/sections/WizardMaxDpsSection';
import { GuidelinesSection } from './layouts/sections/GuidelinesSection';
import { TabBarSection } from './layouts/sections/TabBarSection';
import { HeaderSection } from './layouts/sections/HeaderSection';
import { LayoutMenuSection } from './layouts/sections/LayoutMenuSection';
import { NavigationSection } from './layouts/sections/NavigationSection';

// ── ActiveSection ─────────────────────────────────────────────────────────────

function ActiveSection({ subTab, contextId }: { subTab: SubTab; contextId: string | null }) {
    switch (subTab) {
        case 'theme':
            return (
                <div className="space-y-6">
                    {contextId === null && <BrowserThemeSyncSection />}
                    <ThemePresetSection contextId={contextId} />
                    <ThemeVarsSection contextId={contextId} />
                </div>
            );
        case 'typo':
            return <TypographySpacingSection contextId={contextId} />;
        case 'grid':
            return (
                <div className="space-y-4">
                    <GridSection contextId={contextId} />
                    {contextId === null && <WizardMaxDpsSection />}
                </div>
            );
        case 'guidelines':
            return <GuidelinesSection contextId={contextId} />;
        case 'tabbar':
            return <TabBarSection contextId={contextId} />;
        default:
            return null;
    }
}

// ── ScopeRail ─────────────────────────────────────────────────────────────────

interface ScopeRowProps {
    active: boolean;
    onClick: () => void;
    label: string;
    sub?: string;
    iconNode: React.ReactNode;
}

function ScopeRow({ active, onClick, label, sub, iconNode }: ScopeRowProps) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors hover:opacity-90"
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--accent)' : 'var(--text-primary)',
            }}
        >
            <span
                className="w-6 h-6 flex items-center justify-center shrink-0 rounded"
                style={{ background: active ? 'transparent' : 'var(--app-bg)' }}
            >
                {iconNode}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate">{label}</span>
                {sub && (
                    <span
                        className="block text-[10px] truncate"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: 0.8 }}
                    >
                        {sub}
                    </span>
                )}
            </span>
        </button>
    );
}

// ── AdminDesign ───────────────────────────────────────────────────────────────

export function AdminDesign() {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const [searchParams, setSearchParams] = useSearchParams();

    // ── URL-driven state ──────────────────────────────────────────────────
    const ctxParam = searchParams.get('ctx');
    const tabParam = searchParams.get('tab') as SubTab | null;
    const frameParam = searchParams.get('frame');

    // 'header' / 'menu' / 'nav' select a global frame section (shown in the right
    // pane instead of the scoped appearance tabs). null = normal scope mode.
    const frame: 'header' | 'menu' | 'nav' | null =
        frameParam === 'header' || frameParam === 'menu' || frameParam === 'nav' ? frameParam : null;

    const rawContextId = ctxParam && ctxParam !== 'global' ? ctxParam : null;
    const contextId = rawContextId && layouts.some((l) => l.id === rawContextId) ? rawContextId : null;

    useEffect(() => {
        if (rawContextId && !layouts.some((l) => l.id === rawContextId)) {
            const next = new URLSearchParams(searchParams);
            next.set('ctx', 'global');
            setSearchParams(next, { replace: true });
        }
    }, [layouts, rawContextId, searchParams, setSearchParams]);

    const subTab: SubTab = (() => {
        const valid: SubTab[] = ['theme', 'typo', 'grid', 'guidelines', 'tabbar'];
        if (!tabParam || !valid.includes(tabParam)) return 'theme';
        return tabParam;
    })();

    const setContext = (id: string | null) => {
        const next = new URLSearchParams(searchParams);
        next.delete('frame');
        next.set('ctx', id ?? 'global');
        setSearchParams(next, { replace: true });
    };

    const setSubTab = (tab: SubTab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    const setFrame = (f: 'header' | 'menu' | 'nav') => {
        const next = new URLSearchParams(searchParams);
        next.set('frame', f);
        setSearchParams(next, { replace: true });
    };

    return (
        <div className="p-6 space-y-4">
            <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t('design.title')}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('design.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                {/* Left rail: global frame sections + scope picker */}
                <aside
                    className="md:sticky md:top-0 self-start rounded-xl p-2 space-y-1"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <p
                        className="text-[10px] uppercase tracking-widest px-2 py-1.5 font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('design.frameGroup')}
                    </p>
                    <ScopeRow
                        active={frame === 'header'}
                        onClick={() => setFrame('header')}
                        label={t('layouts.subtab.header')}
                        iconNode={<PanelTop size={13} />}
                    />
                    <ScopeRow
                        active={frame === 'menu'}
                        onClick={() => setFrame('menu')}
                        label={t('layouts.subtab.menu')}
                        iconNode={<Menu size={13} />}
                    />
                    <ScopeRow
                        active={frame === 'nav'}
                        onClick={() => setFrame('nav')}
                        label={t('layouts.subtab.nav')}
                        iconNode={<Compass size={13} />}
                    />

                    <div className="h-px my-1.5" style={{ background: 'var(--app-border)' }} />

                    <p
                        className="text-[10px] uppercase tracking-widest px-2 py-1.5 font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('layouts.scope.title')}
                    </p>
                    <ScopeRow
                        active={frame === null && contextId === null}
                        onClick={() => setContext(null)}
                        label={t('layouts.scope.global')}
                        sub={t('layouts.scope.globalHint')}
                        iconNode={<Globe2 size={13} />}
                    />
                    {layouts.map((l) => (
                        <ScopeRow
                            key={l.id}
                            active={frame === null && contextId === l.id}
                            onClick={() => setContext(l.id)}
                            label={l.name}
                            iconNode={
                                l.icon ? <Icon icon={l.icon} width={13} height={13} /> : <LayoutDashboard size={13} />
                            }
                        />
                    ))}
                </aside>

                {/* Right pane: selected frame section, or the scoped appearance tabs */}
                <div className="min-w-0 space-y-4">
                    {frame === 'header' ? (
                        <HeaderSection />
                    ) : frame === 'menu' ? (
                        <LayoutMenuSection />
                    ) : frame === 'nav' ? (
                        <NavigationSection />
                    ) : (
                        <>
                            <div
                                className="sticky top-0 z-20 -mt-2 py-2"
                                style={{
                                    background: 'color-mix(in srgb, var(--app-bg) 92%, transparent)',
                                    backdropFilter: 'blur(8px)',
                                    borderBottom: '1px solid var(--app-border)',
                                }}
                            >
                                <SubTabsNav active={subTab} onChange={setSubTab} />
                            </div>

                            <ActiveSection subTab={subTab} contextId={contextId} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
