import { Icon } from '@iconify/react';
import type { BadgeStyle, BadgeSize } from '../../types';

// Visual primitive for a single badge. Stateless — fed by useBadges.
// Style reference: the small circular status badges in StatusBadges.tsx /
// useStatusFields.tsx (ring against the surface, CSS-var colours).

const DOT_PX: Record<BadgeSize, number> = { sm: 8, md: 12, lg: 16 };
const TEXT_PX: Record<BadgeSize, number> = { sm: 9, md: 11, lg: 13 };

// A 2px ring in the surface colour lets the badge read cleanly even when it
// straddles the widget border.
const RING = '0 0 0 2px var(--widget-bg, var(--app-bg))';

export function Badge({
    style,
    size = 'md',
    color,
    text,
    icon,
}: {
    style: BadgeStyle;
    size?: BadgeSize;
    color?: string;
    text?: string;
    icon?: string;
}) {
    const c = color || 'var(--accent)';

    if (style === 'dot') {
        const d = DOT_PX[size];
        return (
            <span
                style={{
                    width: d,
                    height: d,
                    borderRadius: '50%',
                    background: c,
                    boxShadow: RING,
                    display: 'inline-block',
                }}
            />
        );
    }

    const fs = TEXT_PX[size];
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                fontSize: fs,
                lineHeight: 1,
                fontWeight: 700,
                color: '#fff',
                background: c,
                borderRadius: 999,
                padding: `${Math.round(fs * 0.28)}px ${Math.round(fs * 0.55)}px`,
                minWidth: fs + 8,
                height: fs + 8,
                boxShadow: RING,
                whiteSpace: 'nowrap',
            }}
        >
            {icon && <Icon icon={icon} width={fs} height={fs} style={{ color: 'currentColor' }} />}
            {text}
        </span>
    );
}
