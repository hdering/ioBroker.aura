/**
 * `window.aura` inside the HTML widget's sandboxed frame — the write half of the
 * bindings (issue #649).
 *
 * Bindings themselves only ever read: `{0_userdata.0.Licht}` puts a value into the
 * markup, nothing puts one back. The markup, however, lives in its own document
 * (`srcDoc` iframe), so it cannot reach the host's `window.aura` the way the value
 * widget's inline template can. This module bridges that gap with `postMessage`:
 *
 *   iframe  ──{ source:'aura:call',  id, method, args }──▶  host   (useHtmlBridge)
 *   iframe  ◀──{ source:'aura:reply', id, result|error }──  host
 *   iframe  ◀──{ source:'aura:event', sub, state }───────  host   (subscriptions)
 *
 * `postMessage` works across every sandbox that allows scripts, including the ones
 * WITHOUT `allow-same-origin` — so a widget no longer has to weaken its sandbox to
 * be able to switch something. (Reaching `parent.aura` directly happens to work
 * under the "Standard" preset because a `srcdoc` document inherits the embedder's
 * origin, but it breaks silently the moment someone picks "Minimal".)
 *
 * The host accepts a message only when its `source` is exactly this widget's frame,
 * so no other frame or window on the page can talk through this channel.
 */

/** Frame → host: one API call. */
export const BRIDGE_CALL = 'aura:call';
/** Host → frame: the result of one call. */
export const BRIDGE_REPLY = 'aura:reply';
/** Host → frame: a subscribed datapoint changed. */
export const BRIDGE_EVENT = 'aura:event';
/** Frame → host: the document's content height in px (`autoHeight`, #884). */
export const BRIDGE_SIZE = 'aura:size';

export type BridgeMethod = 'hello' | 'setState' | 'toggle' | 'getState' | 'subscribe' | 'unsubscribe' | 'sendTo';

export interface BridgeCall {
    source: typeof BRIDGE_CALL;
    /** Request id; `hello` sends 0 and expects no reply. */
    id: number;
    method: BridgeMethod;
    args: unknown[];
}

/**
 * The API as it runs INSIDE the frame. Plain ES5 in a single expression so it also
 * survives the odd kiosk browser, and deliberately tiny — everything it can do is
 * one round trip to the host.
 */
const BRIDGE_SCRIPT = [
    '(function(){',
    'var seq=0,pending={},subs={};',
    'function call(m,a){var id=++seq;return new Promise(function(res,rej){pending[id]={res:res,rej:rej};',
    "parent.postMessage({source:'aura:call',id:id,method:m,args:a},'*');});}",
    "window.addEventListener('message',function(e){var d=e.data;if(!d)return;",
    "if(d.source==='aura:reply'){var p=pending[d.id];if(!p)return;delete pending[d.id];",
    'if(d.error)p.rej(new Error(d.error));else p.res(d.result);}',
    "else if(d.source==='aura:event'){var l=subs[d.sub];if(l)l.slice().forEach(function(cb){",
    'try{cb(d.state?d.state.val:null,d.state);}catch(err){console.error(err);}});}});',
    'window.aura={',
    "setState:function(id,val,ack){return call('setState',[id,val,!!ack]);},",
    "toggle:function(id){return call('toggle',[id]);},",
    "getState:function(id){return call('getState',[id]);},",
    "sendTo:function(t,c,p){return call('sendTo',[t,c,p]);},",
    'subscribe:function(id,cb){(subs[id]=subs[id]||[]).push(cb);',
    "call('subscribe',[id]);return function(){subs[id]=(subs[id]||[]).filter(function(f){return f!==cb;});",
    "if(!subs[id].length)call('unsubscribe',[id]);};}};",
    // Announce the (re)load so the host can drop the subscriptions of the document
    // that was just replaced — a srcDoc reload keeps the same WindowProxy, so the
    // host cannot tell the two apart on its own.
    "parent.postMessage({source:'aura:call',id:0,method:'hello',args:[]},'*');",
    '})();',
].join('');

/**
 * Size reporter for `autoHeight` (#884): the host cannot read into a sandboxed
 * frame, so the document measures itself and posts its height on every change —
 * a new datapoint value, a late image, a narrower screen. Independent of
 * `window.aura`, so it also runs with `htmlApi: false`.
 *
 * The height of the root element, not `scrollHeight`: that one never drops below
 * the frame's own height, so the tile could grow but never shrink again. A
 * horizontal scrollbar is added on top, else it would steal the last pixels and
 * bring a vertical one along. A page that pins `html` to `height:100%` simply
 * keeps the height it has.
 */
const SIZE_SCRIPT = [
    '(function(){',
    'var last=-1,d=document.documentElement;',
    'function m(){if(!d)return;',
    'var h=Math.ceil(d.getBoundingClientRect().height)+Math.max(0,window.innerHeight-d.clientHeight);',
    "if(h!==last){last=h;parent.postMessage({source:'aura:size',h:h},'*');}}",
    // Not before the body is parsed: this runs from <head>, where the document is
    // still empty — a 0 posted on every srcDoc reload would make the tile flicker.
    'function start(){if(window.ResizeObserver){var ro=new ResizeObserver(m);ro.observe(d);',
    'if(document.body)ro.observe(document.body);}m();}',
    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();",
    "window.addEventListener('load',m);window.addEventListener('resize',m);",
    '})();',
].join('');

const DOCTYPE_RE = /^\s*<!doctype[^>]*>/i;
// The tag name must end at the `>` or at a space — otherwise `<header>` would
// pass as a `<head>` and the script would land in the middle of the page.
const HEAD_RE = /<head(?:\s[^>]*)?>/i;
const HTML_RE = /<html(?:\s[^>]*)?>/i;

/**
 * Put the API in front of the widget's own markup — but never in front of a
 * `<!doctype>`, which would drop the frame into quirks mode and quietly change
 * every layout that relies on the standard box model.
 */
export function injectBridge(html: string): string {
    return injectScript(html, BRIDGE_SCRIPT);
}

/** Put the `autoHeight` size reporter into the frame (see SIZE_SCRIPT). */
export function injectSizeReporter(html: string): string {
    return injectScript(html, SIZE_SCRIPT);
}

function injectScript(html: string, script: string): string {
    const tag = `<script>${script}</script>`;
    for (const re of [HEAD_RE, DOCTYPE_RE, HTML_RE]) {
        const m = re.exec(html);
        if (m) {
            const at = (m.index ?? 0) + m[0].length;
            return html.slice(0, at) + tag + html.slice(at);
        }
    }
    return tag + html;
}

/** true when the sandbox attribute lets scripts run at all — without them the
 *  injected API would just be dead markup. `undefined` means no sandbox. */
export function sandboxAllowsScripts(sandboxAttr: string | undefined): boolean {
    if (sandboxAttr === undefined) return true;
    return sandboxAttr.split(/\s+/).includes('allow-scripts');
}
