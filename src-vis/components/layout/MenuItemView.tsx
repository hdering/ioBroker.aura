/**
 * Renderers for the extra elements of the navigation chromes — header, tab bar
 * and section menu. All three host the same `MenuItemContent` shapes; the only
 * difference is the surrounding layout, expressed as `variant`:
 *
 *   `bar`   — inline in a horizontal bar (header, tab bar, docked section bar)
 *   `block` — stacked in the section-menu drawer, where a clock may be large
 *
 * Before this module the clock and datapoint renderers existed twice, once in
 * TabBar.tsx and once in LayoutDrawer.tsx, and the header had no items at all.
 */

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { resolveHtmlAssets } from '../../utils/assetUrl';
import { effectiveSnooze, resumeIdleReturn, snoozeIdleReturn, useIdleReturnStore } from '../../store/idleReturnStore';
import type { MenuItemContent } from '../../store/dashboardStore';
import { subscribeDpValue } from '../../hooks/useIoBroker';
import { applyCustomFormat, fmtTime, fmtDate } from '../../utils/clockUtils';
import { useT } from '../../i18n';
import { MenuWidgetSlot } from './MenuWidgetSlot';

export type MenuItemVariant = 'bar' | 'block';

function MenuClock({ item, variant }: { item: MenuItemContent; variant: MenuItemVariant }) {
    const t = useT();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const bar = variant === 'bar';

    if (item.clockCustomFormat) {
        return (
            <div
                className={`${bar ? 'text-sm font-medium' : 'text-2xl font-bold'} tabular-nums shrink-0`}
                style={{ color: 'var(--text-primary)' }}
            >
                {applyCustomFormat(now, item.clockCustomFormat, t)}
            </div>
        );
    }

    const timeStr = fmtTime(now, item.clockShowSeconds ?? false);
    const dateStr = fmtDate(now, item.clockDateLength ?? 'short', t);

    if (item.clockDisplay === 'datetime') {
        return (
            <div className={bar ? 'flex flex-col items-end leading-tight shrink-0' : undefined}>
                <div
                    className={`${bar ? 'text-sm' : 'text-3xl'} font-bold tabular-nums leading-none`}
                    style={{ color: 'var(--text-primary)' }}
                >
                    {timeStr}
                </div>
                <div className={bar ? 'text-xs' : 'text-sm mt-1'} style={{ color: 'var(--text-secondary)' }}>
                    {dateStr}
                </div>
            </div>
        );
    }

    const text = item.clockDisplay === 'date' ? dateStr : timeStr;
    return (
        <div
            className={`${bar ? 'text-sm font-medium' : 'text-2xl font-bold'} tabular-nums shrink-0`}
            style={{ color: 'var(--text-primary)' }}
        >
            {text}
        </div>
    );
}

function MenuDatapoint({ item, variant }: { item: MenuItemContent; variant: MenuItemVariant }) {
    const [val, setVal] = useState<string>('…');
    useEffect(() => {
        if (!item.datapointId) return;
        const unsub = subscribeDpValue(item.datapointId, (value) => {
            setVal(value != null ? String(value) : '–');
        });
        return unsub;
    }, [item.datapointId]);

    const bar = variant === 'bar';

    if (item.datapointTemplate) {
        return (
            <div
                className={bar ? 'text-sm font-medium shrink-0' : 'text-sm'}
                style={{ color: bar ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: resolveHtmlAssets(item.datapointTemplate.replace(/\{dp\}/g, val)) }}
            />
        );
    }

    return (
        <div
            className={`text-sm ${bar ? 'font-medium tabular-nums shrink-0' : ''}`}
            style={{ color: 'var(--text-primary)' }}
        >
            {val}
        </div>
    );
}

/** Default pause length of a fresh chip, in minutes. */
export const IDLE_RETURN_DEFAULT_MINUTES = 15;

/**
 * Pause chip for the auto-return (issue #638): one tap keeps this device on the
 * page it is showing, a second tap hands it back to the timer.
 *
 * Deliberately a pause with a countdown rather than an on/off switch — the
 * report that asked for this is a wall tablet, and an "off" nobody remembers to
 * undo is how such a tablet ends up parked on the camera page for days. The
 * remaining minutes come from the datapoint, which the adapter counts down.
 */
function MenuIdleReturn({ item, variant }: { item: MenuItemContent; variant: MenuItemVariant }) {
    const t = useT();
    const left = useIdleReturnStore(effectiveSnooze);
    const armed = useIdleReturnStore((s) => s.armed);
    const minutes = Math.max(1, Math.round(item.idleReturnMinutes ?? IDLE_RETURN_DEFAULT_MINUTES));
    const paused = left > 0;
    const bar = variant === 'bar';
    const size = bar ? 14 : 18;

    return (
        <button
            onClick={() => (paused ? resumeIdleReturn() : snoozeIdleReturn(minutes))}
            title={paused ? t('menuItem.idleReturn.resumeHint') : t('menuItem.idleReturn.pauseHint')}
            className={`flex items-center gap-1.5 rounded-lg px-2 ${bar ? 'py-1 text-xs' : 'py-1.5 text-sm'} font-medium shrink-0 hover:opacity-80 transition-opacity`}
            style={{
                background: paused ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                color: paused ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${paused ? 'var(--accent)' : 'var(--app-border)'}`,
                // Nothing to pause here — still visible (it sits in a configured
                // slot) but unmistakably inactive.
                opacity: armed || paused ? 1 : 0.45,
            }}
        >
            {paused ? <Play size={size} /> : <Pause size={size} />}
            <span className="tabular-nums">
                {paused ? t('menuItem.idleReturn.left').replace('{n}', String(left)) : t('menuItem.idleReturn.pause')}
            </span>
        </button>
    );
}

function MenuText({ item, variant }: { item: MenuItemContent; variant: MenuItemVariant }) {
    return (
        <div
            className={`text-sm ${variant === 'bar' ? 'font-medium shrink-0' : ''}`}
            style={{ color: 'var(--text-primary)' }}
        >
            {item.text ?? ''}
        </div>
    );
}

export function MenuItemView({
    item,
    variant,
    onWidgetChange,
}: {
    item: MenuItemContent;
    variant: MenuItemVariant;
    onWidgetChange?: (next: MenuItemContent['widget']) => void;
}) {
    if (item.type === 'clock') return <MenuClock item={item} variant={variant} />;
    if (item.type === 'datapoint') return <MenuDatapoint item={item} variant={variant} />;
    if (item.type === 'widget') return <MenuWidgetSlot item={item} variant={variant} onWidgetChange={onWidgetChange} />;
    if (item.type === 'idleReturn') return <MenuIdleReturn item={item} variant={variant} />;
    return <MenuText item={item} variant={variant} />;
}
