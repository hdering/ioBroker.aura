import { Badge } from '../common/Badge';
import type { BadgeCorner } from '../../types';
import type { ResolvedBadge } from '../../hooks/useBadges';

// Overlays resolved badges on the four corners of a widget/group. Each badge
// sits ON the edge (centred on the corner, overflowing outward), so the host
// container must not clip overflow (.aura-widget is overflow-visible).

const CORNERS: BadgeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function cornerStyle(corner: BadgeCorner): React.CSSProperties {
    const base: React.CSSProperties = {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        pointerEvents: 'none',
        zIndex: 3,
    };
    switch (corner) {
        case 'top-left':
            return { ...base, top: 0, left: 0, alignItems: 'flex-start', transform: 'translate(-40%, -40%)' };
        case 'top-right':
            return { ...base, top: 0, right: 0, alignItems: 'flex-end', transform: 'translate(40%, -40%)' };
        case 'bottom-left':
            return { ...base, bottom: 0, left: 0, alignItems: 'flex-start', transform: 'translate(-40%, 40%)' };
        case 'bottom-right':
            return { ...base, bottom: 0, right: 0, alignItems: 'flex-end', transform: 'translate(40%, 40%)' };
    }
}

export function BadgeOverlay({ badges }: { badges: ResolvedBadge[] }) {
    if (!badges.length) return null;
    return (
        <>
            {CORNERS.map((corner) => {
                const inCorner = badges.filter((b) => b.corner === corner);
                if (!inCorner.length) return null;
                return (
                    <div key={corner} className="nodrag aura-badge-corner" style={cornerStyle(corner)}>
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
