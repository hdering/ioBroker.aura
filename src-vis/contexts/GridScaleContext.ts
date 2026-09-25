import { createContext, useContext } from 'react';

/** Horizontal stretch of the desktop grid against its design pitch — 1 on the
 *  fixed grid, the fluid mode's factor otherwise (#413). A widget that derives a
 *  column count from its own pixel width (the group) divides by this so the
 *  stretched box keeps the columns it was designed with. */
export const GridScaleContext = createContext(1);

export const useGridScale = () => useContext(GridScaleContext);
