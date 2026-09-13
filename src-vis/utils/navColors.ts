/**
 * Colours shared by the three navigations: tab bar, section bar/drawer and the
 * menu widget (#640).
 *
 * All three used to hard-code `--accent` / `--text-secondary`, so the theme
 * editor's "Navigation" group only reached part of them and the icons could not
 * be coloured at all. The icon vars default to `currentColor`, i.e. the icon
 * keeps following its entry's text colour until the user sets one.
 */

/** Text of the active entry. */
export const NAV_ACTIVE = 'var(--nav-active, var(--accent))';

/** Text of an inactive entry. `fallback` is the look the caller had before. */
export function navText(fallback = 'var(--text-secondary)'): string {
    return `var(--nav-text, ${fallback})`;
}

/**
 * Icon colour of an entry. By default it follows the entry's text (`currentColor`);
 * pass the colour the icon had before where it was set explicitly.
 */
export function navIcon(isActive: boolean, fallback = 'currentColor'): string {
    return isActive ? `var(--nav-active-icon, ${fallback})` : `var(--nav-icon, ${fallback})`;
}
