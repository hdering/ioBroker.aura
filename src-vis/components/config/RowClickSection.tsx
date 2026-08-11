import type { ClickAction, WidgetConfig } from '../../types';
import { DEFAULT_ROW_CLICK_ACTION, type RowClickSetting, type RowPopupOptions } from '../../utils/rowClickAction';
import { ClickActionEditor } from './ClickActionEditor';

type Mode = 'auto' | 'off' | 'custom';

const ENTRY_MODE_HINT: Record<string, string> = {
    inherit: 'Übernimmt, was im Tab „Klick auf Zeile“ für die ganze Liste eingestellt ist.',
    auto: 'Leitet das Popup aus der Rolle dieses Datenpunkts ab – auch wenn die Liste auf „Aus“ oder eine eigene Aktion steht.',
    off: 'Diese Zeile reagiert nicht auf Klicks.',
    own: 'Gilt nur für diese Zeile. Popup-Größe kommt weiterhin aus der Listen-Einstellung.',
};

/**
 * Per-entry click action. Beyond inherit/auto/off it offers a fully custom action
 * through the regular ClickActionEditor, so one row can open a widget popup while
 * the next jumps to another tab. The popup size block stays list-wide and is hidden
 * here; only the heading gets a per-entry override, because that is the one thing
 * that is genuinely per datapoint.
 */
