import { useEffect, useId, useState } from 'react';
import { Database } from 'lucide-react';
import {
    getSendToRequest,
    getText,
    toSendToOptions,
    type WebComponentSetting,
    type WebComponentSettingOption,
} from '@iobroker/web-components';
import { useT } from '../../i18n';
import { getObjectViewDirect, sendToDirect } from '../../hooks/useIoBroker';
import { evalSettingExpr, objectIdOfRow } from '../../utils/webComponentHost';
import { DatapointPicker } from './DatapointPicker';

/**
 * The fields of one JSON-Config panel of an ioBroker web component - the settings
 * a manifest declares, and the form of a dialog a component asks for. Both are
 * rendered by this one component, so the settings editor and a form dialog look
 * the same.
 *
 * Supported: text (minRows), password, number, slider, checkbox, color, select,
 * objectId (states through the datapoint picker; other `types` below `root` as a
 * list), instance (adapter), selectSendTo / autocompleteSendTo (the options come
 * from the adapter via sendTo, a text field when it gives none), header,
 * staticText, divider; `hidden` / `disabled` expressions over `data` and `help`
 * texts.
 */

export type WebComponentLang = 'en' | 'de' | 'ru' | 'pt' | 'nl' | 'fr' | 'it' | 'es' | 'pl' | 'uk' | 'zh-cn';

export const wcInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
export const wcInputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
export const wcLabelCls = 'text-[11px] mb-1 block';
export const wcHintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Toggle({ value, onToggle, disabled }: { value: boolean; onToggle: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={value}
            disabled={disabled}
            onClick={onToggle}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50"
            style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: value ? '18px' : '2px' }}
            />
        </button>
    );
}

/** Instances of one adapter (`flow.0`, …) for settings of type `instance` */
function useInstances(adapter: string | undefined): string[] {
    const [list, setList] = useState<string[]>([]);
    useEffect(() => {
        let alive = true;
        const start = adapter ? `system.adapter.${adapter}.` : 'system.adapter.';
        void getObjectViewDirect('instance', start, `${start}香`).then((view) => {
            if (!alive) return;
            setList(
                (view.rows ?? [])
                    .map((row) => row.id.replace(/^system\.adapter\./, ''))
                    .filter((id) => /\.\d+$/.test(id))
                    .sort(),
            );
        });
        return () => {
            alive = false;
        };
    }, [adapter]);
    return list;
}

/** `objectId` for states only - what the datapoint picker offers. `types` missing means `state`, as in JSON-Config */
function onlyStates(item: WebComponentSetting): boolean {
    const types = Array.isArray(item.types) ? item.types : item.types ? [item.types] : ['state'];
    return types.every((t) => t === 'state');
}

/**
 * Objects of other types (`config`, `channel`, `device`, …) below `root`, read from
 * the object views - flow's diagrams are `config` objects under `flow.0.diagrams`,
 * which the datapoint picker (states only) never lists.
 */
function useObjectsOfTypes(types: string[], root: string | undefined): { id: string; name: unknown }[] {
    const [list, setList] = useState<{ id: string; name: unknown }[]>([]);
    const typesKey = types.join(',');
    useEffect(() => {
        let alive = true;
        const start = root ? `${root}.` : '';
        const end = root ? `${root}.香` : '香';
        void Promise.all(
            typesKey.split(',').map((type) =>
                getObjectViewDirect(type as Parameters<typeof getObjectViewDirect>[0], start, end).catch(() => ({
                    rows: [],
                })),
            ),
        ).then((views) => {
            if (!alive) return;
            const rows = views.flatMap((v) => v.rows ?? []);
            setList(
                rows
                    .map((row) => ({
                        // not row.id: the `config` view keys its rows by name, not by ID
                        id: objectIdOfRow(row),
                        name: (row.value as { common?: { name?: unknown } } | undefined)?.common?.name,
                    }))
                    .sort((a, b) => a.id.localeCompare(b.id)),
            );
        });
        return () => {
            alive = false;
        };
    }, [typesKey, root]);
    return list;
}

function ObjectSelect({
    item,
    value,
    lang,
    disabled,
    onSet,
}: {
    item: WebComponentSetting;
    value: unknown;
    lang: WebComponentLang;
    disabled: boolean;
    onSet: (v: unknown) => void;
}) {
    const t = useT();
    const types = Array.isArray(item.types) ? item.types : item.types ? [item.types] : ['state'];
    const objects = useObjectsOfTypes(types, item.root);
    const current = typeof value === 'string' ? value : '';
    const label = (id: string, name: unknown): string => {
        const text = name && (typeof name === 'string' || typeof name === 'object') ? getText(name as never, lang) : '';
        return text && text !== id ? `${text} (${id})` : id;
    };
    return (
        <select
            value={current}
            disabled={disabled}
            onChange={(e) => onSet(e.target.value)}
            className={wcInputCls}
            style={wcInputStyle}
        >
            <option value="">{objects.length ? '–' : t('wc.noObjects')}</option>
            {current && !objects.some((o) => o.id === current) && (
                <option value={current}>{objects.length ? t('wc.objectNotFound', { id: current }) : current}</option>
            )}
            {objects.map((o) => (
                <option key={o.id} value={o.id}>
                    {label(o.id, o.name)}
                </option>
            ))}
        </select>
    );
}

