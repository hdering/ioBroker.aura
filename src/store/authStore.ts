import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  pinHash: string | null;      // gespeicherter PIN-Hash (null = noch kein PIN gesetzt)
  sessionActive: boolean;      // aktuelle Session authentifiziert
  setPinHash: (hash: string) => void;
  setSession: (active: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      pinHash: null,
      sessionActive: false,
      setPinHash: (hash) => set({ pinHash: hash }),
      setSession: (active) => set({ sessionActive: active }),
    }),
    { name: 'aura-auth', partialize: (s) => ({ pinHash: s.pinHash, sessionActive: s.sessionActive }) },
  ),
);

export function loginWithPin(pin: string): boolean {
  const { pinHash, setSession } = useAuthStore.getState();
  if (!pinHash) return false;
  if (hashPin(pin) === pinHash) { setSession(true); return true; }
  return false;
}

export function setupPin(pin: string): void {
  useAuthStore.getState().setPinHash(hashPin(pin));
  useAuthStore.getState().setSession(true);
}

export function logout(): void {
  useAuthStore.getState().setSession(false);
}
