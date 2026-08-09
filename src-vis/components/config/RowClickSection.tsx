import type { ClickAction, WidgetConfig } from '../../types';
import type { RowClickSetting, RowPopupOptions } from '../../utils/rowClickAction';
import { ClickActionEditor } from './ClickActionEditor';

type Mode = 'auto' | 'off' | 'custom';

/**
 * Per-entry override for the static list. Only the three meaningful choices are
 * offered here - a fully custom action stays a list-wide setting so the row editor
 * does not grow a nested popup editor.
 */
export function RowClickEntryField({
    value,
    onChange,
}: {
    value: RowClickSetting | undefined;
    onChange: (next: RowClickSetting | undefined) => void;
}) {
    const current = value === undefined ? 'inherit' : value === 'auto' ? 'auto' : value.kind === 'none' ? 'off' : 'own';
    return (
        <select
            value={current}
            onChange={(e) => {
                const v = e.target.value;
                if (v === 'inherit') onChange(undefined);
                else if (v === 'auto') onChange('auto');
                else if (v === 'off') onChange({ kind: 'none' });
            }}
            className="w-full text-[10px] rounded px-2 py-0.5 focus:outline-none"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--app-border)',
            }}
        >
            <option value="inherit">Wie Liste</option>
            <option value="auto">Automatisch</option>
            <option value="off">Aus</option>
            {current === 'own' && <option value="own">Eigene Aktion</option>}
        </select>
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
 * Automatic mode derives the popup from each row's datapoint role, so a dimmer row
 * opens the dimmer popup and a sensor row the generic datapoint popup. A custom
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
    const mode: Mode = stored === undefined || stored === 'auto' ? 'auto' : stored.kind === 'none' ? 'off' : 'custom';

    const setMode = (next: Mode) => {
        if (next === mode) return;
        if (next === 'auto') return onChange({ rowClickAction: undefined });
        if (next === 'off') return onChange({ rowClickAction: { kind: 'none' } });
        onChange({ rowClickAction: { kind: 'popup-view', viewId: '' } });
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
                            clickAction: typeof stored === 'object' ? stored : undefined,
                            popupTitle: opts.rowPopupTitle,
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
                            rowPopupWidth: o.popupWidth as number | undefined,
                            rowPopupHeight: o.popupHeight as number | undefined,
                            rowPopupAutoCloseSec: o.popupAutoCloseSec as number | undefined,
                        });
                    }}
                />
            )}
        </div>
    );
}
