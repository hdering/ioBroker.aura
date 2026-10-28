import { useEffect, useState } from 'react';
import { Check, Copy, Pencil, Plus, Trash2, Volume2, X } from 'lucide-react';
import { docsUrl } from '../../utils/docsUrl';
import { getStateDirect, sendToDirect, setStateDirectAsync } from '../../hooks/useIoBroker';
import { useClientList } from '../../hooks/useClientList';
import {
    discardPendingKey,
    markExternalDirty,
    registerExternalConfigKey,
    subscribeDirty,
} from '../../store/persistManager';
import { registerHistoryStore, resyncHistoryKey } from '../../store/editHistory';
import { NS } from '../../utils/namespace';
import { ClauseList, newClause } from '../../components/config/ConditionEditor';
import { ConfigModal } from '../../components/config/ConfigModal';
import { DatapointPicker } from '../../components/config/DatapointPicker';
import {
    announcementClauses,
    parseAnnouncementConfig,
    type AnnouncementConfig,
    type AnnouncementRule,
} from '../../utils/announcements';
import { ADMIN_PAGE_PAD, AdminPageTitle, AdminPageSubtitle } from './AdminPageHeader';

/**
 * Admin → Ansagen (issue #834, phase 4): announcements without a script.
 *
 * The rules live in `config.announcements` and are run by the adapter
 * (lib/announcements.js), not by the dashboards, so a lock like "once a day"
 * holds across every device. This page only edits the datapoint — the same
 * module-level edit buffer as the message defaults, so the admin's save bar and
 * undo/redo cover it.
 */

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const cardStyle: React.CSSProperties = {
    background: 'var(--app-surface)',
    border: '1px solid var(--app-border)',
};
const smallBtnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    border: '1px solid var(--app-border)',
    color: 'var(--text-primary)',
};

/** Name of the rules in the admin's save bookkeeping (persistManager). */
const CONFIG_KEY = 'aura-announcements';

const EMPTY: AnnouncementConfig = { rules: [] };

const editBuffer = {
    /** What the page shows. null = nothing loaded and nothing edited yet. */
    value: null as AnnouncementConfig | null,
    /** What ioBroker holds — the baseline Rückgängig returns to. */
    saved: null as AnnouncementConfig | null,
};

registerHistoryStore(CONFIG_KEY, {
    getSnapshot: () => ({ value: editBuffer.value }),
    applySnapshot: (snap) => {
        editBuffer.value = (snap.value as AnnouncementConfig | null) ?? editBuffer.saved;
        if (JSON.stringify(editBuffer.value) === JSON.stringify(editBuffer.saved)) discardPendingKey(CONFIG_KEY);
        else markExternalDirty(CONFIG_KEY);
    },
});

/** ack=true: an owned configuration value, not a command. */
function writeConfig(next: AnnouncementConfig): Promise<boolean> {
    return setStateDirectAsync(`${NS}.config.announcements`, JSON.stringify(next), true).then(() => true);
}

/** Re-renders the page on every edit — subscribeDirty only reports the clean/dirty switch. */
const editListeners = new Set<() => void>();

function commit(next: AnnouncementConfig) {
    editBuffer.value = next;
    markExternalDirty(CONFIG_KEY);
    editListeners.forEach((fn) => fn());
}

function newRule(name: string): AnnouncementRule {
    return {
        id: `ann-${Date.now().toString(36)}`,
        name,
        enabled: true,
        clause: newClause(),
        text: '',
    };
}

const WEEKDAYS: { value: number; label: string }[] = [
    { value: 1, label: 'Mo' },
    { value: 2, label: 'Di' },
    { value: 3, label: 'Mi' },
    { value: 4, label: 'Do' },
    { value: 5, label: 'Fr' },
    { value: 6, label: 'Sa' },
    { value: 0, label: 'So' },
];

