import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { useConfigStore } from './store/configStore';
import { getTheme } from './themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { themeId, customVars } = useThemeStore();
  const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);
  const theme = getTheme(themeId);

  useEffect(() => {
    const root = document.documentElement;
    const vars = { ...theme.vars, ...customVars };
    Object.entries(vars).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });
    root.style.setProperty('--font-scale', String(fontScale));
    root.classList.toggle('dark', theme.dark);
  }, [theme, customVars, fontScale]);

  return <>{children}</>;
}
