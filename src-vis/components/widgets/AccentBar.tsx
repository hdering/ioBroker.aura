/** The card layouts' coloured bar on the left edge, as a custom-grid component ('accent-bar', #768). */
export function AccentBar({ color }: { color: string }) {
    return (
        <div
            className="aura-widget-accent-bar rounded-full"
            style={{ width: 4, alignSelf: 'stretch', flexShrink: 0, background: color }}
        />
    );
}
