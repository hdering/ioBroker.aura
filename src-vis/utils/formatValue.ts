import { useGlobalSettingsStore } from '../store/globalSettingsStore';

/**
 * Thousands-separator presets. The group character always comes paired with a
 * matching decimal character — otherwise a dot group separator would collide
 * with the decimal point ("1.234.5").
 */
export type NumberFormat = 'plain' | 'de' | 'en' | 'space' | 'apostrophe';

/** Non-breaking space so grouped numbers never wrap mid-value. */
const NBSP = ' ';

const SEPARATORS: Record<NumberFormat, { group: string; decimal: string }> = {
    plain: { group: '', decimal: '.' },
    de: { group: '.', decimal: ',' },
    en: { group: ',', decimal: '.' },
    space: { group: NBSP, decimal: ',' },
    apostrophe: { group: "'", decimal: '.' },
};

/** Sample rendering of 1234.5 per preset — used for the option labels. */
export const NUMBER_FORMAT_SAMPLES: Record<NumberFormat, string> = {
    plain: '1234.5',
    de: '1.234,5',
    en: '1,234.5',
    space: `1${NBSP}234,5`,
    apostrophe: "1'234.5",
};

export const NUMBER_FORMATS: NumberFormat[] = ['plain', 'de', 'en', 'space', 'apostrophe'];

/**
 * Format a number with the given decimal places and thousands grouping.
 * `format` omitted → the global setting applies (non-reactive read; call sites
 * that need live updates subscribe to the store and pass the value explicitly).
 */
export function formatNum(value: number, decimals: number, format?: NumberFormat): string {
    const base = decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
    const fmt = format ?? useGlobalSettingsStore.getState().numberFormat ?? 'plain';
    if (fmt === 'plain' || !SEPARATORS[fmt]) return base;

    const { group, decimal } = SEPARATORS[fmt];
    const sign = base.startsWith('-') ? '-' : '';
    const unsigned = sign ? base.slice(1) : base;
    const [intPart, fracPart] = unsigned.split('.');
    const grouped = group ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group) : intPart;
    return `${sign}${grouped}${fracPart ? decimal + fracPart : ''}`;
}
