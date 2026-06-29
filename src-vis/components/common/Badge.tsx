import { Icon } from '@iconify/react';
import type { BadgeStyle, BadgeSize } from '../../types';

// Visual primitive for a single badge. Stateless — fed by useBadges.
// Style reference: the small circular status badges in StatusBadges.tsx /
// useStatusFields.tsx (ring against the surface, CSS-var colours).

const DOT_PRESET: Record<'sm' | 'md' | 'lg', number> = { sm: 8, md: 12, lg: 16 };
const TEXT_PRESET: Record<'sm' | 'md' | 'lg', number> = { sm: 9, md: 11, lg: 13 };

/** Dot diameter in px for a size (preset name or explicit number). */
export function badgeDotPx(size: BadgeSize | undefined): number {
    return typeof size === 'number' ? size : DOT_PRESET[size ?? 'md'];
}

/** Text/icon font size in px for a size (preset name or explicit number). */
export function badgeTextPx(size: BadgeSize | undefined): number {
    return typeof size === 'number' ? size : TEXT_PRESET[size ?? 'md'];
}

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
        const d = badgeDotPx(size);
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

    const fs = badgeTextPx(size);
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
