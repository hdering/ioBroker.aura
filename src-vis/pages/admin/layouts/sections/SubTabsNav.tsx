import { Palette, Type, LayoutGrid, SlidersHorizontal, AlignJustify } from 'lucide-react';
import { useT } from '../../../../i18n';

export type SubTab = 'theme' | 'typo' | 'grid' | 'guidelines' | 'tabbar';

const ALL_TABS: { id: SubTab; labelKey: string; icon: React.ElementType }[] = [
  { id: 'theme',      labelKey: 'layouts.subtab.theme',      icon: Palette },
  { id: 'typo',       labelKey: 'layouts.subtab.typo',       icon: Type },
  { id: 'grid',       labelKey: 'layouts.subtab.grid',       icon: LayoutGrid },
  { id: 'guidelines', labelKey: 'layouts.subtab.guidelines', icon: SlidersHorizontal },
  { id: 'tabbar',     labelKey: 'layouts.subtab.tabbar',     icon: AlignJustify },
];

interface SubTabsNavProps {
  active: SubTab;
  onChange: (tab: SubTab) => void;
  hideTabBar: boolean;
}

export function SubTabsNav({ active, onChange, hideTabBar }: SubTabsNavProps) {
  const t = useT();
  const tabs = ALL_TABS.filter((tab) => !(hideTabBar && tab.id === 'tabbar'));

  return (
    <div className="flex gap-1 flex-wrap mt-2 items-center">
      {tabs.map(({ id, labelKey, icon: Icon }) => {
        const isActive = active === id;
        const isContextOnly = id === 'tabbar';
        return (
          <span key={id} className="flex items-center gap-1">
            {isContextOnly && (
              <span
                aria-hidden
                className="mx-1 h-5 w-px"
                style={{ background: 'color-mix(in srgb, var(--accent-yellow) 50%, transparent)' }}
              />
            )}
            <button
              onClick={() => onChange(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-colors ${isContextOnly ? 'subtabs-context-only' : ''}`}
              style={{
                background: isActive
                  ? isContextOnly
                    ? 'color-mix(in srgb, var(--accent-yellow) 20%, transparent)'
                    : 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  : isContextOnly
                    ? 'color-mix(in srgb, var(--accent-yellow) 12%, transparent)'
                    : 'transparent',
                color: isActive
                  ? isContextOnly
                    ? 'var(--accent-yellow)'
                    : 'var(--accent)'
                  : isContextOnly
                    ? 'var(--accent-yellow)'
                    : 'var(--text-secondary)',
                border: `1px solid ${
                  isActive
                    ? isContextOnly
                      ? 'var(--accent-yellow)'
                      : 'var(--accent)'
                    : isContextOnly
                      ? 'var(--accent-yellow)'
                      : 'transparent'
                }`,
              }}
            >
              <Icon size={13} />
              {t(labelKey as never)}
              {isContextOnly && (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full subtabs-context-pulse"
                  style={{
                    background: 'var(--accent-yellow)',
                    boxShadow: '0 0 8px var(--accent-yellow)',
                  }}
                />
              )}
            </button>
          </span>
        );
      })}
      <style>{`
        @keyframes subtabsContextOnlyIn {
          0%   { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes subtabsContextPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.35); }
        }
        .subtabs-context-only {
          animation: subtabsContextOnlyIn 260ms ease-out;
        }
        .subtabs-context-pulse {
          animation: subtabsContextPulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
