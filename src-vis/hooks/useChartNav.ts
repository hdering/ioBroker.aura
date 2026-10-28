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
import type { EChartTimeRange } from './useMultiSeriesData';
import { useChartNavStore } from '../store/chartNavStore';
import { parseRangeToken, rangeKey, type RangeChip, type RangeUnit } from '../utils/rangeChips';
import {
    canStepForward,
    formatNavDate,
    isTodayRef,
    navSpan,
    navWindow,
    normalizeRef,
    parseNavCommand,
    parseNavDate,
    refFromDay,
    stepRef,
    switchRef,
    todayRef,
    type NavAnchor,
    type NavCommand,
    type NavSpan,
    type NavWindow,
} from '../utils/chartNav';

export interface ChartNavOptions {
    /** The configured start range (already resolved against the widget's chip list). */
    startRange: EChartTimeRange;
    startCustomValue: number;
    startCustomUnit: RangeUnit;
    /** The range is pinned to the configuration — chips from a group or datapoint are ignored. */
    lockRange: boolean;
    /** Paging on (‹ › ⇥ 📅). Without it the window always rolls up to now. */
    paging: boolean;
    /** Open on the current window instead of the rolling one. */
    startOnCurrent: boolean;
    anchor: NavAnchor;
    group: string;
    dateDp: string;
    rangeDp: string;
    commandDp: string;
}

export interface ChartNav {
    range: EChartTimeRange;
    customValue: number;
    customUnit: RangeUnit;
    /** Token of the active range (`24h`, `7d`, `3M`) — what a chip is matched by. */
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
    selectChip: (c: RangeChip) => void;
    command: (cmd: NavCommand) => void;
    /** A calendar day from the date field (`YYYY-MM-DD`). */
    pickDay: (iso: string) => void;
}

type Origin = 'user' | 'dp' | 'group';

export function useChartNav(opts: ChartNavOptions): ChartNav {
    const { startRange, startCustomValue, startCustomUnit, lockRange, paging, anchor, group } = opts;

    const [range, setRange] = useState<EChartTimeRange>(startRange);
    const [customValue, setCustomValue] = useState<number>(startCustomValue);
    const [customUnit, setCustomUnit] = useState<RangeUnit>(startCustomUnit);
    const span = navSpan(range, customValue, customUnit);
    // Opening straight on the current window is opt-in, so an existing chart keeps its rolling range.
    const [ref, setRef] = useState<number | null>(() => {
        const s = navSpan(startRange, startCustomValue, startCustomUnit);
        return paging && opts.startOnCurrent && s ? todayRef(s, anchor) : null;
    });
    const chipKey = rangeKey(range, customValue, customUnit);
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
        now.current = { ...now.current, chip: rangeKey(startRange, startCustomValue, startCustomUnit) };
    }, [startRange, startCustomValue, startCustomUnit]);

    // Only the paging options themselves move the paging mode — so toggling them in the editor
    // shows immediately, while browsing to another date afterwards is left alone.
    const startOnCurrent = paging && opts.startOnCurrent;
    useEffect(() => {
        const s = navSpan(startRange, startCustomValue, startCustomUnit);
        const r = startOnCurrent && s ? todayRef(s, anchor) : null;
        setRef(r);
        now.current = { ...now.current, ref: r };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startOnCurrent, anchor]);

    const dateId = paging ? opts.dateDp.trim() : '';
    const rangeId = opts.rangeDp.trim();
    const cmdId = paging ? opts.commandDp.trim() : '';
    const dateDp = useDatapoint(dateId);
    const rangeDp = useDatapoint(rangeId);
    const cmdDp = useDatapoint(cmdId);
    // Values this widget wrote itself: their echo must not be applied — by the time it arrives
    // the chart may already stand on a newer selection.
    const ownWrites = useRef(new Set<string>());
    const publish = useChartNavStore((s) => s.publish);
    const groupState = useChartNavStore((s) => (group ? s.groups[group] : undefined));

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
        }
        const r = paging ? nextRef : null;
        setRef(r);
        const key = nextChip?.key ?? now.current.chip;
        now.current = { ref: r, chip: key };
        if (origin !== 'group' && group) publish(group, { chip: key, ref: r });
        if (origin !== 'user') return;
        if (dateId) {
            const v = formatNavDate(r, anchor, typeof dateDp.value === 'number');
            if (String(v) !== String(dateDp.value ?? '')) {
                ownWrites.current.add(`d:${v}`);
                dateDp.setValue(v);
            }
        }
        if (rangeId && key !== String(rangeDp.value ?? '')) {
            ownWrites.current.add(`r:${key}`);
            rangeDp.setValue(key);
        }
    };

    const spanOf = (key: string) => {
        const c = parseRangeToken(key);
        return c ? navSpan(c.range, c.value, c.unit) : null;
    };

    /** A chip change keeps the browsed date — the current window stays the current window. */
    const switchChip = (c: RangeChip, origin: Origin) => {
        const cur = now.current;
        const to = navSpan(c.range, c.value, c.unit);
        navigate(c, cur.ref !== null && to ? switchRef(cur.ref, spanOf(cur.chip), to, anchor) : cur.ref, origin);
    };

    const command = (cmd: NavCommand, origin: Origin) => {
        if (cmd === 'now') return navigate(null, null, origin);
        const cur = now.current;
        const s = spanOf(cur.chip);
        if (!s) return;
        if (cmd === 'today') return navigate(null, todayRef(s, anchor), origin);
        if (cmd === 'next' && !canStepForward(cur.ref, s, anchor)) return;
        navigate(null, stepRef(cur.ref, s, cmd === 'prev' ? -1 : 1, anchor), origin);
    };

    // Follow the group — including the state it already has when this chart mounts (a popup copy).
    useEffect(() => {
        if (!groupState) return;
        const cur = now.current;
        if (groupState.chip === cur.chip && groupState.ref === cur.ref) return;
        const chip = parseRangeToken(groupState.chip);
        navigate(chip && chip.key !== cur.chip ? chip : null, groupState.ref, 'group');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupState]);

    useEffect(() => {
        const raw = dateDp.value;
        if (ownWrites.current.delete(`d:${raw}`)) return;
        const r = parseNavDate(raw, anchor);
        if (r === undefined || r === now.current.ref) return;
        const s = spanOf(now.current.chip);
        navigate(null, r !== null && s ? normalizeRef(r, s, anchor) : r, 'dp');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateDp.value, anchor]);

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

    return {
        range,
        customValue,
        customUnit,
        chipKey,
        span,
        paging,
        anchor,
        ref,
        window: paging && ref !== null && span ? navWindow(span, ref, anchor) : null,
        onCurrent: isTodayRef(ref, span, anchor),
        canNext: canStepForward(ref, span, anchor),
        selectChip: (c) => switchChip(c, 'user'),
        command: (cmd) => command(cmd, 'user'),
        pickDay: (iso) => {
            if (!iso || !span) return;
            const [y, m, d] = iso.split('-').map(Number);
            if (!y || !m || !d) return;
            navigate(null, normalizeRef(refFromDay(new Date(y, m - 1, d).getTime(), anchor), span, anchor), 'user');
        },
    };
}
