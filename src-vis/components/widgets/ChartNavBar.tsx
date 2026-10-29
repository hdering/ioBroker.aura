/**
 * Paging bar of the chart widgets (issue #871): ‹ › step by the active chip, ⇥ jumps to the current
 * window (lit there; a second click returns to the rolling range), the date button shows the window
 * and opens the browser's date picker. `Gesamt` has no window to page through, so the controls grey
 * out rather than disappear. State and logic: hooks/useChartNav.
 */
import { useRef } from 'react';
import { ArrowRightToLine, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import type { ChartNav } from '../../hooks/useChartNav';
import { dayOfRef, dayStart, isDaySpan, isoDay, type NavWindow, type NavSpan } from '../../utils/chartNav';
import { rangeLabel, type RangeChip } from '../../utils/rangeChips';
import { openNativePicker } from '../common/DateTimeInput';

const btnCls =
    'nodrag px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40';
const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--app-border)',
    color: active ? '#fff' : 'var(--text-secondary)',
});

/** The browsed window: one day as "Mo 27.10.", several as "21.10.–27.10.", hours with their time. */
export function navWindowLabel(w: NavWindow, span: NavSpan, locale: string): string {
    const first = new Date(w.start);
    const last = new Date(w.end - 1);
    if (!isDaySpan(span)) {
        const hm = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        return `${first.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${hm(first)}–${hm(new Date(w.end))}`;
    }
    if (dayStart(first.getTime()) === dayStart(last.getTime())) {
        return first.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
    }
    const year = new Date().getFullYear();
    const opts: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        ...(first.getFullYear() !== year || last.getFullYear() !== year ? { year: '2-digit' } : {}),
    };
    return `${first.toLocaleDateString(locale, opts)}–${last.toLocaleDateString(locale, opts)}`;
}

export function ChartNavBar({ nav, chips }: { nav: ChartNav; chips: RangeChip[] }) {
    const t = useT();
    const inputRef = useRef<HTMLInputElement>(null);
    const off = !nav.span;
    // What one arrow step is, for the tooltips: the active chip's caption ("7 Tage", "Quartal").
    const step =
        chips.find((c) => c.key === nav.chipKey)?.label ?? (nav.span ? rangeLabel(nav.span.value, nav.span.unit) : '');
    const label = nav.window && nav.span ? navWindowLabel(nav.window, nav.span, t('echart.dateLocale')) : null;
    const currentTitle = nav.onCurrent ? t('echart.navLiveTitle') : t('echart.dayTodayTitle');
    return (
        <div
            className="aura-chart-nav flex items-center gap-1 shrink-0"
            data-testid="echart-nav"
            title={off ? t('echart.navTotalHint') : undefined}
        >
            <button
                className={btnCls}
                style={btnStyle(false)}
                title={t('echart.dayPrevTitle', { step })}
                aria-label={t('echart.dayPrevTitle', { step })}
                disabled={off}
                data-testid="echart-nav-prev"
                onClick={() => nav.command('prev')}
            >
                <ChevronLeft size={12} />
            </button>
            <button
                className={btnCls}
                style={btnStyle(false)}
                title={t('echart.dayNextTitle', { step })}
                aria-label={t('echart.dayNextTitle', { step })}
                disabled={!nav.canNext}
                data-testid="echart-nav-next"
                onClick={() => nav.command('next')}
            >
                <ChevronRight size={12} />
            </button>
            {/* ⇥ rather than "Heute": the arrows step by the chip, so a day word would read as
                yesterday/tomorrow on a week or a month. */}
            <button
                className={btnCls}
                style={btnStyle(nav.onCurrent)}
                title={currentTitle}
                aria-label={currentTitle}
                aria-pressed={nav.onCurrent}
                disabled={off}
                data-testid="echart-nav-today"
                onClick={() => nav.command(nav.onCurrent ? 'now' : 'today')}
            >
                <ArrowRightToLine size={12} />
            </button>
            {/* The date is the picker's trigger — a field of its own would not fit the header on
                a narrow widget. The input has to stay rendered for showPicker(), so it is
                collapsed rather than hidden, and sits under the button it belongs to. */}
            <span className="relative inline-flex items-center ml-1">
                <input
                    ref={inputRef}
                    type="date"
                    className="nodrag absolute bottom-0 left-0 w-0 h-0 p-0 border-0 opacity-0 pointer-events-none"
                    tabIndex={-1}
                    aria-hidden
                    value={nav.window && nav.ref !== null ? isoDay(dayOfRef(nav.ref, nav.anchor)) : ''}
                    max={Number.isFinite(nav.horizon) ? isoDay(nav.horizon) : undefined}
                    onChange={(e) => nav.pickDay(e.target.value)}
                />
                <button
                    className={`${btnCls} flex items-center gap-1 whitespace-nowrap`}
                    style={btnStyle(false)}
                    title={t('echart.dayPickTitle')}
                    disabled={off}
                    data-testid="echart-nav-date"
                    onClick={() => openNativePicker(inputRef.current)}
                >
                    <CalendarDays size={12} />
                    {label}
                </button>
            </span>
        </div>
    );
}
