import { createContext, useContext } from 'react';

/** Horizontal stretch of the desktop grid against its design pitch — 1 on the
 *  fixed grid, the fluid mode's factor otherwise (#413). A widget that derives a
 *  column count from its own pixel width (the group) divides by this so the
 *  stretched box keeps the columns it was designed with. */
export const GridScaleContext = createContext(1);

export const useGridScale = () => useContext(GridScaleContext);

/** Row height the tab grid really draws when the fluid mode stretches its rows
 *  (#413 'scale'/'fill'), null on the design pitch. A group derives its children's
 *  content-sized rows on it like the Dashboard derives the group's hug (#759). */
export const GridRowHeightContext = createContext<number | null>(null);

export const useStretchedRowHeight = () => useContext(GridRowHeightContext);
