import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { getTheme } from './themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { themeId, customVars } = useThemeStore();
  const theme = getTheme(themeId);

  useEffect(() => {
    const root = document.documentElement;
    const vars = { ...theme.vars, ...customVars };
    Object.entries(vars).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });
    root.classList.toggle('dark', theme.dark);
  }, [theme, customVars]);

  return <>{children}</>;
}
