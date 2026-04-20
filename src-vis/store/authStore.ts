import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStateDirect, setStateDirect } from '../hooks/useIoBroker';

const ADMIN_PIN_DP = 'aura.0.admin.pinHash';

// Simple FNV-1a hash – works over plain HTTP (no crypto.subtle needed).
// Sufficient for local PIN protection; not intended for cryptographic security.
function hashPin(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface AuthState {
  pinHash: string | null;      // loaded from ioBroker, NOT persisted
  pinHashLoaded: boolean;      // true once fetched from ioBroker
  sessionActive: boolean;      // persisted in localStorage
  setPinHash: (hash: string | null) => void;
  setSession: (active: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      pinHash: null,
      pinHashLoaded: false,
      sessionActive: false,
      setPinHash: (hash) => set({ pinHash: hash, pinHashLoaded: true }),
      setSession: (active) => set({ sessionActive: active }),
    }),
    { name: 'aura-auth', partialize: (s) => ({ sessionActive: s.sessionActive }) },
  ),
);

/** Load the PIN hash from ioBroker into the store. Call this on the login page mount. */
export async function loadPinHash(): Promise<void> {
  const state = await getStateDirect(ADMIN_PIN_DP);
  const hash = (state?.val && typeof state.val === 'string' && state.val.length > 0)
    ? state.val
    : null;
  useAuthStore.getState().setPinHash(hash);
}

export function loginWithPin(pin: string): boolean {
  const { pinHash, setSession } = useAuthStore.getState();
  if (!pinHash) return false;
  if (hashPin(pin) === pinHash) { setSession(true); return true; }
  return false;
}

export function setupPin(pin: string): void {
  const hash = hashPin(pin);
  setStateDirect(ADMIN_PIN_DP, hash);
  useAuthStore.getState().setPinHash(hash);
  useAuthStore.getState().setSession(true);
}

export function logout(): void {
  useAuthStore.getState().setSession(false);
}
