import type { TranslationKey } from '../i18n';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function pad(n: number) { return String(n).padStart(2, '0'); }

export function applyCustomFormat(date: Date, fmt: string, t: TFn): string {
  return fmt
    .replace('EEEE', t(`clock.day.${date.getDay()}` as TranslationKey))
    .replace('EE',   t(`cal.day.${date.getDay()}` as TranslationKey))
    .replace('MMMM', t(`clock.month.${date.getMonth()}` as TranslationKey))
    .replace('yyyy', String(date.getFullYear()))
    .replace('yy',   String(date.getFullYear()).slice(-2))
    .replace('MM',   pad(date.getMonth() + 1))
    .replace('dd',   pad(date.getDate()))
    .replace('HH',   pad(date.getHours()))
    .replace('hh',   pad(date.getHours() % 12 || 12))
    .replace('mm',   pad(date.getMinutes()))
    .replace('ss',   pad(date.getSeconds()));
}

export function fmtTime(date: Date, showSeconds: boolean) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}${showSeconds ? ':' + pad(date.getSeconds()) : ''}`;
}

export function fmtDate(date: Date, length: 'short' | 'long', t: TFn) {
  if (length === 'long') {
    return `${t(`clock.day.${date.getDay()}` as TranslationKey)}, ${date.getDate()}. ${t(`clock.month.${date.getMonth()}` as TranslationKey)} ${date.getFullYear()}`;
  }
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
