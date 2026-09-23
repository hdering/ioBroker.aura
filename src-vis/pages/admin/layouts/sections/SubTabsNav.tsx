import { Fragment } from 'react';
import {
    Palette,
    Type,
    LayoutGrid,
    SlidersHorizontal,
    AlignJustify,
    PanelTop,
    Menu,
    Compass,
    Hash,
    Shapes,
    Globe2,
    Layers,
    Lock,
    SunMoon,
    SwatchBook,
    MousePointerClick,
    ArrowUpLeft,
} from 'lucide-react';
import { useT, type TranslationKey } from '../../../../i18n';
import {
    BAND_ORDER,
    BAND_TABS,
    BAND_INDEX,
    OVERRIDE_COLOR,
    type Band,
    type ScopeLevel,
    type SubTab,
} from '../shared/scopeBands';

export type { SubTab };

export const TAB_LABEL_KEY: Record<SubTab, TranslationKey> = {
    values: 'layouts.subtab.values',
    sync: 'layouts.subtab.sync',
    mythemes: 'layouts.subtab.mythemes',
    behavior: 'layouts.subtab.behavior',
    header: 'layouts.subtab.header',
    menu: 'layouts.subtab.menu',
    icons: 'layouts.subtab.icons',
    tabbar: 'layouts.subtab.tabbar',
    theme: 'layouts.subtab.theme',
    typo: 'layouts.subtab.typo',
    grid: 'layouts.subtab.grid',
    guidelines: 'layouts.subtab.guidelines',
    nav: 'layouts.subtab.nav',
};

const TAB_ICON: Record<SubTab, React.ElementType> = {
    values: Hash,
    sync: SunMoon,
    mythemes: SwatchBook,
    behavior: MousePointerClick,
    header: PanelTop,
    menu: Menu,
    icons: Shapes,
    tabbar: AlignJustify,
    theme: Palette,
    typo: Type,
    grid: LayoutGrid,
    guidelines: SlidersHorizontal,
    nav: Compass,
};

const BAND_ICON: Record<Band, React.ElementType> = { global: Globe2, layout: PanelTop, section: Layers };
const BAND_LABEL: Record<Band, TranslationKey> = {
    global: 'design.band.global',
    layout: 'design.band.layout',
    section: 'design.band.section',
};
const BAND_HINT: Record<Band, TranslationKey> = {
    global: 'design.band.globalHint',
    layout: 'design.band.layoutHint',
    section: 'design.band.sectionHint',
};

interface SubTabsNavProps {
    active: SubTab;
    onChange: (tab: SubTab) => void;
    /** Scope selected in the tree — decides which bands are locked here. */
    level: ScopeLevel;
    /** Own values per group at the selected scope (orange counters). */
    ownCounts?: Partial<Record<SubTab, number>>;
    /** Where a locked band is edited: the jump shown at the end of its row. */
    jumpTarget: (band: Band) => { label: string; onClick: () => void } | null;
}

/**
 * Three rows, one per band, named after the chain each group may be overridden
 * along: Global · Global → Layout · Global → Layout → Bereich. Every tab stays
 * visible at every scope; a row whose chain ends above the selected scope is
 * locked and points back up.
 */
export function SubTabsNav({ active, onChange, level, ownCounts = {}, jumpTarget }: SubTabsNavProps) {
    const t = useT();
    return (
        <div
            className="rounded-xl px-3 sm:px-4 py-1"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            data-testid="design-bands"
        >
            {BAND_ORDER.map((band, bi) => {
                const locked = BAND_INDEX[level] > BAND_INDEX[band];
                const BandIcon = BAND_ICON[band];
                const jump = locked ? jumpTarget(band) : null;
                return (
                    <Fragment key={band}>
                        <div
                            className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-2 lg:gap-3 items-center py-2"
                            style={{
                                borderBottom: bi < BAND_ORDER.length - 1 ? '1px dashed var(--app-border)' : undefined,
                                opacity: 1,
                            }}
                            data-testid={`design-band-${band}`}
                            data-locked={locked ? 'true' : undefined}
                        >
                            <div className="flex flex-col gap-0.5" style={{ opacity: locked ? 0.6 : 1 }}>
                                <span
                                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <BandIcon size={12} />
                                    {t(BAND_LABEL[band])}
                                </span>
                                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t(BAND_HINT[band])}
                                </span>
                            </div>
                            <div className="flex gap-1 flex-wrap items-center">
                                {BAND_TABS[band].map((id) => {
                                    const isActive = active === id;
                                    const Icon = TAB_ICON[id];
                                    const n = ownCounts[id] ?? 0;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => onChange(id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-colors"
                                            style={{
                                                background: isActive
                                                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                                                    : 'transparent',
                                                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                                border: `1px ${locked && isActive ? 'dashed' : 'solid'} ${isActive ? 'var(--accent)' : 'transparent'}`,
                                                opacity: locked ? (isActive ? 0.85 : 0.5) : 1,
                                            }}
                                            title={n ? t('design.tab.ownTitle', { count: String(n) }) : undefined}
                                            data-testid={`design-tab-${id}`}
                                        >
                                            <Icon size={13} />
                                            {t(TAB_LABEL_KEY[id])}
                                            {n > 0 && (
                                                <span
                                                    className="text-[10px] leading-[14px] px-1.5 rounded-full font-semibold"
                                                    style={{ background: OVERRIDE_COLOR, color: '#fff' }}
                                                    data-testid={`design-tab-own-${id}`}
                                                >
                                                    {n}
                                                </span>
                                            )}
                                            {locked && <Lock size={10} />}
                                        </button>
                                    );
                                })}
                                {jump && (
                                    <button
                                        onClick={jump.onClick}
                                        className="lg:ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] hover:opacity-80"
                                        style={{
                                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                                            color: 'var(--accent)',
                                            border: '1px solid var(--accent)',
                                        }}
                                        data-testid={`design-band-jump-${band}`}
                                    >
                                        <ArrowUpLeft size={11} />
                                        {t('design.band.editAt', { scope: jump.label })}
                                    </button>
                                )}
                            </div>
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}
