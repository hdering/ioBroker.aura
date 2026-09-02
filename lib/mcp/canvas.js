'use strict';

/**
 * The size the dashboard is allowed to be.
 *
 * The user draws the target device into the editor with the guidelines
 * (Einstellungen -> Layout: "Hilfslinien", e.g. 1280x800 for a wall tablet). That
 * is the one place where the intended screen is written down — and until now the
 * MCP server ignored it: it derived the width from the widest widget it happened
 * to find and knew nothing at all about the height, so a generated tab could run
 * off the bottom of the very device it was built for.
 *
 * This module turns those two pixel values into the numbers a model actually
 * writes: how many grid columns and rows fit on the target screen.
 *
 * The arithmetic mirrors the frontend one-to-one:
 *   - columns  Dashboard.tsx: cols = floor((width - gap) / (snapX + gap))
 *   - rows     a widget at y with height h ends at (y+h)*rowHeight + (y+h-1)*gap
 *   - chrome   utils/guidelinesInset.ts (header 65, tab bar 44, section bar 48)
 *
 * The chrome heights are the same calibrated estimates the editor preview uses
 * as its fallback. The running frontend measures the real chrome from the DOM;
 * the adapter cannot, so a heavily styled header can shift the row budget by a
 * row. That is why every finding built on this is a warning, never an error.
 *
 * Pure functions — settings in, numbers out.
 */

/** Chrome above the grid, measured in the rendered frontend with default styling. */
const CHROME = { header: 65, tabBar: 44, sectionBar: 48 };

const DEFAULT_GRID = { rowHeight: 20, snapX: 20, gap: 10 };
const DEFAULT_DRAWER_WIDTH = 240;

/** First value that was actually set — `??` over a list. */
function pick(...vals) {
    for (const v of vals) {
        if (v !== undefined && v !== null) {
            return v;
        }
    }
    return undefined;
}

/** Global -> layout -> section tab bar, appearance fields only (items only decide visibility). */
function resolveTabBar(global, layout, section) {
    const out = Object.assign({}, global || {});
    for (const ov of [layout || {}, section || {}]) {
        for (const k of Object.keys(ov)) {
            if (k !== 'items' && ov[k] !== undefined) {
                out[k] = ov[k];
            }
        }
    }
    const items = [];
    const seen = new Set();
    for (const src of [global, layout, section]) {
        for (const it of (src && src.items) || []) {
            if (it && !seen.has(it.id)) {
                seen.add(it.id);
                items.push(it);
            }
        }
    }
    out.items = items;
    return out;
}

/**
 * The settings that apply to one tab.
 *
 * Grid and guidelines are 3-level keys (global -> layout -> section, section wins);
 * the frame settings below them belong to the whole layout and a section never
 * overrides them. Mirrors hooks/useEffectiveSettings.ts for the keys used here.
 */
function effectiveSettings(frontend, layout, section) {
    const f = frontend || {};
    const l = (layout && layout.settings) || {};
    const s = (section && section.settings) || {};
    const three = (k) => pick(s[k], l[k], f[k]);
    const two = (k) => pick(l[k], f[k]);
    return {
        gridRowHeight: three('gridRowHeight'),
        gridSnapX: three('gridSnapX'),
        gridGap: three('gridGap'),
        guidelinesEnabled: three('guidelinesEnabled'),
        guidelinesWidth: three('guidelinesWidth'),
        guidelinesHeight: three('guidelinesHeight'),
        layoutDrawerEnabled: three('layoutDrawerEnabled'),
        layoutDrawerPlacement: two('layoutDrawerPlacement'),
        layoutDrawerShowSingle: two('layoutDrawerShowSingle'),
        layoutDrawerWidth: two('layoutDrawerWidth'),
        showHeader: two('showHeader'),
        tabBar: resolveTabBar(f.tabBar, l.tabBar, s.tabBar),
    };
}

/** The bar's own visibility rule — utils/tabBarVisible.ts. */
function tabBarShowsOnOwn(tabCount, tbs) {
    return tabCount > 1 || (tbs && tbs.showSingle) === true || ((tbs && tbs.items && tbs.items.length) || 0) > 0;
}

/** The grid's three numbers, defaults filled in. */
function gridOf(settings) {
    const s = settings || {};
    return {
        rowHeight: s.gridRowHeight != null ? s.gridRowHeight : DEFAULT_GRID.rowHeight,
        snapX: s.gridSnapX != null ? s.gridSnapX : s.gridRowHeight != null ? s.gridRowHeight : DEFAULT_GRID.snapX,
        gap: s.gridGap != null ? s.gridGap : DEFAULT_GRID.gap,
    };
}

