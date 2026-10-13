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
import { useDatapoint } from '../../hooks/useDatapoint';
import { activeBgImage, bgImageStyle } from '../../utils/backgroundImage';

/** Spread into the host's style whenever a layer is rendered inside it. */
export const BG_IMAGE_HOST_STYLE: CSSProperties = { isolation: 'isolate' };

export function BackgroundImageLayer({ image }: { image: unknown }) {
    const dp = activeBgImage(image)?.dp?.trim();
    // Only an image bound to a datapoint subscribes one (#775).
    return dp ? <DpImageLayer image={image} dp={dp} /> : <ImageLayer image={image} />;
}

function DpImageLayer({ image, dp }: { image: unknown; dp: string }) {
    const { value } = useDatapoint(dp);
    return <ImageLayer image={image} dpValue={value} />;
}

function ImageLayer({ image, dpValue }: { image: unknown; dpValue?: unknown }) {
    const style = bgImageStyle(image, dpValue);
    if (!style) return null;
    return (
        <div
            aria-hidden
            className="aura-bg-image absolute inset-0 pointer-events-none"
            style={{ ...style, zIndex: -1, borderRadius: 'inherit' }}
        />
    );
}
