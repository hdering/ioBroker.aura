/**
 * Width of the scrollbar gutter that `.aura-scroll` permanently reserves.
 *
 * `.aura-scroll` sets `scrollbar-gutter: stable`, so every scroll container loses
 * these px on its inline-end edge — even while nothing overflows and no scrollbar
 * is painted. Layouts whose rows bleed past the content box (calendar entries)
 * would therefore sit closer to the left widget edge than to the right one, which
 * reads as a broken layout (#590). Publishing the measured width lets CSS move
 * that gutter out of the content box again instead of guessing a magic number:
 * it differs per browser and per OS scrollbar setting.
 *
 * Overlay scrollbars reserve nothing and measure 0 — the correct compensation
 * there as well, so no special casing is needed.
 */
export function measureScrollbarGutter(): number {
    const probe = document.createElement('div');
    // Same properties as .aura-scroll; no content, so only the stable reservation
    // shows up in the difference between border box and content box.
    probe.style.cssText =
        'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;' +
        'overflow-y:auto;scrollbar-width:thin;scrollbar-gutter:stable;visibility:hidden';
    document.body.appendChild(probe);
    const px = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return Number.isFinite(px) && px >= 0 ? px : 0;
}

/** Publishes the measured gutter as `--aura-sbw` for the bleed helpers in index.css. */
export function publishScrollbarGutter(): void {
    document.documentElement.style.setProperty('--aura-sbw', `${measureScrollbarGutter()}px`);
}