/** One line in the list: when and where, in words. */
function ruleSummary(rule: AnnouncementRule): string {
    const parts: string[] = [];
    if (rule.timeFrom && rule.timeTo) parts.push(`${rule.timeFrom}–${rule.timeTo}`);
    if (rule.days?.length) {
        parts.push(
            WEEKDAYS.filter((d) => rule.days!.includes(d.value))
                .map((d) => d.label)
                .join(' '),
        );
    }
    if (rule.oncePerDay) parts.push('1× am Tag');
    if (rule.cooldownMin) parts.push(`alle ${rule.cooldownMin} min`);
    parts.push(rule.clientIds?.length ? `${rule.clientIds.length} Gerät(e)` : 'alle Geräte');
    return parts.join(' · ');
}

function Chip({
    on,
    onClick,
    children,
    title,
}: {
    on: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
            style={{
                background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--app-bg)',
                color: on ? 'var(--accent)' : 'var(--text-primary)',
                border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 27%, transparent)' : 'var(--app-border)'}`,
            }}
        >
            {on && <Check size={9} strokeWidth={3} />}
            {children}
        </button>
    );
}

function RuleEditModal({
    rule,
    onChange,
    onClose,
}: {
    rule: AnnouncementRule;
    onChange: (next: AnnouncementRule) => void;
    onClose: () => void;
}) {
    const clients = useClientList();
    const [picking, setPicking] = useState(false);
    const [testState, setTestState] = useState<{ busy: boolean; result?: string; error?: boolean }>({ busy: false });

    const patch = (p: Partial<AnnouncementRule>) => onChange({ ...rule, ...p });

    const toggleClient = (clientId: string) => {
        const cur = rule.clientIds ?? [];
        const next = cur.includes(clientId) ? cur.filter((c) => c !== clientId) : [...cur, clientId];
        patch({ clientIds: next.length ? next : undefined });
    };
    const toggleDay = (day: number) => {
        const cur = rule.days ?? [];
        const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
        patch({ days: next.length && next.length < 7 ? next.sort() : undefined });
    };

    const runTest = async () => {
        setTestState({ busy: true });
        const res = await sendToDirect<{ ok?: boolean; text?: string }>(NS, 'announcementTest', { rule }, 10_000);
        if (res && typeof res === 'object' && 'ok' in res && res.ok) {
            setTestState({
                busy: false,
                result: res.text ? `Gesprochen: „${res.text}“` : 'Kein Text — nichts gesprochen.',
            });
        } else {
            setTestState({ busy: false, error: true, result: 'Der Adapter hat nicht geantwortet.' });
        }
    };

    return (
        <ConfigModal title={`Ansage: ${rule.name}`} maxWidth={720} padded onClose={onClose}>
            <div className="space-y-4" data-aura-announcement-editor="">
                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Name
                    </label>
                    <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Bedingungen
                    </label>
                    <div className="space-y-1.5">
                        <ClauseList
                            clauses={announcementClauses(rule)}
                            logic="AND"
                            allowChanged
                            addLabel="Bedingung hinzufügen"
                            onChange={(next) => {
                                const [first = newClause(), ...rest] = next;
                                patch({ clause: first, extraClauses: rest.length ? rest : undefined });
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <label className="text-[11px] shrink-0" style={labelStyle}>
                            Ansagen
                        </label>
                        <select
                            value={rule.mode ?? 'edge'}
                            onChange={(e) => patch({ mode: e.target.value === 'update' ? 'update' : undefined })}
                            className={inputCls}
                            style={{ ...inputStyle, maxWidth: 360 }}
                        >
                            <option value="edge">sobald die Bedingungen erfüllt werden</option>
                            <option value="update">bei jedem neuen Wert, solange sie erfüllt sind</option>
                        </select>
                    </div>
                    <p className="text-[11px] mt-1.5" style={labelStyle}>
                        Der Adapter prüft die Regeln, auch wenn kein Dashboard offen ist. Sind die Bedingungen beim
                        Speichern oder beim Start schon erfüllt, wird nichts angesagt. {'„Bei jedem neuen Wert“'} passt
                        zu Klingeln, die bei jedem Druck erneut <span className="font-mono">true</span> melden.
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px]" style={labelStyle}>
                            Text oder Sounddatei
                        </label>
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="text-[11px] px-2 py-0.5 rounded-lg hover:opacity-80"
                            style={{ ...smallBtnStyle, color: 'var(--accent)' }}
                        >
                            Wert einfügen
                        </button>
                    </div>
                    <textarea
                        value={rule.text}
                        onChange={(e) => patch({ text: e.target.value })}
                        rows={3}
                        placeholder="Es hat an der Haustür geklingelt"
                        className={inputCls}
                        style={inputStyle}
                    />
                    <p className="text-[11px] mt-1" style={labelStyle}>
                        <span className="font-mono">{'{{value}}'}</span> = Wert des ersten Datenpunkts,{' '}
                        <span className="font-mono">{'[[Datenpunkt-ID]]'}</span> = Wert eines beliebigen Datenpunkts,{' '}
                        <span className="font-mono">{'{{name}}'}</span> /{' '}
                        <span className="font-mono">{'{{parent}}'}</span> wie in Popups. Eine Datei (
                        <span className="font-mono">.mp3</span>, <span className="font-mono">.wav</span>, URL) wird
                        abgespielt statt gesprochen.
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => void runTest()}
                            disabled={testState.busy || !rule.text.trim()}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-40"
                            style={smallBtnStyle}
                        >
                            <Volume2 size={12} /> Jetzt testen
                        </button>
                        {testState.result && (
                            <span
                                className="text-[11px]"
                                style={{ color: testState.error ? 'var(--accent-red)' : 'var(--text-secondary)' }}
                            >
                                {testState.result}
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Geräte (leer = alle)
                    </label>
                    {clients.length === 0 ? (
                        <p className="text-[11px]" style={labelStyle}>
                            Noch keine Geräte registriert.
                        </p>
                    ) : (
                        <div
                            className="flex flex-wrap gap-1.5 overflow-y-auto rounded-lg p-1.5"
                            style={{ maxHeight: 110, border: '1px solid var(--app-border)' }}
                        >
                            {clients.map((c) => (
                                <Chip
                                    key={c.clientId}
                                    on={!!rule.clientIds?.includes(c.clientId)}
                                    onClick={() => toggleClient(c.clientId)}
                                    title={c.clientId}
                                >
                                    {c.name}
                                    <span className="font-mono opacity-50">{c.clientId.slice(0, 6)}</span>
                                </Chip>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[11px] mb-1 block" style={labelStyle}>
                            Lautstärke % (leer = Einstellung des Geräts)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.volume ?? ''}
                            onChange={(e) =>
                                patch({
                                    volume:
                                        e.target.value === ''
                                            ? undefined
                                            : Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
                                })
                            }
                            className={`${inputCls} font-mono`}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={labelStyle}>
                            Stimme (Name oder Teil davon, leer = Standard)
                        </label>
                        <input
                            type="text"
                            value={rule.voice ?? ''}
                            onChange={(e) => patch({ voice: e.target.value || undefined })}
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={!!rule.interrupt}
                            onChange={(e) => patch({ interrupt: e.target.checked || undefined })}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Laufende Ansage unterbrechen</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={!!rule.onlyVisible}
                            onChange={(e) => patch({ onlyVisible: e.target.checked || undefined })}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>
                            Nur auf Geräten mit eingeschaltetem Display
                        </span>
                    </label>
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Zeitfenster (leer = immer)
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                        <input
                            type="time"
                            value={rule.timeFrom ?? ''}
                            onChange={(e) => patch({ timeFrom: e.target.value || undefined })}
                            className={`${inputCls} font-mono`}
                            style={{ ...inputStyle, maxWidth: 120 }}
                            aria-label="von"
                        />
                        <span className="text-xs" style={labelStyle}>
                            bis
                        </span>
                        <input
                            type="time"
                            value={rule.timeTo ?? ''}
                            onChange={(e) => patch({ timeTo: e.target.value || undefined })}
                            className={`${inputCls} font-mono`}
                            style={{ ...inputStyle, maxWidth: 120 }}
                            aria-label="bis"
                        />
                        <div className="flex gap-1 flex-wrap">
                            {WEEKDAYS.map((d) => (
                                <Chip
                                    key={d.value}
                                    on={!!rule.days?.includes(d.value)}
                                    onClick={() => toggleDay(d.value)}
                                >
                                    {d.label}
                                </Chip>
                            ))}
                        </div>
                    </div>
                    <p className="text-[11px] mt-1" style={labelStyle}>
                        Beide Zeiten setzen, sonst gilt das Fenster nicht. 22:00 bis 06:00 geht über Mitternacht. Keine
                        Wochentage gewählt = jeden Tag.
                    </p>
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Sperre
                    </label>
                    <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={!!rule.oncePerDay}
                                onChange={(e) => patch({ oncePerDay: e.target.checked || undefined })}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>Höchstens einmal am Tag</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                            <span style={{ color: 'var(--text-primary)' }}>Mindestabstand</span>
                            <input
                                type="number"
                                min={0}
                                value={rule.cooldownMin ?? ''}
                                onChange={(e) => {
                                    const n = Math.round(Number(e.target.value) || 0);
                                    patch({ cooldownMin: n > 0 ? n : undefined });
                                }}
                                className={`${inputCls} font-mono`}
                                style={{ ...inputStyle, maxWidth: 80 }}
                            />
                            <span style={labelStyle}>Minuten</span>
                        </label>
                    </div>
                </div>
            </div>

            {picking && (
                <DatapointPicker
                    currentValue=""
                    onSelect={(id) => {
                        const sep = rule.text && !/\s$/.test(rule.text) ? ' ' : '';
                        patch({ text: `${rule.text}${sep}[[${id}]]` });
                        setPicking(false);
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </ConfigModal>
    );
}

export function AdminAnnouncements() {
    const [, bump] = useState(0);
    useEffect(() => subscribeDirty(() => bump((n) => n + 1)), []);
    useEffect(() => {
        const fn = () => bump((n) => n + 1);
        editListeners.add(fn);
        return () => {
            editListeners.delete(fn);
        };
    }, []);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');

    useEffect(() => {
        registerExternalConfigKey(CONFIG_KEY, {
            save: () =>
                writeConfig(editBuffer.value ?? EMPTY).then((ok) => {
                    if (ok) editBuffer.saved = editBuffer.value;
                    return ok;
                }),
            revert: () => {
                editBuffer.value = editBuffer.saved;
            },
        });
    }, []);

    useEffect(() => {
        if (editBuffer.value !== null) return;
        let cancelled = false;
        void getStateDirect(`${NS}.config.announcements`).then((st) => {
            if (cancelled || editBuffer.value !== null) return;
            const parsed = parseAnnouncementConfig(st?.val);
            editBuffer.saved = parsed;
            editBuffer.value = parsed;
            resyncHistoryKey(CONFIG_KEY);
            bump((n) => n + 1);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const config = editBuffer.value ?? EMPTY;
    const rules = config.rules;
    const editing = rules.find((r) => r.id === editingId) ?? null;

    const updateRule = (next: AnnouncementRule) =>
        commit({ ...config, rules: rules.map((r) => (r.id === next.id ? next : r)) });

    const handleAdd = () => {
        const name = newName.trim();
        if (!name) return;
        const rule = newRule(name);
        commit({ ...config, rules: [...rules, rule] });
        setNewName('');
        setAdding(false);
        setEditingId(rule.id);
    };

    const copyRule = (rule: AnnouncementRule) => {
        const copy: AnnouncementRule = {
            ...structuredClone(rule),
            id: `ann-${Date.now().toString(36)}`,
            name: `${rule.name} (Kopie)`,
        };
        const at = rules.findIndex((r) => r.id === rule.id) + 1;
        commit({ ...config, rules: [...rules.slice(0, at), copy, ...rules.slice(at)] });
        setEditingId(copy.id);
    };

    return (
        <div className={`${ADMIN_PAGE_PAD} space-y-6`} data-aura-admin-announcements="">
            <div>
                <AdminPageTitle>Ansagen</AdminPageTitle>
                <AdminPageSubtitle>
                    Datenpunkt + Bedingung → Text → Geräte. Sprachausgabe ohne Skript.{' '}
                    <a
                        href={docsUrl('anleitungen/sprachausgabe#ansagen-ohne-skript')}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent)' }}
                    >
                        Anleitung
                    </a>
                </AdminPageSubtitle>
            </div>

            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Regeln
                    </h2>
                    {!adding && (
                        <button
                            onClick={() => {
                                setAdding(true);
                                setNewName('');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Plus size={13} /> Ansage hinzufügen
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    {adding && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={cardStyle}>
                            <input
                                autoFocus
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAdd();
                                    if (e.key === 'Escape') setAdding(false);
                                }}
                                placeholder="Name, z. B. Klingel"
                                className={inputCls}
                                style={inputStyle}
                            />
                            <button
                                onClick={handleAdd}
                                disabled={!newName.trim()}
                                className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
                                style={{ background: 'var(--accent)', color: '#fff' }}
                            >
                                <Check size={13} />
                            </button>
                            <button
                                onClick={() => setAdding(false)}
                                className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                                style={{ ...smallBtnStyle, color: 'var(--text-secondary)' }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    )}

                    {rules.length === 0 && !adding && (
                        <div
                            className="px-4 py-6 text-xs text-center rounded-xl"
                            style={{ ...cardStyle, color: 'var(--text-secondary)' }}
                        >
                            Noch keine Ansage angelegt. Beispiel: Klingel = true →{' '}
                            {'„Es hat an der Haustür geklingelt“'} auf dem Flurtablet.
                        </div>
                    )}

                    {rules.map((rule) => (
                        <div
                            key={rule.id}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl"
                            style={cardStyle}
                            data-aura-announcement={rule.id}
                        >
                            <button
                                onClick={() => updateRule({ ...rule, enabled: !rule.enabled })}
                                className="relative w-8 h-4 rounded-full shrink-0 transition-colors"
                                style={{ background: rule.enabled ? 'var(--accent)' : 'var(--app-border)' }}
                                title={rule.enabled ? 'Aktiv — klicken zum Deaktivieren' : 'Inaktiv'}
                            >
                                <span
                                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                                    style={{ left: rule.enabled ? 'calc(100% - 14px)' : '2px' }}
                                />
                            </button>
                            <div className="flex-1 min-w-0">
                                <div
                                    className="text-xs font-semibold truncate"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {rule.name}
                                </div>
                                <div className="text-[11px] truncate" style={labelStyle} title={rule.text}>
                                    {rule.text || '— kein Text —'}
                                </div>
                                <div
                                    className="text-[10px] font-mono truncate"
                                    style={labelStyle}
                                    title={rule.clause.datapoint}
                                >
                                    {rule.clause.datapoint || '— kein Datenpunkt —'}
                                    {!!rule.extraClauses?.length && (
                                        <span className="font-sans"> + {rule.extraClauses.length} weitere</span>
                                    )}
                                    <span className="font-sans"> · {ruleSummary(rule)}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingId(rule.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                                style={smallBtnStyle}
                            >
                                <Pencil size={11} /> Bearbeiten
                            </button>
                            <button
                                onClick={() => copyRule(rule)}
                                className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                                style={{ ...smallBtnStyle, color: 'var(--text-secondary)' }}
                                title="Kopieren"
                            >
                                <Copy size={11} />
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm(`Ansage "${rule.name}" löschen?`)) {
                                        commit({ ...config, rules: rules.filter((r) => r.id !== rule.id) });
                                    }
                                }}
                                className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                                style={{ ...smallBtnStyle, color: 'var(--accent-red)' }}
                                title="Löschen"
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>

                <p className="text-[11px] mt-2" style={labelStyle}>
                    Änderungen gelten nach dem Speichern. Die Ansage läuft über{' '}
                    <span className="font-mono">{NS}.speech.say</span> — Stummschaltung, Lautstärke und
                    Autoplay-Hinweise der Geräte gelten wie bei jeder anderen Ansage.
                </p>
            </section>

            {editing && <RuleEditModal rule={editing} onChange={updateRule} onClose={() => setEditingId(null)} />}
        </div>
    );
}