export function RowClickEntryField({
    config,
    value,
    onChange,
    popupTitle,
    onPopupTitleChange,
    titlePlaceholder,
    popupHideTitle,
    onPopupHideTitleChange,
    listHidesTitle,
}: {
    /** The list widget's config - the editor uses it for layout/widget pickers. */
    config: WidgetConfig;
    value: RowClickSetting | undefined;
    onChange: (next: RowClickSetting | undefined) => void;
    /** Per-entry popup heading; empty = list-wide title, else the row name. */
    popupTitle?: string;
    onPopupTitleChange?: (next: string | undefined) => void;
    /** What the popup shows when no per-entry title is set (row name / list title). */
    titlePlaceholder?: string;
    /** Per-entry title bar: undefined = inherit, true = hide, false = force show. */
    popupHideTitle?: boolean;
    onPopupHideTitleChange?: (next: boolean | undefined) => void;
    /** The list-wide setting, so "Wie Liste" can show what it resolves to. */
    listHidesTitle?: boolean;
}) {
    const current = value === undefined ? 'inherit' : value === 'auto' ? 'auto' : value.kind === 'none' ? 'off' : 'own';
    const custom = current === 'own' ? (value as ClickAction) : undefined;
    // Navigation actions have no header of their own, so the field would be dead.
    const opensPopup = current !== 'off' && (!custom || custom.kind.startsWith('popup-'));

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    Klick auf Zeile
                </label>
                <select
                    value={current}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'inherit') onChange(undefined);
                        else if (v === 'auto') onChange('auto');
                        else if (v === 'off') onChange({ kind: 'none' });
                        else onChange(DEFAULT_ROW_CLICK_ACTION);
                    }}
                    className="text-[10px] rounded px-2 py-0.5 focus:outline-none"
                    style={{
                        width: 150,
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <option value="inherit">Wie Liste</option>
                    <option value="auto">Automatisch</option>
                    <option value="off">Aus</option>
                    <option value="own">Eigene Aktion</option>
                </select>
            </div>
            <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                {ENTRY_MODE_HINT[current]}
            </p>
            {current === 'own' && (
                <div
                    className="rounded-lg p-2 mt-1"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <ClickActionEditor
                        config={{ ...config, options: { clickAction: custom } }}
                        onConfigChange={(next) => {
                            const action = next.options?.clickAction as ClickAction | undefined;
                            onChange(action ?? { kind: 'none' });
                        }}
                        hidePopupOptions
                        hideNone
                    />
                </div>
            )}
            {opensPopup && onPopupHideTitleChange && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                    <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        Popup-Titelzeile
                    </label>
                    <select
                        value={popupHideTitle === undefined ? 'inherit' : popupHideTitle ? 'hide' : 'show'}
                        onChange={(e) => {
                            const v = e.target.value;
                            onPopupHideTitleChange(v === 'inherit' ? undefined : v === 'hide');
                        }}
                        className="text-[10px] rounded px-2 py-0.5 focus:outline-none"
                        style={{
                            width: 150,
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <option value="inherit">Wie Liste ({listHidesTitle ? 'aus' : 'an'})</option>
                        <option value="show">Anzeigen</option>
                        <option value="hide">Ausblenden</option>
                    </select>
                </div>
            )}
            {opensPopup && onPopupTitleChange && !(popupHideTitle ?? listHidesTitle) && (
                <div className="pt-0.5">
                    <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Popup-Titel
                    </label>
                    <input
                        type="text"
                        value={popupTitle ?? ''}
                        onChange={(e) => onPopupTitleChange(e.target.value || undefined)}
                        placeholder={titlePlaceholder || 'Name des Datenpunkts'}
                        className="w-full text-[10px] rounded px-2 py-0.5 focus:outline-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

const MODES: { value: Mode; label: string }[] = [
    { value: 'auto', label: 'Automatisch' },
    { value: 'off', label: 'Aus' },
    { value: 'custom', label: 'Eigene Aktion' },
];

/**
 * "Klick auf Zeile" - shared by the static and the dynamic list config panel.
 *
 * Default (nothing stored) is "Aus" - a row click does nothing until an action is
 * picked. "Eigene Aktion" then starts from DEFAULT_ROW_CLICK_ACTION (the datapoint
 * list of the clicked row's branch). Automatic mode derives the popup from each
 * row's datapoint role instead, so a dimmer row opens the dimmer popup and a sensor
 * row the generic datapoint popup. A custom
 * action reuses the regular ClickActionEditor through a proxy config: it reads
 * options.clickAction / popupTitle / popupWidth / popupHeight / popupAutoCloseSec,
 * which are mapped onto the row* option keys here.
 */
export function RowClickSection({
    config,
    opts,
    onChange,
}: {
    config: WidgetConfig;
    opts: RowPopupOptions;
    onChange: (patch: RowPopupOptions) => void;
}) {
    const stored = opts.rowClickAction;
    // undefined = not configured = off, so rows stay inert until an action is picked.
    const mode: Mode =
        stored === undefined ? 'off' : stored === 'auto' ? 'auto' : stored.kind === 'none' ? 'off' : 'custom';
    const customAction = typeof stored === 'object' ? stored : DEFAULT_ROW_CLICK_ACTION;

    const setMode = (next: Mode) => {
        if (next === mode) return;
        if (next === 'auto') return onChange({ rowClickAction: 'auto' });
        if (next === 'off') return onChange({ rowClickAction: { kind: 'none' } });
        onChange({ rowClickAction: DEFAULT_ROW_CLICK_ACTION });
    };

    return (
        <div>
            <div style={{ height: 1, background: 'var(--app-border)', marginBottom: 10 }} />
            <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Klick auf Zeile
            </label>
            <div className="flex gap-1 mb-1.5">
                {MODES.map((m) => (
                    <button
                        key={m.value}
                        onClick={() => setMode(m.value)}
                        className="flex-1 text-[11px] rounded-lg px-2 py-1.5 transition-colors"
                        style={{
                            background: mode === m.value ? 'var(--accent)' : 'var(--app-bg)',
                            color: mode === m.value ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${mode === m.value ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        {m.label}
                    </button>
                ))}
            </div>
            {mode === 'auto' && (
                <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    Das Popup wird aus der Rolle des Datenpunkts abgeleitet: Dimmer-Popup, Schalter-Popup, Rolladen,
                    Thermostat - sonst ein generisches Datenpunkt-Popup. Klicks auf Schalter oder Regler in der Zeile
                    schalten weiterhin direkt.
                </p>
            )}
            {mode === 'custom' && (
                <ClickActionEditor
                    config={{
                        ...config,
                        options: {
                            clickAction: customAction,
                            popupTitle: opts.rowPopupTitle,
                            popupHideTitle: opts.rowPopupHideTitle,
                            popupWidth: opts.rowPopupWidth,
                            popupHeight: opts.rowPopupHeight,
                            popupAutoCloseSec: opts.rowPopupAutoCloseSec,
                        },
                    }}
                    onConfigChange={(next) => {
                        const o = next.options ?? {};
                        onChange({
                            rowClickAction: (o.clickAction as ClickAction | undefined) ?? { kind: 'none' },
                            rowPopupTitle: o.popupTitle as string | undefined,
                            rowPopupHideTitle: o.popupHideTitle as boolean | undefined,
                            rowPopupWidth: o.popupWidth as number | undefined,
                            rowPopupHeight: o.popupHeight as number | undefined,
                            rowPopupAutoCloseSec: o.popupAutoCloseSec as number | undefined,
                        });
                    }}
                    hideNone
                />
            )}
        </div>
    );
}
