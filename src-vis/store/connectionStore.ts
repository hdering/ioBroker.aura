import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invalidateDatapointCache } from '../hooks/useDatapointList';
import { reconnectSocket } from '../hooks/useIoBroker';

// Stable fingerprint-based client ID derived from browser/device properties.
// Deterministic: same device + browser always produces the same ID, even after
// localStorage is cleared (which causes duplicates with random IDs on mobile).
function generateClientId(): string {
  const fp = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.hardwareConcurrency ?? 0,
  ].join('|');
  // Two independent djb2 hashes → 16 hex chars
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < fp.length; i++) {
    const c = fp.charCodeAt(i);
    h1 = Math.imul((h1 << 5) + h1, 1) ^ c;
    h2 = Math.imul((h2 << 5) + h2, 1) ^ c;
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

interface ConnectionState {
  ioBrokerUrl: string;
  clientId: string;
  clientName: string;
  setIoBrokerUrl: (url: string) => void;
  setClientName: (name: string) => void;
}

// In production use same host as the page but socketio port 8084.
// In dev the Vite proxy handles /socket.io so origin is fine.
export const DEFAULT_IOBROKER_URL = import.meta.env.DEV
  ? window.location.origin
  : `${window.location.protocol}//${window.location.hostname}:8084`;

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      ioBrokerUrl: DEFAULT_IOBROKER_URL,
      clientId: generateClientId(),
      clientName: '',
      setIoBrokerUrl: (url) => {
        invalidateDatapointCache();
        reconnectSocket(url);
        set({ ioBrokerUrl: url });
      },
      setClientName: (name) => set({ clientName: name }),
    }),
    {
      name: 'aura-connection',
      // clientId is intentionally excluded: it is recomputed from a device fingerprint
      // on every load, so it stays stable even when localStorage is cleared (mobile).
      partialize: (state) => ({ ioBrokerUrl: state.ioBrokerUrl, clientName: state.clientName }),
    },
  ),
);
