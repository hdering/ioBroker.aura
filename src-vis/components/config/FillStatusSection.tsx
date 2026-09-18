/**
 * FillStatusSection — the two optional status datapoints of the fill widget (#671).
 *
 * "Charging" and "connected" are statements about the device, not about the level, so
 * they get their own block below the colours. Each row is a datapoint plus the rule that
 * turns its value into a yes/no: an HmIP flag is a boolean, an `UNREACH` is an inverted
 * one, and a PV storage reports a charge power that is positive while charging and
 * negative while feeding back.
 *
 * Everything below only shows up once the datapoint above it is filled — an empty field
 * means the widget looks exactly as it always did.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import { ColorPicker } from '../common/ColorPicker';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { DEFAULT_CHARGE_ICON, DEFAULT_OFFLINE_ICON } from '../widgets/FillStatus';
import { FILL_CONDITIONS, type FillCondition, type FillChargeEffect } from '../../utils/fillStatus';

const CONDITION_LABEL: Record<FillCondition, string> = {
    true: 'wahr / 1',
    false: 'falsch / 0',
    gt0: 'größer 0',
    lt0: 'kleiner 0',
};

const EFFECT_LABEL: Record<FillChargeEffect, string> = {
    none: 'kein Effekt',
    blink: 'Blinken',
    scan: 'Lauflicht',
};

export interface FillStatusSectionProps {
    options: Record<string, unknown>;
    set: (patch: Record<string, unknown>) => void;
    /** Opens the panel's datapoint picker for that row. */
    onPick: (which: 'charge' | 'connected') => void;
    /** Panel input classes / styling (fCls / fSty). */
    inputClassName: string;
    inputStyle?: React.CSSProperties;
    /** Default colours of the two badges. */
    chargeColor: string;
    offlineColor: string;
}

export function FillStatusSection({
    options: o,
    set,
    onPick,
    inputClassName,
    inputStyle,
    chargeColor,
    offlineColor,
}: FillStatusSectionProps) {
    const chargeDp = (o.chargeDatapoint as string) ?? '';
    const connectedDp = (o.connectedDatapoint as string) ?? '';
    const [iconPicker, setIconPicker] = useState<'charge' | 'offline' | null>(null);

    const label = (text: string) => (
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            {text}
        </label>
    );

    const dpRow = (which: 'charge' | 'connected', value: string, text: string, placeholder: string) => (
        <div>
            {label(text)}
            <div className="flex gap-1">
                <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                        set(
                            which === 'charge'
                                ? { chargeDatapoint: e.target.value }
                                : { connectedDatapoint: e.target.value },
                        )
                    }
                    placeholder={placeholder}
                    className={`${inputClassName} font-mono flex-1 min-w-0`}
                    style={inputStyle}
                />
                <button
                    type="button"
                    onClick={() => onPick(which)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                    title="Datenpunkt wählen"
                >
                    <Database size={13} />
                </button>
            </div>
        </div>
    );

    const conditionRow = (key: 'chargeCondition' | 'connectedCondition', text: string) => (
        <div>
            {label(text)}
            <select
                value={(o[key] as FillCondition) ?? 'true'}
                onChange={(e) => set({ [key]: e.target.value })}
                className={inputClassName}
                style={inputStyle}
            >
                {FILL_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                        {CONDITION_LABEL[c]}
                    </option>
                ))}
            </select>
        </div>
    );

    const toggle = (key: string, text: string, def = true) => {
        const val = (o[key] as boolean | undefined) ?? def;
        return (
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {text}
                </label>
                <button
                    onClick={() => set({ [key]: !val })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: val ? '18px' : '2px' }}
                    />
                </button>
            </div>
        );
    };

    /** Icon button + name, like the limits editor. Empty stored value = the default icon. */
    const iconRow = (which: 'charge' | 'offline', text: string) => {
        const key = which === 'charge' ? 'chargeIcon' : 'offlineIcon';
        const fallback = which === 'charge' ? DEFAULT_CHARGE_ICON : DEFAULT_OFFLINE_ICON;
        const name = (o[key] as string) || '';
        const Icon = getWidgetIcon(name || fallback, null);
        return (
            <div>
                {label(text)}
                <button
                    onClick={() => setIconPicker(which)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 w-full hover:opacity-80"
                    style={inputStyle}
                >
                    {Icon ? <Icon size={15} /> : null}
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {name || `${fallback} (Standard)`}
                    </span>
                </button>
            </div>
        );
    };

    const colorRow = (key: 'chargeColor' | 'offlineColor', text: string, fallback: string) => (
        <div className="flex items-center justify-between">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {text}
            </label>
            <ColorPicker
                value={(o[key] as string) || fallback}
                onChange={(v) => set({ [key]: v })}
                className="w-8 h-8 rounded cursor-pointer shrink-0"
                style={{ border: '1px solid var(--app-border)', padding: '1px' }}
            />
        </div>
    );

    return (
        <>
            <div
                className="text-[10px] font-semibold uppercase tracking-wider pt-1"
                style={{ color: 'var(--text-secondary)' }}
            >
                Status
            </div>

            {dpRow('charge', chargeDp, 'Laden aus Datenpunkt', 'z. B. …CHARGING (leer = aus)')}
            {chargeDp.trim() !== '' && (
                <>
                    {conditionRow('chargeCondition', 'Lädt, wenn der Wert …')}
                    <div>
                        {label('Effekt während des Ladens')}
                        <select
                            value={(o.chargeEffect as FillChargeEffect) ?? 'none'}
                            onChange={(e) => set({ chargeEffect: e.target.value })}
                            className={inputClassName}
                            style={inputStyle}
                        >
                            {(['none', 'blink', 'scan'] as FillChargeEffect[]).map((e) => (
                                <option key={e} value={e}>
                                    {EFFECT_LABEL[e]}
                                </option>
                            ))}
                        </select>
                    </div>
                    {toggle('showChargeIcon', 'Icon anzeigen')}
                    {(o.showChargeIcon ?? true) !== false && iconRow('charge', 'Icon beim Laden')}
                    {colorRow('chargeColor', 'Farbe (Icon und Lauflicht)', chargeColor)}
                </>
            )}

            {dpRow('connected', connectedDp, 'Verbunden aus Datenpunkt', 'z. B. …UNREACH (leer = aus)')}
            {connectedDp.trim() !== '' && (
                <>
                    {conditionRow('connectedCondition', 'Verbunden, wenn der Wert …')}
                    {toggle('showOfflineIcon', 'Icon bei fehlender Verbindung')}
                    {(o.showOfflineIcon ?? true) !== false && iconRow('offline', 'Icon ohne Verbindung')}
                    {toggle('offlineDim', 'Anzeige ausgrauen, wenn getrennt')}
                    {colorRow('offlineColor', 'Farbe des Verbindungs-Icons', offlineColor)}
                </>
            )}

            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                Beide Datenpunkte werden nur gelesen. Ein <code>UNREACH</code>-Datenpunkt meldet die Störung, nicht die
                Verbindung — dort „falsch / 0" wählen. Das Custom-Layout zeigt keinen Status.
            </p>

            {iconPicker && (
                <IconPickerModal
                    current={(o[iconPicker === 'charge' ? 'chargeIcon' : 'offlineIcon'] as string) ?? ''}
                    onSelect={(name) => {
                        set({ [iconPicker === 'charge' ? 'chargeIcon' : 'offlineIcon']: name || undefined });
                        setIconPicker(null);
                    }}
                    onClose={() => setIconPicker(null)}
                />
            )}
        </>
    );
}
