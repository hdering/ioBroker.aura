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

/* ── socket traffic ──────────────────────────────────────────────────────────
 *
 * Everything the dashboard receives after the page has loaded comes over the
 * ioBroker socket, and a WebSocket never appears in resource timing: the first
 * report for #636 showed twelve resources and 2.5 MB — the bundle, nothing else —
 * while the device it came from was pulling a few hundred kB/s. So count the
 * frames at the source. Wrapping the constructor only happens with `?diag=1`,
 * and this module is evaluated from main.tsx before the socket is opened. */
const sock = { opens: 0, closes: 0, errors: 0, msgs: 0, bytes: 0, sent: 0, sentBytes: 0 };

/** The counters above only mean anything when the wrapper was in place before
 *  the socket opened. The app is hash-routed, so adding `?diag=1` to the URL of
 *  a page that is already running does NOT reload it: the report then shows a
 *  perfectly healthy dashboard as "0 connections, 0 messages". The second device
 *  report for #636 read exactly like that, and it cost an afternoon. */
let sockArmed = false;

function sizeOf(data: unknown): number {
    if (typeof data === 'string') return data.length;
    const d = data as { byteLength?: number; size?: number } | null;
    return d?.byteLength ?? d?.size ?? 0;
}

if (typeof window !== 'undefined' && typeof window.WebSocket === 'function' && diagRequested()) {
    const Native = window.WebSocket;
    const Counting = function (this: unknown, url: string | URL, protocols?: string | string[]) {
        const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
        sock.opens++;
        ws.addEventListener('message', (ev: MessageEvent) => {
            sock.msgs++;
            sock.bytes += sizeOf(ev.data);
        });
        ws.addEventListener('close', () => sock.closes++);
        ws.addEventListener('error', () => sock.errors++);
        const send = ws.send.bind(ws);
        ws.send = (data: Parameters<WebSocket['send']>[0]) => {
            sock.sent++;
            sock.sentBytes += sizeOf(data);
            send(data);
        };
        return ws;
    } as unknown as typeof WebSocket;
    Counting.prototype = Native.prototype;
    Object.assign(Counting, {
        CONNECTING: Native.CONNECTING,
        OPEN: Native.OPEN,
        CLOSING: Native.CLOSING,
        CLOSED: Native.CLOSED,
    });
    window.WebSocket = Counting;
    sockArmed = true;
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
    // "0 icons in the DOM" has two very different causes: the icons did not
    // render, or the widgets around them are not there either. Counting the
    // cards and every other svg tells them apart in the same screenshot.
    const allSvg = document.querySelectorAll('svg').length;
    const lucide = document.querySelectorAll('svg.lucide').length;
    const cards = [...document.querySelectorAll('[data-aura-widget]')];
    const blank = cards.filter((c) => !c.querySelector('svg'));
    const typeOf = (c: Element): string => c.getAttribute('data-aura-widget-type') || '?';
    out.push(`svg total: ${allSvg}   of them lucide-react: ${lucide}`);
    out.push(`widget cards: ${cards.length}, without any svg: ${blank.length}`);
    // "One widget on the layout" and "two cards in the DOM" was the second
    // report's quietest surprise — name the types instead of counting them.
    if (cards.length) out.push(`  types: ${cards.slice(0, 6).map(typeOf).join(', ')}`);
    if (blank.length) out.push(`  blank: ${blank.slice(0, 6).map(typeOf).join(', ')}`);
    return out;
}

/** Name the element a DOM change belongs to.
 *
 * The first activity report for #636 came back with 469 DOM changes a second
 * against 2/s on a healthy device — proof of a redraw loop, and nothing at all
 * to look at. A widget card is the unit the user configures and the unit a fix
 * lands in, so walk up to the nearest one; outside the grid the first `aura-`
 * class on the way up is still a far better answer than "somewhere". */
