/**
 * SafeHtml — render a user-provided HTML string after sanitising it with
 * DOMPurify. Mirrors the sanitise-then-inject pattern used in HtmlPopupBody.
 *
 * DOMPurify allows <img> (incl. src/width/height) by default, so simple
 * "logo" markup works without extra config, while <script> and event
 * handlers are stripped. Plain-text labels pass through unchanged.
 */
import DOMPurify from 'dompurify';

interface Props {
    html: string;
    /** Wrapper element. Defaults to an inline-block span so images sit inline. */
    as?: 'span' | 'div';
    className?: string;
    style?: React.CSSProperties;
    title?: string;
}

export function SafeHtml({ html, as = 'span', className, style, title }: Props) {
    const clean = DOMPurify.sanitize(html ?? '');
    const Tag = as;
    return (
        <Tag
            className={className}
            title={title}
            style={as === 'span' ? { display: 'inline-block', ...style } : style}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
}
