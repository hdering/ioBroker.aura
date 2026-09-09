import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    adminStatus,
    adminSetup,
    adminLogin,
    adminChange,
    adminSession,
    type AdminAuthResult,
    type AdminChangeResult,
    type AdminSession,
} from '../utils/pinApi';

/**
 * Admin authentication — now verified server-side (main.js /api/aura/admin/*).
 *
 * The old FNV-1a-in-the-browser check is gone: it stored a reversible, socket-
 * readable hash and the "login" was a client-side flag anyone could flip. The
 * password is now scrypt-checked on the adapter host; on success the server hands
 * back a signed session token, which is all this store keeps. Admin API calls
 * (vault read, config save) carry it as a Bearer token.
 */

// The vite dev server has no adapter behind it, so the security API 404s there.
// In that (and only that) case we fall back to a local, unauthenticated editor so
// the dev workflow keeps working — never in a production build.
const DEV = import.meta.env.DEV;

interface AuthState {
    /** Whether an admin password has been set on the server (null = not yet checked). */
    configured: boolean | null;
    statusLoaded: boolean;
    /** false once we learn the security API is unreachable (dev server, adapter down). */
    apiAvailable: boolean;
    /** Signed admin session token from the server, or null when logged out. */
    token: string | null;
    /** Epoch ms the server stops honouring the token (null = unknown, e.g. dev). */
    tokenExp: number | null;
    sessionActive: boolean;
    /** Set when a session was dropped because the server no longer honours it. */
    sessionExpired: boolean;
    setStatus: (configured: boolean) => void;
    setSession: (session: AdminSession | null) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            configured: null,
            statusLoaded: false,
            apiAvailable: true,
            token: null,
            tokenExp: null,
            sessionActive: false,
            sessionExpired: false,
            setStatus: (configured) => set({ configured, statusLoaded: true }),
            // A token is the session, and its expiry comes along: the token outlives
            // the server's patience in localStorage, so the frontend has to know when
            // to ask for the password again instead of failing every admin call.
            setSession: (session) =>
                set({
                    token: session ? session.token : null,
                    tokenExp: session ? session.exp : null,
                    sessionActive: !!session,
                    sessionExpired: false,
                }),
        }),
        {
            name: 'aura-auth',
            partialize: (s) => ({ token: s.token, tokenExp: s.tokenExp, sessionActive: s.sessionActive }),
            // A token whose expiry has passed is no session — drop it while the app
            // boots, so the editor never renders as logged in behind a dead token.
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                if (typeof state.tokenExp === 'number' && state.tokenExp <= Date.now()) {
                    useAuthStore.setState({
                        token: null,
                        tokenExp: null,
                        sessionActive: false,
                        sessionExpired: true,
                    });
                }
            },
        },
    ),
);

/** Ask the server whether an admin password exists yet. Call on the login page. */
export async function loadAdminStatus(): Promise<void> {
    const { configured, available } = await adminStatus();
    if (!available && DEV) {
        // No security API in dev → present the editor as already set up; login is
        // a local no-op below. (Production keeps configured=false → real setup.)
        useAuthStore.setState({ apiAvailable: false, configured: true, statusLoaded: true });
        return;
    }
    useAuthStore.setState({ apiAvailable: available });
    useAuthStore.getState().setStatus(configured);
}

const DEV_SESSION = { ok: true, session: { token: 'dev-local', exp: null } } as const satisfies AdminAuthResult;

/** First-run: set the admin password on the server and start a session. */
export async function setupAdmin(password: string): Promise<AdminAuthResult> {
    if (DEV && !useAuthStore.getState().apiAvailable) {
        useAuthStore.getState().setSession(DEV_SESSION.session);
        useAuthStore.getState().setStatus(true);
        return DEV_SESSION;
    }
    const res = await adminSetup(password);
    if (res.ok) {
        useAuthStore.getState().setSession(res.session);
        useAuthStore.getState().setStatus(true);
        return res;
    }
    // A password is already set — the page was offering a first-run setup that
    // could never succeed. Turn it into the login form it should have been.
    if (res.reason === 'exists') useAuthStore.getState().setStatus(true);
    return res;
}

/** Verify the password server-side; on success keep the returned session token. */
export async function loginWithPin(password: string): Promise<AdminAuthResult> {
    if (DEV && !useAuthStore.getState().apiAvailable) {
        useAuthStore.getState().setSession(DEV_SESSION.session);
        return DEV_SESSION;
    }
    const res = await adminLogin(password);
    if (res.ok) useAuthStore.getState().setSession(res.session);
    return res;
}

/** Change the admin password (requires an active session). */
export async function changeAdmin(newPassword: string): Promise<AdminChangeResult> {
    if (DEV && !useAuthStore.getState().apiAvailable) return { ok: true, session: null }; // no server in dev
    const token = useAuthStore.getState().token;
    if (!token) {
        expireSession();
        return { ok: false, reason: 'expired' };
    }
    const res = await adminChange(token, newPassword);
    // The server hands back a fresh token with the new password — keep it, or the
    // next admin call runs on a session that is already on its way out.
    if (res.ok && res.session) useAuthStore.getState().setSession(res.session);
    if (!res.ok && res.reason === 'expired') expireSession();
    return res;
}

/** Drop the session and remember why, so the login page can say what happened. */
function expireSession(): void {
    useAuthStore.setState({ token: null, tokenExp: null, sessionActive: false, sessionExpired: true });
}

/**
 * Ask the server whether the kept token is still valid; drop the session if not.
 *
 * The editor gate is a persisted flag, the session is an 8 h server token: a tab
 * left open overnight looked logged in while every admin call 401'd — the reported
 * symptom was „wrong PIN“ when changing the admin PIN (#632).
 */
export async function verifyAdminSession(): Promise<boolean> {
    const { token, tokenExp, sessionActive, apiAvailable } = useAuthStore.getState();
    if (!sessionActive) return false;
    if (DEV && !apiAvailable) return true; // no security API behind the dev server
    // No token behind the flag: nothing to verify (dev/test fake) — leave it alone.
    if (!token) return true;
    if (typeof tokenExp === 'number' && tokenExp <= Date.now()) {
        expireSession();
        return false;
    }
    const res = await adminSession(token);
    if (res === 'expired') {
        expireSession();
        return false;
    }
    return true; // 'unavailable' — an adapter restart is not a logout
}

/** The current admin Bearer token, or null. Used by admin-only API calls. */
export function adminToken(): string | null {
    return useAuthStore.getState().token;
}

export function logout(): void {
    useAuthStore.getState().setSession(null);
}