function blameFor(node: Node | null): string {
    let el: Element | null =
        node && node.nodeType === 1 ? (node as Element) : ((node?.parentElement as Element | null) ?? null);
    let landmark = '';
    for (let hops = 0; el && hops < 40; hops++, el = el.parentElement) {
        const id = el.getAttribute?.('data-aura-widget');
        // The id stays whole: the loop-suspect dump below reads it back out.
        if (id) return `${el.getAttribute('data-aura-widget-type') || 'widget'} #${id.slice(0, 24)}`;
        if (el.getAttribute?.('data-aura-render-probe')) return 'off-screen render probe';
        if (!landmark) {
            const cls = (el.getAttribute?.('class') || '').split(/\s+/).find((c) => c.startsWith('aura-'));
            if (cls) landmark = `.${cls}`;
        }
    }
    return landmark || 'outside the grid';
}

/** Short, stable name for a node that was added or removed.
 *
 * "108 node changes under .aura-page" says the churn is above the widgets and
 * nothing more — a whole subtree being thrown away and rebuilt looks exactly
 * like a toast appearing 54 times a second. An `aura-` class is preferred over
 * the Tailwind utilities next to it because it is the one name that survives a
 * restyle. */
function sig(n: Node): string {
    if (n.nodeType === 3) return '#text';
    if (n.nodeType !== 1) return `#${n.nodeName.toLowerCase()}`;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('data-aura-widget-type');
    if (type) return `${tag}[${type}]`;
    const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const aura = classes.find((c) => c.startsWith('aura-'));
    const pick = aura ? [aura] : classes.slice(0, 2);
    return pick.length ? `${tag}.${pick.join('.')}` : tag;
}

/** Which class names a `class` mutation actually added or removed. */
function classDelta(r: MutationRecord, out: Map<string, number>): void {
    const before = new Set((r.oldValue || '').split(/\s+/).filter(Boolean));
    const after = new Set(((r.target as Element).getAttribute('class') || '').split(/\s+/).filter(Boolean));
    for (const c of after) if (!before.has(c)) bump(out, `+${c}`);
    for (const c of before) if (!after.has(c)) bump(out, `-${c}`);
}

function bump(m: Map<string, number>, key: string): void {
    m.set(key, (m.get(key) ?? 0) + 1);
}

function top(m: Map<string, number>, n: number): string {
    return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
}

/** Watch the page for a moment instead of photographing it once.
 *
 * The screenshot from #636 showed a dashboard with no icons in it at all while
 * the device was visibly redrawing the same card over and over — a state a
 * single sample cannot describe. So look at what MOVES: repaint rate, DOM
 * churn, blocked main thread, and what the socket is doing meanwhile. */
