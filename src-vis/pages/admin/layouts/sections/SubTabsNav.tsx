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
    <div className="flex gap-1 flex-wrap mt-2">
      {tabs.map(({ id, labelKey, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-colors"
            style={{
              background: isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
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
  );
}
