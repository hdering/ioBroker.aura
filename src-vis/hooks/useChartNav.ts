/**
 * Range chips + paging of the chart widgets (issue #871): which range is active, which window of
 * it is shown, and how that selection follows a link group and the navigation datapoints.
 *
 * Shared by the advanced chart, the simple chart and the distribution chart, so linked charts of
 * different types page alike. The widget keeps its own option names and passes them in; the
 * window maths lives in utils/chartNav.
 */
import { useEffect, useRef, useState } from 'react';
import { useDatapoint } from './useDatapoint';
import { useIdleTimeout } from './useIdleTimeout';
import type { EChartTimeRange } from './useMultiSeriesData';
import { useChartNavStore } from '../store/chartNavStore';
import { chipKeyOf, parseRangeToken, rangeKey, type RangeChip, type RangeUnit } from '../utils/rangeChips';
import {
    canStepForward,
    formatNavBound,
    formatNavDate,
    freeRange,
    futureHorizon,
    isTodayRef,
    navSpan,
    navWindow,
    normalizeRef,
    parseNavBound,
    parseNavCommand,
    parseNavDate,
    refFromDay,
    stepRef,
    switchRef,
    todayRef,
    type NavAnchor,
    type NavCommand,
    type NavCurrent,
    type NavFuture,
    type NavLimits,
    type NavSpan,
    type NavWindow,
} from '../utils/chartNav';

export interface ChartNavOptions {
    /** The configured start range (already resolved against the widget's chip list). */
    startRange: EChartTimeRange;
    startCustomValue: number;
    startCustomUnit: RangeUnit;
    /** Lead token of the start chip (`36h`), when it names one. */
    startLead?: string;
    /** The range is pinned to the configuration — chips from a group or datapoint are ignored. */
    lockRange: boolean;
    /** Paging on (‹ › ⇥ 📅). Without it the window always rolls up to now. */
    paging: boolean;
    /** Open on the current window instead of the rolling one. */
    startOnCurrent: boolean;
    anchor: NavAnchor;
    /** How far ‹ › 📅 may go into the future (forecasts); default none. */
    future?: NavFuture;
    /** Newest recorded point for `future: data` — undefined while unknown. */
    newest?: number | null;
    /** What ⇥ calls the current window. */
    current?: NavCurrent;
    group: string;
    /**
     * What the link group shares: `all` (default) = range chip and date, `date` = only the date —
     * every chart keeps its own range and shows its window around the date the group stands on.
     */
    groupMode?: 'all' | 'date';
    dateDp: string;
    /**
     * End of a free range (#931). Once set, `dateDp` holds the START and this one the last day
     * shown, whatever the anchor — both read and written.
     */
    endDp?: string;
    rangeDp: string;
    commandDp: string;
    /** The date button picks a free range from–to instead of one day (#931). */
    freeRange?: boolean;
    /**
     * Minutes without any touch on the page after which the chart falls back to its configured
     * range and start date (#932). 0/undefined = never. A link group follows; datapoints are not
     * written — other devices sharing them may be in use.
     */
    idleResetMinutes?: number;
}

export interface ChartNav {
    range: EChartTimeRange;
    customValue: number;
    customUnit: RangeUnit;
    /** Lead token of the active chip (`36h`), undefined when the chip names none. */
    lead: string | undefined;
    /** Token of the active range (`24h`, `7d`, `3M`, `2d+36h`) — what a chip is matched by. */
    chipKey: string;
    span: NavSpan | null;
    paging: boolean;
    anchor: NavAnchor;
    /** Reference point, null = rolling up to now. */
    ref: number | null;
    /** The absolute window while paging, null while rolling (or on `total`). */
    window: NavWindow | null;
    /** The window is the current one (⇥ lit). */
    onCurrent: boolean;
    canNext: boolean;
    /** Latest instant a window may start at — now, or the forecast horizon (Infinity = open). */
    horizon: number;
    selectChip: (c: RangeChip) => void;
    command: (cmd: NavCommand) => void;
    /** A calendar day from the date field (`YYYY-MM-DD`). */
    pickDay: (iso: string) => void;
    /** The date button picks from–to (`echartNavFreeRange`, not with a locked range). */
    freeRange: boolean;
    /** A free range from the from–to fields: first and last day shown (`YYYY-MM-DD`). */
    pickRange: (fromIso: string, toIso: string) => void;
}

