/**
 * Editor panel for a single custom-grid cell.
 * Owns the cell-type select + per-type configuration UI + shared styling controls.
 * Extracted from WidgetFrame to keep that file focused on widget-level concerns.
 *
 * Picker dialogs (icon / DP / image picker) live in WidgetFrame and are opened
 * via the callbacks in props — this component never holds picker state itself.
 */
import React, { useState } from 'react';
import { Database, FolderOpen, HelpCircle, type LucideIcon } from 'lucide-react';
import { JsonPathButton } from '../config/JsonPathButton';
import type { CustomCell, WidgetType } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { FORMAT_LABELS, type DateOutputFormat } from '../widgets/DatePickerWidget';
import { IconPickerModal } from '../config/IconPickerModal';
import { ValueTransformButton } from '../config/ValueTransformButton';

export const CELL_LABELS: Record<string, string> = {
    empty: '–',
    title: 'Titel',
    value: 'Wert',
    unit: 'Einheit',
    text: 'Text',
    dp: 'DP',
    field: 'Feld',
    component: 'Aktion',
    switch: 'Schalter',
    slider: 'Regler',
    button: 'Button',
    icon: 'Icon',
    'state-icon': 'Status-Icon',
    datepicker: 'Datumswähler',
    stepper: 'Stepper',
    input: 'Eingabe',
    progress: 'Fortschritt',
    'state-text': 'Status-Text',
    select: 'Auswahl',
    lastchange: 'Letzte Änderung',
};

