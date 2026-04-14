import { useState, useCallback } from 'react';
import { useIoBroker } from './useIoBroker';
import type { ioBrokerObject, WidgetType } from '../types';

export interface DeviceState {
  id: string;
  obj: ioBrokerObject;
  suggestedWidget: WidgetType;
  unit?: string;
}

export interface Device {
  id: string;
  name: string;
  adapter: string;
  states: DeviceState[];
}

// Mappt ioBroker-Rollen auf Widget-Typen
function roleToWidget(role?: string, valueType?: string): WidgetType {
  if (!role) return valueType === 'boolean' ? 'switch' : 'value';
  const r = role.toLowerCase();
  if (r === 'switch' || r === 'button' || r.startsWith('switch.') || r === 'indicator') return 'switch';
  if (r.includes('dimmer') || r.includes('brightness') || r === 'level' || r.startsWith('level.')) return 'dimmer';
  if (r.includes('temperature') && r.includes('level')) return 'thermostat';
  if (r.includes('temperature')) return 'value';
  if (valueType === 'boolean') return 'switch';
  if (valueType === 'number') return 'value';
  return 'value';
}

function getObjectName(obj: ioBrokerObject): string {
  const n = obj.common.name;
  if (!n) return obj._id.split('.').pop() ?? obj._id;
  if (typeof n === 'string') return n;
  return n['de'] ?? n['en'] ?? Object.values(n)[0] ?? obj._id;
}

// Extrahiert den Adapter-Präfix: "hm-rpc.0.ABC" → "hm-rpc.0"
function adapterPrefix(id: string): string {
  const parts = id.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
}

export function useIoBrokerDevices() {
  const { getObjectView } = useIoBroker();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devResult, chResult, stResult] = await Promise.all([
        getObjectView('device'),
        getObjectView('channel'),
        getObjectView('state'),
      ]);

      // States nach Parent-ID gruppieren
      const statesByParent = new Map<string, DeviceState[]>();
      for (const { value: obj } of stResult.rows) {
        if (!obj) continue;
        const parts = obj._id.split('.');
        const parent = parts.slice(0, -1).join('.');
        if (!statesByParent.has(parent)) statesByParent.set(parent, []);
        statesByParent.get(parent)!.push({
          id: obj._id,
          obj,
          suggestedWidget: roleToWidget(obj.common.role, obj.common.type),
          unit: obj.common.unit,
        });
      }

      const result: Device[] = [];

      // Geräte (device-Objekte)
      for (const { value: obj } of devResult.rows) {
        if (!obj) continue;
        const states: DeviceState[] = [];
        // Direkte States + States aus untergeordneten Kanälen sammeln
        for (const [parent, st] of statesByParent.entries()) {
          if (parent === obj._id || parent.startsWith(obj._id + '.')) {
            states.push(...st);
          }
        }
        if (states.length === 0) continue;
        result.push({
          id: obj._id,
          name: getObjectName(obj),
          adapter: adapterPrefix(obj._id),
          states,
        });
      }

      // Kanäle ohne übergeordnetes Gerät
      const deviceIds = new Set(result.map((d) => d.id));
      for (const { value: obj } of chResult.rows) {
        if (!obj) continue;
        const parts = obj._id.split('.');
        const parentDevice = parts.slice(0, -1).join('.');
        if (deviceIds.has(parentDevice)) continue; // schon über Gerät abgedeckt
        const states = statesByParent.get(obj._id) ?? [];
        if (states.length === 0) continue;
        result.push({
          id: obj._id,
          name: getObjectName(obj),
          adapter: adapterPrefix(obj._id),
          states,
        });
      }

      // Nach Adapter + Name sortieren
      result.sort((a, b) => a.adapter.localeCompare(b.adapter) || a.name.localeCompare(b.name));
      setDevices(result);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [getObjectView]);

  return { devices, loading, loaded, load };
}
