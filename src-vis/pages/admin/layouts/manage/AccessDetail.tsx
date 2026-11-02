// Right pane of the Layouts page for „Zugriffsschutz“ (`?ctx=access`): the named
// PINs (create, rename, re-key, delete) and every section and tab of every layout
// with the PIN it uses — the one place to see what is protected by what.
//
// Two kinds of change, two paths: a PIN itself lives in the server vault and is
// changed there at once (pinCodeStore); which view uses which PIN is dashboard
// config and goes out with the normal „Speichern“.

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useDashboardStore, type DashboardLayout } from '../../../../store/dashboardStore';
import { usePinCodeStore, sortedCodes } from '../../../../store/pinCodeStore';
import { hasPin, sectionPinKey, tabPinKey, type PinProtected } from '../../../../utils/pinLock';
import { PinCodeSelect, PinRemoveButton, pinStored } from '../../../../components/config/PinCodeSelect';
import { useT } from '../../../../i18n';
import { Toggle } from '../shared/SettingControls';
import { Btn, Card, Chip, IconBtn, InlineEdit, inputCls, inputStyle } from './pieces';
import { layoutIconNode, sectionIconNode } from './LayoutTree';

interface ViewRef {
    layoutId: string;
    sectionId: string;
    tabId: string | null;
    label: string;
}

/** Every view that puts itself behind a named PIN, by PIN id. Tabs of a protected section are covered by it. */
function viewsByCode(layouts: DashboardLayout[]): Map<string, ViewRef[]> {
    const out = new Map<string, ViewRef[]>();
    const add = (code: string | undefined, ref: ViewRef) => {
        if (!code) return;
        out.set(code, [...(out.get(code) ?? []), ref]);
    };
    const multi = layouts.length > 1;
    for (const l of layouts)
        for (const sec of l.sections) {
            const base = multi ? `${l.name} › ${sec.name}` : sec.name;
            if (hasPin(sec)) {
                add(sec.pinCode, { layoutId: l.id, sectionId: sec.id, tabId: null, label: base });
                continue;
            }
            for (const tab of sec.tabs)
                if (hasPin(tab))
                    add(tab.pinCode, {
                        layoutId: l.id,
                        sectionId: sec.id,
                        tabId: tab.id,
                        label: `${base} › ${tab.name}`,
                    });
        }
    return out;
}

const CLEAR_PIN: Partial<PinProtected> = {
    pin: undefined,
    pinRelock: undefined,
    pinHideLock: undefined,
    pinProtected: undefined,
    pinLength: undefined,
    pinFrom: undefined,
    pinCode: undefined,
};

export function AccessDetail() {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const loaded = usePinCodeStore((s) => s.loaded);
    const load = usePinCodeStore((s) => s.load);
    const [onlyProtected, setOnlyProtected] = useState(false);

    // Always fresh on entry — another admin tab may have changed the PINs.
    useEffect(() => {
        void load();
    }, [load]);

    const usage = useMemo(() => viewsByCode(layouts), [layouts]);

    return (
        <div className="space-y-4" data-testid="access-detail">
            <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <KeyRound size={16} />
                    <h2 className="text-base font-semibold">{t('access.title')}</h2>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('access.subtitle')}
                </p>
                {!loaded && (
                    <p className="text-xs mt-2" style={{ color: 'var(--accent-red)' }}>
                        {t('pin.codesUnavailable')}
                    </p>
                )}
            </div>

            <CodesCard usage={usage} />

            <Card
                title={t('access.views')}
                padded={false}
                testId="access-views"
                actions={
                    <label
                        className="flex items-center gap-2 text-xs cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('access.onlyProtected')}
                        <Toggle value={onlyProtected} onChange={setOnlyProtected} />
                    </label>
                }
                footer={t('access.saveHint')}
            >
                <div
                    className="hidden md:grid grid-cols-[minmax(0,1fr)_220px_96px_96px_32px] gap-3 px-4 py-2 text-[10px] uppercase tracking-widest font-semibold border-b"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--app-border)' }}
                >
                    <span>{t('access.colView')}</span>
                    <span>{t('access.colPin')}</span>
                    <span>{t('access.colKeepOpen')}</span>
                    <span>{t('access.colLock')}</span>
                    <span />
                </div>
                {layouts.map((l) => (
                    <LayoutRows key={l.id} layout={l} onlyProtected={onlyProtected} />
                ))}
            </Card>
        </div>
    );
}

