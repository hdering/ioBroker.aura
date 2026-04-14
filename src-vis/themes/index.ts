export interface ThemeVars {
  // App
  '--app-bg': string;
  '--app-surface': string;
  '--app-border': string;
  // Widget-Karte
  '--widget-bg': string;
  '--widget-border': string;
  '--widget-border-width': string;
  '--widget-radius': string;
  '--widget-shadow': string;
  '--widget-backdrop': string;  // backdrop-filter for glassmorphism; 'none' for all other themes
  // Text
  '--text-primary': string;
  '--text-secondary': string;
  // Akzente
  '--accent': string;
  '--accent-green': string;
  '--accent-yellow': string;
  '--accent-red': string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean; // für html.dark class
  vars: ThemeVars;
}

export const THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'Dark',
    dark: true,
    vars: {
      '--app-bg': '#111827',
      '--app-surface': '#1f2937',
      '--app-border': '#374151',
      '--widget-bg': '#1f2937',
      '--widget-border': '#374151',
      '--widget-border-width': '1px',
      '--widget-radius': '0.75rem',
      '--widget-shadow': 'none',
      '--widget-backdrop': 'none',
      '--text-primary': '#ffffff',
      '--text-secondary': '#9ca3af',
      '--accent': '#3b82f6',
      '--accent-green': '#22c55e',
      '--accent-yellow': '#eab308',
      '--accent-red': '#ef4444',
    },
  },
  {
    id: 'light',
    name: 'Hell',
    dark: false,
    vars: {
      '--app-bg': '#f9fafb',
      '--app-surface': '#ffffff',
      '--app-border': '#e5e7eb',
      '--widget-bg': '#ffffff',
      '--widget-border': '#e5e7eb',
      '--widget-border-width': '1px',
      '--widget-radius': '0.75rem',
      '--widget-shadow': '0 1px 3px rgba(0,0,0,0.08)',
      '--widget-backdrop': 'none',
      '--text-primary': '#111827',
      '--text-secondary': '#6b7280',
      '--accent': '#3b82f6',
      '--accent-green': '#16a34a',
      '--accent-yellow': '#ca8a04',
      '--accent-red': '#dc2626',
    },
  },
  {
    id: 'lovelace',
    name: 'Lovelace',
    dark: false,
    vars: {
      '--app-bg': '#e8edf2',
      '--app-surface': '#ffffff',
      '--app-border': '#d1d9e0',
      '--widget-bg': '#ffffff',
      '--widget-border': 'transparent',
      '--widget-border-width': '0px',
      '--widget-radius': '1.25rem',
      '--widget-shadow': '0 2px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)',
      '--widget-backdrop': 'none',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#718096',
      '--accent': '#03a9f4',
      '--accent-green': '#4caf50',
      '--accent-yellow': '#ff9800',
      '--accent-red': '#f44336',
    },
  },
  {
    id: 'amoled',
    name: 'AMOLED',
    dark: true,
    vars: {
      '--app-bg': '#000000',
      '--app-surface': '#0a0a0a',
      '--app-border': '#1a1a1a',
      '--widget-bg': '#0d0d0d',
      '--widget-border': '#222222',
      '--widget-border-width': '1px',
      '--widget-radius': '0.5rem',
      '--widget-shadow': 'none',
      '--widget-backdrop': 'none',
      '--text-primary': '#ffffff',
      '--text-secondary': '#555555',
      '--accent': '#00e5ff',
      '--accent-green': '#00e676',
      '--accent-yellow': '#ffea00',
      '--accent-red': '#ff1744',
    },
  },
  {
    id: 'glass',
    name: 'Glass',
    dark: true,
    vars: {
      '--app-bg': '#0f172a',
      '--app-surface': 'rgba(255,255,255,0.05)',
      '--app-border': 'rgba(255,255,255,0.1)',
      '--widget-bg': 'rgba(255,255,255,0.08)',
      '--widget-border': 'rgba(255,255,255,0.15)',
      '--widget-border-width': '1px',
      '--widget-radius': '1rem',
      '--widget-shadow': '0 4px 24px rgba(0,0,0,0.4)',
      '--widget-backdrop': 'none',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#94a3b8',
      '--accent': '#818cf8',
      '--accent-green': '#34d399',
      '--accent-yellow': '#fbbf24',
      '--accent-red': '#f87171',
    },
  },
  // ── Material Design 3 ──────────────────────────────────────────────────────
  // Colors from the MD3 baseline scheme (Material Theme Builder)
  // Primary: #6750A4 (purple/violet) · Shape: medium (12dp) · Elevation via shadow
  {
    id: 'md3-light',
    name: 'Material 3',
    dark: false,
    vars: {
      '--app-bg':              '#FFFBFE',   // MD3 background
      '--app-surface':         '#F3EDF7',   // MD3 surface-container
      '--app-border':          '#CAC4D0',   // MD3 outline-variant
      '--widget-bg':           '#FFFFFF',   // MD3 surface (cards at elevation 0)
      '--widget-border':       'transparent',
      '--widget-border-width': '0px',
      '--widget-radius':       '0.75rem',   // MD3 medium shape = 12dp
      '--widget-shadow':       '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px 1px rgba(0,0,0,0.15)', // elevation 1
      '--widget-backdrop':     'none',
      '--text-primary':        '#1C1B1F',   // MD3 on-background
      '--text-secondary':      '#49454F',   // MD3 on-surface-variant
      '--accent':              '#6750A4',   // MD3 primary
      '--accent-green':        '#386A20',   // MD3-aligned green
      '--accent-yellow':       '#7D5700',   // MD3-aligned amber/tertiary
      '--accent-red':          '#B3261E',   // MD3 error
    },
  },
  {
    id: 'md3-dark',
    name: 'Material 3 Dark',
    dark: true,
    vars: {
      '--app-bg':              '#1C1B1F',   // MD3 background dark
      '--app-surface':         '#2B2930',   // MD3 surface-container-high dark
      '--app-border':          '#49454F',   // MD3 outline-variant dark
      '--widget-bg':           '#211F26',   // MD3 surface-container dark
      '--widget-border':       'transparent',
      '--widget-border-width': '0px',
      '--widget-radius':       '0.75rem',
      '--widget-shadow':       'none',      // MD3 dark: tonal elevation, no shadows
      '--widget-backdrop':     'none',
      '--text-primary':        '#E6E1E5',   // MD3 on-background dark
      '--text-secondary':      '#CAC4D0',   // MD3 on-surface-variant dark
      '--accent':              '#D0BCFF',   // MD3 primary dark
      '--accent-green':        '#B6CCB0',   // MD3-aligned green dark
      '--accent-yellow':       '#F9C642',   // MD3-aligned amber dark
      '--accent-red':          '#F2B8B5',   // MD3 error dark
    },
  },
  // ── Frosted Glass ─────────────────────────────────────────────────────────
  // True glassmorphism: semi-transparent widget cards with backdrop-filter blur
  // on a deep indigo gradient background.
  {
    id: 'frosted-glass',
    name: 'Frosted Glass',
    dark: true,
    vars: {
      '--app-bg':              'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      '--app-surface':         'rgba(255,255,255,0.06)',
      '--app-border':          'rgba(255,255,255,0.12)',
      '--widget-bg':           'rgba(255,255,255,0.08)',
      '--widget-border':       'rgba(255,255,255,0.18)',
      '--widget-border-width': '1px',
      '--widget-radius':       '1rem',
      '--widget-shadow':       '0 8px 32px rgba(0,0,0,0.4)',
      '--widget-backdrop':     'blur(16px) saturate(180%)',
      '--text-primary':        '#f1f5f9',
      '--text-secondary':      '#94a3b8',
      '--accent':              '#818cf8',
      '--accent-green':        '#34d399',
      '--accent-yellow':       '#fbbf24',
      '--accent-red':          '#f87171',
    },
  },
  // ── Catppuccin ────────────────────────────────────────────────────────────
  // Soothing pastel theme by catppuccin/home-assistant.
  // Colors: Base → app bg, Mantle → surface, Surface0 → widget bg,
  //         Surface1 → widget border, Mauve → primary accent.
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    dark: false,
    vars: {
      '--app-bg':              '#eff1f5',   // Base
      '--app-surface':         '#e6e9ef',   // Mantle
      '--app-border':          '#ccd0da',   // Surface0
      '--widget-bg':           '#ccd0da',   // Surface0
      '--widget-border':       '#bcc0cc',   // Surface1
      '--widget-border-width': '1px',
      '--widget-radius':       '0.75rem',
      '--widget-shadow':       '0 2px 8px rgba(76,79,105,0.10)',
      '--widget-backdrop':     'none',
      '--text-primary':        '#4c4f69',   // Text
      '--text-secondary':      '#6c6f85',   // Subtext0
      '--accent':              '#8839ef',   // Mauve
      '--accent-green':        '#40a02b',   // Green
      '--accent-yellow':       '#fe640b',   // Peach
      '--accent-red':          '#d20f39',   // Red
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    dark: true,
    vars: {
      '--app-bg':              '#303446',   // Base
      '--app-surface':         '#292c3c',   // Mantle
      '--app-border':          '#414559',   // Surface0
      '--widget-bg':           '#414559',   // Surface0
      '--widget-border':       '#51576d',   // Surface1
      '--widget-border-width': '1px',
      '--widget-radius':       '0.75rem',
      '--widget-shadow':       'none',
      '--widget-backdrop':     'none',
      '--text-primary':        '#c6d0f5',   // Text
      '--text-secondary':      '#a5adce',   // Subtext0
      '--accent':              '#ca9ee6',   // Mauve
      '--accent-green':        '#a6d189',   // Green
      '--accent-yellow':       '#ef9f76',   // Peach
      '--accent-red':          '#e78284',   // Red
    },
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    dark: true,
    vars: {
      '--app-bg':              '#24273a',   // Base
      '--app-surface':         '#1e2030',   // Mantle
      '--app-border':          '#363a4f',   // Surface0
      '--widget-bg':           '#363a4f',   // Surface0
      '--widget-border':       '#494d64',   // Surface1
      '--widget-border-width': '1px',
      '--widget-radius':       '0.75rem',
      '--widget-shadow':       'none',
      '--widget-backdrop':     'none',
      '--text-primary':        '#cad3f5',   // Text
      '--text-secondary':      '#a5adcb',   // Subtext0
      '--accent':              '#c6a0f6',   // Mauve
      '--accent-green':        '#a6da95',   // Green
      '--accent-yellow':       '#f5a97f',   // Peach
      '--accent-red':          '#ed8796',   // Red
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    dark: true,
    vars: {
      '--app-bg':              '#1e1e2e',   // Base
      '--app-surface':         '#181825',   // Mantle
      '--app-border':          '#313244',   // Surface0
      '--widget-bg':           '#313244',   // Surface0
      '--widget-border':       '#45475a',   // Surface1
      '--widget-border-width': '1px',
      '--widget-radius':       '0.75rem',
      '--widget-shadow':       'none',
      '--widget-backdrop':     'none',
      '--text-primary':        '#cdd6f4',   // Text
      '--text-secondary':      '#a6adc8',   // Subtext0
      '--accent':              '#cba6f7',   // Mauve
      '--accent-green':        '#a6e3a1',   // Green
      '--accent-yellow':       '#fab387',   // Peach
      '--accent-red':          '#f38ba8',   // Red
    },
  },
  // ── Apple Liquid Glass ────────────────────────────────────────────────────
  // Inspired by Apple's Liquid Glass design language (iOS 26 / visionOS).
  // Key traits: pastel gradient background, highly transparent widget cards,
  // strong backdrop-filter (blur + saturate + brightness), specular top-edge
  // highlight via inset box-shadow, and Apple system color accents.
  {
    id: 'liquid-glass',
    name: 'Liquid Glass',
    dark: false,
    vars: {
      '--app-bg':              'linear-gradient(145deg, #dbeafe 0%, #e0e7ff 45%, #fce7f3 100%)',
      '--app-surface':         'rgba(255,255,255,0.38)',
      '--app-border':          'rgba(255,255,255,0.68)',
      '--widget-bg':           'rgba(255,255,255,0.40)',
      '--widget-border':       'rgba(255,255,255,0.72)',
      '--widget-border-width': '1px',
      '--widget-radius':       '1.5rem',
      // inset top highlight = specular glass glint; outer = soft coloured glow
      '--widget-shadow':       'inset 0 1px 0 rgba(255,255,255,0.95), 0 8px 32px rgba(99,102,241,0.14), 0 2px 8px rgba(0,0,0,0.06)',
      '--widget-backdrop':     'blur(24px) saturate(200%) brightness(110%)',
      '--text-primary':        '#1c1c2e',
      '--text-secondary':      '#6b6b8e',
      '--accent':              '#007aff',   // Apple blue
      '--accent-green':        '#34c759',   // Apple green
      '--accent-yellow':       '#ff9f0a',   // Apple orange/yellow
      '--accent-red':          '#ff3b30',   // Apple red
    },
  },
  {
    id: 'liquid-glass-dark',
    name: 'Liquid Glass Dark',
    dark: true,
    vars: {
      '--app-bg':              'linear-gradient(145deg, #0d0d1f 0%, #101028 50%, #0d1a2e 100%)',
      '--app-surface':         'rgba(255,255,255,0.05)',
      '--app-border':          'rgba(255,255,255,0.10)',
      '--widget-bg':           'rgba(255,255,255,0.07)',
      '--widget-border':       'rgba(255,255,255,0.14)',
      '--widget-border-width': '1px',
      '--widget-radius':       '1.5rem',
      '--widget-shadow':       'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 40px rgba(0,0,0,0.55)',
      '--widget-backdrop':     'blur(30px) saturate(200%) brightness(88%)',
      '--text-primary':        '#f5f5f7',
      '--text-secondary':      '#86868b',
      '--accent':              '#0a84ff',   // Apple blue dark
      '--accent-green':        '#30d158',   // Apple green dark
      '--accent-yellow':       '#ffd60a',   // Apple yellow dark
      '--accent-red':          '#ff453a',   // Apple red dark
    },
  },
];

