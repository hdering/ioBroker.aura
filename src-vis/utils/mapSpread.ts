/** A marker's position in screen pixels at the current zoom. */
export interface SpreadPoint {
    id: string;
    x: number;
    y: number;
}

/** Markers whose tips are closer than this (px) count as one spot (#895). */
export const SPREAD_THRESHOLD_PX = 24;
/** Pin width plus a small gap: neighbours on the ring must not overlap. */
const SPREAD_SLOT_PX = 34;
const SPREAD_MIN_RADIUS_PX = 18;

/**
 * Pulls apart markers that sit on (almost) the same spot so each one stays visible (#895):
 * markers closer than `threshold` px — also via a chain of neighbours — form a group, and the
 * group's pins are placed on a ring around its centre. Returns the pixel offset per moved
 * marker; markers on their own are left out. Order on the ring follows the input order, so
 * the same people always sit in the same place (two: left and right).
 */
export function spreadOffsets(
    points: SpreadPoint[],
    threshold = SPREAD_THRESHOLD_PX,
): Record<string, [number, number]> {
    const parent = points.map((_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < threshold) {
                parent[find(j)] = find(i);
            }
        }
    }
    const groups = new Map<number, number[]>();
    points.forEach((_, i) => {
        const root = find(i);
        groups.set(root, [...(groups.get(root) ?? []), i]);
    });

    const out: Record<string, [number, number]> = {};
    for (const members of groups.values()) {
        const n = members.length;
        if (n < 2) continue;
        const cx = members.reduce((s, i) => s + points[i].x, 0) / n;
        const cy = members.reduce((s, i) => s + points[i].y, 0) / n;
        const radius = Math.max(SPREAD_MIN_RADIUS_PX, (SPREAD_SLOT_PX * n) / (2 * Math.PI));
        members.forEach((i, k) => {
            const angle = Math.PI + (k * 2 * Math.PI) / n;
            const p = points[i];
            // Whole pixels: the offset keys the icon, and sub-pixel jitter of a live position would rebuild it.
            out[p.id] = [
                Math.round(cx + radius * Math.cos(angle) - p.x),
                Math.round(cy + radius * Math.sin(angle) - p.y),
            ];
        });
    }
    return out;
}