// ── named PINs ────────────────────────────────────────────────────────────────

function CodesCard({ usage }: { usage: Map<string, ViewRef[]> }) {
    const t = useT();
    const codes = usePinCodeStore((s) => s.codes);
    const loaded = usePinCodeStore((s) => s.loaded);
    const save = usePinCodeStore((s) => s.save);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [digits, setDigits] = useState('');
    const [error, setError] = useState('');
    const list = sortedCodes(codes);

    const create = async () => {
        if (digits.length < 4) {
            setError(t('pin.tooShort'));
            return;
        }
        const res = await save({ name: name.trim() || t('pin.field'), pin: digits });
        if (!res.ok) {
            setError(res.reason === 'tooShort' ? t('pin.tooShort') : t('pin.saveFailed'));
            return;
        }
        setAdding(false);
        setName('');
        setDigits('');
        setError('');
    };

    return (
        <Card
            title={t('access.codes')}
            testId="access-codes"
            actions={
                <Btn small variant="primary" disabled={!loaded} onClick={() => setAdding((v) => !v)}>
                    <Plus size={13} /> {t('access.newCode')}
                </Btn>
            }
        >
            {adding && (
                <div className="flex flex-col sm:flex-row gap-2" data-testid="access-new-code">
                    <input
                        className={inputCls}
                        style={inputStyle}
                        placeholder={t('pin.newName')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        className={inputCls}
                        style={inputStyle}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={t('pin.newDigits')}
                        value={digits}
                        onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && void create()}
                    />
                    <Btn variant="primary" onClick={() => void create()}>
                        {t('pin.create')}
                    </Btn>
                </div>
            )}
            {error && (
                <p className="text-xs" style={{ color: 'var(--accent-red)' }}>
                    {error}
                </p>
            )}
            {loaded && list.length === 0 && !adding && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('access.noCodes')}
                </p>
            )}
            {list.map(([id, c]) => (
                <CodeRow key={id} id={id} name={c.name} len={c.len} users={usage.get(id) ?? []} />
            ))}
        </Card>
    );
}

