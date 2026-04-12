import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invalidateDatapointCache } from '../hooks/useDatapointList';
import { reconnectSocket } from '../hooks/useIoBroker';

function generateClientId(): string {
  // crypto.randomUUID() requires HTTPS – use getRandomValues() which works on HTTP too
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
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
    { name: 'aura-connection' }, // uses localStorage directly – not managed storage
  ),
);
