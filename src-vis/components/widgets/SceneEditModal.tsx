/**
 * Create / edit popup of the Scenes widget (#825).
 *
 * Name, the devices of the scene and the value each one gets when the scene runs.
 * Devices are added through the datapoint picker; the backend checks every one
 * (existing, writable, not system.* / scene.*). A newly added device starts with its current value,
 * "Current values" refreshes all of them — what learning used to be.
 *
 * The widget's runtime editor (option `allowEdit`); the edit dialog uses the larger
 * SceneManagerModal. Self-contained — it talks to the backend itself. Option `sceneDps`
 * narrows the picker to the datapoints the household may add (patterns, see dpPatterns).
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Trash2, Plus } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import { useEscapeLayer } from '../../utils/escapeStack';
import { DatapointPicker } from '../config/DatapointPicker';
import { matchesDpPatterns } from '../../utils/dpPatterns';
import { ConfirmOverlay } from './ConfirmOverlay';
import {
    callSceneBackend,
    loadSceneDevices as loadDevices,
    type SceneDevice,
    type SceneInfo,
    type SceneReply,
} from './scenesApi';

export interface SceneEditResult {
    ok: boolean;
    error?: string;
    missing?: string[];
}

interface Props {
    /** null = new scene */
    scene: SceneInfo | null;
    /** After a successful save or delete (reply incl. `missing`), before closing. */
    onDone: (r: SceneReply) => void;
    onClose: () => void;
    /** Patterns of the datapoints that may be added (option `sceneDps`); empty = all. */
    allowedDps?: string[];
}

const inputCls = 'text-sm rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const secondaryBtn: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};
const smallInput = 'text-xs rounded-md px-2 py-1 focus:outline-none';

/** Stored "on" value of a member, readable: an/aus, 60 %, text. */
export function formatSceneValue(v: unknown, unit: string, t: (k: 'scenes.on' | 'scenes.off') => string): string {
    if (v === null || v === undefined || v === '') return '–';
    if (typeof v === 'boolean') return v ? t('scenes.on') : t('scenes.off');
    return unit ? `${String(v)} ${unit}` : String(v);
}

/** Input matching the datapoint: states → select, boolean → on/off, number → number field, else text. */
export function ValueInput({
    device,
    value,
    onChange,
}: {
    device: SceneDevice;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const t = useT();
    if (device.states && Object.keys(device.states).length) {
        return (
            <select
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => onChange(e.target.value)}
                className={`${smallInput} max-w-[9rem]`}
                style={inputStyle}
                data-testid="scene-value"
            >
                {(value === undefined || value === null) && <option value="">–</option>}
                {Object.entries(device.states).map(([k, label]) => (
                    <option key={k} value={k}>
                        {String(label)}
                    </option>
                ))}
            </select>
        );
    }
    if (device.type === 'boolean') {
        const on = value === true || value === 'true';
        return (
            <button
                type="button"
                onClick={() => onChange(!on)}
                className="text-xs rounded-md px-2.5 py-1 min-w-[3.5rem]"
                style={
                    on
                        ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                        : secondaryBtn
                }
                data-testid="scene-value"
                data-on={on || undefined}
            >
                {on ? t('scenes.on') : t('scenes.off')}
            </button>
        );
    }
    const number = device.type === 'number';
    return (
        <span className="flex items-center gap-1 shrink-0">
            <input
                type={number ? 'number' : 'text'}
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => onChange(e.target.value)}
                min={device.min}
                max={device.max}
                step={device.step ?? 'any'}
                className={`${smallInput} ${number ? 'w-16 text-right tabular-nums' : 'w-24'}`}
                style={inputStyle}
                data-testid="scene-value"
            />
            {device.unit && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {device.unit}
                </span>
            )}
        </span>
    );
}

