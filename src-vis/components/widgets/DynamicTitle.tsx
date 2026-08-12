/**
 * Live datapoint values inside a widget title.
 *
 * Two placeholder layers exist and they do different jobs:
 *   `{{parent}}`  – static string substitution, applied ONCE when a popup view opens
 *                   (see popup/TabEmbedBody). It rewrites text, it never reads a value.
 *   `[[dp]]`      – this file: the token is resolved at render time by subscribing to
 *                   the datapoint, so the title follows the value.
 *
 * They compose, because the static layer runs first: a title of
 * `[[{{parent}}.TempLiving]] °C` becomes `[[0_userdata.0.Räume.TempLiving]] °C`
 * on open and then renders the live temperature.
 *
 * A token may carry a JSON path (`[[dp#battery.soc]]`) — the whole token content is
 * handed to useDatapoint, which owns that syntax.
 */
import { Fragment, useMemo } from 'react';
import { useDatapoint } from '../../hooks/useDatapoint';

/** `[[…]]` with a non-empty, bracket-free body. */
const DP_TOKEN = /\[\[([^[\]]+)\]\]/g;

/** True when `text` carries at least one `[[dp]]` token. */
export function hasDpToken(text: string | undefined | null): boolean {
    return !!text && /\[\[[^[\]]+\]\]/.test(text);
}

/** Strips the tokens, leaving the static text — for places that need a plain string
 *  (tooltips, published names) rather than a live-updating node. */
export function stripDpTokens(text: string): string {
    return text
        .replace(DP_TOKEN, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** One token: subscribes to its datapoint and renders the current value. */
function TokenValue({ dp }: { dp: string }) {
    const { value } = useDatapoint(dp);
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return <>{value ? 'AN' : 'AUS'}</>;
    return <>{String(value)}</>;
}

/**
 * Renders `text` with every `[[dp]]` token replaced by that datapoint's live value.
 * Each token becomes its own component so the number of tokens may vary freely —
 * a hook per token, never a hook in a loop.
 *
 * Returns the text unchanged (no subscriptions) when it holds no token, which is
 * the case for virtually every title.
 */
export function DynamicTitle({ text }: { text: string }) {
    const parts = useMemo(() => {
        if (!hasDpToken(text)) return null;
        const out: { text: string; dp?: string }[] = [];
        let last = 0;
        for (const m of text.matchAll(DP_TOKEN)) {
            if (m.index! > last) out.push({ text: text.slice(last, m.index) });
            out.push({ text: '', dp: m[1].trim() });
            last = m.index! + m[0].length;
        }
        if (last < text.length) out.push({ text: text.slice(last) });
        return out;
    }, [text]);

    if (!parts) return <>{text}</>;

    return (
        <>
            {parts.map((p, i) => (
                <Fragment key={i}>{p.dp ? <TokenValue dp={p.dp} /> : p.text}</Fragment>
            ))}
        </>
    );
}
