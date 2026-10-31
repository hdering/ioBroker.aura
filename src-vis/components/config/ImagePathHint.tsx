/** Every accepted image source, shared by all places where an image URL or an
 *  image datapoint can be configured (image widget, custom cells, JSON table
 *  columns, image popups, state images, cover art). Rendered collapsed so it
 *  never blows up the options panel. (issue #519) */
const IMAGE_PATH_EXAMPLES: { path: string; note: string }[] = [
    { path: 'https://server/bild.png', note: 'externe URL (http läuft auf HTTPS-Seiten über /proxy)' },
    { path: '/adapter/pirate-weather/icons/icebear/cloudy.svg', note: 'Asset eines Adapters' },
    { path: '/vis.0/main/bild.png', note: 'Datei aus dem ioBroker-Dateisystem' },
    { path: 'sonos/coverImage/192.168.1.10.png', note: 'relativer Adapter-Pfad (ohne führenden /)' },
    { path: 'aura-file:/opt/iobroker/…/icon.png', note: 'Datei vom Aura-Server – per Datei-Picker' },
    { path: 'data:image/png;base64,iVBORw0…', note: 'Data-URI (landet in der Konfiguration, siehe unten)' },
    { path: 'iVBORw0KGgo…', note: 'reine Base64-Daten, z.B. Kamera-Snapshot' },
    { path: '<svg xmlns="…">…</svg>', note: 'SVG-Markup direkt aus dem Datenpunkt, z.B. WLAN-QR-Code' },
];

/** From this size on an embedded image gets a warning — small icons are harmless. */
const INLINE_WARN_BYTES = 20 * 1024;

/**
 * Size of an image embedded in the value (data: URI or raw Base64), or 0 when the
 * value is a path, a URL or SVG markup.
 */
export function inlineImageBytes(value: unknown): number {
    if (typeof value !== 'string') return 0;
    if (value.startsWith('data:')) return value.length;
    // Raw Base64 (a camera snapshot pasted in): long and only Base64 characters.
    if (value.length > 256 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 256))) return value.length;
    return 0;
}

/**
 * `values`: the image source(s) of this field. An embedded image above
 * INLINE_WARN_BYTES gets a warning under the field: it is part of the saved
 * configuration, so every device loads it on every start (#882).
 */
export function ImagePathHint({ className, values }: { className?: string; values?: unknown[] }) {
    const inlineBytes = (values ?? []).reduce<number>((n, v) => n + inlineImageBytes(v), 0);
    return (
        <>
            {inlineBytes >= INLINE_WARN_BYTES && (
                <p className="text-[10px] leading-snug" style={{ color: 'var(--accent-yellow, #f59e0b)' }}>
                    Eingebettetes Bild ({Math.round(inlineBytes / 1024)} kB): steckt in der gespeicherten Konfiguration
                    und wird bei jedem Start auf jedem Gerät mitgeladen – auf Mobilgeräten spürbar langsamer. Besser als
                    Datei bzw. URL einbinden (z.B. per Datei-Picker oder aus dem ioBroker-Dateisystem).
                </p>
            )}
            <details className={className}>
                <summary
                    className="text-[10px] cursor-pointer select-none"
                    style={{ color: 'var(--text-secondary)', opacity: 0.8 }}
                >
                    Welche Pfade sind möglich?
                </summary>
                <ul className="mt-1 space-y-0.5">
                    {IMAGE_PATH_EXAMPLES.map((e) => (
                        <li key={e.path} className="text-[10px] leading-snug break-all">
                            <code className="font-mono" style={{ color: 'var(--accent)' }}>
                                {e.path}
                            </code>
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.75 }}> — {e.note}</span>
                        </li>
                    ))}
                </ul>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                    Adapter- und Dateisystem-Pfade werden automatisch über den ioBroker-Web-Adapter geladen.
                    Eingebettete Bilder (Base64, Upload-Knopf) werden mit der Konfiguration gespeichert und bei jedem
                    Start mitgeladen – größere Bilder lieber als Datei/URL.
                </p>
            </details>
        </>
    );
}
