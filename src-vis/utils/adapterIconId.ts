import { auraUrl } from './basePath';

/**
 * Icons from installed ioBroker icon adapters (#716) — the id format.
 *
 *     iob:<adapter>/<path below the adapter's web storage>[#original|#tint]
 *     iob:icons-mfd-svg/light_light_dim_100.svg
 *     iob:vis-icontwo/Lights/light_on.png
 *     iob:icons-eclipse-smarthome-classic/fire.svg#original
 *     iob:icons-material-png/action/ic_home_black_48dp.png#tint
 *
 * The path always holds a `/` and a file extension, so the id can never be
 * mistaken for an Iconify id (`prefix:name`, no slash, no dot) — the icon
 * inventory, the preload and the Iconify cache all skip it on their own.
 *
 * An SVG is drawn as a mask in the current text colour, so theme colour and
 * colour rules apply to it like to any other icon. `#original` keeps its own
 * colours instead (a set drawn in colour). A raster file (PNG/GIF/WebP) shows
 * its own pixels; `#tint` draws it as a mask in the text colour instead — right
 * for single-coloured sets such as icons-material-png, a silhouette for others.
 *
 * Kept free of React so it can be shared with Node tests.
 */

export const ADAPTER_ICON_PREFIX = 'iob:';
const ORIGINAL_SUFFIX = '#original';
const TINT_SUFFIX = '#tint';

const ADAPTER_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const EXT_RE = /\.(svg|png|gif|webp)$/i;

export interface AdapterIconRef {
    /** Adapter name — also the file storage namespace (`icons-mfd-svg`). */
    adapter: string;
    /** File below the adapter's storage root, `/`-separated. */
    path: string;
    /** Lower-case extension without the dot. */
    ext: string;
    /** Keep the file's own colours (SVG only — raster files do unless `tint`). */
    original: boolean;
    /** Draw a raster file in the text colour (`#tint`). */
    tint: boolean;
}

export function isAdapterIconId(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(ADAPTER_ICON_PREFIX) && parseAdapterIconId(value) !== null;
}

export function parseAdapterIconId(id: string): AdapterIconRef | null {
    if (!id.startsWith(ADAPTER_ICON_PREFIX)) return null;
    let rest = id.slice(ADAPTER_ICON_PREFIX.length);
    let original = false;
    let tint = false;
    if (rest.endsWith(ORIGINAL_SUFFIX)) {
        original = true;
        rest = rest.slice(0, -ORIGINAL_SUFFIX.length);
    } else if (rest.endsWith(TINT_SUFFIX)) {
        tint = true;
        rest = rest.slice(0, -TINT_SUFFIX.length);
    }
    const slash = rest.indexOf('/');
    if (slash < 1) return null;
    const adapter = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    const ext = EXT_RE.exec(path)?.[1]?.toLowerCase();
    if (!ADAPTER_RE.test(adapter) || !ext) return null;
    if (path.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
    return { adapter, path, ext, original, tint };
}

/**
 * Id of a file. `flip` decides against the file type's default: for an SVG
 * `true` keeps its colours (`#original`), for a raster file `true` tints it
 * (`#tint`) — so the flag always means "not the default".
 */
export function adapterIconId(adapter: string, path: string, flip = false): string {
    const svg = path.toLowerCase().endsWith('.svg');
    const suffix = flip ? (svg ? ORIGINAL_SUFFIX : TINT_SUFFIX) : '';
    return `${ADAPTER_ICON_PREFIX}${adapter}/${path}${suffix}`;
}

/** The id without its colour flag — the file it names. */
export function adapterIconFile(id: string): string {
    return id.replace(/#(original|tint)$/, '');
}

/** Same-origin URL of the file (`/adapter-icons/file/…`), every segment encoded. */
export function adapterIconUrl(ref: AdapterIconRef): string {
    return auraUrl(
        `/adapter-icons/file/${encodeURIComponent(ref.adapter)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`,
    );
}

/** True when the icon follows the text colour (and with it every colour rule). */
export function isTintableAdapterIcon(ref: AdapterIconRef): boolean {
    return ref.ext === 'svg' ? !ref.original : ref.tint;
}

/** File name without folder and extension — the only "name" such an icon has. */
export function adapterIconLabel(ref: AdapterIconRef): string {
    const file = ref.path.slice(ref.path.lastIndexOf('/') + 1);
    return file.replace(EXT_RE, '');
}
