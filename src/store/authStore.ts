import { create } from 'zustand';
import { persist } from 'zustand/middleware';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function loginWithPin(pin: string): Promise<boolean> {
  const { pinHash, setSession } = useAuthStore.getState();
  if (!pinHash) return false;
  const hash = await sha256(pin);
  if (hash === pinHash) { setSession(true); return true; }
  return false;
}

export async function setupPin(pin: string): Promise<void> {
  const hash = await sha256(pin);
  useAuthStore.getState().setPinHash(hash);
  useAuthStore.getState().setSession(true);
}

export function logout(): void {
  useAuthStore.getState().setSession(false);
}
