/**
 * Create / edit popup of the Scenes widget (#825).
 *
 * Name, the devices of the scene (only those the Aura instance config allows),
 * "learn again" and delete. Saving learns the current value of every newly added
 * device on the adapter side — the scene stores what the room looks like right now.
 * With a scenes PIN configured, the PIN field appears and travels with every write.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Trash2 } from 'lucide-react';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import { useEscapeLayer } from '../../utils/escapeStack';
import { ConfirmOverlay } from './ConfirmOverlay';
import type { SceneDevice, SceneInfo } from './ScenesWidget';

export interface SceneEditResult {
    ok: boolean;
    error?: string;
    retryAfter?: number;
    missing?: string[];
}

interface Props {
    /** null = new scene */
    scene: SceneInfo | null;
    devices: SceneDevice[];
    pinRequired: boolean;
    onSave: (name: string, members: string[], pin: string) => Promise<SceneEditResult>;
    onLearn: (pin: string) => Promise<SceneEditResult>;
    onDelete: (pin: string) => Promise<SceneEditResult>;
    onClose: () => void;
}

const inputCls = 'w-full text-sm rounded-lg px-2.5 py-2 focus:outline-none';
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

/** Stored "on" value of a member, readable: an/aus, 60 %, text. */
export function formatSceneValue(v: unknown, unit: string, t: (k: 'scenes.on' | 'scenes.off') => string): string {
    if (v === null || v === undefined || v === '') return '–';
    if (typeof v === 'boolean') return v ? t('scenes.on') : t('scenes.off');
    return unit ? `${String(v)} ${unit}` : String(v);
}

export function SceneEditModal({ scene, devices, pinRequired, onSave, onLearn, onDelete, onClose }: Props) {
    const t = useT();
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const [name, setName] = useState(scene?.name ?? '');
    const [selected, setSelected] = useState<string[]>(() => scene?.members?.map((m) => m.id) ?? []);
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    useEscapeLayer(onClose);

    const stored = new Map((scene?.members ?? []).map((m) => [m.id, m.value]));
    // Members of the scene that are no longer in the allowed list stay visible (and selected),
    // so saving never drops them silently.
    const known = new Set(devices.map((d) => d.id));
    const rows: SceneDevice[] = [
        ...devices,
        ...(scene?.members ?? [])
            .filter((m) => !known.has(m.id))
            .map((m) => ({ id: m.id, name: m.id, label: '', type: '', unit: '', missing: true })),
    ];

    const errorText = (r: SceneEditResult): string => {
        if (r.error === 'pin') return t('scenes.err.pin');
        if (r.error === 'locked') return t('scenes.err.locked', { s: r.retryAfter ?? 0 });
        if (r.error === 'timeout') return t('scenes.err.timeout');
        return r.error || t('scenes.err.generic');
    };
    const missingText = (r: SceneEditResult): string | null => {
        if (!r.missing?.length) return null;
        const names = r.missing.map((id) => rows.find((d) => d.id === id)?.name ?? id);
        return t('scenes.learnMissing', { list: names.join(', ') });
    };

    const run = async (fn: () => Promise<SceneEditResult>, closeOnOk: boolean, okText?: string) => {
        if (busy) return;
        setBusy(true);
        setMsg(null);
        try {
            const r = await fn();
            if (!r.ok) {
                setMsg({ kind: 'error', text: errorText(r) });
                return;
            }
            // Save/delete close; devices without a value are reported by the widget then.
            if (closeOnOk) {
                onClose();
                return;
            }
            const missing = missingText(r);
            if (missing || okText) setMsg({ kind: 'info', text: missing ?? okText ?? '' });
        } finally {
            setBusy(false);
        }
    };

    const toggle = (id: string) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const canSave = !!name.trim() && selected.length > 0 && !busy && (!pinRequired || !!pin);

    return createPortal(
        <div
            data-aura-app="frontend"
            className="aura-scene-modal fixed inset-0 z-[9000] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-primary)', ...themeVars }}
            onClick={onClose}
        >
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-full"
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
                            className={inputCls}
                            style={inputStyle}
                            data-testid="scene-name"
                            autoFocus={!scene}
                        />
                    </label>

                    <div>
                        <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('scenes.devices')}
                        </span>
                        {rows.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {t('scenes.noDevices')}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {rows.map((d) => {
                                    const on = selected.includes(d.id);
                                    const value = stored.get(d.id);
                                    return (
                                        <label
                                            key={d.id}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm"
                                            style={{
                                                background: on
                                                    ? 'color-mix(in srgb, var(--accent) 12%, var(--app-bg))'
                                                    : 'var(--app-bg)',
                                                border: `1px solid ${on ? 'var(--accent)' : 'var(--app-border)'}`,
                                            }}
                                            data-testid="scene-device"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={on}
                                                onChange={() => toggle(d.id)}
                                                className="shrink-0"
                                                style={{ accentColor: 'var(--accent)' }}
                                            />
                                            <span className="flex-1 min-w-0 truncate" title={d.id}>
                                                {d.name}
                                            </span>
                                            {stored.has(d.id) && (
                                                <span
                                                    className="shrink-0 text-xs tabular-nums"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    {formatSceneValue(value, d.unit, t)}
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {t('scenes.learnHint')}
                        </p>
                    </div>

                    {pinRequired && (
                        <label className="block">
                            <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                {t('scenes.pin')}
                            </span>
                            <input
                                type="password"
                                inputMode="numeric"
                                autoComplete="off"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className={inputCls}
                                style={inputStyle}
                                data-testid="scene-pin"
                            />
                        </label>
                    )}

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
                        <>
                            <button
                                onClick={() => setConfirmDelete(true)}
                                disabled={busy || (pinRequired && !pin)}
                                className="p-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                                style={{ ...secondaryBtn, color: '#ef4444' }}
                                title={t('scenes.delete')}
                                data-testid="scene-delete"
                            >
                                <Trash2 size={14} />
                            </button>
                            <button
                                onClick={() => run(() => onLearn(pin), false, t('scenes.learned'))}
                                disabled={busy || (pinRequired && !pin)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg hover:opacity-80 disabled:opacity-40"
                                style={secondaryBtn}
                                title={t('scenes.learnTitle')}
                                data-testid="scene-learn"
                            >
                                <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
                                {t('scenes.learn')}
                            </button>
                        </>
                    )}
                    <span className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-3 py-2 text-xs rounded-lg hover:opacity-80"
                        style={secondaryBtn}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => run(() => onSave(name.trim(), selected, pin), true)}
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
                            void run(() => onDelete(pin), true);
                        }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}
            </div>
        </div>,
        portal,
    );
}
