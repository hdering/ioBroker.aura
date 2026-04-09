import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invalidateDatapointCache } from '../hooks/useDatapointList';
import { reconnectSocket } from '../hooks/useIoBroker';

interface ConnectionState {
  ioBrokerUrl: string;
  setIoBrokerUrl: (url: string) => void;
}

export const DEFAULT_IOBROKER_URL = 'http://192.168.188.168:8082';

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      ioBrokerUrl: DEFAULT_IOBROKER_URL,
      setIoBrokerUrl: (url) => {
        invalidateDatapointCache();
        reconnectSocket(url);
        set({ ioBrokerUrl: url });
      },
    }),
    { name: 'aura-connection' }, // uses localStorage directly – not managed storage
  ),
);