const COMPONENT_OPTIONS: Record<string, { key: string; label: string }[]> = {
    value: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    switch: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'toggle', label: 'Schalter' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    dimmer: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'slider', label: 'Dimmer-Slider' },
        { key: 'toggle', label: 'An/Aus-Schalter' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    slider: [
        { key: 'slider', label: 'Schieberegler' },
        { key: 'actions', label: 'Aktions-Buttons' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    thermostat: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'btn-plus', label: '+ Temperatur' },
        { key: 'btn-minus', label: '− Temperatur' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    shutter: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'btn-up', label: '▲ Hoch' },
        { key: 'btn-stop', label: '■ Stop' },
        { key: 'btn-down', label: '▼ Runter' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    windowcontact: [
        { key: 'icon', label: 'Status-Icon' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'lock-icon', label: 'Schloss-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    binarysensor: [
        { key: 'icon', label: 'Status-Icon' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    stateimage: [
        { key: 'icon', label: 'Zustands-Icon' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    httpRequest: [{ key: 'button', label: 'HTTP-Button' }],
    enum: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'select', label: 'Dropdown' },
        { key: 'label', label: 'Aktuelle Auswahl' },
    ],
    knob: [
        { key: 'dial', label: '🎛 Drehknopf' },
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    light: [
        { key: 'power', label: '⏻ Ein/Aus-Taste' },
        { key: 'brightness', label: '🔆 Helligkeit (Bar)' },
        { key: 'color', label: '🎨 Farbrad' },
        { key: 'temperature', label: '🌡 Lichtwärme (Bar)' },
        { key: 'effects', label: '✨ Effekt-Liste' },
        { key: 'presets', label: '● Farbpalette (8)' },
        { key: 'title', label: 'Titel' },
        { key: 'status', label: 'Status-Text' },
        { key: 'icon', label: 'Widget-Icon' },
    ],
    button: [{ key: 'icon', label: 'Button-Icon' }],
    input: [
        { key: 'input', label: '⌨ Eingabefeld' },
        { key: 'submit', label: '➤ Senden-Button' },
        { key: 'icon', label: 'Widget-Icon' },
    ],
    timer: [
        { key: 'icon', label: 'Status-Icon' },
        { key: 'master', label: '⏻ Master-Schalter' },
        { key: 'status', label: 'Status-Text' },
        { key: 'events', label: 'Ereignis-Liste' },
        { key: 'add', label: '+ Ereignis-Button' },
    ],
    clock: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'sunrise-icon', label: '🌅 Sonnenaufgang-Icon' },
        { key: 'sunset-icon', label: '🌇 Sonnenuntergang-Icon' },
        { key: 'city-icon', label: '📍 Ort-Icon' },
        { key: 'week-icon', label: '📅 KW-Icon' },
    ],
    mediaplayer: [
        { key: 'play-pause', label: '▶ / ⏸ Play / Pause' },
        { key: 'prev', label: '⏮ Vorheriger Titel' },
        { key: 'next', label: '⏭ Nächster Titel' },
        { key: 'shuffle', label: '⇄ Shuffle' },
        { key: 'repeat', label: '↺ Repeat' },
        { key: 'mute', label: '🔇 Mute / Unmute' },
        { key: 'volume-slider', label: '🔊 Lautstärke-Slider' },
        { key: 'cover', label: '🖼 Album-Cover' },
        { key: 'chips', label: '🎵 Schnellzugriff-Chips' },
        { key: 'battery-icon', label: 'Batterie-Icon' },
        { key: 'reach-icon', label: 'Erreichbarkeit-Icon' },
        { key: 'status-badges', label: 'Status-Badges (alle)' },
    ],
    weather: [
        { key: 'icon', label: 'Widget-Icon' },
        { key: 'weather-icon', label: '🌤 Wetter-Emoji heute (groß)' },
        { key: 'weather-icon-tomorrow', label: '🌤 Wetter-Emoji morgen (groß)' },
        { key: 'weather-icon-day-0', label: '🌤 Wetter-Emoji Tag 0 (heute)' },
        { key: 'weather-icon-day-1', label: '🌤 Wetter-Emoji Tag 1 (morgen)' },
        { key: 'weather-icon-day-2', label: '🌤 Wetter-Emoji Tag 2 (+2)' },
        { key: 'weather-icon-day-3', label: '🌤 Wetter-Emoji Tag 3 (+3)' },
        { key: 'weather-icon-day-4', label: '🌤 Wetter-Emoji Tag 4 (+4)' },
        { key: 'weather-icon-day-5', label: '🌤 Wetter-Emoji Tag 5 (+5)' },
        { key: 'weather-icon-day-6', label: '🌤 Wetter-Emoji Tag 6 (+6)' },
        { key: 'tempBar0', label: '🌡 Temp-Strahler Tag 0 (heute, mit min/max)' },
        { key: 'tempBar1', label: '🌡 Temp-Strahler Tag 1 (morgen, mit min/max)' },
        { key: 'tempBar2', label: '🌡 Temp-Strahler Tag 2 (+2, mit min/max)' },
        { key: 'tempBar3', label: '🌡 Temp-Strahler Tag 3 (+3, mit min/max)' },
        { key: 'tempBar4', label: '🌡 Temp-Strahler Tag 4 (+4, mit min/max)' },
        { key: 'tempBar5', label: '🌡 Temp-Strahler Tag 5 (+5, mit min/max)' },
        { key: 'tempBar6', label: '🌡 Temp-Strahler Tag 6 (+6, mit min/max)' },
        { key: 'tempBarOnly0', label: '🌡 Temp-Strahl Tag 0 (heute, nur Balken)' },
        { key: 'tempBarOnly1', label: '🌡 Temp-Strahl Tag 1 (morgen, nur Balken)' },
        { key: 'tempBarOnly2', label: '🌡 Temp-Strahl Tag 2 (+2, nur Balken)' },
        { key: 'tempBarOnly3', label: '🌡 Temp-Strahl Tag 3 (+3, nur Balken)' },
        { key: 'tempBarOnly4', label: '🌡 Temp-Strahl Tag 4 (+4, nur Balken)' },
        { key: 'tempBarOnly5', label: '🌡 Temp-Strahl Tag 5 (+5, nur Balken)' },
        { key: 'tempBarOnly6', label: '🌡 Temp-Strahl Tag 6 (+6, nur Balken)' },
        { key: 'forecast', label: '📊 Forecast-Balken (alle Tage)' },
        { key: 'warnings', label: '⚠ DWD-Warnungen' },
    ],
};

/** Has a 'component' entry in COMPONENT_OPTIONS for the given widget type. */
export function hasComponentOptions(widgetType: WidgetType): boolean {
    return !!COMPONENT_OPTIONS[widgetType];
}

type CellOpt = { key: string; label: string };
const sortDe = (a: CellOpt, b: CellOpt) => a.label.localeCompare(b.label, 'de');

// "Vom Widget (Haupt-DP)" — base items; 'component' added conditionally at render time
const WIDGET_CELL_OPTS: CellOpt[] = (
    [
        { key: 'field', label: 'Widget-Feld' },
        { key: 'title', label: 'Titel' },
        { key: 'unit', label: 'Einheit (DP1)' },
        { key: 'value', label: 'Hauptwert (DP1)' },
    ] satisfies CellOpt[]
).sort(sortDe);

// "Eigener Datenpunkt" — add new entries anywhere; list self-sorts.
// NOTE: 'button' (Button (DP schreiben)) is deprecated — superseded by the
// 'switch' cell's button control mode. Kept out of the picker but still
// rendered (and editable) for existing configs; see deprecated option below.
const OWN_DP_CELL_OPTS: CellOpt[] = (
    [
        { key: 'datepicker', label: 'Datumswähler (DP)' },
        { key: 'dp', label: 'Datenpunkt-Wert' },
        { key: 'input', label: 'Eingabe (DP schreiben)' },
        { key: 'lastchange', label: 'Letzte Änderung (DP)' },
        { key: 'progress', label: 'Fortschrittsbalken (DP)' },
        { key: 'select', label: 'Auswahlfeld (DP)' },
        { key: 'slider', label: 'Schieberegler (DP)' },
        { key: 'state-icon', label: 'Status-Icon (DP)' },
        { key: 'state-text', label: 'Status-Text (DP)' },
        { key: 'stepper', label: 'Stepper +/− (DP)' },
        { key: 'switch', label: 'Schalter (DP)' },
    ] satisfies CellOpt[]
).sort(sortDe);

// "Statisch" — add new entries anywhere; list self-sorts
const STATIC_CELL_OPTS: CellOpt[] = (
    [
        { key: 'icon', label: 'Statisches Icon' },
        { key: 'image', label: 'Bild (URL / Base64)' },
        { key: 'text', label: 'Freitext' },
    ] satisfies CellOpt[]
).sort(sortDe);

const FIELD_OPTIONS: Record<string, { key: string; label: string }[]> = {
    calendar: [
        { key: 'summary', label: 'Terminname' },
        { key: 'date', label: 'Datum / Zeit' },
        { key: 'time', label: 'Uhrzeit' },
        { key: 'calname', label: 'Kalendername' },
        { key: 'location', label: 'Ort' },
        { key: 'count', label: 'Anzahl Termine' },
    ],
    clock: [
        { key: 'time', label: 'Uhrzeit' },
        { key: 'date', label: 'Datum' },
        { key: 'custom', label: 'Benutzerdefiniert' },
        { key: 'city', label: '📍 Ort' },
        { key: 'sunrise', label: '🌅 Sonnenaufgang' },
        { key: 'sunset', label: '🌇 Sonnenuntergang' },
        { key: 'week', label: 'Kalenderwoche (Nr.)' },
        { key: 'kw', label: 'Kalenderwoche (KW xx)' },
    ],
    value: [
        { key: 'unit', label: 'Einheit' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    switch: [
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    thermostat: [
        { key: 'setpoint', label: 'Solltemperatur' },
        { key: 'actual', label: 'Isttemperatur' },
        { key: 'status', label: 'Heizstatus' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    shutter: [
        { key: 'position', label: 'Position (%)' },
        { key: 'status', label: 'Status' },
        { key: 'moving', label: 'Fährt' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    dimmer: [
        { key: 'level', label: 'Helligkeit (%)' },
        { key: 'status', label: 'Status' },
        { key: 'on', label: 'Ein/Aus' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    gauge: [
        { key: 'value', label: 'Wert' },
        { key: 'unit', label: 'Einheit' },
        { key: 'percent', label: 'Prozent' },
        { key: 'min', label: 'Minimum' },
        { key: 'max', label: 'Maximum' },
    ],
    echart: [
        { key: 'current', label: 'Aktueller Wert' },
        { key: 'unit', label: 'Einheit' },
    ],
    windowcontact: [
        { key: 'label', label: 'Status-Text' },
        { key: 'open', label: 'Geöffnet' },
        { key: 'tilted', label: 'Gekippt' },
        { key: 'closed', label: 'Geschlossen' },
        { key: 'lock', label: 'Schloss' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    binarysensor: [
        { key: 'label', label: 'Status-Text' },
        { key: 'active', label: 'Aktiv' },
        { key: 'labelOn', label: 'Text aktiv' },
        { key: 'labelOff', label: 'Text inaktiv' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    stateimage: [
        { key: 'label', label: 'Status-Text' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    evcc: [
        { key: 'pvPower', label: 'Solar (kW)' },
        { key: 'homePower', label: 'Verbrauch (kW)' },
        { key: 'gridPower', label: 'Netz (kW)' },
        { key: 'gridImport', label: 'Netzbezug' },
        { key: 'gridExport', label: 'Netzeinspeisung' },
        { key: 'batterySoc', label: 'Batterie (%)' },
        { key: 'batteryPower', label: 'Batterie-Leistung' },
    ],
    image: [
        { key: 'url', label: 'Bild-URL' },
        { key: 'dp', label: 'Datenpunkt-ID' },
    ],
    weather: (() => {
        const base: { key: string; label: string }[] = [
            { key: 'title', label: 'Widget-Titel' },
            { key: 'temp', label: 'Temperatur (mit °C)' },
            { key: 'tempValue', label: 'Temperatur (nur Zahl)' },
            { key: 'feelsLike', label: 'Gefühlt (mit °C)' },
            { key: 'feelsLikeValue', label: 'Gefühlt (nur Zahl)' },
            { key: 'feelsLikeLine', label: 'Gefühlt-Zeile (kombiniert)' },
            { key: 'humidity', label: 'Luftfeuchtigkeit (mit %)' },
            { key: 'humidityValue', label: 'Luftfeuchtigkeit (nur Zahl)' },
            { key: 'humidityLine', label: 'Luftfeuchtigkeit-Zeile (💧 …)' },
            { key: 'humidityCloud', label: 'Luftfeuchtigkeit + Bewölkung (Zeile)' },
            { key: 'wind', label: 'Wind (mit km/h)' },
            { key: 'windValue', label: 'Wind (nur Zahl)' },
            { key: 'condition', label: 'Wetterlage' },
            { key: 'emoji', label: 'Wetter-Emoji (Text)' },
            { key: 'cloudCover', label: 'Bewölkung (mit %)' },
            { key: 'cloudCoverValue', label: 'Bewölkung (nur Zahl)' },
            { key: 'rainNow', label: 'Regen aktuell (mit mm)' },
            { key: 'rainNowValue', label: 'Regen aktuell (nur Zahl)' },
            { key: 'rainLine', label: 'Regen-Zeile (💧 % · mm)' },
            { key: 'location', label: 'Standort' },
            { key: 'warningsLine', label: 'DWD-Warnungen (Text-Zeile)' },
        ];
        const dayLabel = (i: number) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : `+${i} Tage`);
        for (let i = 0; i < 7; i++) {
            const dl = dayLabel(i);
            base.push(
                { key: `day${i}`, label: `${dl} — Tagesname` },
                { key: `emoji${i}`, label: `${dl} — Wetter-Emoji (Text)` },
                { key: `condition${i}`, label: `${dl} — Wetterlage` },
                { key: `tempMax${i}`, label: `${dl} — Max-Temperatur` },
                { key: `tempMin${i}`, label: `${dl} — Min-Temperatur` },
                { key: `tempRange${i}`, label: `${dl} — Min / Max` },
                { key: `rainProb${i}`, label: `${dl} — Regenwahrsch. (%)` },
                { key: `rainSum${i}`, label: `${dl} — Regenmenge (mm)` },
                { key: `rainLine${i}`, label: `${dl} — Regen-Zeile (💧 % · mm)` },
            );
        }
        base.push(
            { key: 'dayTomorrow', label: '⏳ Morgen (alt) — Tagesname' },
            { key: 'emojiTomorrow', label: '⏳ Morgen (alt) — Emoji' },
            { key: 'conditionTomorrow', label: '⏳ Morgen (alt) — Wetterlage' },
            { key: 'tempMaxTomorrow', label: '⏳ Morgen (alt) — Max' },
            { key: 'tempMinTomorrow', label: '⏳ Morgen (alt) — Min' },
            { key: 'tempRangeTomorrow', label: '⏳ Morgen (alt) — Min / Max' },
            { key: 'rainProbTomorrow', label: '⏳ Morgen (alt) — Regenwahrsch.' },
            { key: 'rainSumTomorrow', label: '⏳ Morgen (alt) — Regenmenge' },
            { key: 'rainLineTomorrow', label: '⏳ Morgen (alt) — Regen-Zeile (💧 % · mm)' },
        );
        return base;
    })(),
    mediaplayer: [
        { key: 'title', label: 'Titel' },
        { key: 'artist', label: 'Künstler' },
        { key: 'album', label: 'Album' },
        { key: 'source', label: 'Quelle / Player' },
        { key: 'volume', label: 'Lautstärke (%)' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    slider: [
        { key: 'value', label: 'Wert' },
        { key: 'unit', label: 'Einheit' },
        { key: 'min', label: 'Minimum' },
        { key: 'max', label: 'Maximum' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    knob: [
        { key: 'value', label: 'Wert' },
        { key: 'unit', label: 'Einheit' },
        { key: 'min', label: 'Minimum' },
        { key: 'max', label: 'Maximum' },
        { key: 'battery', label: 'Batterie' },
        { key: 'reach', label: 'Erreichbarkeit' },
    ],
    httpRequest: [{ key: 'status', label: 'Status (letzter Request)' }],
    timer: [
        { key: 'status', label: 'Status (X/Y)' },
        { key: 'count', label: 'Anzahl Ereignisse' },
        { key: 'enabled', label: 'Aktive Ereignisse' },
        { key: 'target', label: 'Ziel-DP' },
        { key: 'value', label: 'Ziel-Wert' },
    ],
};

const inputCls = 'w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const inputSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export interface CustomCellEditorProps {
    cell: CustomCell;
    index: number;
    cols: number;
    rows: number;
    widgetType: WidgetType;
    isUniversal: boolean;
    defaultDecimals: number;
    onChange: (patch: Partial<CustomCell>) => void;
    onOpenIconPicker: (slot: 'iconName' | 'trueIcon' | 'falseIcon') => void;
    onOpenDpPicker: () => void;
    onOpenImagePicker: () => void;
}

export function CustomCellEditor({
    cell,
    index,
    cols,
    rows,
    widgetType,
    isUniversal,
    defaultDecimals,
    onChange,
    onOpenIconPicker,
    onOpenDpPicker,
    onOpenImagePicker,
}: CustomCellEditorProps) {
    const [entryIconPicker, setEntryIconPicker] = useState<number | null>(null);
    return (
        <>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Zeile {Math.floor(index / cols) + 1}, Spalte {(index % cols) + 1} · CSS: .aura-custom-cell-{index}
            </p>

            {/* Type */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Inhalt
                </label>
                <select
                    value={cell.type}
                    onChange={(e) => onChange({ type: e.target.value as CustomCell['type'] })}
                    className={inputCls}
                    style={inputSty}
                >
                    <option value="empty">– leer –</option>
                    {!isUniversal && (
                        <optgroup label="Vom Widget (Haupt-DP)">
                            {[
                                ...WIDGET_CELL_OPTS,
                                ...(COMPONENT_OPTIONS[widgetType]
                                    ? [{ key: 'component', label: 'Aktion / Icon' }]
                                    : []),
                            ]
                                .sort(sortDe)
                                .map(({ key, label }) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                        </optgroup>
                    )}
                    {isUniversal && <option value="title">Titel</option>}
                    <optgroup label="Eigener Datenpunkt">
                        {OWN_DP_CELL_OPTS.map(({ key, label }) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                        {/* Deprecated: only shown when an existing cell still uses it. */}
                        {cell.type === 'button' && <option value="button">Button (DP, veraltet)</option>}
                    </optgroup>
                    <optgroup label="Statisch">
                        {STATIC_CELL_OPTS.map(({ key, label }) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </optgroup>
                </select>
            </div>

            {/* Free text content */}
            {cell.type === 'text' && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Text
                    </label>
                    <input
                        type="text"
                        value={cell.text ?? ''}
                        onChange={(e) => onChange({ text: e.target.value })}
                        className={inputCls}
                        style={inputSty}
                    />
                </div>
            )}

            {/* Image URL / base64 */}
            {cell.type === 'image' && (
                <>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Bild-URL oder Base64
                        </label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={cell.imageUrl ?? ''}
                                onChange={(e) => onChange({ imageUrl: e.target.value || undefined })}
                                placeholder="https://… oder data:image/png;base64,…"
                                className={`flex-1 ${inputCls}`}
                                style={inputSty}
                            />
                            <button
                                onClick={onOpenImagePicker}
                                className="px-2 rounded-lg hover:opacity-80 shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title="Lokale Datei vom Server wählen"
                            >
                                <FolderOpen size={13} />
                            </button>
                        </div>
                        {(cell.imageUrl ?? '').startsWith('aura-file:') && (
                            <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--accent)' }}>
                                {(cell.imageUrl as string).slice('aura-file:'.length).split('/').pop()}
                            </p>
                        )}
                        {!(cell.imageUrl ?? '').startsWith('aura-file:') && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                Tipp: Auch Base64-kodierte Bilder werden unterstützt — z.&nbsp;B. kleine Icons oder
                                Logos ohne externen Server.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Darstellung
                        </label>
                        <div className="flex gap-1">
                            {(['contain', 'cover', 'fill'] as const).map((fit) => {
                                const active = (cell.objectFit ?? 'contain') === fit;
                                return (
                                    <button
                                        key={fit}
                                        onClick={() => onChange({ objectFit: fit === 'contain' ? undefined : fit })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {fit === 'contain' ? 'Einpassen' : fit === 'cover' ? 'Ausfüllen' : 'Strecken'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Widget field key (for 'field' type) */}
            {cell.type === 'field' &&
                (() => {
                    const options = FIELD_OPTIONS[widgetType] ?? [];
                    return (
                        <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Widget-Feld
                            </label>
                            {options.length > 0 ? (
                                <select
                                    value={cell.fieldKey ?? ''}
                                    onChange={(e) => onChange({ fieldKey: e.target.value })}
                                    className={inputCls}
                                    style={inputSty}
                                >
                                    <option value="">– Feld wählen –</option>
                                    {options.map(({ key, label }) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={cell.fieldKey ?? ''}
                                    onChange={(e) => onChange({ fieldKey: e.target.value })}
                                    placeholder="z.B. summary"
                                    className={inputCls}
                                    style={inputSty}
                                />
                            )}
                        </div>
                    );
                })()}

            {/* Component key selector */}
            {cell.type === 'component' &&
                (() => {
                    const options = COMPONENT_OPTIONS[widgetType] ?? [];
                    return (
                        <>
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Aktion / Icon
                                </label>
                                <select
                                    value={cell.componentKey ?? ''}
                                    onChange={(e) => onChange({ componentKey: e.target.value })}
                                    className={inputCls}
                                    style={inputSty}
                                >
                                    <option value="">– wählen –</option>
                                    {options.map(({ key, label }) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    Größe
                                </label>
                                <input
                                    type="number"
                                    min={16}
                                    max={512}
                                    step={2}
                                    value={cell.fontSize ?? ''}
                                    onChange={(e) =>
                                        onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })
                                    }
                                    placeholder="auto"
                                    className="w-20 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                    style={inputSty}
                                />
                                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    px (leer = Zelle füllen)
                                </span>
                            </div>
                        </>
                    );
                })()}

            {/* DP selector (dp / switch / slider / button / state-icon / state-text / datepicker / stepper / input / progress / select) */}
            {(cell.type === 'dp' ||
                cell.type === 'switch' ||
                cell.type === 'slider' ||
                cell.type === 'button' ||
                cell.type === 'state-icon' ||
                cell.type === 'state-text' ||
                cell.type === 'datepicker' ||
                cell.type === 'stepper' ||
                cell.type === 'input' ||
                cell.type === 'progress' ||
                cell.type === 'select' ||
                cell.type === 'lastchange') && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Datenpunkt
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={cell.dpId ?? ''}
                            onChange={(e) => onChange({ dpId: e.target.value })}
                            placeholder="z.B. hm-rpc.0.ABC.TEMP"
                            className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={inputSty}
                        />
                        <JsonPathButton value={cell.dpId} onChange={(ref) => onChange({ dpId: ref })} size={12} />
                        {(cell.type === 'dp' || cell.type === 'progress') && (
                            <ValueTransformButton
                                factor={cell.valueFactor}
                                offset={cell.valueOffset}
                                presetId={cell.valueTransform}
                                onPatch={(patch) =>
                                    onChange({
                                        valueFactor: patch.valueFactor,
                                        valueOffset: patch.valueOffset,
                                        valueTransform: patch.valueTransform,
                                    })
                                }
                                size={12}
                            />
                        )}
                        <button
                            onClick={onOpenDpPicker}
                            className="text-xs px-2 py-1.5 rounded-lg shrink-0"
                            style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                        >
                            <Database size={12} />
                        </button>
                    </div>
                </div>
            )}

            {cell.type === 'switch' && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        An/Aus-Werte (optional)
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={cell.trueValue ?? ''}
                            onChange={(e) => onChange({ trueValue: e.target.value || undefined })}
                            placeholder="AN: true"
                            className={inputCls}
                            style={inputSty}
                        />
                        <input
                            type="text"
                            value={cell.falseValue ?? ''}
                            onChange={(e) => onChange({ falseValue: e.target.value || undefined })}
                            placeholder="AUS: false"
                            className={inputCls}
                            style={inputSty}
                        />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Schreibwerte (z.B. 0/100, 0/255, true/false, an/aus). Leer = true/false.
                    </p>
                </div>
            )}

            {/* Switch: control mode + icons + colors */}
            {cell.type === 'switch' &&
                (() => {
                    const mode = cell.controlMode ?? 'toggle';
                    const ctrlIconSize = cell.fontSize ?? 28;
                    const momentary = !!cell.momentary;
                    const TruePrev = cell.trueIcon
                        ? getWidgetIcon(cell.trueIcon, (() => null) as unknown as LucideIcon)
                        : null;
                    const FalsePrev = cell.falseIcon
                        ? getWidgetIcon(cell.falseIcon, (() => null) as unknown as LucideIcon)
                        : null;
                    const trueCol = cell.trueColor && cell.trueColor.startsWith('#') ? cell.trueColor : '#22c55e';
                    const falseCol = cell.falseColor && cell.falseColor.startsWith('#') ? cell.falseColor : '#6b7280';
                    const pickBtn = (
                        slot: 'trueIcon' | 'falseIcon',
                        Preview: LucideIcon | null,
                        name: string | undefined,
                        color: string,
                    ) => (
                        <button
                            onClick={() => onOpenIconPicker(slot)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {Preview ? (
                                <Preview size={14} style={{ flexShrink: 0, color }} />
                            ) : (
                                <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />
                            )}
                            <span
                                className="flex-1 truncate text-[11px]"
                                style={{ color: name ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                                {name ?? 'Icon wählen…'}
                            </span>
                        </button>
                    );
                    return (
                        <>
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Bedienelement
                                </label>
                                <div className="flex gap-1">
                                    {(
                                        [
                                            ['toggle', 'Schiebeschalter'],
                                            ['icon', 'Icon'],
                                            ['button', 'Button'],
                                        ] as const
                                    ).map(([val, lbl]) => (
                                        <button
                                            key={val}
                                            onClick={() => onChange({ controlMode: val })}
                                            className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                            style={{
                                                background: mode === val ? 'var(--accent)' : 'var(--app-bg)',
                                                color: mode === val ? '#fff' : 'var(--text-secondary)',
                                                border: `1px solid ${mode === val ? 'var(--accent)' : 'var(--app-border)'}`,
                                            }}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {mode === 'icon' && (
                                <>
                                    <div className="flex gap-2">
                                        <div className="flex-1 min-w-0">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Icon AN
                                            </label>
                                            {pickBtn('trueIcon', TruePrev, cell.trueIcon, trueCol)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Icon AUS
                                            </label>
                                            {pickBtn('falseIcon', FalsePrev, cell.falseIcon, falseCol)}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Farbe AN
                                            </label>
                                            <input
                                                type="color"
                                                value={
                                                    cell.trueColor && cell.trueColor.startsWith('#')
                                                        ? cell.trueColor
                                                        : '#22c55e'
                                                }
                                                onChange={(e) => onChange({ trueColor: e.target.value })}
                                                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Farbe AUS
                                            </label>
                                            <input
                                                type="color"
                                                value={
                                                    cell.falseColor && cell.falseColor.startsWith('#')
                                                        ? cell.falseColor
                                                        : '#6b7280'
                                                }
                                                onChange={(e) => onChange({ falseColor: e.target.value })}
                                                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                Icon-Größe
                                            </label>
                                            <span
                                                className="text-[11px] tabular-nums"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {ctrlIconSize} px
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={16}
                                            max={192}
                                            step={2}
                                            value={ctrlIconSize}
                                            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                                            className="w-full h-1"
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                    </div>
                                </>
                            )}
                            {mode === 'button' && (
                                <>
                                    <div>
                                        <label
                                            className="text-[11px] mb-1 block"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Beschriftung
                                        </label>
                                        <input
                                            type="text"
                                            value={cell.text ?? ''}
                                            onChange={(e) => onChange({ text: e.target.value || undefined })}
                                            placeholder="z.B. AN/AUS"
                                            className={inputCls}
                                            style={inputSty}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Hintergrundfarbe
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="color"
                                                    value={
                                                        cell.color && cell.color.startsWith('#')
                                                            ? cell.color
                                                            : '#3b82f6'
                                                    }
                                                    onChange={(e) => onChange({ color: e.target.value })}
                                                    className="flex-1 h-7 rounded cursor-pointer border-0 p-0"
                                                />
                                                <button
                                                    onClick={() => onChange({ color: '' })}
                                                    className="text-[10px] px-2 py-0.5 rounded shrink-0"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                >
                                                    Theme
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <label
                                                className="text-[11px] mb-1 block"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Textfarbe
                                            </label>
                                            <input
                                                type="color"
                                                value={
                                                    cell.buttonTextColor && cell.buttonTextColor.startsWith('#')
                                                        ? cell.buttonTextColor
                                                        : '#ffffff'
                                                }
                                                onChange={(e) => onChange({ buttonTextColor: e.target.value })}
                                                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                Buttongröße
                                            </label>
                                            <span
                                                className="text-[11px] tabular-nums"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {cell.buttonSize ?? 8} px
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={2}
                                            max={40}
                                            step={1}
                                            value={cell.buttonSize ?? 8}
                                            onChange={(e) => onChange({ buttonSize: Number(e.target.value) })}
                                            className="w-full h-1"
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                Textgröße
                                            </label>
                                            <span
                                                className="text-[11px] tabular-nums"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {cell.fontSize ?? 12} px
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={8}
                                            max={48}
                                            step={1}
                                            value={cell.fontSize ?? 12}
                                            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                                            className="w-full h-1"
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                    </div>
                                </>
                            )}
                            <div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label
                                            className="text-[11px] font-medium"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Taster-Modus
                                        </label>
                                        <p
                                            className="text-[10px]"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            Impuls statt Umschalten
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onChange({ momentary: !momentary })}
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{ background: momentary ? 'var(--accent)' : 'var(--app-border)' }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                            style={{ left: momentary ? '18px' : '2px' }}
                                        />
                                    </button>
                                </div>
                                {momentary && (
                                    <div className="mt-2">
                                        <label
                                            className="text-[11px] mb-1 block"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Taster-Dauer (ms)
                                        </label>
                                        <input
                                            type="number"
                                            min={50}
                                            step={50}
                                            value={cell.momentaryDelay ?? ''}
                                            onChange={(e) =>
                                                onChange({
                                                    momentaryDelay:
                                                        e.target.value === '' ? undefined : Number(e.target.value),
                                                })
                                            }
                                            placeholder="500"
                                            className={inputCls}
                                            style={inputSty}
                                        />
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label
                                            className="text-[11px] font-medium"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Sicherheitsabfrage
                                        </label>
                                        <p
                                            className="text-[10px]"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            Bestätigung vor dem Schalten
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onChange({ confirmAction: !cell.confirmAction })}
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{
                                            background: cell.confirmAction ? 'var(--accent)' : 'var(--app-border)',
                                        }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                            style={{ left: cell.confirmAction ? '18px' : '2px' }}
                                        />
                                    </button>
                                </div>
                                {cell.confirmAction && (
                                    <div className="mt-2">
                                        <label
                                            className="text-[11px] mb-1 block"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Abfragetext (optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={cell.confirmText ?? ''}
                                            onChange={(e) => onChange({ confirmText: e.target.value || undefined })}
                                            placeholder="Wirklich schalten?"
                                            className={inputCls}
                                            style={inputSty}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    );
                })()}

            {/* Slider min/max/step */}
            {cell.type === 'slider' && (
                <div className="flex gap-2">
                    {(
                        [
                            { key: 'min', label: 'Min', def: 0 },
                            { key: 'max', label: 'Max', def: 100 },
                            { key: 'step', label: 'Step', def: 1 },
                        ] as const
                    ).map(({ key, label, def }) => (
                        <div key={key} className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                {label}
                            </label>
                            <input
                                type="number"
                                value={(cell as unknown as Record<string, number | undefined>)[key] ?? ''}
                                onChange={(e) =>
                                    onChange({
                                        [key]: e.target.value === '' ? undefined : Number(e.target.value),
                                    } as Partial<CustomCell>)
                                }
                                placeholder={String(def)}
                                className={inputCls}
                                style={inputSty}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Slider: Stil + Orientierung + Balkengröße */}
            {cell.type === 'slider' && (
                <div className="flex flex-col gap-2">
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Stil
                        </label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['false', 'Standard'],
                                    ['true', 'Balken'],
                                ] as const
                            ).map(([val, lbl]) => {
                                const active = val === 'true' ? !!cell.barStyle : !cell.barStyle;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => onChange({ barStyle: val === 'true' })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['horizontal', 'Horizontal'],
                                    ['vertical', 'Vertikal'],
                                ] as const
                            ).map(([val, lbl]) => {
                                const active = (cell.orientation ?? 'horizontal') === val;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => onChange({ orientation: val })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {cell.barStyle && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Balkengröße
                                </label>
                                <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                    {cell.barSize ?? 100}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={100}
                                step={5}
                                value={cell.barSize ?? 100}
                                onChange={(e) => onChange({ barSize: Number(e.target.value) })}
                                className="w-full h-1"
                                style={{ accentColor: 'var(--accent)' }}
                            />
                        </div>
                    )}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Wert-Anzeige
                        </label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['none', 'Aus'],
                                    ['left', 'Links'],
                                    ['right', 'Rechts'],
                                    ['top', 'Oben'],
                                    ['bottom', 'Unten'],
                                ] as const
                            ).map(([val, lbl]) => {
                                const active = (cell.valuePosition ?? 'none') === val;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => onChange({ valuePosition: val })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Button label + payload (deprecated — use 'Schalter (DP)' → Button mode) */}
            {cell.type === 'button' && (
                <>
                    <p
                        className="text-[10px] rounded-lg px-2 py-1.5"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        ⚠ Veraltet: stattdessen „Schalter (DP)“ mit Bedienelement „Button“ verwenden.
                    </p>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Beschriftung
                        </label>
                        <input
                            type="text"
                            value={cell.text ?? ''}
                            onChange={(e) => onChange({ text: e.target.value })}
                            placeholder="z.B. AUS"
                            className={inputCls}
                            style={inputSty}
                        />
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Wert beim Klick (true/false, Zahl oder Text)
                        </label>
                        <input
                            type="text"
                            value={cell.sendValue ?? ''}
                            onChange={(e) => onChange({ sendValue: e.target.value })}
                            placeholder="z.B. true"
                            className={inputCls}
                            style={inputSty}
                        />
                    </div>
                </>
            )}

            {/* Icon name (static icon) */}
            {cell.type === 'icon' &&
                (() => {
                    const iconName = cell.iconName;
                    const Preview = iconName ? getWidgetIcon(iconName, (() => null) as unknown as LucideIcon) : null;
                    return (
                        <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Icon
                            </label>
                            <button
                                onClick={() => onOpenIconPicker('iconName')}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                                style={{
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {Preview ? (
                                    <Preview
                                        size={14}
                                        style={{ flexShrink: 0, color: cell.color || 'var(--text-primary)' }}
                                    />
                                ) : (
                                    <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />
                                )}
                                <span
                                    className="flex-1 truncate text-[11px]"
                                    style={{ color: iconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                                >
                                    {iconName ?? 'Icon wählen…'}
                                </span>
                            </button>
                        </div>
                    );
                })()}

            {/* State-icon: true/false icons & colors */}
            {cell.type === 'state-icon' &&
                (() => {
                    const TruePrev = cell.trueIcon
                        ? getWidgetIcon(cell.trueIcon, (() => null) as unknown as LucideIcon)
                        : null;
                    const FalsePrev = cell.falseIcon
                        ? getWidgetIcon(cell.falseIcon, (() => null) as unknown as LucideIcon)
                        : null;
                    const trueCol = cell.trueColor || '#22c55e';
                    const falseCol = cell.falseColor || '#64748b';
                    const pickBtn = (
                        slot: 'trueIcon' | 'falseIcon',
                        Preview: LucideIcon | null,
                        name: string | undefined,
                        color: string,
                    ) => (
                        <button
                            onClick={() => onOpenIconPicker(slot)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {Preview ? (
                                <Preview size={14} style={{ flexShrink: 0, color }} />
                            ) : (
                                <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />
                            )}
                            <span
                                className="flex-1 truncate text-[11px]"
                                style={{ color: name ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                                {name ?? 'Icon wählen…'}
                            </span>
                        </button>
                    );
                    return (
                        <>
                            <div className="flex gap-2">
                                <div className="flex-1 min-w-0">
                                    <label
                                        className="text-[11px] mb-1 block"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Icon (an / true)
                                    </label>
                                    {pickBtn('trueIcon', TruePrev, cell.trueIcon, trueCol)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label
                                        className="text-[11px] mb-1 block"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Icon (aus / false)
                                    </label>
                                    {pickBtn('falseIcon', FalsePrev, cell.falseIcon, falseCol)}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label
                                        className="text-[11px] mb-1 block"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Farbe an
                                    </label>
                                    <input
                                        type="color"
                                        value={
                                            cell.trueColor && cell.trueColor.startsWith('#')
                                                ? cell.trueColor
                                                : '#22c55e'
                                        }
                                        onChange={(e) => onChange({ trueColor: e.target.value })}
                                        className="w-full h-7 rounded cursor-pointer border-0 p-0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label
                                        className="text-[11px] mb-1 block"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Farbe aus
                                    </label>
                                    <input
                                        type="color"
                                        value={
                                            cell.falseColor && cell.falseColor.startsWith('#')
                                                ? cell.falseColor
                                                : '#64748b'
                                        }
                                        onChange={(e) => onChange({ falseColor: e.target.value })}
                                        className="w-full h-7 rounded cursor-pointer border-0 p-0"
                                    />
                                </div>
                            </div>
                        </>
                    );
                })()}

            {/* Stepper / Progress: min / max / step */}
            {(cell.type === 'stepper' || cell.type === 'progress') && (
                <div className="flex gap-2">
                    {(
                        [
                            { key: 'min', label: 'Min', def: 0 },
                            { key: 'max', label: 'Max', def: 100 },
                            ...(cell.type === 'stepper' ? [{ key: 'step', label: 'Step', def: 1 }] : []),
                        ] as const
                    ).map(({ key, label, def }) => (
                        <div key={key} className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                {label}
                            </label>
                            <input
                                type="number"
                                value={(cell as unknown as Record<string, number | undefined>)[key] ?? ''}
                                onChange={(e) =>
                                    onChange({
                                        [key]: e.target.value === '' ? undefined : Number(e.target.value),
                                    } as Partial<CustomCell>)
                                }
                                placeholder={String(def)}
                                className={inputCls}
                                style={inputSty}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Progress: orientation + bar size + show-value */}
            {cell.type === 'progress' && (
                <div className="flex flex-col gap-2">
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['horizontal', 'Horizontal'],
                                    ['vertical', 'Vertikal'],
                                ] as const
                            ).map(([val, lbl]) => {
                                const active = (cell.orientation ?? 'horizontal') === val;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => onChange({ orientation: val })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Balkengröße
                            </label>
                            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                {cell.barSize ?? 100}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={cell.barSize ?? 100}
                            onChange={(e) => onChange({ barSize: Number(e.target.value) })}
                            className="w-full h-1"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Wert im Balken anzeigen
                        </label>
                        <button
                            onClick={() => onChange({ showValue: !cell.showValue })}
                            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                            style={{ background: cell.showValue ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                style={{ left: cell.showValue ? '14px' : '2px' }}
                            />
                        </button>
                    </div>
                </div>
            )}

            {/* Input: text / number mode + min/max/step for number */}
            {cell.type === 'input' && (
                <>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Eingabeart
                        </label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['text', 'Text'],
                                    ['number', 'Zahl'],
                                ] as const
                            ).map(([val, lbl]) => {
                                const active = (cell.inputMode ?? 'text') === val;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => onChange({ inputMode: val })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Platzhalter
                        </label>
                        <input
                            type="text"
                            value={cell.text ?? ''}
                            onChange={(e) => onChange({ text: e.target.value || undefined })}
                            placeholder="optional"
                            className={inputCls}
                            style={inputSty}
                        />
                    </div>
                    {cell.inputMode === 'number' && (
                        <div className="flex gap-2">
                            {(
                                [
                                    { key: 'min', label: 'Min', def: '' },
                                    { key: 'max', label: 'Max', def: '' },
                                    { key: 'step', label: 'Step', def: 1 },
                                ] as const
                            ).map(({ key, label, def }) => (
                                <div key={key} className="flex-1">
                                    <label
                                        className="text-[11px] mb-1 block"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {label}
                                    </label>
                                    <input
                                        type="number"
                                        value={(cell as unknown as Record<string, number | undefined>)[key] ?? ''}
                                        onChange={(e) =>
                                            onChange({
                                                [key]: e.target.value === '' ? undefined : Number(e.target.value),
                                            } as Partial<CustomCell>)
                                        }
                                        placeholder={String(def)}
                                        className={inputCls}
                                        style={inputSty}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* State-Text: trueText / falseText + colors */}
            {cell.type === 'state-text' && (
                <>
                    <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Text (an / true)
                            </label>
                            <input
                                type="text"
                                value={cell.trueText ?? ''}
                                onChange={(e) => onChange({ trueText: e.target.value })}
                                placeholder="z.B. AN"
                                className={inputCls}
                                style={inputSty}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Text (aus / false)
                            </label>
                            <input
                                type="text"
                                value={cell.falseText ?? ''}
                                onChange={(e) => onChange({ falseText: e.target.value })}
                                placeholder="z.B. AUS"
                                className={inputCls}
                                style={inputSty}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Farbe an
                            </label>
                            <input
                                type="color"
                                value={cell.trueColor && cell.trueColor.startsWith('#') ? cell.trueColor : '#22c55e'}
                                onChange={(e) => onChange({ trueColor: e.target.value })}
                                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Farbe aus
                            </label>
                            <input
                                type="color"
                                value={cell.falseColor && cell.falseColor.startsWith('#') ? cell.falseColor : '#64748b'}
                                onChange={(e) => onChange({ falseColor: e.target.value })}
                                className="w-full h-7 rounded cursor-pointer border-0 p-0"
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Select: entries (value/label/color) + showSelectedLabel toggle */}
            {cell.type === 'select' &&
                (() => {
                    const entries = cell.entries ?? [];
                    const update = (next: NonNullable<CustomCell['entries']>) => onChange({ entries: next });
                    const patchEntry = (i: number, patch: Partial<NonNullable<CustomCell['entries']>[number]>) =>
                        update(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
                    const addEntry = () => update([...entries, { value: String(entries.length), label: '' }]);
                    const removeEntry = (i: number) => update(entries.filter((_, idx) => idx !== i));
                    const moveEntry = (i: number, dir: -1 | 1) => {
                        const j = i + dir;
                        if (j < 0 || j >= entries.length) return;
                        const next = [...entries];
                        [next[i], next[j]] = [next[j], next[i]];
                        update(next);
                    };
                    return (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        Einträge ({entries.length})
                                    </label>
                                    <button
                                        onClick={addEntry}
                                        className="text-[10px] px-2 py-1 rounded"
                                        style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                                    >
                                        + Neu
                                    </button>
                                </div>
                                {entries.length === 0 && (
                                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                        Bilde DP-Werte (z.B. 0, 1, 2) auf Labels ab. Beim Auswählen wird der Wert in den
                                        Datenpunkt geschrieben.
                                    </p>
                                )}
                                <div className="flex flex-col gap-1">
                                    {entries.map((e, i) => {
                                        const EntryIcon = e.icon ? getWidgetIcon(e.icon, HelpCircle) : null;
                                        return (
                                            <div key={i} className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={e.value}
                                                    onChange={(ev) => patchEntry(i, { value: ev.target.value })}
                                                    placeholder="Wert"
                                                    className="text-xs rounded-lg px-2 py-1 focus:outline-none"
                                                    style={{ ...inputSty, width: 60, flexShrink: 0 }}
                                                />
                                                <input
                                                    type="text"
                                                    value={e.label}
                                                    onChange={(ev) => patchEntry(i, { label: ev.target.value })}
                                                    placeholder="Label"
                                                    className="flex-1 text-xs rounded-lg px-2 py-1 focus:outline-none"
                                                    style={inputSty}
                                                />
                                                <button
                                                    onClick={() => setEntryIconPicker(i)}
                                                    title={e.icon ? `Icon: ${e.icon}` : 'Icon wählen…'}
                                                    className="h-7 w-7 rounded flex items-center justify-center shrink-0"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        border: '1px solid var(--app-border)',
                                                        color: e.icon ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    }}
                                                >
                                                    {EntryIcon ? (
                                                        <EntryIcon size={14} />
                                                    ) : (
                                                        <HelpCircle size={14} style={{ opacity: 0.4 }} />
                                                    )}
                                                </button>
                                                {e.icon && (
                                                    <button
                                                        onClick={() => patchEntry(i, { icon: undefined })}
                                                        title="Icon entfernen"
                                                        className="text-[10px] px-1 py-1 rounded shrink-0"
                                                        style={{
                                                            background: 'var(--app-bg)',
                                                            color: 'var(--text-secondary)',
                                                            border: '1px solid var(--app-border)',
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                                <input
                                                    type="color"
                                                    value={e.color && e.color.startsWith('#') ? e.color : '#ffffff'}
                                                    onChange={(ev) => patchEntry(i, { color: ev.target.value })}
                                                    title="Farbe (optional)"
                                                    className="h-7 w-7 rounded cursor-pointer border-0 p-0 shrink-0"
                                                />
                                                {e.color && (
                                                    <button
                                                        onClick={() => patchEntry(i, { color: undefined })}
                                                        title="Farbe zurücksetzen"
                                                        className="text-[10px] px-1 py-1 rounded shrink-0"
                                                        style={{
                                                            background: 'var(--app-bg)',
                                                            color: 'var(--text-secondary)',
                                                            border: '1px solid var(--app-border)',
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                                <div className="flex flex-col shrink-0">
                                                    <button
                                                        onClick={() => moveEntry(i, -1)}
                                                        disabled={i === 0}
                                                        className="text-[9px] leading-none px-1"
                                                        style={{
                                                            color: 'var(--text-secondary)',
                                                            opacity: i === 0 ? 0.3 : 1,
                                                        }}
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        onClick={() => moveEntry(i, 1)}
                                                        disabled={i === entries.length - 1}
                                                        className="text-[9px] leading-none px-1"
                                                        style={{
                                                            color: 'var(--text-secondary)',
                                                            opacity: i === entries.length - 1 ? 0.3 : 1,
                                                        }}
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeEntry(i)}
                                                    title="Eintrag löschen"
                                                    className="text-[11px] px-1.5 py-1 rounded shrink-0"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                {entryIconPicker !== null && entries[entryIconPicker] && (
                                    <IconPickerModal
                                        current={entries[entryIconPicker].icon ?? ''}
                                        onSelect={(name) => {
                                            patchEntry(entryIconPicker, { icon: name || undefined });
                                            setEntryIconPicker(null);
                                        }}
                                        onClose={() => setEntryIconPicker(null)}
                                    />
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Aktuelles Label anzeigen
                                </label>
                                <button
                                    onClick={() => onChange({ showSelectedLabel: !cell.showSelectedLabel })}
                                    className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                    style={{
                                        background: cell.showSelectedLabel ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                        style={{ left: cell.showSelectedLabel ? '14px' : '2px' }}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Dropdown ausblenden (nur Einträge)
                                </label>
                                <button
                                    onClick={() => onChange({ hideSelect: !cell.hideSelect })}
                                    className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                    style={{ background: cell.hideSelect ? 'var(--accent)' : 'var(--app-border)' }}
                                >
                                    <span
                                        className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                        style={{ left: cell.hideSelect ? '14px' : '2px' }}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Anzeige aktueller Eintrag
                                </label>
                                <div
                                    className="flex rounded-lg overflow-hidden shrink-0"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    {(
                                        [
                                            { key: 'text', label: 'Text' },
                                            { key: 'icon-text', label: 'Icon + Text' },
                                            { key: 'icon', label: 'Icon' },
                                        ] as const
                                    ).map(({ key, label }) => {
                                        const active = (cell.entryDisplay ?? 'text') === key;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => onChange({ entryDisplay: key })}
                                                className="text-[10px] px-2 py-1 transition-colors"
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
                            </div>
                        </>
                    );
                })()}

            {/* Datepicker: timeOnly / showTime / output format */}
            {cell.type === 'datepicker' &&
                (() => {
                    const fmt = (cell.dateFormat as DateOutputFormat) ?? 'timestamp_ms';
                    return (
                        <>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Nur Uhrzeit (kein Datum)
                                </label>
                                <button
                                    onClick={() =>
                                        onChange({
                                            timeOnly: !cell.timeOnly,
                                            showTime: !cell.timeOnly ? true : cell.showTime,
                                        })
                                    }
                                    className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                    style={{ background: cell.timeOnly ? 'var(--accent)' : 'var(--app-border)' }}
                                >
                                    <span
                                        className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                        style={{ left: cell.timeOnly ? '14px' : '2px' }}
                                    />
                                </button>
                            </div>
                            {!cell.timeOnly && (
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        Uhrzeit-Eingabe anzeigen
                                    </label>
                                    <button
                                        onClick={() => onChange({ showTime: !cell.showTime })}
                                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                        style={{ background: cell.showTime ? 'var(--accent)' : 'var(--app-border)' }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                            style={{ left: cell.showTime ? '14px' : '2px' }}
                                        />
                                    </button>
                                </div>
                            )}
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Ausgabeformat
                                </label>
                                <select
                                    value={fmt}
                                    onChange={(e) => onChange({ dateFormat: e.target.value })}
                                    className={inputCls}
                                    style={inputSty}
                                >
                                    {(Object.entries(FORMAT_LABELS) as [DateOutputFormat, string][]).map(
                                        ([key, label]) => (
                                            <option key={key} value={key}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>
                        </>
                    );
                })()}

            {/* Prefix / Suffix for value / dp / stepper / progress */}
            {(cell.type === 'value' || cell.type === 'dp' || cell.type === 'stepper' || cell.type === 'progress') && (
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Prefix
                        </label>
                        <input
                            type="text"
                            value={cell.prefix ?? ''}
                            onChange={(e) => onChange({ prefix: e.target.value || undefined })}
                            placeholder="z.B. ~"
                            className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={inputSty}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Suffix
                        </label>
                        <input
                            type="text"
                            value={cell.suffix ?? ''}
                            onChange={(e) => onChange({ suffix: e.target.value || undefined })}
                            placeholder="z.B. °C"
                            className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={inputSty}
                        />
                    </div>
                </div>
            )}

            {/* Dezimalstellen for value / dp / stepper / progress */}
            {(cell.type === 'value' || cell.type === 'dp' || cell.type === 'stepper' || cell.type === 'progress') && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Dezimalstellen
                    </label>
                    <div className="flex gap-1">
                        <input
                            type="number"
                            min={0}
                            max={6}
                            step={1}
                            disabled={cell.decimals === undefined}
                            value={cell.decimals ?? defaultDecimals}
                            onChange={(e) => onChange({ decimals: Number(e.target.value) })}
                            className="w-16 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={{ ...inputSty, opacity: cell.decimals === undefined ? 0.5 : 1 }}
                        />
                        <button
                            onClick={() =>
                                onChange({ decimals: cell.decimals === undefined ? defaultDecimals : undefined })
                            }
                            title={
                                cell.decimals === undefined
                                    ? 'Globale Einstellung aktiv – klicken für eigenen Wert'
                                    : 'Auf globale Einstellung zurücksetzen'
                            }
                            className="text-[10px] px-2 py-1 rounded-lg shrink-0"
                            style={{
                                background: cell.decimals === undefined ? 'var(--accent)' : 'var(--app-border)',
                                color: cell.decimals === undefined ? '#fff' : 'var(--text-secondary)',
                                border: 'none',
                            }}
                        >
                            Global
                        </button>
                    </div>
                </div>
            )}

            {/* Alignment for component cells */}
            {cell.type === 'component' && (
                <>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(['left', 'center', 'right'] as const).map((a) => {
                                const active = (cell.align ?? 'center') === a;
                                return (
                                    <button
                                        key={a}
                                        onClick={() => onChange({ align: a })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Vertikale Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(['top', 'middle', 'bottom'] as const).map((v) => {
                                const active = (cell.valign ?? 'middle') === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onChange({ valign: v })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {v === 'top' ? 'Oben' : v === 'middle' ? 'Mitte' : 'Unten'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Format picker for the dedicated "Letzte Änderung" cell — the timestamp is the content */}
            {cell.type === 'lastchange' && (
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Format
                    </label>
                    <div className="flex gap-1">
                        {(
                            [
                                ['relative', 'Relativ'],
                                ['time', 'Uhrzeit'],
                                ['datetime', 'Datum+Zeit'],
                            ] as const
                        ).map(([val, lbl]) => {
                            const active = (cell.lastChangeFormat ?? 'relative') === val;
                            return (
                                <button
                                    key={val}
                                    onClick={() => onChange({ lastChangeFormat: val })}
                                    className="flex-1 text-[10px] py-1.5 rounded-lg transition-colors"
                                    style={{
                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                    }}
                                >
                                    {lbl}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Last-change timestamp */}
            {cell.type !== 'empty' &&
                cell.type !== 'text' &&
                cell.type !== 'image' &&
                cell.type !== 'icon' &&
                cell.type !== 'component' &&
                cell.type !== 'lastchange' && (
                    <>
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    Letzte Änderung
                                </label>
                                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                    Zeitstempel unter dem Wert anzeigen
                                </p>
                            </div>
                            <button
                                onClick={() => onChange({ showLastChange: !cell.showLastChange })}
                                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                style={{ background: cell.showLastChange ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                <span
                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                    style={{ left: cell.showLastChange ? '18px' : '2px' }}
                                />
                            </button>
                        </div>
                        {cell.showLastChange && (
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Format
                                </label>
                                <div className="flex gap-1">
                                    {(
                                        [
                                            ['relative', 'Relativ'],
                                            ['time', 'Uhrzeit'],
                                            ['datetime', 'Datum+Zeit'],
                                        ] as const
                                    ).map(([val, lbl]) => {
                                        const active = (cell.lastChangeFormat ?? 'relative') === val;
                                        return (
                                            <button
                                                key={val}
                                                onClick={() => onChange({ lastChangeFormat: val })}
                                                className="flex-1 text-[10px] py-1.5 rounded-lg transition-colors"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {lbl}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

            {/* Spans (col + row) — available for any non-empty cell */}
            {cell.type !== 'empty' && (
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Spaltenbreite
                        </label>
                        <div className="flex gap-1 flex-wrap">
                            {Array.from({ length: cols }, (_, i) => i + 1).map((v) => {
                                const active = (cell.colSpan ?? 1) === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onChange({ colSpan: v === 1 ? undefined : v })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            minWidth: 24,
                                        }}
                                    >
                                        ×{v}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Zeilenhöhe
                        </label>
                        <div className="flex gap-1 flex-wrap">
                            {Array.from({ length: rows }, (_, i) => i + 1).map((v) => {
                                const active = (cell.rowSpan ?? 1) === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onChange({ rowSpan: v === 1 ? undefined : v })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            minWidth: 24,
                                        }}
                                    >
                                        ×{v}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {cell.type !== 'empty' && cell.type !== 'component' && (
                <>
                    {/* Font size */}
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Schriftgröße
                        </label>
                        <input
                            type="number"
                            min={8}
                            max={192}
                            step={1}
                            value={cell.fontSize ?? ''}
                            onChange={(e) =>
                                onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })
                            }
                            placeholder="auto"
                            className="w-16 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                            style={inputSty}
                        />
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            px
                        </span>
                    </div>

                    {/* Bold / Italic */}
                    <div className="flex items-center gap-4">
                        {(
                            [
                                { key: 'bold', label: 'Fett' },
                                { key: 'italic', label: 'Kursiv' },
                            ] as const
                        ).map(({ key, label }) => {
                            const val = !!(cell as unknown as Record<string, unknown>)[key];
                            return (
                                <div key={key} className="flex items-center gap-2">
                                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                        {label}
                                    </span>
                                    <button
                                        onClick={() => onChange({ [key]: !val } as Partial<CustomCell>)}
                                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                        style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                            style={{ left: val ? '14px' : '2px' }}
                                        />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Color */}
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Farbe
                        </label>
                        <input
                            type="color"
                            value={cell.color && cell.color.startsWith('#') ? cell.color : '#ffffff'}
                            onChange={(e) => onChange({ color: e.target.value })}
                            className="w-8 h-7 rounded cursor-pointer border-0 p-0"
                            style={{ background: 'none' }}
                        />
                        <button
                            onClick={() => onChange({ color: '' })}
                            className="text-[10px] px-2 py-0.5 rounded"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            Theme
                        </button>
                    </div>

                    {/* Horizontal align */}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(['left', 'center', 'right'] as const).map((a) => {
                                const active = (cell.align ?? 'left') === a;
                                return (
                                    <button
                                        key={a}
                                        onClick={() => onChange({ align: a })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Vertical align */}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Vertikale Ausrichtung
                        </label>
                        <div className="flex gap-1">
                            {(['top', 'middle', 'bottom'] as const).map((v) => {
                                const active = (cell.valign ?? 'middle') === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onChange({ valign: v })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {v === 'top' ? 'Oben' : v === 'middle' ? 'Mitte' : 'Unten'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Text overflow */}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Text-Überlauf
                        </label>
                        <div className="flex gap-1">
                            {([false, true] as const).map((v) => {
                                const active = (cell.allowOverflow ?? false) === v;
                                return (
                                    <button
                                        key={String(v)}
                                        onClick={() => onChange({ allowOverflow: v || undefined })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {v ? 'Überlaufen' : 'Abschneiden'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Textumbruch */}
                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Textumbruch
                        </label>
                        <div className="flex gap-1">
                            {([false, true] as const).map((v) => {
                                const active = (cell.wrap ?? false) === v;
                                return (
                                    <button
                                        key={String(v)}
                                        onClick={() => onChange({ wrap: v || undefined })}
                                        className="flex-1 text-[10px] py-1 rounded"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {v ? 'Umbrechen' : 'Eine Zeile'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
