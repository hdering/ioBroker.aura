import { Badge, badgeDotPx, badgeTextPx } from '../common/Badge';
import type { BadgeCorner } from '../../types';
import type { ResolvedBadge } from '../../hooks/useBadges';

// Overlays resolved badges on the four corners of a widget/group. Each badge
// sits ON the edge (centred on the corner, overflowing outward), so the host
// container must not clip overflow (.aura-widget is overflow-visible; the tab
// bar rows use .aura-badge-room to keep their overflow-x:auto scroll from
// clipping the badges vertically — see index.css).

const CORNERS: BadgeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Height of one badge in px — a dot is as tall as it is wide, a label is fs+8. */
function badgeHeightPx(b: ResolvedBadge): number {
    return b.style === 'dot' ? badgeDotPx(b.size) : badgeTextPx(b.size) + 8;
}

// How far the badge hangs over the edge. Deliberately a px value derived from
// the badge HEIGHT, not a percentage of its width: a label with a long text is
// wide, and `translateX(40%)` pushed it far into the widget sitting next to it
// (where the neighbour — its own stacking context — painted over the text).
// For a dot, width == height, so this is exactly the previous offset.
function overhangPx(badges: ResolvedBadge[]): number {
    return Math.round(0.4 * Math.max(...badges.map(badgeHeightPx)));
}

function cornerStyle(corner: BadgeCorner, over: number, clamp: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pointerEvents: 'none',
        zIndex: 3,
        // A label may grow inward at most to the far edge of the host (plus the
        // overhang), so a long text never spills across the widget next to it.
        ...(clamp ? { maxWidth: `calc(100% + ${over}px)` } : {}),
    };
    switch (corner) {
        case 'top-left':
            return { ...base, top: 0, left: 0, alignItems: 'flex-start', transform: `translate(${-over}px, -40%)` };
        case 'top-right':
            return { ...base, top: 0, right: 0, alignItems: 'flex-end', transform: `translate(${over}px, -40%)` };
        case 'bottom-left':
            return { ...base, bottom: 0, left: 0, alignItems: 'flex-start', transform: `translate(${-over}px, 40%)` };
        case 'bottom-right':
            return { ...base, bottom: 0, right: 0, alignItems: 'flex-end', transform: `translate(${over}px, 40%)` };
    }
}

export function BadgeOverlay({ badges, clampWidth = false }: { badges: ResolvedBadge[]; clampWidth?: boolean }) {
    if (!badges.length) return null;
    return (
        <>
            {CORNERS.map((corner) => {
                const inCorner = badges.filter((b) => b.corner === corner);
                if (!inCorner.length) return null;
                return (
                    <div
                        key={corner}
                        className="nodrag aura-badge-corner"
                        style={cornerStyle(corner, overhangPx(inCorner), clampWidth)}
                    >
                        {inCorner.map((b) => (
                            <Badge
                                key={b.id}
                                style={b.style}
                                size={b.size}
                                color={b.color}
                                text={b.text}
                                icon={b.icon}
                            />
                        ))}
                    </div>
                );
            })}
        </>
    );
}
