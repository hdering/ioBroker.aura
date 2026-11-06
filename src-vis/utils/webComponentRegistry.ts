/**
 * Runtime side of ioBroker web components: which components the installed
 * adapters offer (their manifests only - no code of a component runs for that),
 * and the one socket bridge every webcomponent widget hands to its element.
 *
 * Adapters list their components in `common.webComponents`; the files lie in the
 * adapter's admin folder, served as `<base>/adapter/<adapter>/`. Aura's own server
 * answers `/adapter/…` from the file storage and `/lib/esm/react-*.js` itself, and
 * behind the web adapter extension (`/aura/`) web serves both, so
 * `getWebComponentSources(…, document.baseURI)` finds them either way.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    getWebComponentSources,
    loadWebComponents,
    type LoadedWebComponent,
    type WebComponentSocket,
} from '@iobroker/web-components';
import {
    getObjectDirect,
    getObjectViewDirect,
    getSocket,
    getStateDirect,
    sendToDirect,
    setStateDirectAsync,
    subscribeStateDirect,
} from '../hooks/useIoBroker';
import { createWebComponentSocket, objectIdOfRow, type HostState } from './webComponentHost';

let catalog: Promise<LoadedWebComponent[]> | null = null;
const catalogListeners = new Set<() => void>();

async function readCatalog(): Promise<LoadedWebComponent[]> {
    const view = await getObjectViewDirect('instance', 'system.adapter.', 'system.adapter.\u9999');
    const instances = (view.rows ?? [])
        .map((row) => row.value as unknown as { _id: string; common?: { version?: string; webComponents?: unknown } })
        .filter((obj) => obj && Array.isArray(obj.common?.webComponents) && obj.common.webComponents.length)
        .map((obj) => ({ _id: obj._id, common: obj.common ?? {} }));
    if (!instances.length) return [];
    return loadWebComponents(getWebComponentSources(instances, document.baseURI), { log: console });
}

/**
 * The components of all installed adapters, read once per page and shared.
 *
 * @param force read again (after an adapter was installed or updated)
 */
export function loadWebComponentCatalog(force = false): Promise<LoadedWebComponent[]> {
    if (!catalog || force) {
        catalog = readCatalog().catch((e: unknown) => {
            console.warn('[webcomponent] reading the components failed:', e);
            catalog = null; // the next widget may try again
            return [];
        });
        if (force) void catalog.then(() => catalogListeners.forEach((fn) => fn()));
    }
    return catalog;
}

/** The component of a widget: by tag, the adapter only as a tie-breaker */
export function findWebComponent(
    components: LoadedWebComponent[],
    tag: unknown,
    adapter?: unknown,
): LoadedWebComponent | undefined {
    if (typeof tag !== 'string' || !tag) return undefined;
    const withTag = components.filter((c) => c.manifest.tag === tag);
    return withTag.find((c) => c.adapter === adapter) ?? withTag[0];
}

/** React access to the catalog: `components` stays empty until it is read */
export function useWebComponentCatalog(): {
    components: LoadedWebComponent[];
    loading: boolean;
    reload: () => void;
} {
    const [components, setComponents] = useState<LoadedWebComponent[]>([]);
    const [loading, setLoading] = useState(true);
    const [epoch, setEpoch] = useState(0);

    useEffect(() => {
        const bump = (): void => setEpoch((n) => n + 1);
        catalogListeners.add(bump);
        return () => {
            catalogListeners.delete(bump);
        };
    }, []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        void loadWebComponentCatalog().then((list) => {
            if (!alive) return;
            setComponents(list);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [epoch]);

    const reload = useCallback(() => {
        void loadWebComponentCatalog(true);
    }, []);

    return { components, loading, reload };
}

let socketBridge: Promise<WebComponentSocket> | null = null;

/** The `socket` property for every element: Aura's socket in the shape of a socket-client `Connection` */
export function getWebComponentSocket(): Promise<WebComponentSocket> {
    if (!socketBridge) {
        socketBridge = (async () => {
            const sys = (await getObjectDirect('system.config').catch(() => null)) as {
                common?: { language?: string };
            } | null;
            const lang = sys?.common?.language || 'en';
            return createWebComponentSocket(
                {
                    subscribeState: (id, cb) => subscribeStateDirect(id, (state) => cb(state as unknown as HostState)),
                    getState: async (id) => (await getStateDirect(id)) as unknown as HostState | null,
                    setState: (id, val, ack) =>
                        setStateDirectAsync(
                            id,
                            (val !== null && typeof val === 'object' ? JSON.stringify(val) : val) as
                                | boolean
                                | number
                                | string,
                            ack,
                        ),
                    getObject: (id) => getObjectDirect(id),
                    getHistory: (id, options) =>
                        new Promise((resolve, reject) => {
                            getSocket().emit('getHistory', id, options, (err: unknown, result: unknown) =>
                                err
                                    ? reject(err instanceof Error ? err : new Error(String(err)))
                                    : resolve(result ?? []),
                            );
                        }),
                    getObjectView: async (type, start, end) => {
                        const view = await getObjectViewDirect(
                            type as Parameters<typeof getObjectViewDirect>[0],
                            start,
                            end,
                        );
                        const out: Record<string, unknown> = {};
                        // by the object's own ID: the `config` view keys its rows by name
                        for (const row of view.rows ?? []) out[objectIdOfRow(row)] = row.value;
                        return out;
                    },
                    sendTo: async (instance, command, data) => {
                        const result = await sendToDirect(instance, command, data);
                        if (result && typeof result === 'object' && '__timeout' in result) {
                            throw new Error(`sendTo ${instance} "${command}": no answer`);
                        }
                        return result;
                    },
                },
                lang,
            );
        })();
    }
    return socketBridge;
}
