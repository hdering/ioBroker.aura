export function resolveAssetUrl(value: string): string {
    if (value.startsWith('aura-file:')) {
        return `/fs/read?path=${encodeURIComponent(value.slice('aura-file:'.length))}`;
    }
    return value;
}
