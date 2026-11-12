import { useEffect, useId, useRef, useState } from 'react';
import { Database } from 'lucide-react';
import {
    getSendToRequest,
    getText,
    type WebComponentSendToRequest,
    type WebComponentSetting,
    type WebComponentSettingOption,
} from '@iobroker/web-components';
import { useT } from '../../i18n';
import { getObjectViewDirect, sendToDirect } from '../../hooks/useIoBroker';
import {
    askSendToOptions,
    autocompleteValue,
    evalSettingExpr,
    mergeSendToOptions,
    objectIdOfRow,
    type SendToAnswer,
} from '../../utils/webComponentHost';
import { DatapointPicker } from './DatapointPicker';

/**
 * The fields of one JSON-Config panel of an ioBroker web component - the settings
 * a manifest declares, and the form of a dialog a component asks for. Both are
 * rendered by this one component, so the settings editor and a form dialog look
 * the same.
 *
 * Supported: text (minRows), password, number, slider, checkbox, color, select,
 * selectSendTo / autocompleteSendTo (options asked from the instance, a text field
 * without an answer),
 * objectId (states through the datapoint picker; other `types` below `root` as a
 * list), instance (adapter), header, staticText, divider; `hidden` / `disabled`
 * expressions over `data` and `help` texts.
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

/** How long the settings wait for the options of a sendTo setting before they show a text field */
const SEND_TO_TIMEOUT_MS = 10000;

/** Pause after the last change of the request before the options are asked again (typing asks once) */
const SEND_TO_DEBOUNCE_MS = 300;

/**
 * Options of a `selectSendTo` / `autocompleteSendTo` setting, asked from the instance
 * whenever the request's key changes (instance, command, message, `alsoDependsOn`).
 * `request` null: the setting cannot ask (no instance yet, broken pattern).
 */
