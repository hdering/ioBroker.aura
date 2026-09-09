/**
 * Client for Aura's server-side security API (main.js → lib/security/apiHandler).
 *
 * Everything secret — the admin password, a section/tab PIN — is verified on the
 * adapter host, not here: these calls send the plaintext once over the (same-
 * origin) connection and get back a signed token or the unlocked content. The
 * frontend never holds a PIN or a password hash. Served on the Aura origin, so
 * plain relative URLs; in the vite dev server (which is not the adapter) these
 * 404 and the UI degrades to "not configured" / "unlock failed".
 */

const API_BASE = '/api/aura';

export interface UnlockResult {
    content: unknown;
    pinRelock: 'leave' | 'session';
    unlockToken: string;
}

async function request(
    method: string,
    route: string,
    opts: { body?: unknown; token?: string } = {},
): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    try {
        const res = await fetch(`${API_BASE}/${route}`, {
            method,
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
        let json: any = null;
        try {
            json = await res.json();
        } catch {
            /* empty body */
        }
        return { status: res.status, json };
    } catch {
        // Network error (e.g. dev server without the adapter behind it).
        return { status: 0, json: null };
    }
}

export async function adminStatus(): Promise<{ configured: boolean; available: boolean }> {
    const { status, json } = await request('GET', 'admin/status');
    // status 0 = network error, 404 = no adapter behind this origin (vite dev
    // server). Either way the security API is not reachable here.
    if (status === 0 || status === 404) return { configured: false, available: false };
    return { configured: status === 200 && !!json?.configured, available: true };
}

export interface AdminSession {
    token: string;
    /** Epoch ms the server stops honouring this token, if it told us. */
    exp: number | null;
}

const session = (json: { token: string; exp?: unknown }): AdminSession => ({
    token: json.token,
    exp: typeof json.exp === 'number' ? json.exp : null,
});

export async function adminSetup(password: string): Promise<AdminSession | null> {
    const { status, json } = await request('POST', 'admin/setup', { body: { password } });
    return status === 200 && json?.token ? session(json) : null;
}

export async function adminLogin(password: string): Promise<AdminSession | null> {
    const { status, json } = await request('POST', 'admin/login', { body: { password } });
    return status === 200 && json?.token ? session(json) : null;
}

/**
 * Is the admin token we kept still one the server accepts?
 *
 * `'unavailable'` is deliberately distinct from `'expired'`: a network hiccup or an
 * adapter restart must not throw an admin out of the editor, only a real 401 does.
 */
export async function adminSession(token: string): Promise<'ok' | 'expired' | 'unavailable'> {
    const { status } = await request('GET', 'admin/session', { token });
    if (status === 200) return 'ok';
    if (status === 401) return 'expired';
    return 'unavailable';
}

export type AdminChangeResult =
    | { ok: true; session: AdminSession | null }
    | { ok: false; reason: 'expired' | 'tooShort' | 'unavailable' | 'error' };

/**
 * Change the admin password. The reason matters: every failure used to surface as
 * „wrong PIN“ although the form never asks for the old one (#632) — an expired
 * session was the usual cause and the least guessable message.
 */
export async function adminChange(token: string, newPassword: string): Promise<AdminChangeResult> {
    const { status, json } = await request('POST', 'admin/change', { body: { newPassword }, token });
    if (status === 200) return { ok: true, session: json?.token ? session(json) : null };
    if (status === 401) return { ok: false, reason: 'expired' };
    if (status === 400) return { ok: false, reason: 'tooShort' };
    // 0 = network error, 404 = no adapter behind this origin.
    if (status === 0 || status === 404) return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'error' };
}

export interface VaultSectionMeta {
    scope: 'section' | 'tab';
    name: string;
    pinRelock: 'leave' | 'session';
    /** Released for the MCP server to read and write this view's content. */
    mcpWrite?: boolean;
    content: any;
}

export async function vaultRead(token: string): Promise<Record<string, VaultSectionMeta> | null> {
    const { status, json } = await request('GET', 'vault', { token });
    return status === 200 && json?.sections ? json.sections : null;
}

/**
 * Grant or revoke „editable via MCP“ for one protected view.
 *
 * Admin token, never a PIN: the point of the switch is that the AI server gets
 * access without the code ever being typed into a chat. Stored in the vault, so a
 * socket client cannot grant itself a release by writing the config state.
 *
 * `unknown` is its own outcome, not a failure: the vault only learns about a view
 * when the adapter redacts the saved config, so a PIN that was just typed has no
 * entry yet. The editor then parks the release and applies it after the save
 * (see mcpReleaseStore.pending) instead of showing an error.
 */
export type McpReleaseOutcome = 'ok' | 'unknown' | 'error';

export async function vaultSetMcp(token: string, key: string, enabled: boolean): Promise<McpReleaseOutcome> {
    const { status } = await request('POST', 'vault/mcp', { body: { key, enabled }, token });
    if (status === 200) return 'ok';
    return status === 404 ? 'unknown' : 'error';
}

export interface VaultRemoveResult {
    /** false when the vault did not know the key — nothing was protected. */
    removed: boolean;
    scope: 'section' | 'tab';
    /** The payload the adapter wrote back into the config, for the editor to mirror. */
    content?: unknown;
}

/**
 * Remove the PIN of one view: the adapter puts the content back into
 * `config.dashboard` and forgets the vault entry, in one step.
 *
 * Both halves belong together — the vault holds the only copy of the content
 * besides the stub's place in the state, so a client that just dropped the entry
 * would need a save to land the content and a discarded edit in between would
 * take it with it. The payload comes back so the editor can mirror the same
 * result without waiting for the state. `null` = the call failed; nothing changed.
 */
export async function vaultRemove(token: string, key: string): Promise<VaultRemoveResult | null> {
    const { status, json } = await request('POST', 'vault/remove', { body: { key }, token });
    if (status !== 200) return null;
    return {
        removed: json?.removed === true,
        scope: json?.scope === 'section' ? 'section' : 'tab',
        content: json?.content,
    };
}

export type UnlockOutcome =
    | { ok: true; result: UnlockResult }
    | { ok: false; reason: 'wrong' | 'ratelimited' | 'error'; retryAfter?: number };

export async function pinUnlock(key: string, pin: string): Promise<UnlockOutcome> {
    const { status, json } = await request('POST', 'pin/unlock', { body: { key, pin } });
    if (status === 200 && json)
        return {
            ok: true,
            result: { content: json.content, pinRelock: json.pinRelock, unlockToken: json.unlockToken },
        };
    if (status === 429) return { ok: false, reason: 'ratelimited', retryAfter: json?.retryAfter };
    if (status === 401) return { ok: false, reason: 'wrong' };
    return { ok: false, reason: 'error' };
}