export const DEFAULT_THEME_ID = 'dark';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * Dedicated dark theme for the admin backend.
 * NOT included in THEMES (not shown in the frontend theme picker).
 * Tuned for UI clarity: higher contrast layers, visible borders, readable secondary text.
 */
export const ADMIN_DARK_THEME: Theme = {
  id: 'admin-dark',
  name: 'Admin Dark',
  dark: true,
  vars: {
    '--app-bg':               '#0f1623',   // deep navy — clear base layer
    '--app-surface':          '#182032',   // distinctly lighter — cards/panels
    '--app-border':           '#2d3f58',   // visible borders at every layer
    '--widget-bg':            '#182032',
    '--widget-border':        '#2d3f58',
    '--widget-border-width':  '1px',
    '--widget-radius':        '0.75rem',
    '--widget-shadow':        '0 1px 6px rgba(0,0,0,0.4)',
    '--widget-backdrop':      'none',
    '--text-primary':         '#dce8f6',   // soft blue-white, low glare
    '--text-secondary':       '#7a96b5',   // clearly visible, not washed out
    '--accent':               '#5aaeff',   // brighter accent for dark bg
    '--accent-green':         '#3dd87a',
    '--accent-yellow':        '#f5bf45',
    '--accent-red':           '#f46e6e',
  },
};
