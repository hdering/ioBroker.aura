/**
 * FillStatusSection — the optional status datapoints of the fill widget (#671, #691).
 *
 * "Charging", "discharging" and "connected" are statements about the device, not about
 * the level, so they get their own block below the colours. Each row is a datapoint plus
 * the rule that turns its value into a yes/no: an HmIP flag is a boolean, an `UNREACH` is
 * an inverted one, and a PV storage reports a pack power that is positive while charging
 * and negative while feeding back — that one id fills both rows, with `gt0` above and
 * `lt0` below, which is why the discharge field offers to copy it over.
 *
 * Everything below only shows up once the datapoint above it is filled — an empty field
 * means the widget looks exactly as it always did.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import { ColorPicker } from '../common/ColorPicker';
import { IconPickerModal } from './IconPickerModal';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { DEFAULT_CHARGE_ICON, DEFAULT_DISCHARGE_ICON, DEFAULT_OFFLINE_ICON } from '../widgets/FillStatus';
import {
    FILL_CONDITIONS,
    DEFAULT_DISCHARGE_CONDITION,
    type FillCondition,
    type FillChargeEffect,
} from '../../utils/fillStatus';

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

/** Which row a datapoint picker / icon picker was opened for. */
type DpKey = 'charge' | 'discharge' | 'connected';
type IconKey = 'charge' | 'discharge' | 'offline';

const DP_OPTION: Record<DpKey, string> = {
    charge: 'chargeDatapoint',
    discharge: 'dischargeDatapoint',
    connected: 'connectedDatapoint',
};
const ICON_OPTION: Record<IconKey, string> = {
    charge: 'chargeIcon',
    discharge: 'dischargeIcon',
    offline: 'offlineIcon',
};
const ICON_DEFAULT: Record<IconKey, string> = {
    charge: DEFAULT_CHARGE_ICON,
    discharge: DEFAULT_DISCHARGE_ICON,
    offline: DEFAULT_OFFLINE_ICON,
};

export interface FillStatusSectionProps {
    options: Record<string, unknown>;
    set: (patch: Record<string, unknown>) => void;
    /** Opens the panel's datapoint picker for that row. */
    onPick: (which: DpKey) => void;
    /** Panel input classes / styling (fCls / fSty). */
    inputClassName: string;
    inputStyle?: React.CSSProperties;
    /** Default colours of the three badges. */
    chargeColor: string;
    dischargeColor: string;
    offlineColor: string;
}

export function FillStatusSection({
    options: o,
    set,
    onPick,
    inputClassName,
    inputStyle,
    chargeColor,
    dischargeColor,
    offlineColor,
}: FillStatusSectionProps) {
    const chargeDp = (o.chargeDatapoint as string) ?? '';
    const dischargeDp = (o.dischargeDatapoint as string) ?? '';
    const connectedDp = (o.connectedDatapoint as string) ?? '';
    const [iconPicker, setIconPicker] = useState<IconKey | null>(null);

    const label = (text: string) => (
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            {text}
        </label>
    );

    const dpRow = (which: DpKey, value: string, text: string, placeholder: string) => (
        <div>
            {label(text)}
            <div className="flex gap-1">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => set({ [DP_OPTION[which]]: e.target.value })}
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

    const conditionRow = (
        key: 'chargeCondition' | 'dischargeCondition' | 'connectedCondition',
        text: string,
        def: FillCondition = 'true',
    ) => (
        <div>
            {label(text)}
            <select
                value={(o[key] as FillCondition) ?? def}
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

    /** The fill effect while the state holds. Same three choices for both directions. */
    const effectRow = (key: 'chargeEffect' | 'dischargeEffect', text: string) => (
        <div>
            {label(text)}
            <select
                value={(o[key] as FillChargeEffect) ?? 'none'}
                onChange={(e) => set({ [key]: e.target.value })}
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
    );

    /** Icon button + name, like the limits editor. Empty stored value = the default icon. */
    const iconRow = (which: IconKey, text: string) => {
        const key = ICON_OPTION[which];
        const fallback = ICON_DEFAULT[which];
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

    const colorRow = (key: 'chargeColor' | 'dischargeColor' | 'offlineColor', text: string, fallback: string) => (
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
                    {effectRow('chargeEffect', 'Effekt während des Ladens')}
                    {toggle('showChargeIcon', 'Icon anzeigen')}
                    {(o.showChargeIcon ?? true) !== false && iconRow('charge', 'Icon beim Laden')}
                    {colorRow('chargeColor', 'Farbe (Icon und Lauflicht)', chargeColor)}
                </>
            )}

            {dpRow('discharge', dischargeDp, 'Entladen aus Datenpunkt', 'z. B. …packPower (leer = aus)')}
            {/* A signed power answers both questions. One click saves typing the id twice. */}
            {dischargeDp.trim() === '' && chargeDp.trim() !== '' && (
                <button
                    type="button"
                    onClick={() => set({ dischargeDatapoint: chargeDp })}
                    className="text-[10px] text-left underline underline-offset-2 hover:opacity-80 -mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    Denselben Datenpunkt wie beim Laden übernehmen
                </button>
            )}
            {dischargeDp.trim() !== '' && (
                <>
                    {conditionRow('dischargeCondition', 'Entlädt, wenn der Wert …', DEFAULT_DISCHARGE_CONDITION)}
                    {effectRow('dischargeEffect', 'Effekt während des Entladens')}
                    {toggle('showDischargeIcon', 'Icon anzeigen')}
                    {(o.showDischargeIcon ?? true) !== false && iconRow('discharge', 'Icon beim Entladen')}
                    {colorRow('dischargeColor', 'Farbe (Icon und Lauflicht)', dischargeColor)}
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
                Alle drei Datenpunkte werden nur gelesen. Eine vorzeichenbehaftete Leistung deckt Laden und Entladen ab
                — oben „größer 0“, unten „kleiner 0“. Ein <code>UNREACH</code>-Datenpunkt meldet die Störung, nicht die
                Verbindung — dort „falsch / 0“ wählen. Das Custom-Layout zeigt keinen Status.
            </p>

            {iconPicker && (
                <IconPickerModal
                    current={(o[ICON_OPTION[iconPicker]] as string) ?? ''}
                    onSelect={(name) => {
                        set({ [ICON_OPTION[iconPicker]]: name || undefined });
                        setIconPicker(null);
                    }}
                    onClose={() => setIconPicker(null)}
                />
            )}
        </>
    );
}