async function collectActivity(
    ms: number,
): Promise<{ lines: string[]; top: string; share: number; perSecond: number }> {
    const before = { ...sock };
    let frames = 0;
    let mutations = 0;
    let svgIn = 0;
    let svgOut = 0;
    let longTasks = 0;
    let longestMs = 0;

    const blame = new Map<string, number>();
    const attrNames = new Map<string, number>();
    const nodesIn = new Map<string, number>();
    const nodesOut = new Map<string, number>();
    const targets = new Map<string, number>();
    const classToggles = new Map<string, number>();
    const kinds = { attributes: 0, childList: 0, characterData: 0 };

    const mo = new MutationObserver((records) => {
        mutations += records.length;
        for (const r of records) {
            bump(blame, blameFor(r.target));
            bump(targets, sig(r.target));
            kinds[r.type]++;
            if (r.type === 'attributes') {
                bump(attrNames, r.attributeName || '?');
                if (r.attributeName === 'class') classDelta(r, classToggles);
            }
            r.addedNodes.forEach((n) => {
                if (n.nodeName === 'svg') svgIn++;
                bump(nodesIn, sig(n));
            });
            r.removedNodes.forEach((n) => {
                if (n.nodeName === 'svg') svgOut++;
                bump(nodesOut, sig(n));
            });
        }
    });
    mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        // The class that goes on and off is usually the mechanism itself — a
        // condition effect, a scale step, a drag state. Without the old value
        // the report can only say that "class" changed 87 times.
        attributeOldValue: true,
    });

    let po: PerformanceObserver | null = null;
    try {
        po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                longTasks++;
                longestMs = Math.max(longestMs, e.duration);
            }
        });
        po.observe({ entryTypes: ['longtask'] });
    } catch {
        po = null; // Safari / Firefox — the other three numbers still answer
    }

    let running = true;
    const tick = (): void => {
        frames++;
        if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    await new Promise((r) => setTimeout(r, ms));
    running = false;
    mo.disconnect();
    po?.disconnect();

    const s = ms / 1000;
    const d = {
        msgs: sock.msgs - before.msgs,
        bytes: sock.bytes - before.bytes,
        sent: sock.sent - before.sent,
        opens: sock.opens - before.opens,
    };
    // Read the socket's own state rather than only the frames it moved: a report
    // taken on an already-running page has no frame counts at all (see sockArmed).
    let live = '';
    try {
        const { socketDiagnostics } = await import('../hooks/useIoBroker');
        const sd = socketDiagnostics();
        live =
            `socket now: library ${sd.lib ? 'loaded' : 'MISSING (/socket.io/socket.io.js)'}` +
            `, ${sd.connected ? 'connected' : 'OFFLINE'}${sd.stub ? ' (inert stub)' : ''}\n` +
            // Counted in the socket handlers, so these hold no matter when the
            // report was switched on — unlike everything above them.
            `  events since load: ${sd.stateChanges} state changes, ` +
            `${sd.connects} connects, ${sd.disconnects} drops\n` +
            `  subscribed datapoints: ${sd.subscriptions}`;
    } catch (e) {
        live = `socket now: unreadable (${(e as Error).message})`;
    }

    const ranked = [...blame.entries()].sort((a, b) => b[1] - a[1]);
    const lines = [
        `over ${s} s at rest:`,
        `  frames: ${frames} (${Math.round(frames / s)}/s)   DOM changes: ${mutations} (${Math.round(mutations / s)}/s)`,
        `  changed most: ${top(blame, 3) || '—'}`,
        `  kinds: attr ${kinds.attributes}` +
            `${attrNames.size ? ` (${top(attrNames, 3)})` : ''}` +
            `, nodes ${kinds.childList}, text ${kinds.characterData}`,
        `  on: ${top(targets, 3) || '—'}`,
        ...(classToggles.size ? [`  class: ${top(classToggles, 4)}`] : []),
        `  nodes in: ${top(nodesIn, 3) || '—'}`,
        `  nodes out: ${top(nodesOut, 3) || '—'}`,
        `  svg added: ${svgIn}   removed: ${svgOut}`,
        `  long tasks: ${longTasks}, longest ${Math.round(longestMs)} ms`,
        `  socket: ${d.msgs} msgs, ${kb(d.bytes)} in, ${d.sent} sent, ${d.opens} new connections`,
        `socket since load: ${sock.opens} connections (${sock.closes} closed, ${sock.errors} errors)`,
        `  ${sock.msgs} messages, ${kb(sock.bytes)} received, ${sock.sent} sent`,
        sockArmed
            ? live
            : `  ^ NOT MEASURED: ?diag=1 was added to a page that was already running.\n` +
              `    Reload with the flag in the URL for socket numbers.\n${live}`,
    ];
    return {
        lines,
        top: ranked[0]?.[0] ?? '',
        share: mutations ? (ranked[0]?.[1] ?? 0) / mutations : 0,
        perSecond: mutations / s,
    };
}

/** The configuration of the widget that dominates the churn.
 *
 * Three device reports in, the loop is measured from every angle and still not
 * reproducible here, because the one thing a screenshot cannot carry is the
 * widget that causes it. When a single card owns most of the DOM changes, print
 * what it is configured as — that turns the next screenshot into a recipe that
 * can be rebuilt locally instead of another round of guessing.
 *
 * Only printed when there IS a loop and one widget owns it, so a healthy page
 * never dumps a configuration nobody asked for.
 */
