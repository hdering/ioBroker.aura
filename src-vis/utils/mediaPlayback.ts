/**
 * Whether a `media.state` datapoint currently means "playing".
 *
 * Adapters disagree on the encoding: booleans, the strings play/playing, and numeric
 * enums whose numbering is anything but standard — a Yamaha receiver reports
 * 0 = Play, 1 = Stop, 2 = Pause, so the usual `=== 1` check reads a stopped player as
 * playing. `playValue` pins the value that means play; device detection fills it in
 * whenever the datapoint declares a `common.states` enum. Without it we fall back to
 * the encodings that are unambiguous. (issue #593)
 */
export function isPlaybackActive(value: unknown, playValue?: unknown): boolean {
    if (playValue !== undefined && playValue !== '') return String(value) === String(playValue);
    return value === true || value === 1 || value === 'play' || value === 'playing';
}
