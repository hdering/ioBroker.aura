/**
 * Linked tabs (#896): a tab in one layout that shows the widgets of a tab in
 * another. The link carries only the original's section and tab id; name, icon,
 * slug, order, conditions and badges stay the link's own, the widgets and the PIN
 * come from the original.
 *
 * Pure module (types only) so tools/tests can bundle it without the stores.
 */
import type { DashboardLayout, Section, Tab, TabLink } from '../store/dashboardStore';

export interface LinkSource {
    layout: DashboardLayout;
    section: Section;
    tab: Tab;
}

/**
 * The original a link points at, or undefined when it is gone. A link never
 * resolves to another link — the editor always links the original, and a
 * hand-edited chain would otherwise be a way into a cycle.
 */
export function findLinkSource(layouts: DashboardLayout[], link: TabLink | undefined): LinkSource | undefined {
    if (!link) return undefined;
    for (const layout of layouts) {
        const section = layout.sections.find((sec) => sec.id === link.sectionId);
        if (!section) continue;
        const tab = section.tabs.find((t) => t.id === link.tabId);
        return tab && !tab.link ? { layout, section, tab } : undefined;
    }
    return undefined;
}

/** Every linked tab that points at the given tab — „wo er überall vorkommt“. */
export function linksTo(
    layouts: DashboardLayout[],
    sectionId: string,
    tabId: string,
): { layout: DashboardLayout; section: Section; tab: Tab }[] {
    const out: { layout: DashboardLayout; section: Section; tab: Tab }[] = [];
    for (const layout of layouts)
        for (const section of layout.sections)
            for (const tab of section.tabs)
                if (tab.link?.sectionId === sectionId && tab.link.tabId === tabId) out.push({ layout, section, tab });
    return out;
}

/** "Layout › Bereich › Tab" — the bare tab name when the layout has a single section. */
export function linkSourceLabel(src: LinkSource): string {
    return src.layout.sections.length > 1
        ? `${src.layout.name} › ${src.section.name} › ${src.tab.name}`
        : `${src.layout.name} › ${src.tab.name}`;
}