function InstanceSelect({
    item,
    value,
    disabled,
    onSet,
}: {
    item: WebComponentSetting;
    value: unknown;
    disabled: boolean;
    onSet: (v: unknown) => void;
}) {
    const instances = useInstances(item.adapter);
    const current = typeof value === 'string' ? value : '';
    return (
        <select
            value={current}
            disabled={disabled}
            onChange={(e) => onSet(e.target.value)}
            className={wcInputCls}
            style={wcInputStyle}
        >
            <option value="">–</option>
            {current && !instances.includes(current) && <option value={current}>{current}</option>}
            {instances.map((id) => (
                <option key={id} value={id}>
                    {id}
                </option>
            ))}
        </select>
    );
}

/** How long a `selectSendTo` / `autocompleteSendTo` waits for the instance - a stopped one never answers */
const SEND_TO_TIMEOUT_MS = 10000;

type SendToList =
    | { state: 'none' }
    | { state: 'loading'; instance: string }
    | { state: 'failed'; instance: string }
    | { state: 'ready'; instance: string; options: WebComponentSettingOption[] };

/**
 * The options of a `selectSendTo` / `autocompleteSendTo`: asked from the instance
 * whenever the request changes (message, instance, `alsoDependsOn`) - a moment
 * after the last change, so typing into a field the message depends on asks once.
 */
function useSendToOptions(item: WebComponentSetting, data: Record<string, unknown>, adapter: string): SendToList {
    const request = getSendToRequest(item, data, adapter);
    const key = request?.key ?? '';
    const [list, setList] = useState<SendToList>({ state: 'none' });
    useEffect(() => {
        if (!request) {
            setList({ state: 'none' });
            return;
        }
        let alive = true;
        const { instance, command, data: message } = request;
        setList({ state: 'loading', instance });
        const timer = setTimeout(() => {
            void sendToDirect(instance, command, message, SEND_TO_TIMEOUT_MS)
                .catch(() => null)
                .then((answer) => {
                    if (!alive) return;
                    setList(
                        Array.isArray(answer)
                            ? { state: 'ready', instance, options: toSendToOptions(answer) }
                            : { state: 'failed', instance },
                    );
                });
        }, 300);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
        // the key stands for the request
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return list;
}

/**
 * `selectSendTo` and `autocompleteSendTo` of JSON-Config: a list the adapter
 * gives at runtime (its locations, devices, …). Without an answer - no instance
 * chosen, instance stopped, no handler - a text field, so the value stays editable.
 */
function SendToField({
    id,
    item,
    value,
    data,
    adapter,
    lang,
    disabled,
    onSet,
}: {
    id: string;
    item: WebComponentSetting;
    value: unknown;
    data: Record<string, unknown>;
    adapter: string;
    lang: WebComponentLang;
    disabled: boolean;
    onSet: (v: unknown) => void;
}) {
    const t = useT();
    const list = useSendToOptions(item, data, adapter);
    const current = value === undefined || value === null ? '' : String(value);
    const autocomplete = item.type === 'autocompleteSendTo';
    const options: WebComponentSettingOption[] = [
        ...(autocomplete ? (item.options ?? []) : []),
        ...(list.state === 'ready' ? list.options : []),
    ];
    const pick = (text: string) => {
        const option = options.find((o) => String(o.value) === text);
        onSet(option ? option.value : text);
    };
    const hint = (text: string) => (
        <p className="text-[10px] mt-0.5" style={wcHintStyle}>
            {text}
        </p>
    );

    if (list.state === 'ready' && !autocomplete) {
        return (
            <select
                id={id}
                value={current}
                disabled={disabled}
                onChange={(e) => pick(e.target.value)}
                className={wcInputCls}
                style={wcInputStyle}
            >
                <option value="">{options.length ? '–' : t('wc.noObjects')}</option>
                {current && !options.some((o) => String(o.value) === current) && (
                    <option value={current}>
                        {options.length ? t('wc.objectNotFound', { id: current }) : current}
                    </option>
                )}
                {options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                        {getText(o.label, lang)}
                    </option>
                ))}
            </select>
        );
    }

    // autocomplete, and the text field while the list is missing
    const listId = `${id}-options`;
    const notInList =
        autocomplete &&
        !item.freeSolo &&
        list.state === 'ready' &&
        current !== '' &&
        !options.some((o) => String(o.value) === current);
    return (
        <>
            <input
                id={id}
                type="text"
                list={options.length ? listId : undefined}
                value={current}
                maxLength={autocomplete ? item.maxLength : undefined}
                disabled={disabled}
                onChange={(e) => pick(e.target.value)}
                className={wcInputCls}
                style={wcInputStyle}
            />
            {options.length > 0 && (
                <datalist id={listId}>
                    {options.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                            {getText(o.label, lang)}
                        </option>
                    ))}
                </datalist>
            )}
            {list.state === 'loading' && hint(t('wc.sendTo.loading', { instance: list.instance }))}
            {list.state === 'failed' && hint(t('wc.sendTo.failed', { instance: list.instance }))}
            {list.state === 'none' && hint(t('wc.sendTo.noInstance'))}
            {notInList && hint(t('wc.sendTo.notInList', { value: current }))}
        </>
    );
}

