/**
 * Paints a background image (issue #442) between a box's own background colour
 * and its content.
 *
 * The layer sits at z-index -1, so the host MUST be its own stacking context —
 * pass `BG_IMAGE_HOST_STYLE` (isolation: isolate) to it. Then the painting order
 * is: host colour → this layer → the host's content, without touching the
 * z-index or position of a single child.
 */
import type { CSSProperties } from 'react';
import { bgImageStyle } from '../../utils/backgroundImage';

/** Spread into the host's style whenever a layer is rendered inside it. */
export const BG_IMAGE_HOST_STYLE: CSSProperties = { isolation: 'isolate' };

export function BackgroundImageLayer({ image }: { image: unknown }) {
    const style = bgImageStyle(image);
    if (!style) return null;
    return (
        <div
            aria-hidden
            className="aura-bg-image absolute inset-0 pointer-events-none"
            style={{ ...style, zIndex: -1, borderRadius: 'inherit' }}
        />
    );
}
