import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { getSettingsGroups, getText, resolveManifestUrl, type WebComponentSetting } from '@iobroker/web-components';
import { useConfigStore } from '../../store/configStore';
import { getObjectViewDirect } from '../../hooks/useIoBroker';
import { evalSettingExpr, objectIdOfRow, typedSettings } from '../../utils/webComponentHost';
import { findWebComponent, useWebComponentCatalog } from '../../utils/webComponentRegistry';
import { DatapointPicker } from './DatapointPicker';

interface Props {
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Toggle({ value, onToggle, disabled }: { value: boolean; onToggle: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
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
        void getObjectViewDirect('instance', start, `${start}\u9999`).then((view) => {
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
        const end = root ? `${root}.\u9999` : '\u9999';
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
    lang: ioBrokerLang;
    disabled: boolean;
    onSet: (v: unknown) => void;
}) {
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
            className={iCls}
            style={iSty}
        >
            <option value="">{objects.length ? '–' : 'Keine Objekte gefunden'}</option>
            {current && !objects.some((o) => o.id === current) && (
                <option value={current}>{objects.length ? `${current} (nicht gefunden)` : current}</option>
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
            className={iCls}
            style={iSty}
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

/**
 * Settings of the webcomponent widget: which component of which adapter, and its
 * own settings as its manifest declares them (a subset of JSON-Config). Values
 * are stored in `options.wcSettings`, only what the user set - the defaults of
 * the manifest fill in the rest when the element gets them.
 */
export function WebComponentConfig({ options: o, onChange }: Props) {
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as ioBrokerLang;
    const { components, loading, reload } = useWebComponentCatalog();
    const component = findWebComponent(components, o.wcTag, o.wcAdapter);
    const stored = (o.wcSettings && typeof o.wcSettings === 'object' ? o.wcSettings : {}) as Record<string, unknown>;
    const data = component ? (typedSettings(component.manifest, stored) as Record<string, unknown>) : {};
    const [picking, setPicking] = useState<string | null>(null);

    const setValue = (key: string, value: unknown): void => {
        const next = { ...stored };
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
        onChange({ wcSettings: next });
    };

    const field = (key: string, item: WebComponentSetting): React.ReactNode => {
        if (evalSettingExpr(item.hidden, data)) return null;
        const disabled = evalSettingExpr(item.disabled, data);
        const label = getText(item.label, lang);
        const help = item.help ? getText(item.help, lang) : '';
        const value = data[key];

        if (item.type === 'header') {
            return (
                <p key={key} className="text-xs font-semibold pt-1" style={{ color: 'var(--text-primary)' }}>
                    {getText(item.text ?? item.label, lang)}
                </p>
            );
        }
        if (item.type === 'staticText') {
            return (
                <p key={key} className="text-[11px]" style={hintSty}>
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
                input = (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                            {label}
                        </span>
                        <Toggle
                            value={value === true}
                            disabled={disabled}
                            onToggle={() => setValue(key, value !== true)}
                        />
                    </div>
                );
                return (
                    <div key={key}>
                        {input}
                        {help && (
                            <p className="text-[10px] mt-0.5" style={hintSty}>
                                {help}
                            </p>
                        )}
                    </div>
                );
            case 'number':
                input = (
                    <input
                        type="number"
                        value={value === undefined ? '' : String(value)}
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        disabled={disabled}
                        onChange={(e) => setValue(key, e.target.value === '' ? undefined : Number(e.target.value))}
                        className={iCls}
                        style={iSty}
                    />
                );
                break;
            case 'slider':
                input = (
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            value={typeof value === 'number' ? value : Number(item.min ?? 0)}
                            min={item.min ?? 0}
                            max={item.max ?? 100}
                            step={item.step ?? 1}
                            disabled={disabled}
                            onChange={(e) => setValue(key, Number(e.target.value))}
                            className="flex-1"
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
                            onChange={(e) => setValue(key, e.target.value)}
                            className="w-8 h-8 rounded shrink-0"
                            style={{ border: '1px solid var(--app-border)', background: 'transparent' }}
                        />
                        <input
                            type="text"
                            value={typeof value === 'string' ? value : ''}
                            disabled={disabled}
                            onChange={(e) => setValue(key, e.target.value)}
                            className={`${iCls} font-mono`}
                            style={iSty}
                        />
                    </div>
                );
                break;
            case 'select':
                input = (
                    <select
                        value={value === undefined ? '' : String(value)}
                        disabled={disabled}
                        onChange={(e) => {
                            const opt = item.options?.find((op) => String(op.value) === e.target.value);
                            setValue(key, opt ? opt.value : e.target.value);
                        }}
                        className={iCls}
                        style={iSty}
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
                            onSet={(v) => setValue(key, v)}
                        />
                    );
                    break;
                }
                input = (
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={typeof value === 'string' ? value : ''}
                            disabled={disabled}
                            placeholder={item.root ? `${item.root}.…` : undefined}
                            onChange={(e) => setValue(key, e.target.value)}
                            className={`${iCls} flex-1 font-mono min-w-0`}
                            style={iSty}
                        />
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setPicking(key)}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0 disabled:opacity-50"
                            style={{ ...iSty, color: 'var(--text-secondary)' }}
                            title="Aus ioBroker wählen"
                        >
                            <Database size={13} />
                        </button>
                    </div>
                );
                break;
            case 'instance':
                input = (
                    <InstanceSelect item={item} value={value} disabled={disabled} onSet={(v) => setValue(key, v)} />
                );
                break;
            case 'text':
            case 'password':
            default:
                input =
                    item.type === 'text' && (item.minRows ?? 1) > 1 ? (
                        <textarea
                            rows={item.minRows}
                            value={value === undefined ? '' : String(value)}
                            disabled={disabled}
                            onChange={(e) => setValue(key, e.target.value)}
                            className={iCls}
                            style={iSty}
                        />
                    ) : (
                        <input
                            type={item.type === 'password' ? 'password' : 'text'}
                            value={value === undefined ? '' : String(value)}
                            disabled={disabled}
                            onChange={(e) => setValue(key, e.target.value)}
                            className={iCls}
                            style={iSty}
                        />
                    );
        }
        return (
            <div key={key}>
                {label && (
                    <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                        {label}
                    </label>
                )}
                {input}
                {help && (
                    <p className="text-[10px] mt-0.5" style={hintSty}>
                        {help}
                    </p>
                )}
            </div>
        );
    };

    const choice = component ? `${component.adapter}|${component.manifest.tag}` : '';
    const icon = component ? resolveManifestUrl(component.manifest.icon, component.url) : undefined;
    const pickingItem = picking && component ? findSetting(component.manifest, picking) : undefined;

    return (
        <>
            <div>
                <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                    Komponente
                </label>
                <div className="flex gap-1">
                    <select
                        value={choice}
                        onChange={(e) => {
                            const [adapter, tag] = e.target.value.split('|');
                            if (tag === o.wcTag && adapter === o.wcAdapter) return;
                            onChange({ wcTag: tag || undefined, wcAdapter: adapter || undefined, wcSettings: {} });
                        }}
                        className={`${iCls} flex-1 min-w-0`}
                        style={iSty}
                    >
                        <option value="">{loading ? 'Lade…' : '– wählen –'}</option>
                        {typeof o.wcTag === 'string' && o.wcTag && !component && (
                            <option value={`${String(o.wcAdapter ?? '')}|${o.wcTag}`}>
                                {o.wcTag} (nicht installiert)
                            </option>
                        )}
                        {components.map((c) => (
                            <option key={`${c.adapter}|${c.manifest.tag}`} value={`${c.adapter}|${c.manifest.tag}`}>
                                {c.adapter}: {getText(c.manifest.name, lang) || c.manifest.tag}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={reload}
                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{ ...iSty, color: 'var(--text-secondary)' }}
                        title="Komponenten neu einlesen"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
                {!loading && !components.length && (
                    <p className="text-[10px] mt-0.5" style={hintSty}>
                        Kein installierter Adapter bietet Web-Komponenten an (io-package: common.webComponents).
                    </p>
                )}
                {component && (
                    <div className="flex gap-2 items-start mt-1.5">
                        {icon && <img src={icon} alt="" className="w-6 h-6 object-contain shrink-0" />}
                        <p className="text-[10px]" style={hintSty}>
                            {getText(component.manifest.description, lang)}{' '}
                            <span className="font-mono">&lt;{component.manifest.tag}&gt;</span>
                        </p>
                    </div>
                )}
            </div>

            {component &&
                getSettingsGroups(component.manifest).map((group) => (
                    <div key={group.name} className="space-y-2">
                        {group.label && (
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {getText(group.label, lang)}
                            </p>
                        )}
                        {Object.entries(group.panel.items).map(([key, item]) => field(key, item))}
                    </div>
                ))}

            {picking && (
                <DatapointPicker
                    currentValue={typeof data[picking] === 'string' ? (data[picking] as string) : ''}
                    onSelect={(id) => {
                        setValue(picking, id);
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                    idFilter={rootFilter(pickingItem?.root)}
                />
            )}
        </>
    );
}

type ioBrokerLang = 'en' | 'de' | 'ru' | 'pt' | 'nl' | 'fr' | 'it' | 'es' | 'pl' | 'uk' | 'zh-cn';

function findSetting(manifest: Parameters<typeof getSettingsGroups>[0], key: string): WebComponentSetting | undefined {
    for (const group of getSettingsGroups(manifest)) {
        if (group.panel.items[key]) return group.panel.items[key];
    }
    return undefined;
}

/** `root` of an objectId setting: that object and the ones below it only */
function rootFilter(root: string | undefined): ((id: string) => boolean) | undefined {
    if (!root) return undefined;
    return (id) => id === root || id.startsWith(`${root}.`);
}
