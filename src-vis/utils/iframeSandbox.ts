export type SandboxPreset = 'off' | 'minimal' | 'standard' | 'extended' | 'full' | 'custom';

export interface SandboxPresetInfo {
  value: SandboxPreset;
  label: string;
  flags: string;
  description: string;
}

export const SANDBOX_PRESETS: SandboxPresetInfo[] = [
  {
    value: 'off',
    label: 'Aus',
    flags: '',
    description: 'Keine Sandbox – iframe hat volle Berechtigungen wie eine normale Seite.',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    flags: 'allow-scripts',
    description: 'Nur Skripte. Kein Zugriff auf Cookies, localStorage oder DOM des Parents.',
  },
  {
    value: 'standard',
    label: 'Standard',
    flags: 'allow-scripts allow-same-origin',
    description: 'Skripte + same-origin. Inhalt kann Cookies/localStorage nutzen. Empfohlen für eigene Inhalte.',
  },
  {
    value: 'extended',
    label: 'Erweitert',
    flags: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation',
    description: 'Standard + Formulare, Popups, Modals, Vollbild-Präsentation.',
  },
  {
    value: 'full',
    label: 'Voll',
    flags: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-presentation allow-downloads allow-top-navigation allow-pointer-lock',
    description: 'Alle gängigen Berechtigungen inkl. Downloads, Top-Navigation, Pointer-Lock.',
  },
  {
    value: 'custom',
    label: 'Benutzerdefiniert',
    flags: '',
    description: 'Eigene Flags eingeben (durch Leerzeichen getrennt, z. B. "allow-scripts allow-forms").',
  },
];

export function resolveSandboxAttr(
  preset: SandboxPreset | undefined,
  custom: string | undefined,
  fallback: SandboxPreset = 'off',
): string | undefined {
  const effective = preset ?? fallback;
  if (effective === 'off') return undefined;
  if (effective === 'custom') {
    const trimmed = (custom ?? '').trim();
    return trimmed === '' ? '' : trimmed;
  }
  const info = SANDBOX_PRESETS.find((p) => p.value === effective);
  return info?.flags || undefined;
}
