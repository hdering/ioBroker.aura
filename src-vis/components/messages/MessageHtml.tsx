import { useCallback } from 'react';
import DOMPurify from 'dompurify';
import { SafeHtml } from '../common/SafeHtml';
import { hasDpToken, useDpTokenResolver, useResolvedTitle } from '../widgets/DynamicTitle';

/**
 * Title and body of a message render as sanitised HTML, so a notice can carry a
 * table, a list or a bit of emphasis (issue #429).
 *
 * `[[dp]]` tokens resolve first, then DOMPurify runs — that order matters: a
 * datapoint whose value happens to contain markup must go through the sanitiser
 * too, not be injected raw.
 *
 * The trade-off: a plain-text sender writing something like `Wert <sensor>
 * defekt` loses the angle-bracket word, because the HTML parser reads it as a
 * tag and the sanitiser drops the unknown element. Bare comparisons (`Temperatur
 * < 5`) survive — a `<` only starts a tag when a letter follows it.
 */
export function MessageHtml({
    text,
    as = 'span',
    className,
}: {
    text: string;
    as?: 'span' | 'div';
    className?: string;
}) {
    const resolved = useResolvedTitle(text);
    return <SafeHtml as={as} html={resolved} className={className} />;
}

/**
 * Same content as plain text, for the compact rows where raw markup would
 * otherwise leak into a single line. Sanitises first so a stripped `<script>`
 * cannot smuggle its body through. Those rows reach it through
 * useMessagePlainText below, which resolves the `[[dp]]` tokens first.
 */
function stripMessageHtml(raw: string | undefined): string {
    if (!raw) return '';
    // Cell and item boundaries carry no whitespace of their own, so dropping the
    // tags outright would run "<td>Raum</td><td>Temperatur</td>" into one word.
    const spaced = raw.replace(/<\/(td|th|tr|li|p|div|h[1-6])>|<br\s*\/?>/gi, ' ');
    const clean = DOMPurify.sanitize(spaced, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    // DOMPurify escapes what it removes; turn the entities back into characters
    // and collapse the whitespace that block elements left behind.
    const el = document.createElement('textarea');
    el.innerHTML = clean;
    return (el.value || '').replace(/\s+/g, ' ').trim();
}

/**
 * The plain-text reading of a whole message list, `[[dp]]` tokens resolved
 * (issue #605).
 *
 * The compact rows - widget list, bell dropdown, admin history - cannot call
 * useResolvedTitle per message: the number of messages changes between renders,
 * and that is one hook per row. So every text of the list goes into the batch
 * resolver once and the returned mapper is applied per row, exactly the shape the
 * list widgets use for their row labels.
 *
 * Tokens resolve BEFORE the markup is stripped, the same order MessageHtml uses:
 * a datapoint value that happens to contain markup has to reach the sanitiser.
 */
export function useMessagePlainText(
    messages: ReadonlyArray<{ title?: string; text?: string; html?: string }>,
): (raw: string | undefined) => string {
    // Only token-bearing texts are handed over - a list without any placeholder
    // subscribes to nothing and the mapper is the identity plus the strip.
    const texts: string[] = [];
    for (const m of messages) {
        for (const raw of [m.title, m.text, m.html]) if (raw && hasDpToken(raw)) texts.push(raw);
    }
    const resolve = useDpTokenResolver(texts);
    return useCallback((raw: string | undefined) => (raw ? stripMessageHtml(resolve(raw)) : ''), [resolve]);
}
