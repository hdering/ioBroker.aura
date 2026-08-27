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
    { path: 'data:image/png;base64,iVBORw0…', note: 'Data-URI' },
    { path: 'iVBORw0KGgo…', note: 'reine Base64-Daten, z.B. Kamera-Snapshot' },
    { path: '<svg xmlns="…">…</svg>', note: 'SVG-Markup direkt aus dem Datenpunkt, z.B. WLAN-QR-Code' },
];

export function ImagePathHint({ className }: { className?: string }) {
    return (
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
            </p>
        </details>
    );
}
