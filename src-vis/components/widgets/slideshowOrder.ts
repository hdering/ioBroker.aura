/**
 * Order of the slideshow (#848), kept free of React so it can be tested on its own.
 *
 * Random order is a seeded shuffle per round: every file once per round, no
 * repeats, and the same seed + round give the same order again. That is what
 * lets a slideshow that is mounted anew (the screensaver popup opens on every
 * idle phase) continue where it stopped instead of starting over, by keeping
 * nothing but `{ seed, round, path }`.
 */

export type SlideshowOrder = 'dateDesc' | 'dateAsc' | 'name' | 'random';

export const SLIDESHOW_ORDERS: SlideshowOrder[] = ['random', 'dateDesc', 'dateAsc', 'name'];

/** One entry of `/fs/media`. */
export interface MediaItem {
    path: string;
    name: string;
    kind: 'image' | 'video';
    size: number;
    /** Capture date (EXIF / mp4) or, without one, the file date - ms. */
    time: number;
    dateSource: 'exif' | 'mtime';
}

/** Where the show stands; small enough for sessionStorage. */
export interface SlideshowPosition {
    seed: number;
    round: number;
    /** Path of the item on screen. */
    path: string | null;
}

/** mulberry32: tiny, fast, good enough to shuffle photos. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const byPath = (a: MediaItem, b: MediaItem) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Fisher-Yates over a copy sorted by path, so the input order of the list does not matter. */
function shuffled(items: MediaItem[], seed: number): MediaItem[] {
    const out = [...items].sort(byPath);
    const rnd = seededRandom(seed);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Seed of one round: rounds of the same show differ, but stay reproducible. */
function roundSeed(seed: number, round: number): number {
    return (seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
}

/**
 * The sequence of one round.
 *
 * Random: a new shuffle per round, whose first item is never the last one of
 * the round before (the same photo twice in a row looks like a hang).
 * The sorted orders are the same every round; name ties break by path.
 */
export function slideshowSequence(items: MediaItem[], order: SlideshowOrder, seed: number, round: number): MediaItem[] {
    if (order !== 'random') {
        const out = [...items];
        if (order === 'name') {
            out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || byPath(a, b));
        } else {
            const dir = order === 'dateAsc' ? 1 : -1;
            out.sort((a, b) => (a.time - b.time) * dir || byPath(a, b));
        }
        return out;
    }
    // Two files: one order for every round (x y x y) - a new shuffle could only repeat one.
    if (items.length === 2) return shuffled(items, roundSeed(seed, 0));
    const seq = shuffled(items, roundSeed(seed, round));
    // From three files on, the swap below never touches the last item, so the raw
    // shuffle of the round before tells its true last item without recursing.
    if (round > 0 && seq.length > 2) {
        const prev = shuffled(items, roundSeed(seed, round - 1));
        if (seq[0].path === prev[prev.length - 1].path) [seq[0], seq[1]] = [seq[1], seq[0]];
    }
    return seq;
}

/** Index of `path` in the sequence, 0 when it is gone (deleted, folder changed). */
export function indexOfPath(seq: MediaItem[], path: string | null): number {
    if (!path) return 0;
    const i = seq.findIndex((m) => m.path === path);
    return i < 0 ? 0 : i;
}

/**
 * One step forward or back. Running off the end starts the next round (a new
 * shuffle in random order); going back from the first item of a round goes to
 * the last of the round before.
 */
export function stepPosition(
    items: MediaItem[],
    order: SlideshowOrder,
    pos: SlideshowPosition,
    dir: 1 | -1,
): { pos: SlideshowPosition; item: MediaItem | null } {
    if (!items.length) return { pos: { ...pos, path: null }, item: null };
    const seq = slideshowSequence(items, order, pos.seed, pos.round);
    const i = pos.path ? seq.findIndex((m) => m.path === pos.path) : -1;
    // An item that vanished: continue at the start of the round.
    if (i < 0) return { pos: { ...pos, path: seq[0].path }, item: seq[0] };
    const j = i + dir;
    if (j >= 0 && j < seq.length) return { pos: { ...pos, path: seq[j].path }, item: seq[j] };
    const round = Math.max(0, pos.round + dir);
    if (dir < 0 && pos.round === 0) {
        // No round before the first one: wrap to its end.
        const last = seq[seq.length - 1];
        return { pos: { ...pos, path: last.path }, item: last };
    }
    const next = slideshowSequence(items, order, pos.seed, round);
    const item = dir > 0 ? next[0] : next[next.length - 1];
    return { pos: { seed: pos.seed, round, path: item.path }, item };
}

/** The item `pos` points at, or the first of its round. */
export function currentItem(items: MediaItem[], order: SlideshowOrder, pos: SlideshowPosition): MediaItem | null {
    if (!items.length) return null;
    const seq = slideshowSequence(items, order, pos.seed, pos.round);
    return seq[indexOfPath(seq, pos.path)];
}

/** The item after `pos` without moving, for preloading. */
export function peekNext(items: MediaItem[], order: SlideshowOrder, pos: SlideshowPosition): MediaItem | null {
    return stepPosition(items, order, pos, 1).item;
}
