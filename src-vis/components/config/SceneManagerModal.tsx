/**
 * "Szene bearbeiten" in the widget's edit dialog (#825) — the master-detail layout of
 * "Datenpunkte verwalten": the scene's devices on the left (drag = order in which the
 * scenes adapter sets them, add, remove), the selected device on the right (datapoint,
 * value). Unlike the list dialogs nothing is stored on the fly: the scene lives in the
 * scenes adapter, so the header carries name, "Current values", delete and save.
 */
import { useEffect, useState } from 'react';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { DatapointPicker } from './DatapointPicker';
import { DatapointManagerModal } from './list/DatapointManagerModal';
import type { ManagedEntry } from './list/EntryListItem';
import { ValueInput, formatSceneValue } from '../widgets/SceneEditModal';
import {
    callSceneBackend,
    loadSceneDevices,
    type SceneDevice,
    type SceneInfo,
    type SceneReply,
} from '../widgets/scenesApi';

interface Member {
    /** Local key — stays when the datapoint of the row is changed. */
    key: string;
    id: string;
    value: unknown;
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

let keySeq = 0;
const newKey = () => `m${++keySeq}`;

export function SceneManagerModal({
    scene,
    onDone,
    onClose,
}: {
    /** null = new scene */
    scene: SceneInfo | null;
    /** After a successful save or delete (reply incl. `missing`). */
    onDone: (r: SceneReply) => void;
    onClose: () => void;
}) {
    const t = useT();
    const [name, setName] = useState(scene?.name ?? '');
    const [members, setMembers] = useState<Member[]>(() =>
        (scene?.members ?? []).map((m) => ({ key: newKey(), id: m.id, value: m.value })),
    );
    const [devices, setDevices] = useState<Record<string, SceneDevice>>({});
    const [picker, setPicker] = useState<{ key: string | null } | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const merge = (list: SceneDevice[]) =>
        setDevices((prev) => ({ ...prev, ...Object.fromEntries(list.map((d) => [d.id, d])) }));

    useEffect(() => {
        const ids = [...new Set(members.map((m) => m.id))];
        if (ids.length) void loadSceneDevices(ids).then(merge);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const lookup = async (ids: string[]) => {
        const list = await loadSceneDevices(ids);
        merge(list);
        return list;
    };

    const reject = (list: SceneDevice[]) => {
        const bad = list.filter((d) => d.problem);
        setMsg(
            bad.length
                ? { kind: 'info', text: t('scenes.rejected', { list: bad.map((d) => d.name).join(', ') }) }
                : null,
        );
        return list.filter((d) => !d.problem);
    };

    /** New rows at the end, each with its current value; already present datapoints are skipped. */
    const addDevices = async (ids: string[]) => {
        const ok = reject(await lookup(ids));
        setMembers((prev) => [
            ...prev,
            ...ok
                .filter((d) => !prev.some((m) => m.id === d.id))
                .map((d) => ({ key: newKey(), id: d.id, value: d.value })),
        ]);
    };

    /** Point an existing row at another datapoint; its value starts from the new one's current value. */
    const changeDatapoint = async (key: string, id: string) => {
        const trimmed = id.trim();
        setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, id: trimmed } : m)));
        if (!trimmed) return;
        const d = (await lookup([trimmed])).find((x) => x.id === trimmed);
        if (d && !d.problem) setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, value: d.value } : m)));
        reject(d ? [d] : []);
    };

    const patch = (key: string, p: Partial<Member>) =>
        setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...p } : m)));

    const takeCurrent = async (keys?: string[]) => {
        const rows = members.filter((m) => m.id && (!keys || keys.includes(m.key)));
        if (!rows.length || busy) return;
        setBusy(true);
        try {
            const fresh = await lookup([...new Set(rows.map((m) => m.id))]);
            const byId = new Map(fresh.filter((d) => !d.problem).map((d) => [d.id, d.value]));
            setMembers((prev) =>
                prev.map((m) =>
                    rows.some((r) => r.key === m.key) && byId.has(m.id) ? { ...m, value: byId.get(m.id) } : m,
                ),
            );
        } finally {
            setBusy(false);
        }
    };

    const run = async (command: 'saveScene' | 'deleteScene', payload: Record<string, unknown>) => {
        if (busy) return;
        setBusy(true);
        setMsg(null);
        try {
            const r = await callSceneBackend(command, payload);
            if (r.ok) {
                onDone(r);
                onClose();
            } else {
                setMsg({
                    kind: 'error',
                    text: r.error === 'timeout' ? t('scenes.err.timeout') : r.error || t('scenes.err.generic'),
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const valid = members.filter((m) => m.id);
    const canSave = !!name.trim() && valid.length > 0 && !busy;
    const save = () =>
        run('saveScene', {
            ...(scene ? { id: scene.id } : {}),
            name: name.trim(),
            members: valid.map((m) => ({ id: m.id, value: m.value })),
        });

    const valueText = (m: Member) => {
        const d = devices[m.id];
        if (!m.id) return t('scenes.cfg.noDp');
        if (d?.problem) return t('scenes.unavailable');
        const v = m.value;
        if (d?.states && v !== undefined && v !== null && d.states[String(v)] !== undefined) return d.states[String(v)];
        return formatSceneValue(v, d?.unit ?? '', t);
    };

    const entries: ManagedEntry[] = members.map((m) => ({
        id: m.key,
        label: m.id ? (devices[m.id]?.name ?? m.id) : t('scenes.cfg.noDp'),
        sublabel: valueText(m),
    }));

    const header = (
        <div className="flex flex-wrap items-end gap-2" data-testid="scene-mgr-header">
            <label className="flex-1 min-w-[12rem]">
                <span className={labelCls} style={labelStyle}>
                    {t('scenes.name')}
                </span>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder={t('scenes.namePlaceholder')}
                    className={inputCls}
                    style={inputStyle}
                    data-testid="scene-name"
                    autoFocus={!scene}
                />
            </label>
            <button
                onClick={() => void takeCurrent()}
                disabled={busy || !valid.length}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg hover:opacity-80 disabled:opacity-40"
                style={btnStyle}
                title={t('scenes.takeCurrentTitle')}
                data-testid="scene-current"
            >
                <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
                {t('scenes.takeCurrent')}
            </button>
            {scene &&
                (confirmDelete ? (
                    <span className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
                        {t('scenes.deleteConfirm', { name: scene.name })}
                        <button
                            onClick={() => void run('deleteScene', { id: scene.id })}
                            className="px-2.5 py-2 rounded-lg text-white"
                            style={{ background: '#ef4444' }}
                            data-testid="scene-delete-yes"
                        >
                            {t('common.yes')}
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="px-2.5 py-2 rounded-lg"
                            style={btnStyle}
                        >
                            {t('common.no')}
                        </button>
                    </span>
                ) : (
                    <button
                        onClick={() => setConfirmDelete(true)}
                        disabled={busy}
                        className="p-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                        style={{ ...btnStyle, color: '#ef4444' }}
                        title={t('scenes.delete')}
                        data-testid="scene-delete"
                    >
                        <Trash2 size={14} />
                    </button>
                ))}
            <button
                onClick={() => void save()}
                disabled={!canSave}
                className="px-4 py-2 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
                data-testid="scene-save"
            >
                {t('scenes.save')}
            </button>
            {msg && (
                <p
                    className="basis-full text-xs px-2 py-1.5 rounded-lg"
                    style={
                        msg.kind === 'error'
                            ? { background: '#ef444422', color: '#ef4444', border: '1px solid #ef444455' }
                            : { color: 'var(--text-primary)', border: '1px solid var(--app-border)' }
                    }
                    data-testid="scene-msg"
                >
                    {msg.text}
                </p>
            )}
        </div>
    );

    return (
        <>
            <DatapointManagerModal
                title={scene ? t('scenes.edit') : t('scenes.new')}
                storageKey="aura-scene-manager-modal"
                entries={entries}
                resolvedNames={{}}
                entriesTabLabel={t('scenes.cfg.devicesTab')}
                selectHint={t('scenes.cfg.pickDevice')}
                emptyState={t('scenes.cfg.noDevicesYet')}
                addLabel={t('scenes.cfg.addDevice')}
                header={header}
                onAdd={() => setPicker({ key: null })}
                onRemove={(key) => setMembers((prev) => prev.filter((m) => m.key !== key))}
                onRemoveAll={() => setMembers([])}
                onReorder={(from, to) =>
                    setMembers((prev) => {
                        const next = [...prev];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        return next;
                    })
                }
                renderDetail={(key) => {
                    const m = members.find((x) => x.key === key);
                    if (!m) return null;
                    const d = devices[m.id];
                    return (
                        <div className="space-y-3" data-testid="scene-member-detail">
                            <div>
                                <span className={labelCls} style={labelStyle}>
                                    {t('scenes.cfg.datapoint')}
                                </span>
                                <div className="flex gap-1">
                                    <input
                                        defaultValue={m.id}
                                        onBlur={(e) => {
                                            if (e.target.value.trim() !== m.id)
                                                void changeDatapoint(m.key, e.target.value);
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                        placeholder="z. B. hm-rpc.0.ABC123.1.STATE"
                                        className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                                        style={inputStyle}
                                        data-testid="scene-member-dp"
                                        key={m.id}
                                    />
                                    <button
                                        onClick={() => setPicker({ key: m.key })}
                                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                        style={btnStyle}
                                        title={t('scenes.cfg.pickDp')}
                                        data-testid="scene-member-pick"
                                    >
                                        <Database size={13} />
                                    </button>
                                </div>
                                {d && (
                                    <p
                                        className="text-[11px] mt-1"
                                        style={{ color: d.problem ? '#ef4444' : 'var(--text-secondary)' }}
                                    >
                                        {d.problem
                                            ? t('scenes.rejected', { list: d.name })
                                            : [d.name, d.type, d.unit].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                            </div>
                            {d && !d.problem && (
                                <div>
                                    <span className={labelCls} style={labelStyle}>
                                        {t('scenes.cfg.value')}
                                    </span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <ValueInput
                                            device={d}
                                            value={m.value}
                                            onChange={(v) => patch(m.key, { value: v })}
                                        />
                                        <button
                                            onClick={() => void takeCurrent([m.key])}
                                            disabled={busy}
                                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1 hover:opacity-80 disabled:opacity-40"
                                            style={btnStyle}
                                            data-testid="scene-member-current"
                                        >
                                            <RefreshCw size={11} />
                                            {t('scenes.cfg.currentValue', {
                                                v: formatSceneValue(
                                                    d.states && d.value != null
                                                        ? (d.states[String(d.value)] ?? d.value)
                                                        : d.value,
                                                    d.unit,
                                                    t,
                                                ),
                                            })}
                                        </button>
                                    </div>
                                    <p
                                        className="text-[11px] mt-1.5"
                                        style={{ color: 'var(--text-secondary)', opacity: 0.8 }}
                                    >
                                        {t('scenes.cfg.valueHint')}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                }}
                onClose={onClose}
            />
            {picker && (
                <DatapointPicker
                    currentValue={picker.key ? (members.find((m) => m.key === picker.key)?.id ?? '') : ''}
                    onSelect={(id) => {
                        const key = picker.key;
                        setPicker(null);
                        if (key) void changeDatapoint(key, id);
                        else void addDevices([id]);
                    }}
                    onClose={() => setPicker(null)}
                    multiSelect={!picker.key}
                    onMultiSelect={(picks) => {
                        setPicker(null);
                        const ids = picks.map((p) => p.id).filter(Boolean);
                        if (ids.length) void addDevices(ids);
                    }}
                />
            )}
        </>
    );
}
