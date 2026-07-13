import { Fragment } from 'react';
import { Palette, Type, LayoutGrid, SlidersHorizontal, AlignJustify, PanelTop, Menu, Compass } from 'lucide-react';
import { useT } from '../../../../i18n';

export type SubTab = 'theme' | 'typo' | 'grid' | 'guidelines' | 'tabbar' | 'header' | 'menu' | 'nav';

// Frame tabs (whole-layout chrome) come first and are visually set apart from the
// per-scope content tabs that follow.
const FRAME_IDS: SubTab[] = ['header', 'menu', 'nav'];
const isFrame = (id: SubTab) => FRAME_IDS.includes(id);

const ALL_TABS: { id: SubTab; labelKey: string; icon: React.ElementType }[] = [
    { id: 'header', labelKey: 'layouts.subtab.header', icon: PanelTop },
    { id: 'menu', labelKey: 'layouts.subtab.menu', icon: Menu },
    { id: 'nav', labelKey: 'layouts.subtab.nav', icon: Compass },
    { id: 'tabbar', labelKey: 'layouts.subtab.tabbar', icon: AlignJustify },
    { id: 'theme', labelKey: 'layouts.subtab.theme', icon: Palette },
    { id: 'typo', labelKey: 'layouts.subtab.typo', icon: Type },
    { id: 'grid', labelKey: 'layouts.subtab.grid', icon: LayoutGrid },
    { id: 'guidelines', labelKey: 'layouts.subtab.guidelines', icon: SlidersHorizontal },
];

interface SubTabsNavProps {
    active: SubTab;
    onChange: (tab: SubTab) => void;
    /** Restrict which tabs are shown (e.g. section scope hides frame tabs). */
    allowed?: SubTab[];
}

export function SubTabsNav({ active, onChange, allowed }: SubTabsNavProps) {
    const t = useT();
    const tabs = allowed ? ALL_TABS.filter((tab) => allowed.includes(tab.id)) : ALL_TABS;

    return (
        <div className="flex gap-1 flex-wrap mt-2 items-center">
            {tabs.map(({ id, labelKey, icon: Icon }, i) => {
                const isActive = active === id;
                const frame = isFrame(id);
                // Divider between the leading frame group and the content tabs.
                const showDivider = i > 0 && isFrame(tabs[i - 1].id) && !frame;
                return (
                    <Fragment key={id}>
                        {showDivider && (
                            <span className="mx-1 self-stretch w-px" style={{ background: 'var(--app-border)' }} />
                        )}
                        <button
                            onClick={() => onChange(id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-colors"
                            style={{
                                background: isActive
                                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                                    : frame
                                      ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                                      : 'transparent',
                                color: isActive || frame ? 'var(--accent)' : 'var(--text-secondary)',
                                border: `1px solid ${
                                    isActive
                                        ? 'var(--accent)'
                                        : frame
                                          ? 'color-mix(in srgb, var(--accent) 35%, transparent)'
                                          : 'transparent'
                                }`,
                            }}
                        >
                            <Icon size={13} />
                            {t(labelKey as never)}
                        </button>
                    </Fragment>
                );
            })}
        </div>
    );
}