export function SceneEditModal({ scene, onDone, onClose, allowedDps = [] }: Props) {
    const t = useT();
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const [name, setName] = useState(scene?.name ?? '');
    const [selected, setSelected] = useState<string[]>(() => scene?.members?.map((m) => m.id) ?? []);
    const [values, setValues] = useState<Record<string, unknown>>(() =>
        Object.fromEntries((scene?.members ?? []).map((m) => [m.id, m.value])),
    );
    const [devices, setDevices] = useState<Record<string, SceneDevice>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [picker, setPicker] = useState(false);
    useEscapeLayer(() => {
        if (!picker) onClose();
    });

    const allowedKey = allowedDps.join('|');
    const allowed = useCallback(
        (id: string) => matchesDpPatterns(id, allowedDps),
        [allowedKey], // eslint-disable-line react-hooks/exhaustive-deps
    );

    const merge = (list: SceneDevice[]) =>
        setDevices((prev) => ({ ...prev, ...Object.fromEntries(list.map((d) => [d.id, d])) }));

    // Names, types and current values of the members.
    useEffect(() => {
        const ids = (scene?.members ?? []).map((m) => m.id);
        if (ids.length) void loadDevices(ids).then(merge);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const nameOf = (id: string) => devices[id]?.name ?? id;

    // Runs after an async lookup too, so everything goes through functional updates.
    const add = (picked: SceneDevice[]) => {
        // The picker only offers allowed ones; a typed-in id is checked here.
        const list = picked.map((d) => (allowed(d.id) ? d : { ...d, problem: d.problem ?? 'not allowed' }));
        const rejected = list.filter((d) => d.problem);
        setMsg(
            rejected.length
                ? { kind: 'info', text: t('scenes.rejected', { list: rejected.map((d) => d.name).join(', ') }) }
                : null,
        );
        const usable = list.filter((d) => !d.problem);
        if (!usable.length) return;
        merge(usable);
        setSelected((prev) => [...prev, ...usable.map((d) => d.id).filter((id) => !prev.includes(id))]);
        // A stored value of a device that was removed and added again wins over the current one.
        setValues((prev) => ({ ...Object.fromEntries(usable.map((d) => [d.id, d.value])), ...prev }));
    };
    const remove = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));

    const takeCurrent = async () => {
        if (!selected.length || busy) return;
        setBusy(true);
        try {
            const fresh = await loadDevices(selected);
            merge(fresh);
            setValues((prev) => ({
                ...prev,
                ...Object.fromEntries(fresh.filter((d) => !d.problem).map((d) => [d.id, d.value])),
            }));
        } finally {
            setBusy(false);
        }
    };

    const errorText = (r: SceneEditResult): string => {
        if (r.error === 'timeout') return t('scenes.err.timeout');
        return r.error || t('scenes.err.generic');
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
            } else setMsg({ kind: 'error', text: errorText(r as SceneEditResult) });
        } finally {
            setBusy(false);
        }
    };

    const canSave = !!name.trim() && selected.length > 0 && !busy;

    return createPortal(
        <div
            data-aura-app="frontend"
            className="aura-scene-modal fixed inset-0 z-[10010] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={onClose}
        >
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-full"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                onClick={(e) => e.stopPropagation()}
                data-testid="scene-modal"
            >
                <div
                    className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <p className="text-sm font-semibold flex-1">{scene ? t('scenes.edit') : t('scenes.new')}</p>
                    <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3 overflow-y-auto min-h-0">
                    <label className="block">
                        <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('scenes.name')}
                        </span>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                            placeholder={t('scenes.namePlaceholder')}
                            className={`w-full ${inputCls}`}
                            style={inputStyle}
                            data-testid="scene-name"
                            autoFocus={!scene}
                        />
                    </label>

                    <div>
                        <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('scenes.devices')}
                        </span>
                        {selected.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {t('scenes.noDevices')}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {selected.map((id) => {
                                    const d = devices[id];
                                    return (
                                        <div
                                            key={id}
                                            className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-lg text-sm"
                                            style={{
                                                background: 'var(--app-bg)',
                                                border: '1px solid var(--app-border)',
                                            }}
                                            data-testid="scene-device"
                                            data-id={id}
                                        >
                                            <span className="flex-1 min-w-0 truncate" title={id}>
                                                {nameOf(id)}
                                            </span>
                                            {d && !d.problem ? (
                                                <ValueInput
                                                    device={d}
                                                    value={values[id]}
                                                    onChange={(v) => setValues((p) => ({ ...p, [id]: v }))}
                                                />
                                            ) : (
                                                <span className="text-xs" style={{ color: '#ef4444' }}>
                                                    {d ? t('scenes.unavailable') : '…'}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => remove(id)}
                                                className="shrink-0 p-1 rounded-md hover:opacity-70"
                                                style={{ color: 'var(--text-secondary)' }}
                                                title={t('scenes.remove')}
                                                data-testid="scene-remove"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {t('scenes.valueHint')}
                        </p>
                    </div>

                    <button
                        onClick={() => setPicker(true)}
                        className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                        style={secondaryBtn}
                        data-testid="scene-pick"
                    >
                        <Plus size={12} />
                        {t('scenes.cfg.addDevice')}
                    </button>

                    {msg && (
                        <p
                            className="text-xs px-2 py-1.5 rounded-lg"
                            style={
                                msg.kind === 'error'
                                    ? { background: '#ef444422', color: '#ef4444', border: '1px solid #ef444455' }
                                    : {
                                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                          color: 'var(--text-primary)',
                                          border: '1px solid var(--app-border)',
                                      }
                            }
                            data-testid="scene-msg"
                        >
                            {msg.text}
                        </p>
                    )}
                </div>

                <div
                    className="flex items-center gap-2 px-4 py-3 border-t"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    {scene && (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            disabled={busy}
                            className="p-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                            style={{ ...secondaryBtn, color: '#ef4444' }}
                            title={t('scenes.delete')}
                            data-testid="scene-delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => void takeCurrent()}
                        disabled={busy || !selected.length}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg hover:opacity-80 disabled:opacity-40"
                        style={secondaryBtn}
                        title={t('scenes.takeCurrentTitle')}
                        data-testid="scene-current"
                    >
                        <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
                        {t('scenes.takeCurrent')}
                    </button>
                    <span className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-3 py-2 text-xs rounded-lg hover:opacity-80"
                        style={secondaryBtn}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() =>
                            run('saveScene', {
                                ...(scene ? { id: scene.id } : {}),
                                name: name.trim(),
                                members: selected.map((id) => ({ id, value: values[id] })),
                            })
                        }
                        disabled={!canSave}
                        className="px-3 py-2 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                        data-testid="scene-save"
                    >
                        {t('scenes.save')}
                    </button>
                </div>

                {confirmDelete && (
                    <ConfirmOverlay
                        text={t('scenes.deleteConfirm', { name: scene?.name ?? '' })}
                        onConfirm={() => {
                            setConfirmDelete(false);
                            void run('deleteScene', { id: scene?.id });
                        }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}
            </div>
            {picker && (
                <div onClick={(e) => e.stopPropagation()}>
                    <DatapointPicker
                        currentValue=""
                        idFilter={allowedDps.length ? allowed : undefined}
                        onSelect={(id) => {
                            setPicker(false);
                            void loadDevices([id]).then(add);
                        }}
                        onClose={() => setPicker(false)}
                        multiSelect
                        onMultiSelect={(picks) => {
                            setPicker(false);
                            const ids = picks.map((p) => p.id).filter(Boolean);
                            if (ids.length) void loadDevices(ids).then(add);
                        }}
                    />
                </div>
            )}
        </div>,
        portal,
    );
}
