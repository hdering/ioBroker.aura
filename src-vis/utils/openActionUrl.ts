import { getStateDirect, getStateFromCache } from '../hooks/useIoBroker';
import { resolveActionUrl, urlTemplateRefs } from './actionUrl';

function go(url: string, newTab: boolean | undefined, win?: Window | null): void {
    if (win) {
        win.location.href = url;
        return;
    }
    if (newTab) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
}

/**
 * Opens the URL of an external-link action, with its datapoint placeholders resolved
 * (#1006). The values normally sit in the state cache already (the clicked row shows
 * its value). A datapoint the page never read is fetched first; a new tab is opened
 * blank right away then, so the browser still counts it as the user's click.
 */
export function openActionUrl(url: string, newTab: boolean | undefined, dpId?: string): void {
    const refs = urlTemplateRefs(url, dpId);
    const missing = refs.filter((id) => !getStateFromCache(id));
    const readCache = (id: string) => getStateFromCache(id)?.val;
    if (missing.length === 0) {
        const resolved = resolveActionUrl(url, dpId, readCache);
        if (resolved) go(resolved, newTab);
        return;
    }
    let win: Window | null = null;
    if (newTab) {
        win = window.open('', '_blank');
        if (win) win.opener = null;
    }
    void Promise.all(missing.map((id) => getStateDirect(id).catch(() => null))).then(() => {
        const resolved = resolveActionUrl(url, dpId, readCache);
        if (resolved) go(resolved, newTab, win);
        else win?.close();
    });
}
