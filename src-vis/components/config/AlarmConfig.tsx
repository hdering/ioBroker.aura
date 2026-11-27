/**
 * AlarmConfig — settings of the alarm widget (#1037).
 *
 * Data source: the ioBroker.alarm adapter (prefix) or own datapoints. Mode
 * buttons and zones are lists — maintained here (popup editor) or read from a
 * JSON datapoint, like the Auswahlfeld (#577). Elements without a datapoint are
 * greyed out with the reason instead of being hidden.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, Database, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type {
    AlarmContactDef,
    AlarmModeDef,
    AlarmPhase,
    AlarmStateMapEntry,
    AlarmZoneDef,
    WidgetConfig,
} from '../../types';
import { useT } from '../../i18n';
import { getObjectViewDirect, getStateDirect } from '../../hooks/useIoBroker';
import { usePinCodeStore, sortedCodes } from '../../store/pinCodeStore';
import { splitDpRef, extractJsonPath } from '../../utils/dpRef';
import { readCommonStates } from '../../utils/commonStates';
import { copyToClipboard } from '../../utils/clipboard';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { parseAlarmModesJson, parseAlarmZonesJson, type AlarmListResult } from '../../utils/alarmListJson';
import {
    ALARM_PHASES,
    ADAPTER_CODE_PHASE,
    ADAPTER_MODE_KEYS,
    ADAPTER_ZONE_KEYS,
    adapterModeDefaults,
    adapterTakeover,
    adapterZoneDefaults,
    guessPhase,
    manualModeDefaults,
    PHASE_INFO,
} from '../widgets/alarm/alarmModel';
import { ConfigSection, SubGroup } from './ConfigSection';
import { VisibleFieldsSection, type VisibleField } from './VisibleFieldsSection';
import { Unavailable } from './Unavailable';
import { ConfigModal } from './ConfigModal';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { ColorField } from './list/listFieldUi';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const cellCls = 'w-full text-[11px] rounded px-1.5 py-1 focus:outline-none';
const inputSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelSty: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

export const ALARM_MODES_JSON_EXAMPLE = `[
  { "key": "off",   "label": "Aus",      "icon": "ShieldOff", "disarm": true, "writeValue": "0" },
  { "key": "away",  "label": "Abwesend", "icon": "ShieldCheck", "writeValue": "1" },
  { "key": "night", "label": "Nacht",    "icon": "Moon", "color": "#6366f1", "writeValue": "2" }
]`;
export const ALARM_ZONES_JSON_EXAMPLE = `[
  { "key": "eg", "label": "Erdgeschoss", "onOffDp": "0_userdata.0.alarm.eg", "triggeredDp": "0_userdata.0.alarm.eg_alarm" },
  { "key": "og", "label": "Obergeschoss", "onOffDp": "0_userdata.0.alarm.og" }
]`;

// ── small building blocks ────────────────────────────────────────────────────

function Segment<K extends string>({
    value,
    options,
    onChange,
    testId,
}: {
    value: K;
    options: { key: K; label: string }[];
    onChange: (k: K) => void;
    testId?: string;
}) {
    return (
        <div
            className="inline-flex rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--app-border)' }}
            data-aura-segment={testId}
        >
            {options.map(({ key, label }) => {
                const active = value === key;
                return (
                    <button
                        key={key}
                        onClick={() => onChange(key)}
                        data-key={key}
                        className="text-[11px] px-2.5 py-1 transition-colors"
                        style={{
                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                        }}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

function Toggle({
    label,
    on,
    onChange,
    hint,
}: {
    label: string;
    on: boolean;
    onChange: (v: boolean) => void;
    hint?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
                <label className="text-[11px]" style={labelSty}>
                    {label}
                </label>
                {hint && (
                    <span className="text-[10px] opacity-60" style={labelSty}>
                        {hint}
                    </span>
                )}
            </div>
            <button
                onClick={() => onChange(!on)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: on ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

/** Datapoint input with picker button; `dense` for table cells. */
function DpInput({
    value,
    onChange,
    placeholder,
    dense,
    testId,
}: {
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
    dense?: boolean;
    testId?: string;
}) {
    const [picking, setPicking] = useState(false);
    return (
        <div className="flex gap-1 min-w-0">
            <input
                type="text"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value.trim() || undefined)}
                placeholder={placeholder}
                data-aura-dp={testId}
                className={`${dense ? cellCls : inputCls} flex-1 min-w-0 font-mono`}
                style={inputSty}
            />
            <button
                onClick={() => setPicking(true)}
                className="px-1.5 rounded-lg hover:opacity-80 shrink-0"
                style={{ ...inputSty, color: 'var(--text-secondary)' }}
                title="Aus ioBroker wählen"
            >
                <Database size={dense ? 11 : 13} />
            </button>
            {picking && (
                <DatapointPicker
                    currentValue={value ?? ''}
                    onSelect={(id) => onChange(id || undefined)}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}

function DpField({
    label,
    hint,
    value,
    onChange,
    testId,
    children,
}: {
    label: string;
    hint?: string;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    testId?: string;
    children?: ReactNode;
}) {
    return (
        <div>
            <label className={labelCls} style={labelSty}>
                {label}
            </label>
            <DpInput value={value} onChange={onChange} testId={testId} placeholder="0_userdata.0.alarm.…" />
            {children}
            {hint && (
                <p className="text-[10px] mt-1" style={hintSty}>
                    {hint}
                </p>
            )}
        </div>
    );
}

function ValueField({
    label,
    value,
    onChange,
    placeholder = 'true',
}: {
    label: string;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
}) {
    return (
        <div className="flex items-center gap-2 mt-1">
            <label className="text-[10px] shrink-0" style={labelSty}>
                {label}
            </label>
            <input
                type="text"
                value={value ?? ''}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
                className={`${cellCls} font-mono`}
                style={inputSty}
            />
        </div>
    );
}

function IconButton({ icon, onChange }: { icon: string | undefined; onChange: (v: string | undefined) => void }) {
    const [open, setOpen] = useState(false);
    const Icon = getWidgetIcon(icon || 'ShieldCheck', null);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="w-7 h-7 rounded flex items-center justify-center shrink-0 hover:opacity-80"
                style={{ ...inputSty, opacity: icon ? 1 : 0.5 }}
                title={icon || 'Icon'}
            >
                <Icon size={14} />
            </button>
            {open && (
                <IconPickerModal
                    current={icon ?? ''}
                    onSelect={(n) => {
                        onChange(n || undefined);
                        setOpen(false);
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

function RowTools({
    index,
    count,
    onMove,
    onRemove,
    hidden,
    onToggleHidden,
}: {
    index: number;
    count: number;
    onMove: (from: number, to: number) => void;
    onRemove?: () => void;
    hidden?: boolean;
    onToggleHidden?: () => void;
}) {
    const btn = 'p-1 rounded hover:opacity-80 disabled:opacity-30';
    return (
        <div className="flex items-center gap-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {onToggleHidden && (
                <button className={btn} onClick={onToggleHidden} title={hidden ? 'Einblenden' : 'Ausblenden'}>
                    {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
            )}
            <button className={btn} disabled={index === 0} onClick={() => onMove(index, index - 1)} title="Nach oben">
                <ArrowUp size={12} />
            </button>
            <button
                className={btn}
                disabled={index === count - 1}
                onClick={() => onMove(index, index + 1)}
                title="Nach unten"
            >
                <ArrowDown size={12} />
            </button>
            {onRemove && (
                <button className={btn} onClick={onRemove} title="Entfernen" style={{ color: '#ef4444' }}>
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    return next;
}

function uniqueKey(base: string, taken: string[]): string {
    let k = base;
    let i = 2;
    while (taken.includes(k)) k = `${base}${i++}`;
    return k;
}

// ── modes editor (popup) ─────────────────────────────────────────────────────

function ModesEditor({
    modes,
    manual,
    onChange,
}: {
    modes: AlarmModeDef[];
    manual: boolean;
    onChange: (m: AlarmModeDef[]) => void;
}) {
    const t = useT();
    const patch = (i: number, p: Partial<AlarmModeDef>) =>
        onChange(modes.map((m, j) => (j === i ? { ...m, ...p } : m)));
    const fixed = (k: string) => !manual && ADAPTER_MODE_KEYS.includes(k);
    return (
        <div className="space-y-2" data-aura-alarm-modes-editor="">
            {!manual && (
                <p className="text-[10px]" style={hintSty}>
                    {t('alarm.cfg.modes.adapterHint') as string}
                </p>
            )}
            {modes.map((m, i) => (
                <div
                    key={i}
                    className="rounded-lg p-2 space-y-1.5"
                    style={{ border: '1px solid var(--app-border)', opacity: m.hidden ? 0.55 : 1 }}
                    data-aura-alarm-mode-row={m.key}
                >
                    <div className="flex items-center gap-1.5">
                        <IconButton icon={m.icon} onChange={(icon) => patch(i, { icon })} />
                        <input
                            type="text"
                            value={m.label ?? ''}
                            placeholder={fixed(m.key) ? (t(`alarm.mode.${m.key}` as never) as string) : m.key}
                            onChange={(e) => patch(i, { label: e.target.value || undefined })}
                            className={cellCls}
                            style={inputSty}
                            data-aura-field="label"
                        />
                        <RowTools
                            index={i}
                            count={modes.length}
                            onMove={(a, b) => onChange(moveItem(modes, a, b))}
                            hidden={m.hidden}
                            onToggleHidden={() => patch(i, { hidden: m.hidden ? undefined : true })}
                            onRemove={manual ? () => onChange(modes.filter((_, j) => j !== i)) : undefined}
                        />
                    </div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
                        <ColorField
                            label="Farbe"
                            value={m.color}
                            fallback="#3b82f6"
                            onChange={(color) => patch(i, { color })}
                        />
                        <div>
                            <label className="text-[9px] block mb-0.5" style={labelSty}>
                                key
                            </label>
                            <input
                                type="text"
                                value={m.key}
                                disabled={!manual}
                                onChange={(e) =>
                                    patch(i, {
                                        key:
                                            e.target.value.trim() ||
                                            uniqueKey(
                                                'mode',
                                                modes.map((x) => x.key),
                                            ),
                                    })
                                }
                                className={`${cellCls} font-mono`}
                                style={{ ...inputSty, opacity: manual ? 1 : 0.55 }}
                                data-aura-field="key"
                            />
                        </div>
                    </div>
                    <Unavailable reason={manual ? undefined : (t('alarm.cfg.modes.adapterFixed') as string)}>
                        <div className="space-y-1">
                            <label className="text-[9px] block" style={labelSty}>
                                {t('alarm.cfg.mode.writeDp') as string}
                            </label>
                            <DpInput
                                dense
                                value={m.writeDp}
                                onChange={(writeDp) => patch(i, { writeDp })}
                                placeholder={t('alarm.cfg.mode.writeDpPh') as string}
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                                <ValueField
                                    label={t('alarm.cfg.mode.writeValue') as string}
                                    value={m.writeValue}
                                    placeholder={m.key}
                                    onChange={(writeValue) => patch(i, { writeValue })}
                                />
                                <ValueField
                                    label={t('alarm.cfg.mode.activeWhen') as string}
                                    value={m.activeWhen}
                                    placeholder={m.activeDp ? 'true' : (m.writeValue ?? m.key)}
                                    onChange={(activeWhen) => patch(i, { activeWhen })}
                                />
                            </div>
                            <label className="text-[9px] block" style={labelSty}>
                                {t('alarm.cfg.mode.activeDp') as string}
                            </label>
                            <DpInput
                                dense
                                value={m.activeDp}
                                onChange={(activeDp) => patch(i, { activeDp })}
                                placeholder={t('alarm.cfg.mode.activeDpPh') as string}
                                testId={`activeDp-${m.key}`}
                            />
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] shrink-0" style={labelSty}>
                                    {t('alarm.cfg.mode.phase') as string}
                                </label>
                                <select
                                    value={m.phase ?? ''}
                                    onChange={(e) =>
                                        patch(i, { phase: (e.target.value || undefined) as AlarmPhase | undefined })
                                    }
                                    className={cellCls}
                                    style={inputSty}
                                >
                                    <option value="">
                                        {t(m.disarm ? 'alarm.state.deactivated' : 'alarm.state.sharp') as string} (
                                        {t('alarm.cfg.mode.pin.auto') as string})
                                    </option>
                                    {ALARM_PHASES.map((p) => (
                                        <option key={p} value={p}>
                                            {t(PHASE_INFO[p].labelKey) as string}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-3 pt-0.5">
                                <label className="flex items-center gap-1 text-[10px]" style={labelSty}>
                                    <input
                                        type="checkbox"
                                        checked={m.disarm === true}
                                        onChange={(e) => patch(i, { disarm: e.target.checked || undefined })}
                                    />
                                    {t('alarm.cfg.mode.disarm') as string}
                                </label>
                                <label className="flex items-center gap-1 text-[10px]" style={labelSty}>
                                    {t('alarm.cfg.mode.pin') as string}
                                    <select
                                        value={m.requirePin === undefined ? '' : m.requirePin ? 'yes' : 'no'}
                                        onChange={(e) =>
                                            patch(i, {
                                                requirePin:
                                                    e.target.value === '' ? undefined : e.target.value === 'yes',
                                            })
                                        }
                                        className="text-[10px] rounded px-1 py-0.5"
                                        style={inputSty}
                                    >
                                        <option value="">{t('alarm.cfg.mode.pin.auto') as string}</option>
                                        <option value="yes">{t('alarm.cfg.mode.pin.yes') as string}</option>
                                        <option value="no">{t('alarm.cfg.mode.pin.no') as string}</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </Unavailable>
                </div>
            ))}
            {manual && (
                <button
                    onClick={() =>
                        onChange([
                            ...modes,
                            {
                                key: uniqueKey(
                                    'mode',
                                    modes.map((m) => m.key),
                                ),
                                label: '',
                            },
                        ])
                    }
                    className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 hover:opacity-80"
                    style={{ ...inputSty, color: 'var(--text-secondary)' }}
                    data-aura-add="mode"
                >
                    <Plus size={12} /> {t('alarm.cfg.modes.add') as string}
                </button>
            )}
        </div>
    );
}

// ── zones editor (popup) ─────────────────────────────────────────────────────

function ZonesEditor({
    zones,
    manual,
    onChange,
}: {
    zones: AlarmZoneDef[];
    manual: boolean;
    onChange: (z: AlarmZoneDef[]) => void;
}) {
    const t = useT();
    const patch = (i: number, p: Partial<AlarmZoneDef>) =>
        onChange(zones.map((z, j) => (j === i ? { ...z, ...p } : z)));
    return (
        <div className="space-y-2" data-aura-alarm-zones-editor="">
            {!manual && (
                <p className="text-[10px]" style={hintSty}>
                    {t('alarm.cfg.zones.adapterHint') as string}
                </p>
            )}
            {zones.map((z, i) => (
                <div
                    key={i}
                    className="rounded-lg p-2 space-y-1.5"
                    style={{ border: '1px solid var(--app-border)', opacity: z.hidden ? 0.55 : 1 }}
                    data-aura-alarm-zone-row={z.key}
                >
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={z.label ?? ''}
                            placeholder={
                                !manual && ADAPTER_ZONE_KEYS.includes(z.key)
                                    ? (t(`alarm.zone.${z.key}` as never) as string)
                                    : z.key
                            }
                            onChange={(e) => patch(i, { label: e.target.value || undefined })}
                            className={cellCls}
                            style={inputSty}
                            data-aura-field="label"
                        />
                        <RowTools
                            index={i}
                            count={zones.length}
                            onMove={(a, b) => onChange(moveItem(zones, a, b))}
                            hidden={z.hidden}
                            onToggleHidden={() => patch(i, { hidden: z.hidden ? undefined : true })}
                            onRemove={manual ? () => onChange(zones.filter((_, j) => j !== i)) : undefined}
                        />
                    </div>
                    <Unavailable reason={manual ? undefined : (t('alarm.cfg.zones.adapterFixed') as string)}>
                        <div className="space-y-1">
                            <label className="text-[9px] block" style={labelSty}>
                                {t('alarm.cfg.zone.onOffDp') as string}
                            </label>
                            <DpInput dense value={z.onOffDp} onChange={(onOffDp) => patch(i, { onOffDp })} />
                            <label className="text-[9px] block" style={labelSty}>
                                {t('alarm.cfg.zone.triggeredDp') as string}
                            </label>
                            <DpInput
                                dense
                                value={z.triggeredDp}
                                onChange={(triggeredDp) => patch(i, { triggeredDp })}
                            />
                        </div>
                    </Unavailable>
                </div>
            ))}
            {manual && (
                <button
                    onClick={() => {
                        const key = uniqueKey(
                            'zone',
                            zones.map((z) => z.key),
                        );
                        onChange([...zones, { key, label: `Zone ${zones.length + 1}` }]);
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 hover:opacity-80"
                    style={{ ...inputSty, color: 'var(--text-secondary)' }}
                    data-aura-add="zone"
                >
                    <Plus size={12} /> {t('alarm.cfg.zones.add') as string}
                </button>
            )}
        </div>
    );
}

// ── JSON source (modes / zones) ──────────────────────────────────────────────

function JsonListSource<T extends { key: string; label?: string }>({
    dp,
    onDpChange,
    parse,
    example,
    describe,
    onTakeOver,
    testId,
}: {
    dp: string;
    onDpChange: (dp: string | undefined) => void;
    parse: (raw: unknown) => AlarmListResult<T>;
    example: string;
    describe: (item: T) => string;
    onTakeOver: (items: T[]) => void;
    testId: string;
}) {
    const t = useT();
    const [preview, setPreview] = useState<(AlarmListResult<T> & { error?: string }) | null>(null);
    const [showExample, setShowExample] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const { id, path } = splitDpRef(dp);
        if (!id) {
            setPreview(null);
            return;
        }
        void (async () => {
            try {
                const state = await getStateDirect(id);
                if (cancelled) return;
                if (!state) {
                    setPreview({
                        items: [],
                        rejected: [],
                        invalid: true,
                        error: t('alarm.cfg.json.unreadable') as string,
                    });
                    return;
                }
                setPreview(parse(path ? extractJsonPath(state.val, path) : state.val));
            } catch {
                if (!cancelled)
                    setPreview({
                        items: [],
                        rejected: [],
                        invalid: true,
                        error: t('alarm.cfg.json.unreadable') as string,
                    });
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dp]);

    return (
        <div className="space-y-1.5" data-aura-alarm-json={testId}>
            <DpInput value={dp} onChange={onDpChange} placeholder="0_userdata.0.alarm.config" testId={testId} />
            {preview && (
                <div className="text-[10px] space-y-0.5" data-aura-alarm-preview={testId}>
                    {preview.error || preview.invalid ? (
                        <div style={{ color: '#f59e0b' }}>
                            {preview.error ?? (t('alarm.cfg.json.invalid') as string)}
                        </div>
                    ) : (
                        <div style={labelSty}>
                            {t('alarm.cfg.json.found', { n: preview.items.length }) as string}
                            {preview.items.length > 0 && (
                                <span style={{ opacity: 0.75 }}>
                                    {' · '}
                                    {preview.items.slice(0, 6).map(describe).join(', ')}
                                    {preview.items.length > 6 ? ' …' : ''}
                                </span>
                            )}
                        </div>
                    )}
                    {preview.rejected.map((r, i) => (
                        <div key={i} style={{ color: '#f59e0b' }} data-aura-rejected="">
                            {t('alarm.cfg.json.rejected', { row: r.row, reason: r.reason }) as string}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    onClick={() => setShowExample((v) => !v)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                    style={{ ...inputSty, color: 'var(--text-secondary)' }}
                >
                    {t('alarm.cfg.json.example') as string}
                </button>
                <button
                    onClick={() => preview && onTakeOver(preview.items)}
                    disabled={!preview || preview.items.length === 0}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80 disabled:opacity-40"
                    style={{ ...inputSty, color: 'var(--text-secondary)' }}
                    data-aura-takeover={testId}
                >
                    {t('alarm.cfg.json.takeOver') as string}
                </button>
            </div>
            {showExample && (
                <div className="rounded-lg p-2 space-y-1" style={{ ...inputSty, color: 'var(--text-secondary)' }}>
                    <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto m-0">{example}</pre>
                    <button
                        onClick={() => copyToClipboard(example)}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 flex items-center gap-1"
                        style={inputSty}
                    >
                        <Copy size={10} /> {t('alarm.cfg.json.copy') as string}
                    </button>
                    <p className="text-[10px] m-0" style={{ opacity: 0.8 }}>
                        {t('alarm.cfg.json.alsoAllowed') as string}
                    </p>
                </div>
            )}
        </div>
    );
}

/** One list (modes or zones): source switch, popup button or JSON source. */
function ListSection({
    title,
    sectionKey,
    fromJson,
    onSource,
    count,
    editorTitle,
    renderEditor,
    json,
}: {
    title: string;
    sectionKey: string;
    fromJson: boolean;
    onSource: (s: 'list' | 'json') => void;
    count: number;
    editorTitle: string;
    renderEditor: () => ReactNode;
    json: ReactNode;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    return (
        <ConfigSection title={title} sectionKey={sectionKey}>
            <Segment
                value={fromJson ? 'json' : 'list'}
                options={[
                    { key: 'list', label: t('alarm.cfg.source.list') as string },
                    { key: 'json', label: t('alarm.cfg.source.json') as string },
                ]}
                onChange={onSource}
                testId={sectionKey}
            />
            {fromJson ? (
                json
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="w-full text-xs px-3 py-2 rounded-lg hover:opacity-80 text-left"
                    style={{ ...inputSty }}
                    data-aura-open-editor={sectionKey}
                >
                    {editorTitle} <span style={labelSty}>({count})</span>
                </button>
            )}
            {open && (
                <ConfigModal
                    title={editorTitle}
                    maxWidth={560}
                    padded
                    storageKey={`aura-alarm-${sectionKey}`}
                    onClose={() => setOpen(false)}
                >
                    {renderEditor()}
                </ConfigModal>
            )}
        </ConfigSection>
    );
}

// ── state map ────────────────────────────────────────────────────────────────

function StateMapEditor({
    map,
    stateDp,
    onChange,
}: {
    map: AlarmStateMapEntry[];
    stateDp: string;
    onChange: (m: AlarmStateMapEntry[] | undefined) => void;
}) {
    const t = useT();
    const [busy, setBusy] = useState(false);
    const set = (next: AlarmStateMapEntry[]) => onChange(next.length ? next : undefined);
    const patch = (i: number, p: Partial<AlarmStateMapEntry>) => set(map.map((r, j) => (j === i ? { ...r, ...p } : r)));
    const presets: { key: string; label: string; rows: AlarmStateMapEntry[] }[] = [
        {
            key: 'bool',
            label: t('alarm.cfg.stateMap.preset.bool') as string,
            rows: [
                { value: 'false', phase: 'off' },
                { value: 'true', phase: 'armed' },
            ],
        },
        {
            key: '012',
            label: t('alarm.cfg.stateMap.preset.012') as string,
            rows: [
                { value: '0', phase: 'off' },
                { value: '1', phase: 'armed' },
                { value: '2', phase: 'triggered' },
            ],
        },
        {
            key: 'adapter',
            label: t('alarm.cfg.stateMap.preset.adapter') as string,
            rows: Object.entries(ADAPTER_CODE_PHASE).map(([value, phase]) => ({ value, phase })),
        },
    ];
    const fromStates = async () => {
        if (!stateDp) return;
        setBusy(true);
        try {
            const states = await readCommonStates(stateDp);
            if (states)
                set(Object.entries(states).map(([value, label]) => ({ value, label, phase: guessPhase(label) })));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-1.5" data-aura-alarm-statemap="">
            <label className={labelCls} style={labelSty}>
                {t('alarm.cfg.stateMap') as string}
            </label>
            <div className="flex flex-wrap gap-1">
                {presets.map((p) => (
                    <button
                        key={p.key}
                        onClick={() => set(p.rows)}
                        className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                        style={{ ...inputSty, color: 'var(--text-secondary)' }}
                        data-aura-preset={p.key}
                    >
                        {p.label}
                    </button>
                ))}
                <button
                    onClick={fromStates}
                    disabled={!stateDp || busy}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80 disabled:opacity-40"
                    style={{ ...inputSty, color: 'var(--text-secondary)' }}
                >
                    {t('alarm.cfg.stateMap.fromStates') as string}
                </button>
            </div>
            {map.map((r, i) => (
                <div key={i} className="flex items-center gap-1">
                    <input
                        type="text"
                        value={r.value}
                        onChange={(e) => patch(i, { value: e.target.value })}
                        className={`${cellCls} font-mono`}
                        style={{ ...inputSty, width: 70, flex: 'none' }}
                        placeholder={t('alarm.cfg.stateMap.value') as string}
                    />
                    <select
                        value={r.phase}
                        onChange={(e) => patch(i, { phase: e.target.value as AlarmPhase })}
                        className={cellCls}
                        style={{ ...inputSty, width: 120, flex: 'none', color: PHASE_INFO[r.phase]?.color }}
                    >
                        {ALARM_PHASES.map((p) => (
                            <option key={p} value={p}>
                                {t(PHASE_INFO[p].labelKey) as string}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={r.label ?? ''}
                        onChange={(e) => patch(i, { label: e.target.value || undefined })}
                        className={cellCls}
                        style={inputSty}
                        placeholder={t('alarm.cfg.stateMap.label') as string}
                    />
                    <button
                        onClick={() => set(map.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:opacity-80 shrink-0"
                        style={{ color: '#ef4444' }}
                        title="Entfernen"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                onClick={() => set([...map, { value: '', phase: 'off' }])}
                className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 hover:opacity-80"
                style={{ ...inputSty, color: 'var(--text-secondary)' }}
            >
                <Plus size={11} /> {t('alarm.cfg.stateMap.add') as string}
            </button>
            <p className="text-[10px]" style={hintSty}>
                {t('alarm.cfg.stateMap.hint') as string}
            </p>
        </div>
    );
}

function ContactsEditor({
    contacts,
    onChange,
}: {
    contacts: AlarmContactDef[];
    onChange: (c: AlarmContactDef[] | undefined) => void;
}) {
    const t = useT();
    const set = (next: AlarmContactDef[]) => onChange(next.length ? next : undefined);
    return (
        <div className="space-y-1" data-aura-alarm-contacts="">
            <label className={labelCls} style={labelSty}>
                {t('alarm.cfg.contacts') as string}
            </label>
            {contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                    <input
                        type="text"
                        value={c.name ?? ''}
                        onChange={(e) =>
                            set(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value || undefined } : x)))
                        }
                        className={cellCls}
                        style={{ ...inputSty, width: 110, flex: 'none' }}
                        placeholder={t('alarm.cfg.contacts.name') as string}
                    />
                    <div className="flex-1 min-w-0">
                        <DpInput
                            dense
                            value={c.dp}
                            onChange={(dp) => set(contacts.map((x, j) => (j === i ? { ...x, dp: dp ?? '' } : x)))}
                        />
                    </div>
                    <button
                        onClick={() => set(contacts.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:opacity-80 shrink-0"
                        style={{ color: '#ef4444' }}
                        title="Entfernen"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                onClick={() => set([...contacts, { dp: '' }])}
                className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 hover:opacity-80"
                style={{ ...inputSty, color: 'var(--text-secondary)' }}
            >
                <Plus size={11} /> {t('alarm.cfg.contacts.add') as string}
            </button>
        </div>
    );
}

/** Adapter mode: the alarm instances found — or the hint that there is none (#1037). */
function AdapterInstances({
    prefix,
    onPick,
    onManual,
}: {
    prefix: string;
    onPick: (p: string) => void;
    onManual: () => void;
}) {
    const t = useT();
    const [list, setList] = useState<string[] | null>(null);
    useEffect(() => {
        let alive = true;
        const start = 'system.adapter.alarm.';
        void getObjectViewDirect('instance', start, `${start}\u9999`).then((view) => {
            if (!alive) return;
            setList(
                (view.rows ?? [])
                    .map((row) => row.id.replace(/^system\.adapter\./, ''))
                    .filter((id) => /^alarm\.\d+$/.test(id))
                    .sort(),
            );
        });
        return () => {
            alive = false;
        };
    }, []);
    if (list === null) return null;
    if (list.length === 0)
        return (
            <div
                className="rounded-lg p-2 mb-2 space-y-1.5 text-[11px]"
                style={{ border: '1px solid #f59e0b66', background: '#f59e0b14', color: 'var(--text-secondary)' }}
                data-aura-alarm-no-instance=""
            >
                <div>{t('alarm.cfg.noInstance') as string}</div>
                <button
                    onClick={onManual}
                    className="text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
                    style={{ ...inputSty, color: 'var(--text-primary)' }}
                >
                    {t('alarm.cfg.useManual') as string}
                </button>
            </div>
        );
    if (list.length === 1 && list[0] === prefix) return null;
    return (
        <div className="flex flex-wrap items-center gap-1 mb-2" data-aura-alarm-instances="">
            <span className="text-[10px]" style={labelSty}>
                {t('alarm.cfg.instances') as string}
            </span>
            {list.map((id) => (
                <button
                    key={id}
                    onClick={() => onPick(id)}
                    className="text-[10px] px-2 py-0.5 rounded-lg font-mono hover:opacity-80"
                    style={{
                        ...inputSty,
                        background: id === prefix ? 'var(--accent)' : 'var(--app-bg)',
                        color: id === prefix ? '#fff' : 'var(--text-secondary)',
                    }}
                >
                    {id}
                </button>
            ))}
        </div>
    );
}

/**
 * Named PIN of the vault for pinCheck "aura": pick one or create one. Only the id is
 * stored in the widget; name and code stay in the vault (Layouts › Zugriffsschutz).
 */
function NamedPinField({ value, onChange }: { value: string | undefined; onChange: (id: string | undefined) => void }) {
    const t = useT();
    const codes = usePinCodeStore((st) => st.codes);
    const loaded = usePinCodeStore((st) => st.loaded);
    const load = usePinCodeStore((st) => st.load);
    const save = usePinCodeStore((st) => st.save);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [digits, setDigits] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!loaded) void load();
    }, [loaded, load]);
    const create = async () => {
        if (digits.trim().length < 4) {
            setError(t('pin.tooShort') as string);
            return;
        }
        const res = await save({ name: name.trim() || (t('alarm.title') as string), pin: digits.trim() });
        if (!res.ok) {
            setError((res.reason === 'tooShort' ? t('pin.tooShort') : t('pin.saveFailed')) as string);
            return;
        }
        onChange(res.id);
        setCreating(false);
        setName('');
        setDigits('');
        setError('');
    };
    const missing = !!value && loaded && !codes[value];
    return (
        <div className="space-y-1.5" data-aura-alarm-named-pin="">
            <label className={labelCls} style={labelSty}>
                {t('alarm.cfg.pinCode') as string}
            </label>
            <select
                value={creating ? '__new' : (value ?? '')}
                onChange={(e) => {
                    const v = e.target.value;
                    setError('');
                    if (v === '__new') {
                        setCreating(true);
                        return;
                    }
                    setCreating(false);
                    onChange(v || undefined);
                }}
                className={inputCls}
                style={inputSty}
            >
                <option value="">{t('alarm.cfg.pinCode.none') as string}</option>
                {sortedCodes(codes).map(([id, c]) => (
                    <option key={id} value={id}>
                        {c.name} ({c.len})
                    </option>
                ))}
                {missing && <option value={value}>{t('alarm.cfg.pinCode.missing') as string}</option>}
                <option value="__new">{t('alarm.cfg.pinCode.new') as string}</option>
            </select>
            {creating && (
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('alarm.cfg.pinCode.name') as string}
                        className={cellCls}
                        style={inputSty}
                    />
                    <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={digits}
                        onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
                        placeholder={t('alarm.cfg.pinCode.digits') as string}
                        className={`${cellCls} font-mono`}
                        style={{ ...inputSty, width: 110, flex: 'none' }}
                    />
                    <button
                        onClick={() => void create()}
                        className="text-[11px] px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        {t('alarm.cfg.pinCode.create') as string}
                    </button>
                </div>
            )}
            {error && (
                <p className="text-[10px]" style={{ color: '#ef4444' }}>
                    {error}
                </p>
            )}
            {missing && (
                <p className="text-[10px]" style={{ color: '#f59e0b' }}>
                    {t('alarm.cfg.pinCode.missingHint') as string}
                </p>
            )}
            <p className="text-[10px]" style={hintSty}>
                {t('alarm.cfg.pinCode.hint') as string}
            </p>
        </div>
    );
}

// ── panel ────────────────────────────────────────────────────────────────────

export function AlarmConfig({
    config,
    onConfigChange,
}: {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);

    const manual = o.sourceMode === 'manual';
    const prefix = (o.alarmPrefix as string) ?? 'alarm.0';
    const logLines = (o.logLines as number) ?? 5;
    const sizeScale = (o.sizeScale as number) ?? 1;
    const pinCheck = o.pinCheck === 'dp' || o.pinCheck === 'aura' ? o.pinCheck : 'none';
    const pinPossible = !manual || (pinCheck === 'dp' && !!s('pinDp')) || (pinCheck === 'aura' && !!s('pinCode'));
    const modesFromJson = o.modesSource === 'json';
    const zonesFromJson = o.zonesSource === 'json';
    const contacts = (o.contacts as AlarmContactDef[] | undefined) ?? [];

    // Lists as the editor shows them: adapter mode always lists the fixed keys.
    const legacyHidden = (k: string) =>
        o[{ off: 'showModeOff', sharp: 'showModeSharp', inside: 'showModeInside', night: 'showModeNight' }[k] ?? ''] ===
        false;
    const storedModes = (o.modes as AlarmModeDef[] | undefined) ?? [];
    const modesForEditor: AlarmModeDef[] = manual
        ? storedModes
        : [
              ...storedModes.filter((m) => ADAPTER_MODE_KEYS.includes(m.key)),
              ...adapterModeDefaults().filter((d) => !storedModes.some((m) => m.key === d.key)),
          ].map((m) => (m.hidden === undefined && legacyHidden(m.key) ? { ...m, hidden: true } : m));
    const storedZones = (o.zones as AlarmZoneDef[] | undefined) ?? [];
    const zonesForEditor: AlarmZoneDef[] = manual
        ? storedZones
        : [
              ...storedZones.filter((z) => ADAPTER_ZONE_KEYS.includes(z.key)),
              ...adapterZoneDefaults().filter((d) => !storedZones.some((z) => z.key === d.key)),
          ];

    const noDp = t('alarm.cfg.noDp') as string;
    const need = (has: boolean) => (manual && !has ? noDp : undefined);
    const zonesAvailable = zonesFromJson ? !!s('zonesDp') : !manual || storedZones.length > 0;

    const fields: VisibleField[] = [
        { key: 'showHeader', label: t('alarm.cfg.showHeader') as string },
        { key: 'showModes', label: t('alarm.cfg.showModes') as string },
        { key: 'showDelay', label: t('alarm.cfg.showDelay') as string, disabledReason: need(!!s('delayDp')) },
        {
            key: 'showCountdown',
            label: t('alarm.cfg.showCountdown') as string,
            disabledReason: need(!!s('countdownDp') || !!s('silentCountdownDp')),
        },
        {
            key: 'showCircuits',
            label: t('alarm.cfg.showCircuits') as string,
            disabledReason: need(!!s('circuitsDp') || !!s('noticeDp') || contacts.length > 0),
        },
        {
            key: 'showZones',
            label: t('alarm.cfg.showZones') as string,
            disabledReason: zonesAvailable ? undefined : (t('alarm.cfg.noZones') as string),
        },
        {
            key: 'showLog',
            label: t('alarm.cfg.showLog') as string,
            disabledReason: need(!!s('logDp')),
            children: (
                <div>
                    <label className="text-[11px] mb-1 flex items-center justify-between" style={labelSty}>
                        <span>{t('alarm.cfg.logLines') as string}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{logLines}</span>
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={20}
                        step={1}
                        value={logLines}
                        onChange={(e) => set({ logLines: Number(e.target.value) })}
                        className="w-full"
                    />
                </div>
            ),
        },
        {
            key: 'showPanic',
            label: t('alarm.cfg.showPanic') as string,
            def: false,
            hint: t('alarm.cfg.showPanic.hint') as string,
            disabledReason: need(!!s('panicDp')),
        },
        {
            key: 'showPresence',
            label: t('alarm.cfg.showPresence') as string,
            def: false,
            disabledReason: need(!!s('presenceDp')),
        },
    ];

    const switchSource = (next: 'adapter' | 'manual') => {
        if (next === (manual ? 'manual' : 'adapter')) return;
        const patch: Record<string, unknown> = { sourceMode: next };
        // A manual list needs write values; adapter-style rows (only overrides) would write their keys.
        if (next === 'manual' && !storedModes.some((m) => m.writeDp || m.writeValue))
            patch.modes = manualModeDefaults();
        if (next === 'manual' && storedZones.every((z) => ADAPTER_ZONE_KEYS.includes(z.key) && !z.onOffDp))
            patch.zones = undefined;
        if (next === 'adapter') {
            patch.modes = storedModes.filter((m) => ADAPTER_MODE_KEYS.includes(m.key));
            patch.zones = storedZones.filter((z) => ADAPTER_ZONE_KEYS.includes(z.key));
        }
        set(patch);
    };

    return (
        <>
            <VisibleFieldsSection fields={fields} values={o} onChange={set} />

            <ConfigSection title={t('alarm.cfg.section.source') as string} sectionKey="datapoints">
                <Segment
                    value={manual ? 'manual' : 'adapter'}
                    options={[
                        { key: 'adapter', label: t('alarm.cfg.source.adapter') as string },
                        { key: 'manual', label: t('alarm.cfg.source.manual') as string },
                    ]}
                    onChange={switchSource}
                    testId="source"
                />
                {!manual ? (
                    <div>
                        <AdapterInstances
                            prefix={prefix}
                            onPick={(p) => set({ alarmPrefix: p })}
                            onManual={() => switchSource('manual')}
                        />
                        <label className={labelCls} style={labelSty}>
                            {t('alarm.cfg.prefix') as string}
                        </label>
                        <input
                            type="text"
                            value={prefix}
                            onChange={(e) => set({ alarmPrefix: e.target.value || 'alarm.0' })}
                            placeholder="alarm.0"
                            className={`${inputCls} font-mono`}
                            style={inputSty}
                        />
                    </div>
                ) : (
                    <>
                        <button
                            onClick={() => set(adapterTakeover(prefix))}
                            className="text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
                            style={{ ...inputSty, color: 'var(--text-secondary)' }}
                            title={t('alarm.cfg.takeover.hint') as string}
                            data-aura-alarm-takeover=""
                        >
                            {t('alarm.cfg.takeover', { prefix }) as string}
                        </button>
                        <DpField
                            label={t('alarm.cfg.stateDp') as string}
                            hint={t('alarm.cfg.stateDp.hint') as string}
                            value={s('stateDp')}
                            onChange={(v) => set({ stateDp: v })}
                            testId="stateDp"
                        />
                        <StateMapEditor
                            map={(o.stateMap as AlarmStateMapEntry[] | undefined) ?? []}
                            stateDp={s('stateDp') ?? ''}
                            onChange={(m) => set({ stateMap: m })}
                        />

                        <SubGroup title={t('alarm.cfg.group.alarm') as string}>
                            <DpField
                                label={t('alarm.cfg.triggeredDp') as string}
                                hint={t('alarm.cfg.triggeredDp.hint') as string}
                                value={s('triggeredDp')}
                                onChange={(v) => set({ triggeredDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.sirenDp') as string}
                                value={s('sirenDp')}
                                onChange={(v) => set({ sirenDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.panicDp') as string}
                                value={s('panicDp')}
                                onChange={(v) => set({ panicDp: v })}
                            >
                                <ValueField
                                    label={t('alarm.cfg.writeValue') as string}
                                    value={s('panicValue')}
                                    onChange={(v) => set({ panicValue: v })}
                                />
                            </DpField>
                        </SubGroup>

                        <SubGroup title={t('alarm.cfg.group.arming') as string}>
                            <DpField
                                label={t('alarm.cfg.enableableDp') as string}
                                hint={t('alarm.cfg.enableableDp.hint') as string}
                                value={s('enableableDp')}
                                onChange={(v) => set({ enableableDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.delayDp') as string}
                                value={s('delayDp')}
                                onChange={(v) => set({ delayDp: v })}
                            >
                                <ValueField
                                    label={t('alarm.cfg.writeValue') as string}
                                    value={s('delayValue')}
                                    onChange={(v) => set({ delayValue: v })}
                                />
                            </DpField>
                            <DpField
                                label={t('alarm.cfg.countdownDp') as string}
                                value={s('countdownDp')}
                                onChange={(v) => set({ countdownDp: v })}
                            >
                                <div className="flex items-center gap-2 mt-1">
                                    <label className="text-[10px]" style={labelSty}>
                                        {t('alarm.cfg.countdownUnit') as string}
                                    </label>
                                    <select
                                        value={o.countdownUnit === 'endTs' ? 'endTs' : 's'}
                                        onChange={(e) => set({ countdownUnit: e.target.value })}
                                        className="text-[11px] rounded px-1.5 py-1"
                                        style={inputSty}
                                    >
                                        <option value="s">{t('alarm.cfg.countdownUnit.s') as string}</option>
                                        <option value="endTs">{t('alarm.cfg.countdownUnit.endTs') as string}</option>
                                    </select>
                                </div>
                            </DpField>
                            <DpField
                                label={t('alarm.cfg.silentCountdownDp') as string}
                                hint={t('alarm.cfg.silentCountdownDp.hint') as string}
                                value={s('silentCountdownDp')}
                                onChange={(v) => set({ silentCountdownDp: v })}
                            />
                            <ContactsEditor contacts={contacts} onChange={(c) => set({ contacts: c })} />
                            <Unavailable
                                reason={contacts.length ? undefined : (t('alarm.cfg.contacts.none') as string)}
                            >
                                <Toggle
                                    label={t('alarm.cfg.contactsBlockArm') as string}
                                    on={o.contactsBlockArm === true}
                                    onChange={(v) => set({ contactsBlockArm: v })}
                                />
                            </Unavailable>
                        </SubGroup>

                        <SubGroup title={t('alarm.cfg.group.notices') as string}>
                            <DpField
                                label={t('alarm.cfg.circuitsDp') as string}
                                hint={t('alarm.cfg.circuitsDp.hint') as string}
                                value={s('circuitsDp')}
                                onChange={(v) => set({ circuitsDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.noticeDp') as string}
                                hint={t('alarm.cfg.noticeDp.hint') as string}
                                value={s('noticeDp')}
                                onChange={(v) => set({ noticeDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.quitDp') as string}
                                value={s('quitDp')}
                                onChange={(v) => set({ quitDp: v })}
                            >
                                <ValueField
                                    label={t('alarm.cfg.writeValue') as string}
                                    value={s('quitValue')}
                                    onChange={(v) => set({ quitValue: v })}
                                />
                            </DpField>
                        </SubGroup>

                        <SubGroup title={t('alarm.cfg.group.more') as string}>
                            <DpField
                                label={t('alarm.cfg.presenceDp') as string}
                                value={s('presenceDp')}
                                onChange={(v) => set({ presenceDp: v })}
                            />
                            <DpField
                                label={t('alarm.cfg.logDp') as string}
                                value={s('logDp')}
                                onChange={(v) => set({ logDp: v })}
                            >
                                <div className="flex items-center gap-2 mt-1">
                                    <label className="text-[10px]" style={labelSty}>
                                        {t('alarm.cfg.logSeparator') as string}
                                    </label>
                                    <select
                                        value={(o.logSeparator as string) ?? 'br'}
                                        onChange={(e) => set({ logSeparator: e.target.value })}
                                        className="text-[11px] rounded px-1.5 py-1"
                                        style={inputSty}
                                    >
                                        <option value="br">&lt;br&gt;</option>
                                        <option value="newline">{t('alarm.cfg.logSeparator.newline') as string}</option>
                                        <option value="json">{t('alarm.cfg.logSeparator.json') as string}</option>
                                    </select>
                                </div>
                            </DpField>
                        </SubGroup>
                    </>
                )}
            </ConfigSection>

            <ListSection
                title={t('alarm.cfg.section.modes') as string}
                sectionKey="alarm-modes"
                fromJson={modesFromJson}
                onSource={(v) => set({ modesSource: v })}
                count={modesForEditor.filter((m) => !m.hidden).length}
                editorTitle={t('alarm.cfg.modes.edit') as string}
                renderEditor={() => (
                    <ModesEditor modes={modesForEditor} manual={manual} onChange={(m) => set({ modes: m })} />
                )}
                json={
                    <JsonListSource<AlarmModeDef>
                        dp={s('modesDp') ?? ''}
                        onDpChange={(v) => set({ modesDp: v })}
                        parse={parseAlarmModesJson}
                        example={ALARM_MODES_JSON_EXAMPLE}
                        describe={(m) => `${m.label ?? m.key}${m.writeValue !== undefined ? ` (${m.writeValue})` : ''}`}
                        onTakeOver={(items) => set({ modes: items, modesSource: 'list' })}
                        testId="modes"
                    />
                }
            />

            <ListSection
                title={t('alarm.cfg.section.zones') as string}
                sectionKey="alarm-zones"
                fromJson={zonesFromJson}
                onSource={(v) => set({ zonesSource: v })}
                count={zonesForEditor.filter((z) => !z.hidden).length}
                editorTitle={t('alarm.cfg.zones.edit') as string}
                renderEditor={() => (
                    <ZonesEditor zones={zonesForEditor} manual={manual} onChange={(z) => set({ zones: z })} />
                )}
                json={
                    <JsonListSource<AlarmZoneDef>
                        dp={s('zonesDp') ?? ''}
                        onDpChange={(v) => set({ zonesDp: v })}
                        parse={parseAlarmZonesJson}
                        example={ALARM_ZONES_JSON_EXAMPLE}
                        describe={(z) => z.label ?? z.key}
                        onTakeOver={(items) => set({ zones: items, zonesSource: 'list' })}
                        testId="zones"
                    />
                }
            />

            <ConfigSection title={t('cfg.section.look')} sectionKey="look">
                <Toggle
                    label={t('alarm.cfg.compactMode') as string}
                    on={o.compactMode === true}
                    onChange={(v) => set({ compactMode: v })}
                    hint={t('alarm.cfg.compactMode.hint') as string}
                />
                <div>
                    <label className="text-[11px] mb-1 flex items-center justify-between" style={labelSty}>
                        <span>{t('alarm.cfg.sizeScale') as string}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{sizeScale.toFixed(2)}×</span>
                    </label>
                    <input
                        type="range"
                        min={0.5}
                        max={2.5}
                        step={0.05}
                        value={sizeScale}
                        onChange={(e) => set({ sizeScale: Number(e.target.value) })}
                        className="w-full"
                    />
                </div>
            </ConfigSection>

            <ConfigSection title={t('cfg.section.behavior')} sectionKey="behavior">
                {manual && (
                    <div className="space-y-2" data-aura-alarm-pin="">
                        <div>
                            <label className={labelCls} style={labelSty}>
                                {t('alarm.cfg.pinCheck') as string}
                            </label>
                            <select
                                value={pinCheck}
                                onChange={(e) => set({ pinCheck: e.target.value })}
                                className={inputCls}
                                style={inputSty}
                            >
                                <option value="none">{t('alarm.cfg.pinCheck.none') as string}</option>
                                <option value="dp">{t('alarm.cfg.pinCheck.dp') as string}</option>
                                <option value="aura">{t('alarm.cfg.pinCheck.aura') as string}</option>
                            </select>
                        </div>
                        {pinCheck === 'aura' && (
                            <NamedPinField value={s('pinCode')} onChange={(id) => set({ pinCode: id })} />
                        )}
                        {pinCheck === 'dp' && (
                            <>
                                <DpField
                                    label={t('alarm.cfg.pinDp') as string}
                                    hint={t('alarm.cfg.pinDp.hint') as string}
                                    value={s('pinDp')}
                                    onChange={(v) => set({ pinDp: v })}
                                    testId="pinDp"
                                />
                                <div>
                                    <label className={labelCls} style={labelSty}>
                                        {t('alarm.cfg.pinPayload') as string}
                                    </label>
                                    <select
                                        value={o.pinPayload === 'pin' ? 'pin' : 'json'}
                                        onChange={(e) => set({ pinPayload: e.target.value })}
                                        className={inputCls}
                                        style={inputSty}
                                    >
                                        <option value="json">{t('alarm.cfg.pinPayload.json') as string}</option>
                                        <option value="pin">{t('alarm.cfg.pinPayload.pin') as string}</option>
                                    </select>
                                </div>
                                <DpField
                                    label={t('alarm.cfg.wrongPinDp') as string}
                                    value={s('wrongPinDp')}
                                    onChange={(v) => set({ wrongPinDp: v })}
                                />
                            </>
                        )}
                    </div>
                )}
                <Unavailable reason={pinPossible ? undefined : (t('alarm.cfg.pin.needsCheck') as string)}>
                    <div className="space-y-2">
                        <Toggle
                            label={t('alarm.cfg.requirePin') as string}
                            on={o.requirePinForDisarm === true}
                            onChange={(v) => set({ requirePinForDisarm: v })}
                            hint={
                                (manual
                                    ? t('alarm.cfg.requirePin.hintManual')
                                    : t('alarm.cfg.requirePin.hint')) as string
                            }
                        />
                        <Toggle
                            label={t('alarm.cfg.requirePinArm') as string}
                            on={o.requirePinForArm === true}
                            onChange={(v) => set({ requirePinForArm: v })}
                            hint={
                                (manual
                                    ? t('alarm.cfg.requirePinArm.hintManual')
                                    : t('alarm.cfg.requirePinArm.hint')) as string
                            }
                        />
                        <Unavailable
                            reason={
                                o.requirePinForDisarm === true || o.requirePinForArm === true
                                    ? undefined
                                    : (t('alarm.cfg.pinInput.needsPin') as string)
                            }
                        >
                            <div>
                                <label className={labelCls} style={labelSty}>
                                    {t('alarm.cfg.pinInput') as string}
                                </label>
                                <select
                                    value={o.pinInput === 'keypad' ? 'keypad' : 'field'}
                                    onChange={(e) => set({ pinInput: e.target.value })}
                                    className={inputCls}
                                    style={inputSty}
                                >
                                    <option value="field">{t('alarm.cfg.pinInput.field') as string}</option>
                                    <option value="keypad">{t('alarm.cfg.pinInput.keypad') as string}</option>
                                </select>
                            </div>
                        </Unavailable>
                    </div>
                </Unavailable>
                <Toggle
                    label={t('alarm.cfg.panicConfirm') as string}
                    on={o.panicConfirm !== false}
                    onChange={(v) => set({ panicConfirm: v })}
                />
            </ConfigSection>
        </>
    );
}
