/**
 * Icons from installed ioBroker icon adapters (#716) — the id format.
 *
 *     iob:<adapter>/<path below the adapter's web storage>[#original]
 *     iob:icons-mfd-svg/light_light_dim_100.svg
 *     iob:vis-icontwo/Lights/light_on.png
 *     iob:icons-eclipse-smarthome-classic/fire.svg#original
 *
 * The path always holds a `/` and a file extension, so the id can never be
 * mistaken for an Iconify id (`prefix:name`, no slash, no dot) — the icon
 * inventory, the preload and the Iconify cache all skip it on their own.
 *
 * An SVG is drawn as a mask in the current text colour, so theme colour and
 * colour rules apply to it like to any other icon. `#original` keeps its own
 * colours instead (a set drawn in colour). A raster file (PNG/GIF/WebP) always
 * shows its own pixels; nothing can tint it.
 *
 * Kept free of React so it can be shared with Node tests.
 */

export const ADAPTER_ICON_PREFIX = 'iob:';
const ORIGINAL_SUFFIX = '#original';

const ADAPTER_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const EXT_RE = /\.(svg|png|gif|webp)$/i;

export interface AdapterIconRef {
    /** Adapter name — also the file storage namespace (`icons-mfd-svg`). */
    adapter: string;
    /** File below the adapter's storage root, `/`-separated. */
    path: string;
    /** Lower-case extension without the dot. */
    ext: string;
    /** Keep the file's own colours (SVG only — raster files always do). */
    original: boolean;
}

export function isAdapterIconId(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(ADAPTER_ICON_PREFIX) && parseAdapterIconId(value) !== null;
}

export function parseAdapterIconId(id: string): AdapterIconRef | null {
    if (!id.startsWith(ADAPTER_ICON_PREFIX)) return null;
    let rest = id.slice(ADAPTER_ICON_PREFIX.length);
    let original = false;
    if (rest.endsWith(ORIGINAL_SUFFIX)) {
        original = true;
        rest = rest.slice(0, -ORIGINAL_SUFFIX.length);
    }
    const slash = rest.indexOf('/');
    if (slash < 1) return null;
    const adapter = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    const ext = EXT_RE.exec(path)?.[1]?.toLowerCase();
    if (!ADAPTER_RE.test(adapter) || !ext) return null;
    if (path.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
    return { adapter, path, ext, original };
}

export function adapterIconId(adapter: string, path: string, original = false): string {
    return `${ADAPTER_ICON_PREFIX}${adapter}/${path}${original ? ORIGINAL_SUFFIX : ''}`;
}

/** Same-origin URL of the file (`/adapter-icons/file/…`), every segment encoded. */
export function adapterIconUrl(ref: AdapterIconRef): string {
    return `/adapter-icons/file/${encodeURIComponent(ref.adapter)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`;
}

/** True when the icon follows the text colour (and with it every colour rule). */
export function isTintableAdapterIcon(ref: AdapterIconRef): boolean {
    return ref.ext === 'svg' && !ref.original;
}

/** File name without folder and extension — the only "name" such an icon has. */
export function adapterIconLabel(ref: AdapterIconRef): string {
    const file = ref.path.slice(ref.path.lastIndexOf('/') + 1);
    return file.replace(EXT_RE, '');
}
