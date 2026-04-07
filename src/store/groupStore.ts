import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';

export interface GroupDatapoint {
  id: string;       // ioBroker Datenpunkt-ID
  label: string;    // Anzeigename
  type: 'boolean' | 'number' | 'string';
  unit?: string;
  writable: boolean;
}

export interface DatapointGroup {
  id: string;
  name: string;
  description?: string;
  datapoints: GroupDatapoint[];
}

interface GroupState {
  groups: DatapointGroup[];
  addGroup: (name: string, description?: string) => string;
  removeGroup: (id: string) => void;
  renameGroup: (id: string, name: string, description?: string) => void;
  addDatapoint: (groupId: string, dp: GroupDatapoint) => void;
  removeDatapoint: (groupId: string, dpId: string) => void;
  updateDatapoint: (groupId: string, dpId: string, patch: Partial<GroupDatapoint>) => void;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      groups: [],

      addGroup: (name, description) => {
        const id = `group-${Date.now()}`;
        set((s) => ({ groups: [...s.groups, { id, name, description, datapoints: [] }] }));
        return id;
      },

      removeGroup: (id) =>
        set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),

      renameGroup: (id, name, description) =>
        set((s) => ({ groups: s.groups.map((g) => g.id === id ? { ...g, name, description } : g) })),

      addDatapoint: (groupId, dp) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId && !g.datapoints.find((d) => d.id === dp.id)
              ? { ...g, datapoints: [...g.datapoints, dp] }
              : g,
          ),
        })),

      removeDatapoint: (groupId, dpId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, datapoints: g.datapoints.filter((d) => d.id !== dpId) } : g,
          ),
        })),

      updateDatapoint: (groupId, dpId, patch) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId
              ? { ...g, datapoints: g.datapoints.map((d) => d.id === dpId ? { ...d, ...patch } : d) }
              : g,
          ),
        })),
    }),
    { name: 'aura-groups', storage: createJSONStorage(() => managedStorage) },
  ),
);
