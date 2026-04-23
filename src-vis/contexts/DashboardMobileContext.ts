import { createContext, useContext } from 'react';

/** True when the Dashboard is currently rendering in its mobile (stacked) layout. */
export const DashboardMobileContext = createContext(false);

export const useDashboardMobile = () => useContext(DashboardMobileContext);