async function collectLoopSuspect(topBlame: string, share: number, perSecond: number): Promise<string[]> {
    if (perSecond < 20 || share < 0.25) return [];
    const id = /#(\S+)$/.exec(topBlame)?.[1];
    if (!id) return [];
    try {
        const { useDashboardStore } = await import('../store/dashboardStore');
        for (const layout of useDashboardStore.getState().layouts ?? []) {
            for (const section of layout.sections ?? []) {
                for (const tab of section.tabs ?? []) {
                    const w = (tab.widgets ?? []).find((x) => x.id === id);
                    if (!w) continue;
                    const json = JSON.stringify({ type: w.type, title: w.title, options: w.options });
                    return [
                        '',
                        '— loop suspect —',
                        `${w.type} #${id} on tab "${tab.name ?? tab.id}"`,
                        json.length > 1500 ? `${json.slice(0, 1500)}… (${json.length} chars)` : json,
                    ];
                }
            }
        }
        return ['', '— loop suspect —', `${topBlame} is not in this device's stored layout`];
    } catch (e) {
        return ['', '— loop suspect —', `config unreadable (${(e as Error).message})`];
    }
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

/** What this device kept from earlier sessions. A dashboard that was edited and
 *  never saved keeps a `_aura_dirty:` flag, which blocks the pull from the
 *  adapter and pushes this device's frozen copy back instead — worth seeing
 *  before blaming the rendering. */
function collectStorage(): string[] {
    let keys: string[];
    try {
        keys = Object.keys(localStorage);
    } catch {
        return ['localStorage blocked'];
    }
    let chars = 0;
    for (const k of keys) chars += (localStorage.getItem(k) || '').length + k.length;
    const dirty = keys.filter((k) => k.startsWith('_aura_dirty:')).map((k) => k.slice('_aura_dirty:'.length));
    return [
        `localStorage: ${keys.length} keys, ${chars} chars`,
        `unsaved edits held on this device: ${dirty.length ? dirty.join(', ') : 'none'}`,
    ];
}

function collectTabs(): string[] {
    const tabs = [...document.querySelectorAll('[data-aura-tab-id]')];
    const hidden = tabs.filter((t) => (t as HTMLElement).style.display === 'none');
    return [`mounted tabs: ${tabs.length}, of them hidden but still running: ${hidden.length}`];
}

/** What the four `env(safe-area-inset-*)` actually resolve to on this device.
 *
 *  They cannot be read back from a style declaration — the browser resolves
 *  env() while computing a value — so a throwaway element asks the question by
 *  padding itself with them. */
function readEnvInsets(): { top: string; right: string; bottom: string; left: string } {
    const probe = document.createElement('div');
    probe.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'visibility:hidden',
        'pointer-events:none',
        'padding-top:env(safe-area-inset-top,0px)',
        'padding-right:env(safe-area-inset-right,0px)',
        'padding-bottom:env(safe-area-inset-bottom,0px)',
        'padding-left:env(safe-area-inset-left,0px)',
    ].join(';');
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
    probe.remove();
    return out;
}

/** The safe area as the shell sees it (#662).
 *
 *  iOS 26/27 paint a glass band over the top edge of an installed web app.
 *  Aura cannot remove it, only make it blur a single flat colour — which works
 *  exactly as far as the inset iOS reports reaches. Two failure modes have to be
 *  told apart from a screenshot, and nothing else in this report can do it:
 *  the device reports 0px (nothing moves, the band still lands on the tabs), or
 *  the band simply reaches further down than the inset it announced. So print
 *  what was asked for, what came back, and where the first bar ends up. */
