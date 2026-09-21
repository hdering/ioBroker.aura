/** Published documentation (VitePress on GitHub Pages, `base: '/ioBroker.aura/'`).
 *  Every link from the app into the docs goes through here so a move of the
 *  site (own domain, CNAME) is a one-line change. */
export const DOCS_URL = 'https://hdering.github.io/ioBroker.aura/';

/** Deep link into the docs. `path` is the page path without leading slash and
 *  without `.html` (cleanUrls), e.g. `einstellungen/mcp` or `start/`. */
export function docsUrl(path = ''): string {
    return DOCS_URL + path.replace(/^\/+/, '');
}
