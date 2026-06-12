import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import type { WidgetConfig, ClickAction } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { usePopupConfigStore } from '../../store/popupConfigStore';
import { DatapointPicker } from './DatapointPicker';
import { SANDBOX_PRESETS, type SandboxPreset } from '../../utils/iframeSandbox';

function normalizeAction(action: ClickAction): ClickAction {
    switch (action.kind) {
        case 'popup-dimmer':
            return { kind: 'popup-view', viewId: 'pv-builtin-dimmer' };
        case 'popup-thermostat':
            return { kind: 'popup-view', viewId: 'pv-builtin-thermostat' };
        case 'popup-switch':
            return { kind: 'popup-view', viewId: 'pv-builtin-switch' };
        case 'popup-shutter':
            return { kind: 'popup-view', viewId: 'pv-builtin-shutter' };
        case 'popup-mediaplayer':
            return { kind: 'popup-view', viewId: 'pv-builtin-mediaplayer' };
        default:
            return action;
    }
}

export function defaultActionForConfig(config: WidgetConfig): ClickAction | null {
    switch (config.type) {
        case 'dimmer':
            return { kind: 'popup-view', viewId: 'pv-builtin-dimmer' };
        case 'thermostat':
            return { kind: 'popup-view', viewId: 'pv-builtin-thermostat' };
        case 'switch':
            return { kind: 'popup-view', viewId: 'pv-builtin-switch' };
        case 'shutter':
            return { kind: 'popup-view', viewId: 'pv-builtin-shutter' };
        case 'mediaplayer':
            return { kind: 'popup-view', viewId: 'pv-builtin-mediaplayer' };
        case 'slider':
            return { kind: 'popup-widget', widgetId: '' };
        default:
            return null;
    }
}

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const MODE_GROUPS: { label: string; modes: ClickAction['kind'][] }[] = [
    {
        label: 'Aus',
        modes: ['none'],
    },
    {
        label: 'Popup',
        modes: ['popup-view', 'popup-image', 'popup-iframe', 'popup-json', 'popup-html', 'popup-widget'],
    },
    {
        label: 'Navigation',
        modes: ['link-tab', 'link-external', 'link-widget'],
    },
];

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function modeLabel(kind: ClickAction['kind']): string {
    switch (kind) {
        case 'none':
            return 'Aus';
        case 'popup-view':
            return 'Popup: View';
        case 'popup-image':
            return 'Popup: Bild';
        case 'popup-iframe':
            return 'Popup: Webseite (iframe)';
        case 'popup-json':
            return 'Popup: JSON';
        case 'popup-html':
            return 'Popup: HTML';
        case 'popup-widget':
            return 'Popup: Widget-Inhalt';
        case 'link-tab':
            return 'Sprung: Tab';
        case 'link-external':
            return 'Sprung: Externe URL';
        case 'link-widget':
            return 'Sprung: Widget';
        // legacy kinds (normalized at render time)
        case 'popup-dimmer':
            return 'Popup: Dimmer';
        case 'popup-thermostat':
            return 'Popup: Thermostat';
        case 'popup-switch':
            return 'Popup: Schalter';
        case 'popup-shutter':
            return 'Popup: Rolladen';
        case 'popup-mediaplayer':
            return 'Popup: Mediaplayer';
    }
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
                className="relative w-8 h-4 rounded-full transition-colors"
                style={{ background: checked ? 'var(--accent)' : 'var(--app-border)' }}
                onClick={() => onChange(!checked)}
            >
                <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                    style={{ left: checked ? 'calc(100% - 14px)' : '2px' }}
                />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                {label}
            </span>
        </label>
    );
}

