/**
 * On-device diagnostics — opened with `?diag=1` on the dashboard URL.
 *
 * Some reports can only be answered by the device that has the problem. #636 is
 * the case in point: icons that are invisible on a phone and fine on a desktop,
 * plus a few hundred kB/s of traffic on a dashboard that looks idle. Three
 * attempts at a fix landed blind because nobody could see, on that device,
 * whether the icons were even in the DOM, which bundle was running, or what was
 * actually on the wire.
 *
 * So the page can now report on itself: one screenshot answers all of it. The
 * overlay renders only when the flag is in the URL, so it costs a query-string
 * check on every other load.
 */
import { useCallback, useEffect, useState } from 'react';
import { listIcons } from '@iconify/react';

/** `?diag=1` — also accepted after the hash, since the app is hash-routed and a
 *  pasted link often ends up as `…/#/dashboard?diag=1`. */
function diagRequested(): boolean {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('diag')) return true;
    const hash = window.location.hash;
    const q = hash.indexOf('?');
    return q >= 0 && new URLSearchParams(hash.slice(q)).has('diag');
}

// Resource timing keeps 250 entries by default and then silently drops the rest,
// which on a dashboard is exactly the long tail we want to look at. Only widened
// when the report was actually asked for.
if (typeof performance !== 'undefined' && diagRequested()) {
    try {
        performance.setResourceTimingBufferSize(2000);
    } catch {
        /* not supported — the report just shows the first 250 */
    }
}

function kb(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
    return `${bytes} B`;
}

/** True when the element is in the tree but not rendered — the case that
 *  matters here is a widget on a tab that was visited and then left, which
 *  stays mounted with display:none and keeps its streams running. */
function isOffscreen(el: Element): boolean {
    return el.getClientRects().length === 0;
}

function collectIcons(): string[] {
    const out: string[] = [];
    const nodes = document.querySelectorAll<SVGElement>('svg.iconify');
    out.push(`svg.iconify in DOM: ${nodes.length}`);
    let empty = 0;
    let zeroSize = 0;
    nodes.forEach((el) => {
        if (!el.innerHTML.length) empty++;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) zeroSize++;
    });
    out.push(`  without body: ${empty}   zero-sized: ${zeroSize}`);
    nodes.forEach((el, i) => {
        if (i >= 4) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push(
            `  #${i + 1} ${Math.round(r.width)}x${Math.round(r.height)} body=${el.innerHTML.length}` +
                ` color=${cs.color} vis=${cs.visibility} op=${cs.opacity} disp=${cs.display}`,
        );
    });
    let loaded = -1;
    try {
        loaded = listIcons('').length;
    } catch {
        /* ignore */
    }
    let cache = -1;
    try {
        cache = (localStorage.getItem('aura-icons-v1') || '').length;
    } catch {
        /* storage blocked */
    }
    out.push(`Iconify loaded: ${loaded}   device cache: ${cache < 0 ? 'localStorage blocked' : `${cache} chars`}`);
    return out;
}

/** Ask the adapter for a known icon, so a broken /icons/ route shows up as what
 *  it is instead of as "the icons do not work". */
async function probeIconEndpoint(): Promise<string> {
    const url = '/icons/mdi.json?icons=garage';
    const started = Date.now();
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const text = await res.text();
        const ms = Date.now() - started;
        const isJson = text.trimStart().startsWith('{');
        const body = isJson ? (JSON.parse(text).icons?.garage?.body?.length ?? 0) : 0;
        return `GET ${url} -> ${res.status} in ${ms} ms, ${isJson ? `icon body ${body}` : `NOT JSON: ${text.slice(0, 40)}`}`;
    } catch (e) {
        return `GET ${url} -> failed after ${Date.now() - started} ms: ${(e as Error).message}`;
    }
}

