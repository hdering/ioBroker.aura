/**
 * Shared by the Scenes widget and its edit-dialog section (#825): the sendTo calls to
 * the Aura backend (lib/scenes.js), their types and the device suggestions.
 */
import { useMemo } from 'react';
import { sendToDirect } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useActiveSectionId } from '../../contexts/ActiveSectionContext';
import { useDashboardStore } from '../../store/dashboardStore';

/** A datapoint as the backend describes it (sceneDevices). */
export interface SceneDevice {
    id: string;
    name: string;
    type: string;
    unit: string;
    min?: number;
    max?: number;
    step?: number;
    states?: Record<string, string>;
    /** current value */
    value?: unknown;
    /** why it cannot be a member (read-only, missing, …); null = fine */
    problem?: string | null;
}

export interface SceneInfo {
    id: string;
    name: string;
    own: boolean;
    enabled: boolean;
    memberCount: number;
    /** Own scenes only: members with their stored "on" value. */
    members?: { id: string; value: unknown }[];
}

export interface SceneStatus {
    ok: boolean;
    instance: string;
    installed: boolean;
    running: boolean;
}

export type SceneReply = { ok?: boolean; error?: string; missing?: string[] } & Record<string, unknown>;

/** sendTo to this page's aura instance, normalised to { ok, error } — timeouts and permission strings included. */
export async function callSceneBackend(command: string, payload: Record<string, unknown> = {}): Promise<SceneReply> {
    const r = await sendToDirect<SceneReply>(NS, command, payload);
    if (r && typeof r === 'object' && '__timeout' in r) return { ok: false, error: 'timeout' };
    if (typeof r === 'string') return { ok: false, error: r };
    if (!r) return { ok: false, error: 'no reply' };
    return r as SceneReply;
}

/** Names of every device looked up so far — for the "no value" notice after saving. */
const deviceNames: Record<string, string> = {};

export async function loadSceneDevices(ids: string[]): Promise<SceneDevice[]> {
    const r = await callSceneBackend('sceneDevices', { ids });
    const list = r.ok && Array.isArray(r.devices) ? (r.devices as SceneDevice[]) : [];
    list.forEach((d) => (deviceNames[d.id] = d.name));
    return list;
}

export const sceneDeviceName = (id: string): string => deviceNames[id] ?? id;

/** Status and scene list in one go; `error` set when the backend did not answer. */
export async function loadScenes(): Promise<{ status: SceneStatus | null; scenes: SceneInfo[]; error?: string }> {
    const [st, list] = await Promise.all([callSceneBackend('sceneStatus'), callSceneBackend('listScenes')]);
    if (!st.ok) return { status: null, scenes: [], error: st.error ?? 'error' };
    const scenes = list.ok && Array.isArray(list.scenes) ? (list.scenes as SceneInfo[]) : [];
    return { status: st as unknown as SceneStatus, scenes };
}

/**
 * Main datapoints of the widgets in the surrounding section — the device suggestions of
 * the scene popup. Outside a dashboard (edit dialog) the section active in the store.
 */
export function useSectionDatapoints(enabled: boolean): string[] {
    const layoutId = useActiveLayoutId();
    const sectionId = useActiveSectionId();
    const layouts = useDashboardStore((s) => s.layouts);
    const activeLayoutId = useDashboardStore((s) => s.activeLayoutId);
    return useMemo(() => {
        if (!enabled) return [];
        const layout = layouts.find((l) => l.id === (layoutId || activeLayoutId)) ?? layouts[0];
        const section =
            layout?.sections.find((x) => x.id === (sectionId ?? layout.activeSectionId)) ?? layout?.sections[0];
        const ids = (section?.tabs ?? []).flatMap((tab) => tab.widgets.map((w) => w.datapoint));
        return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.includes('.')))];
    }, [enabled, layouts, layoutId, activeLayoutId, sectionId]);
}