function useSendToOptions(
    item: WebComponentSetting,
    data: Record<string, unknown>,
    adapter: string | undefined,
): { request: WebComponentSendToRequest | null; answer: SendToAnswer | null } {
    const request = getSendToRequest(item, data, adapter ?? '');
    const key = request?.key ?? null;
    const [answer, setAnswer] = useState<SendToAnswer | null>(null);
    const requestRef = useRef(request);
    requestRef.current = request;
    const askedRef = useRef(false);
    useEffect(() => {
        const req = requestRef.current;
        if (!req) return;
        let alive = true;
        // the first request goes out at once, later ones wait until typing pauses
        const timer = setTimeout(
            () => {
                askedRef.current = true;
                void askSendToOptions(req, (instance, command, message) =>
                    sendToDirect(instance, command, message, SEND_TO_TIMEOUT_MS),
                ).then((a) => {
                    if (alive) setAnswer(a);
                });
            },
            askedRef.current ? SEND_TO_DEBOUNCE_MS : 0,
        );
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [key]);
    return { request, answer: answer && answer.key === key ? answer : null };
}

function SendToField({
    item,
    fieldId,
    value,
    data,
    adapter,
    lang,
    disabled,
    onSet,
    textField,
}: {
    item: WebComponentSetting;
    fieldId: string;
    value: unknown;
    data: Record<string, unknown>;
    adapter: string | undefined;
    lang: WebComponentLang;
    disabled: boolean;
    onSet: (v: unknown) => void;
    /** What the field is without options from the instance */
    textField: React.ReactNode;
}) {
    const t = useT();
    const { request, answer } = useSendToOptions(item, data, adapter);
    const pending = !!request && !answer;
    const auto = item.type === 'autocompleteSendTo';
    const options = auto ? mergeSendToOptions(answer?.options ?? [], item.options) : (answer?.options ?? []);

    // no request, no answer or nothing to choose from: the text field, as before
    if (!request || (!pending && (answer?.options === null || (!auto && options.length === 0)))) {
        return <>{textField}</>;
    }
    if (auto) {
        return (
            <AutocompleteInput
                fieldId={fieldId}
                value={value}
                options={options}
                freeSolo={item.freeSolo === true}
                maxLength={item.maxLength}
                lang={lang}
                disabled={disabled}
                pending={pending}
                onSet={onSet}
            />
        );
    }
    const current = value === undefined ? '' : String(value);
    const known = options.some((op) => String(op.value) === current);
    return (
        <select
            id={fieldId}
            value={current}
            disabled={disabled}
            onChange={(e) => {
                const opt = options.find((op) => String(op.value) === e.target.value);
                onSet(opt ? opt.value : e.target.value || undefined);
            }}
            className={wcInputCls}
            style={wcInputStyle}
            data-wc-sendto={pending ? 'pending' : 'ready'}
        >
            {pending ? (
                <option value="">{t('wc.sendToLoading')}</option>
            ) : (
                (value === undefined || current === '') && <option value="">–</option>
            )}
            {current && !known && (
                <option value={current}>{pending ? current : t('wc.sendToNotInList', { value: current })}</option>
            )}
            {options.map((op) => (
                <option key={String(op.value)} value={String(op.value)}>
                    {getText(op.label, lang)}
                </option>
            ))}
        </select>
    );
}

/**
 * Text field with the options as suggestions (`autocompleteSendTo`). The field shows
 * the label of the stored value; what is typed is stored when it names an option (by
 * value or label), any text with `freeSolo`. Leaving the field shows the stored value
 * again.
 */
function AutocompleteInput({
    fieldId,
    value,
    options,
    freeSolo,
    maxLength,
    lang,
    disabled,
    pending,
    onSet,
}: {
    fieldId: string;
    value: unknown;
    options: WebComponentSettingOption[];
    freeSolo: boolean;
    maxLength: number | undefined;
    lang: WebComponentLang;
    disabled: boolean;
    pending: boolean;
    onSet: (v: unknown) => void;
}) {
    const t = useT();
    const listId = `${fieldId}-options`;
    const shown = (v: unknown): string => {
        if (v === undefined || v === null) return '';
        const opt = options.find((op) => String(op.value) === String(v));
        return opt ? getText(opt.label, lang) : String(v);
    };
    const stored = shown(value);
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <>
            <input
                id={fieldId}
                type="text"
                list={listId}
                value={draft ?? stored}
                maxLength={maxLength && maxLength > 0 ? maxLength : undefined}
                placeholder={pending ? t('wc.sendToLoading') : undefined}
                disabled={disabled}
                onChange={(e) => {
                    const text = e.target.value;
                    setDraft(text);
                    const next = autocompleteValue(text, options, freeSolo, lang);
                    if (next && next.value !== value) onSet(next.value);
                }}
                onBlur={() => setDraft(null)}
                className={wcInputCls}
                style={wcInputStyle}
                data-wc-sendto={pending ? 'pending' : 'ready'}
            />
            <datalist id={listId}>
                {options.map((op) => (
                    <option key={String(op.value)} value={getText(op.label, lang)} />
                ))}
            </datalist>
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
    /** Adapter that brings the component: sendTo settings without `instance` ask `<adapter>.0` */
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
export function WebComponentFields({ items, data, lang, adapter, onSet }: Props) {
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
            case 'instance':
                input = <InstanceSelect item={item} value={value} disabled={disabled} onSet={(v) => onSet(key, v)} />;
                break;
            case 'selectSendTo':
            case 'autocompleteSendTo':
                input = (
                    <SendToField
                        item={item}
                        fieldId={fieldId}
                        value={value}
                        data={data}
                        adapter={adapter}
                        lang={lang}
                        disabled={disabled}
                        onSet={(v) => onSet(key, v)}
                        textField={
                            <input
                                id={fieldId}
                                type="text"
                                value={value === undefined ? '' : String(value)}
                                maxLength={item.maxLength && item.maxLength > 0 ? item.maxLength : undefined}
                                disabled={disabled}
                                onChange={(e) => onSet(key, e.target.value)}
                                className={wcInputCls}
                                style={wcInputStyle}
                            />
                        }
                    />
                );
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