function collectResources(): string[] {
    const out: string[] = [];
    let entries: PerformanceResourceTiming[] = [];
    try {
        entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    } catch {
        return ['resource timing unavailable'];
    }
    const bundle = entries.find((e) => /\/assets\/index-[^/]+\.js$/.test(e.name));
    out.push(`bundle: ${bundle ? bundle.name.split('/').pop() : 'not in resource timing (cached?)'}`);

    const iconEntries = entries.filter((e) => /\/icons\/|api\.iconify\.design|simplesvg|unisvg/.test(e.name));
    out.push(`icon requests: ${iconEntries.length}`);
    iconEntries.slice(0, 6).forEach((e) => {
        const where = /^https?:\/\//.test(e.name) && !e.name.startsWith(location.origin) ? 'EXTERNAL' : 'own server';
        out.push(`  ${where} ${Math.round(e.duration)} ms ${kb(e.transferSize)} ${e.name.slice(0, 70)}`);
    });

    const total = entries.reduce((a, e) => a + (e.transferSize || 0), 0);
    out.push(`resources: ${entries.length}, transferred ${kb(total)} since load`);
    [...entries]
        .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
        .slice(0, 5)
        .forEach((e, i) => out.push(`  ${i + 1}. ${kb(e.transferSize)} ${e.name.slice(0, 70)}`));
    return out;
}

/** Streams do not finish, so they never show up in resource timing — but the
 *  element that holds them is right here in the DOM. */
function collectMedia(): string[] {
    const out: string[] = [];
    const nodes = [...document.querySelectorAll('img, iframe, video')].filter((el) => {
        const src = el.getAttribute('src') || '';
        return src && !src.startsWith('data:');
    });
    out.push(`img/iframe/video: ${nodes.length}`);
    nodes.slice(0, 12).forEach((el) => {
        const src = el.getAttribute('src') || '';
        out.push(`  ${isOffscreen(el) ? 'HIDDEN TAB' : 'visible   '} ${el.tagName.toLowerCase()} ${src.slice(0, 70)}`);
    });
    return out;
}

function collectTabs(): string[] {
    const tabs = [...document.querySelectorAll('[data-aura-tab-id]')];
    const hidden = tabs.filter((t) => (t as HTMLElement).style.display === 'none');
    return [`mounted tabs: ${tabs.length}, of them hidden but still running: ${hidden.length}`];
}

export default function DiagnosticsOverlay(): React.ReactElement | null {
    const [enabled] = useState(diagRequested);
    const [report, setReport] = useState<string>('collecting…');
    const [copied, setCopied] = useState(false);

    const build = useCallback(async () => {
        const lines: string[] = [];
        lines.push(`Aura diagnostics — ${new Date().toLocaleString()}`);
        lines.push(`origin: ${location.origin}`);
        lines.push(`screen: ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`);
        lines.push(`UA: ${navigator.userAgent}`);
        lines.push('', '— icons —', ...collectIcons());
        lines.push(await probeIconEndpoint());
        lines.push('', '— network —', ...collectResources());
        lines.push('', '— media —', ...collectMedia());
        lines.push('', '— tabs —', ...collectTabs());
        setReport(lines.join('\n'));
    }, []);

    useEffect(() => {
        if (!enabled) return;
        // Let the dashboard settle first, otherwise the report describes a page
        // that is still loading — which is never the state being complained about.
        const id = setTimeout(build, 3000);
        return () => clearTimeout(id);
    }, [enabled, build]);

    if (!enabled) return null;

    const btn: React.CSSProperties = {
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #64748b',
        background: '#1e293b',
        color: '#e2e8f0',
        font: 'inherit',
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483647,
                background: '#0f172a',
                color: '#e2e8f0',
                font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{ display: 'flex', gap: 8, padding: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ marginRight: 'auto' }}>Aura diagnostics</strong>
                <button type="button" style={btn} onClick={build}>
                    Refresh
                </button>
                <button
                    type="button"
                    style={btn}
                    onClick={() => {
                        navigator.clipboard?.writeText(report).then(
                            () => setCopied(true),
                            () => setCopied(false),
                        );
                    }}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                    type="button"
                    style={btn}
                    onClick={() => {
                        // Drop the flag and reload, so the page comes back normal.
                        location.href = location.href.replace(/([?&])diag=1&?/g, '$1').replace(/[?&]$/, '');
                    }}
                >
                    Close
                </button>
            </div>
            <pre
                style={{
                    margin: 0,
                    padding: '0 10px 16px',
                    flex: 1,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}
            >
                {report}
            </pre>
        </div>
    );
}