/** `root` of an objectId setting: that object and the ones below it only */
function rootFilter(root: string | undefined): ((id: string) => boolean) | undefined {
    if (!root) return undefined;
    return (id) => id === root || id.startsWith(`${root}.`);
}

interface Props {
    /** `items` of the panel: the keys are the names of the values */
    items: Record<string, WebComponentSetting>;
    /** The current values of all fields, typed as they declare - also what `hidden` / `disabled` see as `data` */
    data: Record<string, unknown>;
    /** Language of the labels, options and help texts */
    lang: WebComponentLang;
    /** The adapter that brings the component: a `selectSendTo` without `instance` asks its first instance */
    adapter?: string;
    /**
     * A field changed; `undefined` for a number field that was cleared
     *
     * @param key name of the field
     * @param value its new value
     */
    onSet: (key: string, value: unknown) => void;
}

/**
 * Renders the fields of one panel. Values flow in through `data` and out through
 * `onSet`, so the caller decides where they are kept (the widget options, the
 * state of a dialog).
 */
export function WebComponentFields({ items, data, lang, adapter = '', onSet }: Props) {
    const t = useT();
    const idPrefix = useId();
    const [picking, setPicking] = useState<string | null>(null);

    const field = (key: string, item: WebComponentSetting): React.ReactNode => {
        if (!item || typeof item !== 'object') return null;
        if (evalSettingExpr(item.hidden, data)) return null;
        const disabled = evalSettingExpr(item.disabled, data);
        const label = getText(item.label, lang);
        const help = item.help ? getText(item.help, lang) : '';
        const value = data[key];
        const fieldId = `${idPrefix}-${key}`;

        if (item.type === 'header') {
            return (
                <p key={key} className="text-xs font-semibold pt-1" style={{ color: 'var(--text-primary)' }}>
                    {getText(item.text ?? item.label, lang)}
                </p>
            );
        }
        if (item.type === 'staticText') {
            return (
                <p key={key} className="text-[11px]" style={wcHintStyle}>
                    {getText(item.text ?? item.label, lang)}
                </p>
            );
        }
        if (item.type === 'divider') {
            return <hr key={key} style={{ borderColor: 'var(--app-border)' }} />;
        }

        let input: React.ReactNode;
        switch (item.type) {
            case 'checkbox':
                return (
                    <div key={key} data-wc-field={key}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                                {label}
                            </span>
                            <Toggle
                                value={value === true}
                                disabled={disabled}
                                onToggle={() => onSet(key, value !== true)}
                            />
                        </div>
                        {help && (
                            <p className="text-[10px] mt-0.5" style={wcHintStyle}>
                                {help}
                            </p>
                        )}
                    </div>
                );
            case 'number':
                input = (
                    <input
                        id={fieldId}
                        type="number"
                        inputMode="decimal"
                        value={value === undefined ? '' : String(value)}
                        min={item.min}
                        max={item.max}
                        step={item.step ?? 'any'}
                        disabled={disabled}
                        onChange={(e) => onSet(key, e.target.value === '' ? undefined : Number(e.target.value))}
                        className={wcInputCls}
                        style={wcInputStyle}
                    />
                );
                break;
            case 'slider':
                input = (
                    <div className="flex items-center gap-2">
                        <input
                            id={fieldId}
                            type="range"
                            value={typeof value === 'number' ? value : Number(item.min ?? 0)}
                            min={item.min ?? 0}
                            max={item.max ?? 100}
                            step={item.step ?? 1}
                            disabled={disabled}
                            onChange={(e) => onSet(key, Number(e.target.value))}
                            className="flex-1"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="text-xs tabular-nums w-10 text-right" style={{ color: 'var(--text-primary)' }}>
                            {value === undefined ? '' : String(value)}
                        </span>
                    </div>
                );
                break;
            case 'color':
                input = (
                    <div className="flex gap-1 items-center">
                        <input
                            type="color"
                            value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
                            disabled={disabled}
                            onChange={(e) => onSet(key, e.target.value)}
                            className="w-8 h-8 rounded shrink-0"
                            style={{ border: '1px solid var(--app-border)', background: 'transparent' }}
                        />
                        <input
                            id={fieldId}
                            type="text"
                            value={typeof value === 'string' ? value : ''}
                            disabled={disabled}
                            onChange={(e) => onSet(key, e.target.value)}
                            className={`${wcInputCls} font-mono`}
                            style={wcInputStyle}
                        />
                    </div>
                );
                break;
            case 'select':
                input = (
                    <select
                        id={fieldId}
                        value={value === undefined ? '' : String(value)}
                        disabled={disabled}
                        onChange={(e) => {
                            const opt = item.options?.find((op) => String(op.value) === e.target.value);
                            onSet(key, opt ? opt.value : e.target.value);
                        }}
                        className={wcInputCls}
                        style={wcInputStyle}
                    >
                        {value === undefined && <option value="">–</option>}
                        {(item.options ?? []).map((op) => (
                            <option key={String(op.value)} value={String(op.value)}>
                                {getText(op.label, lang)}
                            </option>
                        ))}
                    </select>
                );
                break;
            case 'objectId':
                if (!onlyStates(item)) {
                    input = (
                        <ObjectSelect
                            item={item}
                            value={value}
                            lang={lang}
                            disabled={disabled}
                            onSet={(v) => onSet(key, v)}
                        />
                    );
                    break;
                }
                input = (
                    <div className="flex gap-1">
                        <input
                            id={fieldId}
                            type="text"
                            value={typeof value === 'string' ? value : ''}
                            disabled={disabled}
                            placeholder={item.root ? `${item.root}.…` : undefined}
                            onChange={(e) => onSet(key, e.target.value)}
                            className={`${wcInputCls} flex-1 font-mono min-w-0`}
                            style={wcInputStyle}
                        />
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setPicking(key)}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0 disabled:opacity-50"
                            style={{ ...wcInputStyle, color: 'var(--text-secondary)' }}
                            title={t('wc.pickDatapoint')}
                            aria-label={t('wc.pickDatapoint')}
                        >
                            <Database size={13} />
                        </button>
                    </div>
                );
                break;
            case 'selectSendTo':
            case 'autocompleteSendTo':
                input = (
                    <SendToField
                        id={fieldId}
                        item={item}
                        value={value}
                        data={data}
                        adapter={adapter}
                        lang={lang}
                        disabled={disabled}
                        onSet={(v) => onSet(key, v)}
                    />
                );
                break;
            case 'instance':
                input = <InstanceSelect item={item} value={value} disabled={disabled} onSet={(v) => onSet(key, v)} />;
                break;
            case 'text':
            case 'password':
            default:
                input =
                    item.type === 'text' && (item.minRows ?? 1) > 1 ? (
                        <textarea
                            id={fieldId}
                            rows={item.minRows}
                            value={value === undefined ? '' : String(value)}
                            disabled={disabled}
                            onChange={(e) => onSet(key, e.target.value)}
                            className={wcInputCls}
                            style={wcInputStyle}
                        />
                    ) : (
                        <input
                            id={fieldId}
                            type={item.type === 'password' ? 'password' : 'text'}
                            value={value === undefined ? '' : String(value)}
                            disabled={disabled}
                            onChange={(e) => onSet(key, e.target.value)}
                            className={wcInputCls}
                            style={wcInputStyle}
                        />
                    );
        }
        return (
            <div key={key} data-wc-field={key}>
                {label && (
                    <label htmlFor={fieldId} className={wcLabelCls} style={{ color: 'var(--text-secondary)' }}>
                        {label}
                    </label>
                )}
                {input}
                {help && (
                    <p className="text-[10px] mt-0.5" style={wcHintStyle}>
                        {help}
                    </p>
                )}
            </div>
        );
    };

    const pickingItem = picking ? items[picking] : undefined;

    return (
        <>
            {Object.entries(items ?? {}).map(([key, item]) => field(key, item))}
            {picking && (
                <DatapointPicker
                    currentValue={typeof data[picking] === 'string' ? (data[picking] as string) : ''}
                    onSelect={(id) => {
                        onSet(picking, id);
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                    idFilter={rootFilter(pickingItem?.root)}
                />
            )}
        </>
    );
}