function collectSafeArea(): string[] {
    const out: string[] = [];
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser', 'window-controls-overlay'];
    const active = modes.filter((m) => matchMedia(`(display-mode: ${m})`).matches);
    out.push(`display-mode: ${active.join(', ') || 'unknown'}   navigator.standalone: ${'standalone' in navigator}`);

    // Without `viewport-fit=cover` every inset below is 0px by definition — so
    // this line also says whether the device is running a build that has the fix.
    const viewport = document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? 'missing';
    out.push(`viewport: ${viewport}`);
    out.push(`theme-color: ${document.getElementById('aura-theme-color')?.getAttribute('content') ?? 'missing'}`);

    const env = readEnvInsets();
    out.push(`env(safe-area-inset-*): top ${env.top}, right ${env.right}, bottom ${env.bottom}, left ${env.left}`);

    const page = document.querySelector('.aura-page');
    if (!page) return [...out, 'no .aura-page — the shell is not rendered'];
    const cs = getComputedStyle(page);
    out.push(
        `.aura-page padding: top ${cs.paddingTop}, right ${cs.paddingRight}, bottom ${cs.paddingBottom}, left ${cs.paddingLeft}`,
    );
    const before = getComputedStyle(page, '::before');
    const after = getComputedStyle(page, '::after');
    out.push(`strips: top ${before.height} ${before.backgroundColor}, bottom ${after.height} ${after.backgroundColor}`);

    // Where the first bar actually sits. Anything above its top edge is flat
    // colour; if the band reaches past that line, this is the number to raise
    // `--aura-safe-top` to.
    const chrome = document.querySelector('.aura-tabs-top, .aura-header, .aura-section-bar');
    if (chrome) {
        const r = chrome.getBoundingClientRect();
        const name = chrome.className.split(/\s+/).find((c) => c.startsWith('aura-')) ?? chrome.tagName.toLowerCase();
        out.push(`first bar: ${name} from ${Math.round(r.top)}px to ${Math.round(r.bottom)}px`);
    } else {
        out.push('first bar: none — the dashboard starts at the top edge');
    }
    return out;
}

export default function DiagnosticsOverlay(): React.ReactElement | null {
    const [enabled, setEnabled] = useState(diagRequested);
    const [report, setReport] = useState<string>('collecting…');
    const [copied, setCopied] = useState(false);

    const build = useCallback(async () => {
        setReport('measuring for 2 s…');
        const lines: string[] = [];
        lines.push(`Aura diagnostics — ${new Date().toLocaleString()}`);
        lines.push(`origin: ${location.origin}`);
        lines.push(`screen: ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`);
        lines.push(`UA: ${navigator.userAgent}`);
        lines.push('', '— safe area —', ...collectSafeArea());
        const activity = await collectActivity(2000);
        lines.push('', '— activity —', ...activity.lines);
        lines.push('', '— icons —', ...collectIcons());
        lines.push(await probeIconEndpoint());
        lines.push('', '— network —', ...collectResources());
        lines.push('', '— media —', ...collectMedia());
        lines.push('', '— storage —', ...collectStorage());
        lines.push('', '— tabs —', ...collectTabs());
        lines.push(...(await collectLoopSuspect(activity.top, activity.share, activity.perSecond)));
        setReport(lines.join('\n'));
    }, []);

    // The flag may also be appended to a page that is already running. That is
    // worth supporting precisely because reloading is what a slow dashboard must
    // NOT do to be measured: the complaint is about a page that has been open for
    // hours, and a reload throws that state away before the report can see it.
    // The app is hash-routed, so appending `?diag=1` to the hash never reloads —
    // only this listener turns the overlay on. What a late start cannot recover
    // are the socket counters; the report says so instead of printing zeros.
    useEffect(() => {
        if (enabled) return;
        const check = (): void => setEnabled((on) => on || diagRequested());
        window.addEventListener('hashchange', check);
        window.addEventListener('popstate', check);
        return () => {
            window.removeEventListener('hashchange', check);
            window.removeEventListener('popstate', check);
        };
    }, [enabled]);

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
