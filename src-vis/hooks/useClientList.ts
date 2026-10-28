import { useEffect, useState } from 'react';
import { getObjectViewDirect, getStateDirect } from './useIoBroker';
import { NS } from '../utils/namespace';

const byLabel = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' });

/** Known clients (id + display name) — for the device pickers of popup triggers and announcements. */
export function useClientList(): { clientId: string; name: string }[] {
    const [clients, setClients] = useState<{ clientId: string; name: string }[]>([]);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const result = await getObjectViewDirect('channel', `${NS}.clients.`, `${NS}.clients.香`);
            // Only direct client channels: aura.0.clients.<clientId> → exactly 4 dot-segments
            const rows = result.rows.filter((r) => r.id.split('.').length === 4);
            const data = await Promise.all(
                rows.map(async (row) => {
                    const cId = row.id.split('.')[3];
                    const nameState = await getStateDirect(`${row.id}.info.name`);
                    return { clientId: cId, name: nameState?.val ? String(nameState.val) : cId.slice(0, 8) };
                }),
            );
            if (!cancelled) setClients(data.sort((a, b) => byLabel(a.name, b.name)));
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return clients;
}