/** Columns that fit into `px` of grid width — the frontend's own formula. */
function pxToCols(px, grid) {
    const step = grid.snapX + grid.gap;
    if (!(px > 0) || !(step > 0)) {
        return 0;
    }
    return Math.max(1, Math.floor((px - grid.gap) / step));
}

/** Rows that fit into `px` of grid height (every row costs rowHeight, every gap but the last). */
function pxToRowsFit(px, grid) {
    const step = grid.rowHeight + grid.gap;
    if (!(px > 0) || !(step > 0)) {
        return 0;
    }
    return Math.max(0, Math.floor((px + grid.gap) / step));
}

/**
 * The design budget for one tab.
 *
 * @param {object} input
 * @param {object} input.frontend  app-config state.frontend
 * @param {object} [input.layout]  the layout the tab lives in
 * @param {object} [input.section] the section the tab lives in
 * @param {number} [input.tabCount] tabs in that section (decides whether the tab bar renders)
 * @returns {object} { enabled, width, height, grid, menuInset, topInset, maxCols, maxRows }
 */
function designCanvas(input) {
    const { frontend, layout, section, tabCount } = input || {};
    const s = effectiveSettings(frontend, layout, section);
    const grid = gridOf(s);
    const width = Number(s.guidelinesWidth);
    const height = Number(s.guidelinesHeight);
    const enabled = s.guidelinesEnabled === true && Number.isFinite(width) && Number.isFinite(height);
    if (!enabled) {
        return { enabled: false, grid, width: null, height: null, maxCols: null, maxRows: null };
    }

    // A docked sidebar takes real horizontal space; a floating menu overlays the
    // grid and costs nothing. Only counted when the menu actually renders, which
    // for a single visible section needs "show for single".
    const visibleSections = layout ? (layout.sections || []).filter((sec) => !sec.hidden).length : 2;
    const menuRenders = s.layoutDrawerEnabled === true && (visibleSections > 1 || s.layoutDrawerShowSingle === true);
    const menuInset =
        menuRenders && s.layoutDrawerPlacement === 'sidebar' ? (s.layoutDrawerWidth ?? DEFAULT_DRAWER_WIDTH) : 0;

    const tabBarVisible = tabBarShowsOnOwn(Number.isFinite(tabCount) ? tabCount : 2, s.tabBar);
    let topInset = 0;
    if (s.showHeader !== false) {
        topInset += CHROME.header;
    }
    if (tabBarVisible && (s.tabBar || {}).position !== 'bottom') {
        topInset += CHROME.tabBar;
    }
    if (menuRenders && s.layoutDrawerPlacement === 'top') {
        topInset += CHROME.sectionBar;
    }

    const usableWidth = Math.max(0, width - menuInset);
    const usableHeight = Math.max(0, height - topInset);
    return {
        enabled: true,
        width,
        height,
        grid,
        menuInset,
        topInset,
        usableWidth,
        usableHeight,
        maxCols: pxToCols(usableWidth, grid),
        maxRows: pxToRowsFit(usableHeight, grid),
    };
}

/** The budget as the line that goes into a tool answer. */
function renderCanvas(canvas) {
    if (!canvas || !canvas.enabled) {
        return (
            'Hilfslinien sind nicht gesetzt — die Zielgröße des Bildschirms ist unbekannt, die Höhe bleibt ' +
            'daher ungeprüft. Der Nutzer setzt sie im Editor unter Einstellungen → Layout ("Hilfslinien").'
        );
    }
    const chrome = [];
    if (canvas.topInset) {
        chrome.push(`${canvas.topInset} px Kopfbereich`);
    }
    if (canvas.menuInset) {
        chrome.push(`${canvas.menuInset} px Menü`);
    }
    return (
        `Zielgröße laut Hilfslinien: ${canvas.width}×${canvas.height} px` +
        (chrome.length ? ` (davon ${chrome.join(' + ')} für die Rahmenelemente)` : '') +
        `. Auf den Bildschirm passen ${canvas.maxCols} Spalten und ${canvas.maxRows} Zeilen — ` +
        'darüber hinaus darf gebaut werden, dann muss der Nutzer aber scrollen.'
    );
}

module.exports = {
    CHROME,
    designCanvas,
    effectiveSettings,
    pxToCols,
    pxToRowsFit,
    renderCanvas,
    resolveTabBar,
    tabBarShowsOnOwn,
};
