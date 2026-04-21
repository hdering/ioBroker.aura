type TFunc = (key: string, vars?: Record<string, string | number>) => string;

export function formatLastChange(t: TFunc, ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);

  if (diffSec < 10)  return t('lc.lessThan10s');
  if (diffSec < 20)  return t('lc.lessThan20s');
  if (diffSec < 30)  return t('lc.lessThan30s');
  if (diffSec < 45)  return t('lc.halfMinute');
  if (diffSec < 90)  return t('lc.lessThan1Min');

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 45)  return diffMin === 1 ? t('lc.1Min') : t('lc.nMin', { n: diffMin });

  const diffHour = Math.round(diffSec / 3_600);
  if (diffHour < 24) return diffHour === 1 ? t('lc.1Hour') : t('lc.nHours', { n: diffHour });

  const diffDay = Math.round(diffSec / 86_400);
  if (diffDay < 30)  return diffDay === 1 ? t('lc.1Day') : t('lc.nDays', { n: diffDay });

  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return diffMonth === 1 ? t('lc.1Month') : t('lc.nMonths', { n: diffMonth });

  const diffYear = Math.round(diffDay / 365);
  return diffYear === 1 ? t('lc.1Year') : t('lc.nYears', { n: diffYear });
}