export function ClickActionEditor({ config, onConfigChange }: Props) {
    const o = config.options ?? {};
    const rawStoredAction = o.clickAction as ClickAction | undefined;
    const storedAction = rawStoredAction ? normalizeAction(rawStoredAction) : undefined;
    const popupTitle = (o.popupTitle as string) ?? '';
    const popupHideTitle = !!o.popupHideTitle;
    const popupWidth = o.popupWidth as number | undefined;
    const popupHeight = o.popupHeight as number | undefined;
    const popupAutoCloseSec = o.popupAutoCloseSec as number | undefined;

    const layouts = useDashboardStore((s) => s.layouts);

    const [dpPickerTarget, setDpPickerTarget] = useState<
        'image-dp' | 'json-dp' | 'html-dp' | 'thermo-setpoint' | 'thermo-mode' | 'view-dp' | null
    >(null);
    const [widgetSearch, setWidgetSearch] = useState('');

    const setAction = (patch: Partial<ClickAction> & { kind: ClickAction['kind'] }) => {
        onConfigChange({ ...config, options: { ...o, clickAction: patch } });
    };

    // Migrate legacy popup kinds (popup-dimmer → popup-view) once on mount.
    // Built-in defaults are NOT persisted — they're resolved at render/runtime,
    // so "reset to type default" actually clears the stored value.
    useEffect(() => {
        if (rawStoredAction && rawStoredAction !== storedAction) {
            setAction(storedAction!);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setOpts = (patch: Record<string, unknown>) => {
        onConfigChange({ ...config, options: { ...o, ...patch } });
    };

    const resetToTypeDefault = () => {
        const { clickAction: _removed, ...rest } = o as Record<string, unknown>;
        onConfigChange({ ...config, options: rest });
    };

    const setMode = (kind: ClickAction['kind']) => {
        switch (kind) {
            case 'none':
                setAction({ kind: 'none' });
                break;
            case 'popup-view':
                setAction({ kind: 'popup-view', viewId: '' });
                break;
            case 'popup-image':
                setAction({ kind: 'popup-image' });
                break;
            case 'popup-iframe':
                setAction({ kind: 'popup-iframe', url: '' });
                break;
            case 'popup-json':
                setAction({ kind: 'popup-json' });
                break;
            case 'popup-html':
                setAction({ kind: 'popup-html' });
                break;
            case 'popup-widget':
                setAction({ kind: 'popup-widget' });
                break;
            case 'link-tab': {
                const firstLayout = layouts[0];
                const firstTab = firstLayout?.tabs[0];
                setAction({ kind: 'link-tab', layoutId: firstLayout?.id ?? '', tabId: firstTab?.id ?? '' });
                break;
            }
            case 'link-external':
                setAction({ kind: 'link-external', url: '' });
                break;
            case 'link-widget': {
                const firstLayout = layouts[0];
                const firstTab = firstLayout?.tabs[0];
                const firstWidget = firstTab?.widgets[0];
                setAction({
                    kind: 'link-widget',
                    layoutId: firstLayout?.id ?? '',
                    tabId: firstTab?.id ?? '',
                    widgetId: firstWidget?.id ?? '',
                });
                break;
            }
        }
    };

    const popupViews = usePopupConfigStore((s) => s.views);
    const popupTypeDefaults = usePopupConfigStore((s) => s.typeDefaults);

    // Resolution order when no explicit action is stored:
    //   1. Admin-configured type default (dynamic — admin edits propagate live)
    //   2. Built-in default for known widget types (dimmer, thermostat, …)
    //   3. 'none'
    const typeDefaultViewId = !storedAction ? popupTypeDefaults[config.type] : undefined;
    const builtInDefault = !storedAction && !typeDefaultViewId ? defaultActionForConfig(config) : null;
    const action: ClickAction = storedAction ??
        (typeDefaultViewId ? { kind: 'popup-view' as const, viewId: typeDefaultViewId } : null) ??
        builtInDefault ?? { kind: 'none' as const };
    const isTypeDefaultActive = !!typeDefaultViewId;
    const hasFallback = !!popupTypeDefaults[config.type] || !!defaultActionForConfig(config);

    const isPopup = action.kind.startsWith('popup-');

    // Layout/Tab/Widget selectors for link modes
    const selLayout = action.kind === 'link-tab' || action.kind === 'link-widget' ? action.layoutId : '';
    const selTab = action.kind === 'link-tab' || action.kind === 'link-widget' ? action.tabId : '';
    const tabsForLayout = layouts.find((l) => l.id === selLayout)?.tabs ?? [];
    const widgetsForTab = tabsForLayout.find((t) => t.id === selTab)?.widgets ?? [];

    // All widgets across all layouts (for popup-widget)
    const allWidgets = layouts.flatMap((l) => l.tabs.flatMap((t) => t.widgets));

    return (
        <div className="space-y-4">
            {/* Mode dropdown */}
            <div>
                <label className={labelCls} style={labelStyle}>
                    Aktion
                </label>
                <select
                    value={action.kind}
                    onChange={(e) => setMode(e.target.value as ClickAction['kind'])}
                    className={inputCls}
                    style={inputStyle}
                >
                    {MODE_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                            {g.modes.map((m) => (
                                <option key={m} value={m}>
                                    {modeLabel(m)}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                {isTypeDefaultActive && (
                    <p
                        className="text-[11px] mt-1.5 px-2 py-1.5 rounded-lg"
                        style={{
                            background: 'var(--accent)18',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)44',
                        }}
                    >
                        Vom Typ-Standard geerbt – ändert sich automatisch mit der Admin-Einstellung. Wähle
                        &bdquo;Aus&rdquo; zum Deaktivieren.
                    </p>
                )}
                {rawStoredAction && hasFallback && (
                    <button
                        onClick={resetToTypeDefault}
                        className="text-[11px] mt-1.5 w-full px-2 py-1.5 rounded-lg text-left hover:opacity-80 transition-opacity"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        ↩ Auf Typ-Standard zurücksetzen
                    </button>
                )}
            </div>

            {/* ── Mode-specific fields ── */}

            {action.kind === 'popup-image' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Bild-URL
                        </label>
                        <input
                            type="text"
                            value={action.url ?? ''}
                            onChange={(e) => setAction({ ...action, url: e.target.value })}
                            placeholder="https://… oder leer lassen für Datenpunkt"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Datenpunkt (URL/Base64)
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={action.dp ?? ''}
                                onChange={(e) => setAction({ ...action, dp: e.target.value })}
                                placeholder="z. B. 0_userdata.0.image"
                                className={inputCls}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                                onClick={() => setDpPickerTarget('image-dp')}
                                className="px-2 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Skalierung
                        </label>
                        <select
                            value={action.fit ?? 'contain'}
                            onChange={(e) => setAction({ ...action, fit: e.target.value as 'contain' | 'cover' })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="contain">Contain</option>
                            <option value="cover">Cover</option>
                        </select>
                    </div>
                </div>
            )}

            {action.kind === 'popup-iframe' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            URL
                        </label>
                        <input
                            type="text"
                            value={action.url}
                            onChange={(e) => setAction({ ...action, url: e.target.value })}
                            placeholder="https://…"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                    {(() => {
                        const preset = (action.sandboxPreset ?? (action.sandbox ? 'extended' : 'off')) as SandboxPreset;
                        const info = SANDBOX_PRESETS.find((p) => p.value === preset) ?? SANDBOX_PRESETS[0];
                        return (
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    Sandbox
                                </label>
                                <select
                                    value={preset}
                                    onChange={(e) =>
                                        setAction({
                                            ...action,
                                            sandboxPreset: e.target.value as SandboxPreset,
                                            sandbox: undefined,
                                        })
                                    }
                                    className={inputCls}
                                    style={inputStyle}
                                >
                                    {SANDBOX_PRESETS.map((p) => (
                                        <option key={p.value} value={p.value}>
                                            {p.label}
                                        </option>
                                    ))}
                                </select>
                                <p
                                    className="text-[10px] mt-1 leading-tight"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                >
                                    {info.description}
                                </p>
                                {preset !== 'off' && preset !== 'custom' && info.flags && (
                                    <p
                                        className="text-[10px] mt-0.5 font-mono leading-tight"
                                        style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                                    >
                                        {info.flags}
                                    </p>
                                )}
                                {preset === 'custom' && (
                                    <input
                                        type="text"
                                        value={action.sandboxCustom ?? ''}
                                        onChange={(e) =>
                                            setAction({ ...action, sandboxCustom: e.target.value || undefined })
                                        }
                                        placeholder="allow-scripts allow-forms"
                                        className={`${inputCls} font-mono mt-1`}
                                        style={inputStyle}
                                    />
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {action.kind === 'popup-json' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Datenpunkt
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={action.dp ?? ''}
                                onChange={(e) => setAction({ ...action, dp: e.target.value })}
                                placeholder="Datenpunkt-ID oder leer lassen"
                                className={inputCls}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                                onClick={() => setDpPickerTarget('json-dp')}
                                className="px-2 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            JSON (statisch, falls kein DP)
                        </label>
                        <textarea
                            value={action.json ?? ''}
                            onChange={(e) => setAction({ ...action, json: e.target.value })}
                            rows={4}
                            placeholder='{"key": "value"}'
                            className={inputCls}
                            style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                        />
                    </div>
                </div>
            )}

            {action.kind === 'popup-html' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Datenpunkt
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={action.dp ?? ''}
                                onChange={(e) => setAction({ ...action, dp: e.target.value })}
                                placeholder="Datenpunkt-ID oder leer lassen"
                                className={inputCls}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                                onClick={() => setDpPickerTarget('html-dp')}
                                className="px-2 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            HTML (statisch, falls kein DP)
                        </label>
                        <textarea
                            value={action.html ?? ''}
                            onChange={(e) => setAction({ ...action, html: e.target.value })}
                            rows={5}
                            placeholder="<p>HTML-Inhalt</p>"
                            className={inputCls}
                            style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                        />
                    </div>
                </div>
            )}

            {action.kind === 'popup-thermostat' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Soll-Temperatur Datenpunkt
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={action.setpointDp ?? ''}
                                onChange={(e) => setAction({ ...action, setpointDp: e.target.value })}
                                placeholder="leer = Widget-Datenpunkt"
                                className={inputCls}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                                onClick={() => setDpPickerTarget('thermo-setpoint')}
                                className="px-2 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Ist-Temperatur Datenpunkt
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={action.modeDp ?? ''}
                                onChange={(e) => setAction({ ...action, modeDp: e.target.value })}
                                placeholder="leer = keine Ist-Anzeige"
                                className={inputCls}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                                onClick={() => setDpPickerTarget('thermo-mode')}
                                className="px-2 rounded-lg"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Database size={13} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {action.kind === 'popup-widget' &&
                (() => {
                    const selectedId = action.widgetId ?? '';
                    const filteredWidgets = allWidgets
                        .filter((w) => w.id !== config.id)
                        .sort((a, b) => (a.title || a.type).localeCompare(b.title || b.type, 'de'))
                        .filter((w) => {
                            if (!widgetSearch) return true;
                            const q = widgetSearch.toLowerCase();
                            return (
                                (w.title || w.type).toLowerCase().includes(q) ||
                                w.id.toLowerCase().includes(q) ||
                                w.type.toLowerCase().includes(q)
                            );
                        });
                    const rowStyle = (id: string): React.CSSProperties => ({
                        padding: '4px 8px',
                        cursor: 'pointer',
                        background: selectedId === id ? 'var(--accent)' : 'transparent',
                        color: selectedId === id ? '#fff' : 'var(--text-primary)',
                        borderRadius: 4,
                    });
                    return (
                        <div className="space-y-1.5">
                            <label className={labelCls} style={labelStyle}>
                                Ziel-Widget (leer = dieses Widget vergrößert)
                            </label>
                            <input
                                type="text"
                                value={widgetSearch}
                                onChange={(e) => setWidgetSearch(e.target.value)}
                                placeholder="Suchen nach Name oder ID…"
                                className={inputCls}
                                style={inputStyle}
                            />
                            <div
                                style={{
                                    ...inputStyle,
                                    padding: '4px',
                                    maxHeight: 180,
                                    overflowY: 'auto',
                                    borderRadius: 8,
                                }}
                            >
                                {/* header */}
                                <div
                                    className="grid gap-x-2 px-2 pb-1 text-[10px]"
                                    style={{
                                        gridTemplateColumns: '1fr 90px 1fr',
                                        color: 'var(--text-secondary)',
                                        borderBottom: '1px solid var(--app-border)',
                                    }}
                                >
                                    <span>Titel</span>
                                    <span>Typ</span>
                                    <span>ID</span>
                                </div>
                                {/* "this widget" row */}
                                <div
                                    className="grid gap-x-2 px-2 rounded text-xs"
                                    style={{ ...rowStyle(''), gridTemplateColumns: '1fr 90px 1fr' }}
                                    onClick={() => setAction({ ...action, widgetId: undefined })}
                                >
                                    <span className="truncate italic">— Dieses Widget —</span>
                                    <span />
                                    <span />
                                </div>
                                {filteredWidgets.map((w) => (
                                    <div
                                        key={w.id}
                                        className="grid gap-x-2 px-2 rounded text-xs"
                                        style={{ ...rowStyle(w.id), gridTemplateColumns: '1fr 90px 1fr' }}
                                        onClick={() => setAction({ ...action, widgetId: w.id })}
                                    >
                                        <span className="truncate">{w.title || '–'}</span>
                                        <span className="truncate" style={{ opacity: 0.75 }}>
                                            {w.type}
                                        </span>
                                        <span className="truncate" style={{ opacity: 0.6, fontFamily: 'monospace' }}>
                                            {w.id}
                                        </span>
                                    </div>
                                ))}
                                {filteredWidgets.length === 0 && (
                                    <div className="px-2 py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                        Keine Widgets gefunden
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

            {action.kind === 'popup-view' && (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Popup-View
                    </label>
                    <select
                        value={action.viewId}
                        onChange={(e) => setAction({ ...action, viewId: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="">— View wählen —</option>
                        {popupViews.map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.name}
                            </option>
                        ))}
                    </select>
                    {popupViews.length === 0 && (
                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Noch keine Views konfiguriert. Unter Admin → Popups anlegen.
                        </p>
                    )}

                    <label className={labelCls} style={{ ...labelStyle, marginTop: 12 }}>
                        Haupt-DP für Popup (leer = Widget-Datenpunkt)
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={action.dp ?? ''}
                            onChange={(e) => setAction({ ...action, dp: e.target.value || undefined })}
                            placeholder={config.datapoint || 'z. B. 0_userdata.0.Anzeige'}
                            className={inputCls}
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                            onClick={() => setDpPickerTarget('view-dp')}
                            className="px-2 rounded-lg"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <Database size={13} />
                        </button>
                    </div>
                    <p
                        className="text-[10px] mt-1 leading-tight"
                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                    >
                        Wird im Popup als <span className="font-mono">{'{{dp}}'}</span> übergeben; daraus abgeleitet{' '}
                        <span className="font-mono">{'{{parent}}'}</span> (Strang) und{' '}
                        <span className="font-mono">{'{{name}}'}</span>. Für Universal-Widgets ohne Datenpunkt hier den
                        DP setzen.
                    </p>
                </div>
            )}

            {action.kind === 'link-tab' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Layout
                        </label>
                        <select
                            value={action.layoutId}
                            onChange={(e) => {
                                const lay = layouts.find((l) => l.id === e.target.value);
                                setAction({
                                    kind: 'link-tab',
                                    layoutId: e.target.value,
                                    tabId: lay?.tabs[0]?.id ?? '',
                                });
                            }}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {layouts.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Tab
                        </label>
                        <select
                            value={action.tabId}
                            onChange={(e) => setAction({ ...action, tabId: e.target.value })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {tabsForLayout.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {action.kind === 'link-external' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            URL
                        </label>
                        <input
                            type="text"
                            value={action.url}
                            onChange={(e) => setAction({ ...action, url: e.target.value })}
                            placeholder="https://…"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                    <Toggle
                        checked={action.newTab ?? false}
                        onChange={(v) => setAction({ ...action, newTab: v })}
                        label="In neuem Tab öffnen"
                    />
                    {!action.newTab && (
                        <p
                            className="text-[11px] px-2 py-1.5 rounded-lg"
                            style={{
                                background: 'var(--accent-red, #ef4444)11',
                                color: 'var(--accent-red, #ef4444)',
                                border: '1px solid var(--accent-red, #ef4444)33',
                            }}
                        >
                            Aura wird verlassen – alle nicht gespeicherten Änderungen gehen verloren.
                        </p>
                    )}
                </div>
            )}

            {action.kind === 'link-widget' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Layout
                        </label>
                        <select
                            value={action.layoutId}
                            onChange={(e) => {
                                const lay = layouts.find((l) => l.id === e.target.value);
                                const tab = lay?.tabs[0];
                                setAction({
                                    kind: 'link-widget',
                                    layoutId: e.target.value,
                                    tabId: tab?.id ?? '',
                                    widgetId: tab?.widgets[0]?.id ?? '',
                                });
                            }}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {layouts.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Tab
                        </label>
                        <select
                            value={action.tabId}
                            onChange={(e) => {
                                const tab = tabsForLayout.find((t) => t.id === e.target.value);
                                setAction({ ...action, tabId: e.target.value, widgetId: tab?.widgets[0]?.id ?? '' });
                            }}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {tabsForLayout.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Widget
                        </label>
                        <select
                            value={action.widgetId}
                            onChange={(e) => setAction({ ...action, widgetId: e.target.value })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            {widgetsForTab.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.title || w.type} ({w.id})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* ── Popup-wide options (for all popup-* modes) ── */}
            {isPopup && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <Toggle
                        checked={popupHideTitle}
                        onChange={(v) => setOpts({ popupHideTitle: v || undefined })}
                        label="Titel ausblenden"
                    />
                    {!popupHideTitle && (
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Custom Popup-Titel (leer = Widget-Titel)
                            </label>
                            <input
                                type="text"
                                value={popupTitle}
                                onChange={(e) => setOpts({ popupTitle: e.target.value || undefined })}
                                placeholder={config.title || 'Widget-Titel'}
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    )}
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className={labelCls} style={labelStyle}>
                                Breite (px, leer = auto)
                            </label>
                            <input
                                type="number"
                                min={200}
                                max={1600}
                                step={50}
                                value={popupWidth ?? ''}
                                onChange={(e) =>
                                    setOpts({ popupWidth: e.target.value ? Number(e.target.value) : undefined })
                                }
                                placeholder="600"
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                        <div className="flex-1">
                            <label className={labelCls} style={labelStyle}>
                                Höhe (px, leer = auto)
                            </label>
                            <input
                                type="number"
                                min={200}
                                max={1200}
                                step={50}
                                value={popupHeight ?? ''}
                                onChange={(e) =>
                                    setOpts({ popupHeight: e.target.value ? Number(e.target.value) : undefined })
                                }
                                placeholder="auto"
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Auto-Schließen nach (Sek., 0 = aus, leer = View/Global)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={3600}
                            step={1}
                            value={popupAutoCloseSec ?? ''}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') return setOpts({ popupAutoCloseSec: undefined });
                                const n = Number(raw);
                                setOpts({ popupAutoCloseSec: Number.isFinite(n) && n >= 0 ? n : undefined });
                            }}
                            placeholder="View/Global"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                </div>
            )}

            {/* DatapointPicker modals */}
            {dpPickerTarget && (
                <DatapointPicker
                    currentValue={(() => {
                        if (dpPickerTarget === 'image-dp')
                            return action.kind === 'popup-image' ? (action.dp ?? '') : '';
                        if (dpPickerTarget === 'json-dp') return action.kind === 'popup-json' ? (action.dp ?? '') : '';
                        if (dpPickerTarget === 'html-dp') return action.kind === 'popup-html' ? (action.dp ?? '') : '';
                        if (dpPickerTarget === 'thermo-setpoint')
                            return action.kind === 'popup-thermostat' ? (action.setpointDp ?? '') : '';
                        if (dpPickerTarget === 'thermo-mode')
                            return action.kind === 'popup-thermostat' ? (action.modeDp ?? '') : '';
                        if (dpPickerTarget === 'view-dp') return action.kind === 'popup-view' ? (action.dp ?? '') : '';
                        return '';
                    })()}
                    onSelect={(id) => {
                        if (dpPickerTarget === 'image-dp' && action.kind === 'popup-image')
                            setAction({ ...action, dp: id });
                        if (dpPickerTarget === 'json-dp' && action.kind === 'popup-json')
                            setAction({ ...action, dp: id });
                        if (dpPickerTarget === 'html-dp' && action.kind === 'popup-html')
                            setAction({ ...action, dp: id });
                        if (dpPickerTarget === 'thermo-setpoint' && action.kind === 'popup-thermostat')
                            setAction({ ...action, setpointDp: id });
                        if (dpPickerTarget === 'thermo-mode' && action.kind === 'popup-thermostat')
                            setAction({ ...action, modeDp: id });
                        if (dpPickerTarget === 'view-dp' && action.kind === 'popup-view')
                            setAction({ ...action, dp: id });
                        setDpPickerTarget(null);
                    }}
                    onClose={() => setDpPickerTarget(null)}
                />
            )}
        </div>
    );
}