type Origin = 'user' | 'dp' | 'group';

export function useChartNav(opts: ChartNavOptions): ChartNav {
    const { startRange, startCustomValue, startCustomUnit, startLead, lockRange, paging, anchor, group } = opts;
    /** Limits as of this moment — the horizon moves with the clock. */
    const lim = (): NavLimits => ({
        horizon: futureHorizon(opts.future ?? { kind: 'none' }, opts.newest),
        current: opts.current,
    });

    const [range, setRange] = useState<EChartTimeRange>(startRange);
    const [customValue, setCustomValue] = useState<number>(startCustomValue);
    const [customUnit, setCustomUnit] = useState<RangeUnit>(startCustomUnit);
    const [lead, setLead] = useState<string | undefined>(startLead);
    const span = navSpan(range, customValue, customUnit);
    // Opening straight on the current window is opt-in, so an existing chart keeps its rolling range.
    const [ref, setRef] = useState<number | null>(() => {
        const s = navSpan(startRange, startCustomValue, startCustomUnit);
        return paging && opts.startOnCurrent && s ? todayRef(s, anchor, Date.now(), lim()) : null;
    });
    const chipKey = chipKeyOf(rangeKey(range, customValue, customUnit), lead);
    // The selection as of the last `navigate`, ahead of the next render: on mount the date and the
    // range datapoint both apply in one commit, and the second must build on the first.
    const now = useRef({ ref, chip: chipKey });
    now.current = { ref, chip: chipKey };

    // Reset the chip when the admin config changes. Deliberately without `ref`: the browsed date is
    // its own selection and must survive a range change.
    useEffect(() => {
        setRange(startRange);
        setCustomValue(startCustomValue);
        setCustomUnit(startCustomUnit);
        setLead(startLead);
        now.current = {
            ...now.current,
            chip: chipKeyOf(rangeKey(startRange, startCustomValue, startCustomUnit), startLead),
        };
    }, [startRange, startCustomValue, startCustomUnit, startLead]);

    // Only the paging options themselves move the paging mode — so toggling them in the editor
    // shows immediately, while browsing to another date afterwards is left alone.
    const startOnCurrent = paging && opts.startOnCurrent;
    useEffect(() => {
        const s = navSpan(startRange, startCustomValue, startCustomUnit);
        const r = startOnCurrent && s ? todayRef(s, anchor, Date.now(), lim()) : null;
        setRef(r);
        now.current = { ...now.current, ref: r };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startOnCurrent, anchor, opts.current]);

    const dateId = paging ? opts.dateDp.trim() : '';
    const endId = dateId ? (opts.endDp ?? '').trim() : '';
    const rangeId = opts.rangeDp.trim();
    const cmdId = paging ? opts.commandDp.trim() : '';
    const dateDp = useDatapoint(dateId);
    const endDp = useDatapoint(endId);
    const rangeDp = useDatapoint(rangeId);
    const cmdDp = useDatapoint(cmdId);
    // Values this widget wrote itself: their echo must not be applied — by the time it arrives
    // the chart may already stand on a newer selection.
    const ownWrites = useRef(new Set<string>());
    const publish = useChartNavStore((s) => s.publish);
    const groupState = useChartNavStore((s) => (group ? s.groups[group] : undefined));

    /** Writes a navigation datapoint, remembering the value so its echo is not applied. */
    const writeDp = (dp: ReturnType<typeof useDatapoint>, tag: string, v: string | number) => {
        if (String(v) === String(dp.value ?? '')) return;
        ownWrites.current.add(`${tag}:${v}`);
        dp.setValue(v);
    };

    const spanOf = (key: string) => {
        const c = parseRangeToken(key);
        return c ? navSpan(c.range, c.value, c.unit) : null;
    };

    /**
     * The one way the selection changes. `user` = clicked in this widget: tell the group and write
     * the datapoints. `dp` = a datapoint moved it: tell the group, but write nothing back.
     * `group` = another linked chart moved it: just follow.
     */
    const navigate = (chip: RangeChip | null, nextRef: number | null, origin: Origin) => {
        const nextChip = chip && !lockRange ? chip : null;
        if (nextChip) {
            setRange(nextChip.range);
            if (nextChip.range === 'custom') {
                setCustomValue(nextChip.value ?? 24);
                setCustomUnit(nextChip.unit ?? 'h');
            }
            setLead(nextChip.lead);
        }
        const r = paging ? nextRef : null;
        setRef(r);
        const key = nextChip?.key ?? now.current.chip;
        now.current = { ref: r, chip: key };
        if (origin !== 'group' && group) publish(group, { chip: key, ref: r });
        if (origin !== 'user') return;
        if (endId) {
            // From–to: the window's first and last day, also for a chip or a step.
            const s = spanOf(key);
            const w = r !== null && s ? navWindow(s, r, anchor) : null;
            writeDp(dateDp, 'd', formatNavBound(w?.start ?? null, 'start', typeof dateDp.value === 'number'));
            writeDp(endDp, 'e', formatNavBound(w?.end ?? null, 'end', typeof endDp.value === 'number'));
        } else if (dateId) {
            writeDp(dateDp, 'd', formatNavDate(r, anchor, typeof dateDp.value === 'number'));
        }
        if (rangeId) writeDp(rangeDp, 'r', key);
    };

    /** A free range [start, end) — becomes an N-day chip whose window is exactly that range. */
    const applyRange = (start: number, end: number, origin: Origin) => {
        const f = freeRange(start, end, anchor);
        const chip = parseRangeToken(f.token);
        if (!chip) return;
        navigate(chip, normalizeRef(f.ref, f.span, anchor, Date.now(), lim()), origin);
    };

    /** A chip change keeps the browsed date — the current window stays the current window. */
    const switchChip = (c: RangeChip, origin: Origin) => {
        const cur = now.current;
        const to = navSpan(c.range, c.value, c.unit);
        navigate(
            c,
            cur.ref !== null && to ? switchRef(cur.ref, spanOf(cur.chip), to, anchor, Date.now(), lim()) : cur.ref,
            origin,
        );
    };

    const command = (cmd: NavCommand, origin: Origin) => {
        if (cmd === 'now') return navigate(null, null, origin);
        const cur = now.current;
        const s = spanOf(cur.chip);
        if (!s) return;
        const l = lim();
        if (cmd === 'today') return navigate(null, todayRef(s, anchor, Date.now(), l), origin);
        if (cmd === 'next' && !canStepForward(cur.ref, s, anchor, Date.now(), l)) return;
        navigate(null, stepRef(cur.ref, s, cmd === 'prev' ? -1 : 1, anchor, Date.now(), l), origin);
    };

    // Back to the configured range and start date after idle (#932) — armed only while the chart
    // stands elsewhere. With "open on the current window" that is today's window as of now, so a
    // wall display left on yesterday's "today" moves on as well.
    const startKey = chipKeyOf(rangeKey(startRange, startCustomValue, startCustomUnit), startLead);
    const startRefNow = () => {
        const s = navSpan(startRange, startCustomValue, startCustomUnit);
        return startOnCurrent && s ? todayRef(s, anchor, Date.now(), lim()) : null;
    };
    const idleMs = Math.max(0, Number(opts.idleResetMinutes) || 0) * 60_000;
    const away = chipKey !== startKey || ref !== startRefNow();
    useIdleTimeout(away ? idleMs : 0, () => {
        // Like a datapoint: the group follows, nothing is written back.
        navigate(parseRangeToken(startKey), startRefNow(), 'dp');
    });

    // Follow the group — including the state it already has when this chart mounts (a popup copy).
    useEffect(() => {
        if (!groupState) return;
        const cur = now.current;
        if (opts.groupMode === 'date') {
            // Only the date: fit the group's reference point to this chart's own span — today's
            // window stays today's window, an hour chart's day lands in a week chart's week.
            const s = spanOf(cur.chip);
            const r =
                groupState.ref !== null && s
                    ? switchRef(groupState.ref, spanOf(groupState.chip), s, anchor, Date.now(), lim())
                    : groupState.ref;
            if (r !== cur.ref) navigate(null, r, 'group');
            return;
        }
        if (groupState.chip === cur.chip && groupState.ref === cur.ref) return;
        const chip = parseRangeToken(groupState.chip);
        navigate(chip && chip.key !== cur.chip ? chip : null, groupState.ref, 'group');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupState]);

    /** From–to datapoints: both ends together decide; a half-written pair (end before start) waits. */
    const applyBounds = () => {
        const start = parseNavBound(dateDp.value, 'start');
        const end = parseNavBound(endDp.value, 'end');
        if (start === null || end === null) {
            if (now.current.ref !== null) navigate(null, null, 'dp');
            return;
        }
        if (start === undefined || end === undefined || end <= start) return;
        applyRange(start, end, 'dp');
    };

    useEffect(() => {
        if (!endId) return;
        if (ownWrites.current.delete(`e:${endDp.value}`)) return;
        applyBounds();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endDp.value, endId]);

    useEffect(() => {
        const raw = dateDp.value;
        if (ownWrites.current.delete(`d:${raw}`)) return;
        if (endId) return applyBounds();
        const r = parseNavDate(raw, anchor);
        if (r === undefined || r === now.current.ref) return;
        const s = spanOf(now.current.chip);
        navigate(null, r !== null && s ? normalizeRef(r, s, anchor, Date.now(), lim()) : r, 'dp');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateDp.value, anchor, endId]);

    useEffect(() => {
        const raw = rangeDp.value;
        if (ownWrites.current.delete(`r:${raw}`)) return;
        const chip = parseRangeToken(raw);
        if (!chip || chip.key === now.current.chip) return;
        switchChip(chip, 'dp');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rangeDp.value]);

    // Commands react to every update (ts), also to the same value twice. The state found on mount
    // is history, not a command. Linked charts share one command datapoint: the first claims it
    // and steps the group, the others follow the group.
    const cmdSeen = useRef<{ id: string; ts: number } | null>(null);
    useEffect(() => {
        const st = cmdDp.state;
        if (!st || !cmdId) return;
        const seen = cmdSeen.current;
        cmdSeen.current = { id: cmdId, ts: st.ts };
        if (!seen || seen.id !== cmdId || seen.ts === st.ts) return;
        const cmd = parseNavCommand(st.val);
        if (!cmd) return;
        if (group && !useChartNavStore.getState().claimCommand(group, `${cmdId}@${st.ts}`)) return;
        command(cmd, 'dp');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cmdDp.state]);

    const free = !!opts.freeRange && !lockRange && paging;
    return {
        range,
        customValue,
        customUnit,
        lead,
        chipKey,
        span,
        paging,
        anchor,
        ref,
        window: paging && ref !== null && span ? navWindow(span, ref, anchor) : null,
        onCurrent: isTodayRef(ref, span, anchor, Date.now(), lim()),
        canNext: canStepForward(ref, span, anchor, Date.now(), lim()),
        horizon: Math.max(Date.now(), lim().horizon ?? 0),
        selectChip: (c) => switchChip(c, 'user'),
        command: (cmd) => command(cmd, 'user'),
        pickDay: (iso) => {
            if (!iso || !span) return;
            const [y, m, d] = iso.split('-').map(Number);
            if (!y || !m || !d) return;
            navigate(
                null,
                normalizeRef(refFromDay(new Date(y, m - 1, d).getTime(), anchor), span, anchor, Date.now(), lim()),
                'user',
            );
        },
        freeRange: free,
        pickRange: (fromIso, toIso) => {
            if (!free) return;
            // A "to" before the "from" is the range the other way round, not an error.
            const [a, b] = toIso < fromIso ? [toIso, fromIso] : [fromIso, toIso];
            const from = parseNavBound(a, 'start');
            const to = parseNavBound(b, 'end');
            if (typeof from !== 'number' || typeof to !== 'number') return;
            applyRange(from, to, 'user');
        },
    };
}
