import { create } from 'zustand';
import { adminToken } from './authStore';
import { vaultCodeDelete, vaultCodeSave, vaultCodes, type PinCodeMeta, type PinCodeSaveResult } from '../utils/pinApi';

/**
 * The named PINs („Kinder“, „Gäste“) the admin assigns to sections and tabs.
 *
 * RAM only, like mcpReleaseStore: the PINs live in the server-side vault and are
 * read with the admin token. Only the id ends up in the dashboard config
 * (`pinCode` on a section/tab) — the name and the digit count stay here.
 */
interface PinCodeState {
    codes: Record<string, PinCodeMeta>;
    /** false until the first successful read (or when the security API is not there). */
    loaded: boolean;
    load: () => Promise<void>;
    save: (body: { id?: string; name?: string; pin?: string }) => Promise<PinCodeSaveResult>;
    remove: (id: string) => Promise<'ok' | 'inUse' | 'error'>;
}

export const usePinCodeStore = create<PinCodeState>()((set, get) => ({
    codes: {},
    loaded: false,
    load: async () => {
        const token = adminToken();
        if (!token) return;
        const res = await vaultCodes(token);
        // Which view uses which PIN comes from the editor's own layouts — they
        // also hold assignments that are not saved yet.
        if (res) set({ codes: res.codes, loaded: true });
    },
    save: async (body) => {
        const token = adminToken();
        if (!token) return { ok: false, reason: 'expired' };
        const res = await vaultCodeSave(token, body);
        if (res.ok) set({ codes: { ...get().codes, [res.id]: { name: res.name, len: res.len } } });
        return res;
    },
    remove: async (id) => {
        const token = adminToken();
        if (!token) return 'error';
        const res = await vaultCodeDelete(token, id);
        if (res === 'ok') {
            const codes = { ...get().codes };
            delete codes[id];
            set({ codes });
        }
        return res;
    },
}));

/** Named PINs sorted by name, for selects and lists. */
export function sortedCodes(codes: Record<string, PinCodeMeta>): [string, PinCodeMeta][] {
    return Object.entries(codes).sort(([, a], [, b]) => a.name.localeCompare(b.name));
}