function CodeRow({ id, name, len, users }: { id: string; name: string; len?: number; users: ViewRef[] }) {
    const t = useT();
    const save = usePinCodeStore((s) => s.save);
    const remove = usePinCodeStore((s) => s.remove);
    const [rekey, setRekey] = useState(false);
    const [digits, setDigits] = useState('');
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const commitPin = async () => {
        if (digits.length < 4) {
            setMsg({ ok: false, text: t('pin.tooShort') });
            return;
        }
        const res = await save({ id, pin: digits });
        setMsg(res.ok ? { ok: true, text: t('access.changed') } : { ok: false, text: t('pin.saveFailed') });
        if (res.ok) {
            setRekey(false);
            setDigits('');
        }
    };

    return (
        <div
            className="rounded-xl px-3 py-2.5 space-y-2"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            data-testid={`access-code-${id}`}
        >
            <div className="flex flex-wrap items-center gap-2">
                <KeyRound size={14} style={{ color: 'var(--text-secondary)' }} />
                <div className="flex-1 min-w-[140px]">
                    <InlineEdit value={name} onCommit={(v) => v.trim() && void save({ id, name: v.trim() })} />
                </div>
                {len ? (
                    <span className="text-xs tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                        {'•'.repeat(len)}
                    </span>
                ) : null}
                <Btn small onClick={() => setRekey((v) => !v)}>
                    {t('access.changePin')}
                </Btn>
                <IconBtn
                    title={users.length ? t('access.deleteInUse') : t('access.delete')}
                    disabled={users.length > 0}
                    muted={users.length > 0}
                    onClick={() =>
                        void remove(id).then(
                            (res) => res === 'inUse' && setMsg({ ok: false, text: t('access.deleteInUse') }),
                        )
                    }
                >
                    <Trash2 size={13} />
                </IconBtn>
            </div>
            {rekey && (
                <div className="flex gap-2">
                    <input
                        className={inputCls}
                        style={inputStyle}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={t('access.newDigits')}
                        value={digits}
                        onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && void commitPin()}
                    />
                    <Btn variant="primary" onClick={() => void commitPin()}>
                        {t('common.save')}
                    </Btn>
                </div>
            )}
            {msg && (
                <p className="text-xs" style={{ color: msg.ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {msg.text}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('access.usedBy')}:
                </span>
                {users.length ? (
                    users.map((u) => (
                        <Chip key={`${u.sectionId}:${u.tabId ?? ''}`} tone="accent">
                            {u.label}
                        </Chip>
                    ))
                ) : (
                    <Chip>{t('access.unused')}</Chip>
                )}
            </div>
        </div>
    );
}

// ── sections and tabs ─────────────────────────────────────────────────────────

function LayoutRows({ layout, onlyProtected }: { layout: DashboardLayout; onlyProtected: boolean }) {
    const t = useT();
    const sections = layout.sections.filter(
        (sec) => !onlyProtected || hasPin(sec) || sec.tabs.some((tab) => hasPin(tab)),
    );
    if (!sections.length) return null;
    return (
        <div className="border-b last:border-b-0" style={{ borderColor: 'var(--app-border)' }}>
            <div
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold"
                style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)' }}
            >
                {layoutIconNode(layout, 12)}
                {layout.name}
            </div>
            {sections.map((sec) => {
                const secLocked = hasPin(sec);
                return (
                    <div key={sec.id}>
                        <ViewRow
                            layoutId={layout.id}
                            sectionId={sec.id}
                            tabId={null}
                            node={sec}
                            label={sec.name}
                            icon={sectionIconNode(sec)}
                        />
                        {sec.tabs
                            .filter((tab) => secLocked || !onlyProtected || hasPin(tab))
                            .map((tab) =>
                                secLocked ? (
                                    <div
                                        key={tab.id}
                                        className="flex items-center gap-2 pl-10 pr-4 py-1.5 text-xs"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <span className="truncate">{tab.name}</span>
                                        <span className="opacity-70">– {t('access.covered')}</span>
                                    </div>
                                ) : (
                                    <ViewRow
                                        key={tab.id}
                                        layoutId={layout.id}
                                        sectionId={sec.id}
                                        tabId={tab.id}
                                        node={tab}
                                        label={tab.name}
                                        indent
                                    />
                                ),
                            )}
                    </div>
                );
            })}
        </div>
    );
}

function ViewRow({
    layoutId,
    sectionId,
    tabId,
    node,
    label,
    icon,
    indent,
}: {
    layoutId: string;
    sectionId: string;
    tabId: string | null;
    node: PinProtected;
    label: string;
    icon?: React.ReactNode;
    indent?: boolean;
}) {
    const t = useT();
    const patch = useDashboardStore((s) => s.patchPinView);
    const set = (p: Partial<PinProtected>) => patch(layoutId, sectionId, tabId, p);
    const locked = hasPin(node);
    const vaultKey = tabId ? tabPinKey(sectionId, tabId) : sectionPinKey(sectionId);
    return (
        <div
            className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_96px_96px_32px] gap-x-3 gap-y-1.5 items-center pr-4 py-2 ${indent ? 'pl-10' : 'pl-4'}`}
            data-testid={`access-row-${vaultKey}`}
        >
            <div className="flex items-center gap-2 min-w-0 text-sm" style={{ color: 'var(--text-primary)' }}>
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <PinCodeSelect node={node} onChange={set} inTable />
            {locked ? (
                <>
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Toggle
                            value={node.pinRelock === 'session'}
                            onChange={(v) => set({ pinRelock: v ? 'session' : undefined })}
                        />
                        <span className="md:hidden">{t('access.colKeepOpen')}</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Toggle
                            value={node.pinHideLock !== true}
                            onChange={(v) => set({ pinHideLock: v ? undefined : true })}
                        />
                        <span className="md:hidden">{t('access.colLock')}</span>
                    </label>
                    <div>
                        <PinRemoveButton
                            vaultKey={vaultKey}
                            stored={pinStored(node)}
                            onRemove={() => set(CLEAR_PIN)}
                            compact
                        />
                    </div>
                </>
            ) : (
                <span className="hidden md:block md:col-span-3" />
            )}
        </div>
    );
}
