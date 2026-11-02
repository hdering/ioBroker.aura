import { useEffect, useState } from 'react';
import { ExternalLink, ShieldOff } from 'lucide-react';
import { useT } from '../../i18n';
import { useDashboardStore } from '../../store/dashboardStore';
import { useMcpReleaseStore } from '../../store/mcpReleaseStore';
import { usePinCodeStore, sortedCodes } from '../../store/pinCodeStore';
import { adminToken } from '../../store/authStore';
import { vaultRemove } from '../../utils/pinApi';
import { KEEP_PIN, LINK_PIN, hasPin, type PinProtected } from '../../utils/pinLock';

const NONE = '';
const LEGACY = '__legacy';
const NEW = '__new';

const FIELD_STYLE = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** The vault holds this view already (its PIN survives a save as KEEP_PIN). */
export function pinStored(node: PinProtected): boolean {
    return node.pin === KEEP_PIN || node.pinProtected === true;
}

/** The patch that puts `node` behind the named PIN `codeId`. */
export function assignPinCode(node: PinProtected, codeId: string): Partial<PinProtected> {
    return { pinCode: codeId, pin: pinStored(node) ? KEEP_PIN : LINK_PIN, pinFrom: undefined };
}

/**
 * „PIN“ of a section or tab: pick one of the named PINs (Layouts › Zugriffsschutz)
 * or create one on the spot. The editor never sees a code — it only stores the
 * PIN's id on the view; the adapter takes the hash from the named PIN on save.
 *
 * „Kein PIN-Schutz“ is only offered while the view is not stored yet: lifting a
 * stored protection has to put the content back server-side, that is what
 * PinRemoveButton does.
 */
export function PinCodeSelect({
    node,
    onChange,
    className,
    inTable,
}: {
    node: PinProtected;
    onChange: (patch: Partial<PinProtected>) => void;
    className?: string;
    /** Row of the Zugriffsschutz table: the page states once what the editor popover says per view. */
    inTable?: boolean;
}) {
    const t = useT();
    const codes = usePinCodeStore((s) => s.codes);
    const loaded = usePinCodeStore((s) => s.loaded);
    const load = usePinCodeStore((s) => s.load);
    const save = usePinCodeStore((s) => s.save);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [digits, setDigits] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!loaded) void load();
    }, [loaded, load]);

    const stored = pinStored(node);
    const known = !!node.pinCode && !!codes[node.pinCode];
    const value = creating ? NEW : node.pinCode ? node.pinCode : hasPin(node) ? LEGACY : NONE;

    const create = async () => {
        if (digits.trim().length < 4) {
            setError(t('pin.tooShort'));
            return;
        }
        const res = await save({ name: name.trim() || t('pin.field'), pin: digits.trim() });
        if (!res.ok) {
            setError(res.reason === 'tooShort' ? t('pin.tooShort') : t('pin.saveFailed'));
            return;
        }
        onChange(assignPinCode(node, res.id));
        setCreating(false);
        setName('');
        setDigits('');
        setError('');
    };

    return (
        <div className={className}>
            <select
                className="aura-pin-code w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={FIELD_STYLE}
                value={value}
                onChange={(e) => {
                    const v = e.target.value;
                    setError('');
                    if (v === NEW) {
                        setCreating(true);
                        return;
                    }
                    setCreating(false);
                    if (v === NONE)
                        onChange({
                            pin: undefined,
                            pinCode: undefined,
                            pinFrom: undefined,
                            pinRelock: undefined,
                            pinHideLock: undefined,
                        });
                    else if (v !== LEGACY) onChange(assignPinCode(node, v));
                }}
            >
                {!stored && <option value={NONE}>{t('pin.none')}</option>}
                {value === LEGACY && <option value={LEGACY}>{t('pin.legacy')}</option>}
                {node.pinCode && !known && <option value={node.pinCode}>{t('pin.unknownCode')}</option>}
                {sortedCodes(codes).map(([id, c]) => (
                    <option key={id} value={id}>
                        {c.len ? `${c.name} (${'•'.repeat(c.len)})` : c.name}
                    </option>
                ))}
                <option value={NEW}>{t('pin.newCode')}</option>
            </select>
            {creating && (
                <div className="aura-pin-new mt-1.5 space-y-1.5">
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder={t('pin.newName')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="aura-pin-new-name w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={FIELD_STYLE}
                    />
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={t('pin.newDigits')}
                        value={digits}
                        onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && void create()}
                        className="aura-pin-new-digits w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={FIELD_STYLE}
                    />
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => void create()}
                            className="aura-pin-new-create flex-1 px-2 py-1.5 rounded-lg text-xs text-white hover:opacity-80"
                            style={{ background: 'var(--accent)' }}
                        >
                            {t('pin.create')}
                        </button>
                        <button
                            onClick={() => {
                                setCreating(false);
                                setError('');
                            }}
                            className="flex-1 px-2 py-1.5 rounded-lg text-xs hover:opacity-80"
                            style={FIELD_STYLE}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}
            {error && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--accent-red)' }}>
                    {error}
                </p>
            )}
            {node.pinCode && loaded && !known && !creating && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('pin.codeLost')}
                </p>
            )}
            {!loaded && !inTable && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('pin.codesUnavailable')}
                </p>
            )}
            {!inTable && (
                <a
                    href="#/admin/layouts?ctx=access"
                    className="aura-pin-manage text-[10px] mt-1 inline-flex items-center gap-0.5 hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('pin.manage')}
                    <ExternalLink size={9} />
                </a>
            )}
        </div>
    );
}

