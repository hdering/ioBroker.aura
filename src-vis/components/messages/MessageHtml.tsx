import DOMPurify from 'dompurify';
import { SafeHtml } from '../common/SafeHtml';
import { useResolvedTitle } from '../widgets/DynamicTitle';

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
 * Same content as plain text, for the compact rows (widget list, bell dropdown,
 * admin history) where raw markup would otherwise leak into a single line.
 * Sanitises first so a stripped `<script>` cannot smuggle its body through.
 */
export function stripMessageHtml(raw: string | undefined): string {
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
