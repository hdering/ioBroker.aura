/**
 * Digit formatting for the Countdown widget (#675).
 *
 * A countdown shows the time that is still to come, so a remaining 59.4 s reads
 * 01:00 and not 00:59 — the display rounds UP to whole seconds and reaches
 * 00:00 exactly when the countdown ends. Negative input is treated as 0.
 */
import type { CountdownFormat } from '../types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Whole seconds still to come (ceil), never negative. */
export function remainingSeconds(ms: number): number {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.ceil(ms / 1000);
}

/**
 * Format remaining milliseconds as digits.
 *
 *   auto  — hh:mm:ss from one hour on, mm:ss below (the default)
 *   hms   — always hh:mm:ss
 *   ms    — total minutes:seconds (90:00 for an hour and a half)
 *   hm    — hh:mm, seconds rounded up to the next minute
 *
 * With `showDays` durations from 24 h on put the days in front ("2d 03:04:05");
 * without it the hours simply keep counting (51:04:05).
 */
export function formatCountdown(ms: number, format: CountdownFormat = 'auto', showDays = false): string {
    const total = remainingSeconds(ms);
    let secs = total;
    let dayPrefix = '';
    if (showDays && total >= 86400) {
        const days = Math.floor(total / 86400);
        secs = total - days * 86400;
        dayPrefix = `${days}d `;
    }
    if (format === 'ms') {
        return `${dayPrefix}${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
    }
    if (format === 'hm') {
        const mins = Math.ceil(secs / 60);
        return `${dayPrefix}${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    }
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (format === 'auto' && h === 0 && !dayPrefix) return `${pad(m)}:${pad(s)}`;
    return `${dayPrefix}${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Short human label for a preset chip: 90 → "1:30", 300 → "5 min", 3600 → "1 h", 5400 → "1:30 h". */
export function formatPreset(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 60) return `${seconds} s`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s === 0 ? `${m} min` : `${m}:${pad(s)}`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m === 0 ? `${h} h` : `${h}:${pad(m)} h`;
}

/**
 * Parse a user-typed duration: "90" (seconds), "1:30" (m:s), "1:00:00" (h:m:s),
 * or "5m", "1h", "1h30m", "45s". Returns whole seconds or null.
 */
export function parseDurationText(text: string): number | null {
    const s = text.trim().toLowerCase();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) {
        return s.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
    }
    const m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?$/);
    if (m && (m[1] || m[2] || m[3])) {
        return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    }
    return null;
}

/** Split seconds into the three fields of the duration editor. */
export function splitDuration(seconds: number): { h: number; m: number; s: number } {
    const total = Math.max(0, Math.round(seconds || 0));
    return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}
