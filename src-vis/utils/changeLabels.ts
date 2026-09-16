/**
 * Wording for structured config changes — shared by the backup list in the
 * settings and by the undo history in the save bar, so "Widget „X“ verschoben"
 * reads the same in both places.
 */
import type { TranslationKey } from '../i18n';
import type { BackupChangeDetail } from '../store/persistManager';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** One change: a named single change, an aggregated count, or the coarse store-level fallback. */
export function formatChangeDetail(t: Translate, d: BackupChangeDetail): string {
    if (d.kind === 'store-changed') return t(`settings.autobackup.store.${d.label}` as TranslationKey);
    if (d.count && d.count > 1)
        return t(`settings.autobackup.change.${d.kind}.n` as TranslationKey, { count: d.count });
    return t(`settings.autobackup.change.${d.kind}` as TranslationKey, { label: d.label ?? '' });
}

export function formatChangeDetails(t: Translate, details: BackupChangeDetail[]): string {
    return details.map((d) => formatChangeDetail(t, d)).join(', ');
}

/** Local date and time ('full') or time only ('time'); the raw ISO string if it does not parse. */
export function formatTimestamp(iso: string | number, style: 'full' | 'time' = 'full'): string {
    try {
        const d = new Date(iso);
        return new Intl.DateTimeFormat(
            undefined,
            style === 'time' ? { timeStyle: 'medium' } : { dateStyle: 'short', timeStyle: 'medium' },
        ).format(d);
    } catch {
        return String(iso);
    }
}
