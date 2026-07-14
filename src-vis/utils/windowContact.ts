/**
 * Pure window-/door-contact value mappings shared by the standalone
 * `WindowContactWidget` and the list widgets' "Fenster-/Türkontakt" display mode.
 *
 * Kept free of React/widget imports so low-level modules (entryControls) can reuse
 * the presets and resolver without pulling in a heavy widget component (which would
 * create a circular import).
 */
import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';

export type ContactState = 'closed' | 'tilted' | 'open';

export type StateCfg = {
    type: 'icon' | 'base64';
    icon?: string;
    color: string;
    base64?: string;
    label: string;
};

// ─── presets ──────────────────────────────────────────────────────────────────

export const WC_PRESETS: Record<string, { closed: string; tilted: string; open: string }> = {
    hmip: { closed: '0', tilted: '1', open: '2,3,4,5,6,7' },
    boolean: { closed: 'false,0', tilted: '', open: 'true,1' },
    boolean_inverted: { closed: 'true,1', tilted: '', open: 'false,0' },
    '0_7': { closed: '0', tilted: '', open: '7' },
    string_hmip: { closed: 'closed', tilted: 'tilted', open: 'open' },
};

export const WC_PRESET_LABELS: Record<string, string> = {
    hmip: 'HmIP (0=zu, 1=gekippt, 2+=offen)',
    boolean: 'Boolean (false=zu, true=offen)',
    boolean_inverted: 'Boolean invertiert (true=zu, false=offen)',
    '0_7': 'Numerisch 0 / 7',
    string_hmip: 'String (CLOSED / TILTED / OPEN)',
    custom: 'Benutzerdefiniert',
};

// ─── fallbacks ────────────────────────────────────────────────────────────────

export const WC_FALLBACK: Record<ContactState, { Icon: typeof CheckCircle2; color: string; label: string }> = {
    closed: { Icon: CheckCircle2, color: '#22c55e', label: 'Geschlossen' },
    tilted: { Icon: TriangleAlert, color: '#f59e0b', label: 'Gekippt' },
    open: { Icon: XCircle, color: '#ef4444', label: 'Offen' },
};

/** Fallback lucide icon *names* per state — resolved through widgetIconMap so both
 *  the standalone widget and the list display can share one icon source. */
export const WC_FALLBACK_ICON_NAME: Record<ContactState, string> = {
    closed: 'CheckCircle2',
    tilted: 'TriangleAlert',
    open: 'XCircle',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

export function matchesValues(value: unknown, valList: string): boolean {
    if (!valList.trim()) return false;
    const str = String(value ?? '')
        .toLowerCase()
        .trim();
    return valList
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
        .some((v) => v === str);
}

export function resolveContactState(
    value: unknown,
    preset: string,
    customValues: { closed: string; tilted: string; open: string },
): ContactState {
    const mapping = preset === 'custom' ? customValues : (WC_PRESETS[preset] ?? WC_PRESETS.hmip);
    if (matchesValues(value, mapping.closed)) return 'closed';
    if (mapping.tilted && matchesValues(value, mapping.tilted)) return 'tilted';
    if (matchesValues(value, mapping.open)) return 'open';
    // Backward-compat fallback for existing widgets without statePreset
    if (value === false || value === 0) return 'closed';
    if (value === 1) return 'tilted';
    if (value === true) return 'open';
    return 'open';
}

export function getWcCfg(o: Record<string, unknown>, st: ContactState): StateCfg {
    const fb = WC_FALLBACK[st];
    return {
        type: (o[`${st}Type`] as 'icon' | 'base64') ?? 'icon',
        icon: o[`${st}Icon`] as string | undefined,
        color: (o[`${st}Color`] as string) || fb.color,
        base64: o[`${st}Base64`] as string | undefined,
        label: (o[`${st}Label`] as string) || fb.label,
    };
}