/**
 * „PIN entfernen“ — lifts the protection of one view.
 *
 * `stored` = the vault holds this view. Then removing is the adapter's job, in one
 * step (POST /api/aura/vault/remove): it writes the content back into
 * config.dashboard and forgets the entry, and hands the payload back so the editor
 * lands on the same result without a save of its own — and without depending on
 * having pulled the protected content at all. A PIN that was only picked has no
 * vault entry, so there this is a plain local clear.
 */
export function PinRemoveButton({
    vaultKey,
    stored,
    onRemove,
    compact,
}: {
    vaultKey: string;
    stored: boolean;
    onRemove: () => void;
    /** Icon-only, for the rows of the Zugriffsschutz table. */
    compact?: boolean;
}) {
    const t = useT();
    const forget = useMcpReleaseStore((s) => s.forget);
    const merge = useDashboardStore((s) => s.mergeProtectedContent);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    return (
        <>
            <button
                disabled={busy}
                title={compact ? t('pin.remove') : undefined}
                onClick={() => {
                    if (!stored) {
                        forget(vaultKey);
                        onRemove();
                        return;
                    }
                    const token = adminToken();
                    if (!token) {
                        setFailed(true);
                        return;
                    }
                    setBusy(true);
                    setFailed(false);
                    void vaultRemove(token, vaultKey).then((res) => {
                        setBusy(false);
                        if (!res) {
                            // Nothing changed server-side — leave the view protected
                            // rather than opening it locally over a live vault entry.
                            setFailed(true);
                            return;
                        }
                        forget(vaultKey);
                        // The adapter already restored the content into the config;
                        // mirror it here (suppressed-dirty) so editor and state agree.
                        if (res.content) merge({ [vaultKey]: { scope: res.scope, content: res.content, open: true } });
                        else onRemove();
                    });
                }}
                className={
                    compact
                        ? 'aura-pin-remove p-1.5 rounded-lg hover:opacity-80 transition-opacity'
                        : 'aura-pin-remove flex items-center gap-1.5 w-full px-2.5 py-2 mt-2 rounded-lg text-xs hover:opacity-80 transition-opacity'
                }
                style={{
                    background: 'var(--app-bg)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--accent-red)',
                    opacity: busy ? 0.6 : 1,
                }}
            >
                <ShieldOff size={11} />
                {!compact && t('pin.remove')}
            </button>
            {failed && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--accent-red)' }}>
                    {t('pin.removeFailed')}
                </p>
            )}
        </>
    );
}
