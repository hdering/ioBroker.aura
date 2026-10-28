/**
 * Configuration panel for the Zeitschaltuhr widget — shown in the widget edit
 * sidebar (admin scope). Admins set the target datapoint and value here; the
 * dashboard user only manages the schedule (events) directly on the widget.
 *
 * Also exposes the global holiday/vacation DPs used by the per-event filters.
 */
import { useState } from 'react';
import { Database, Plus, X } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { AuraIcon } from '../common/AuraIcon';
import { ConfigSection, SubGroup } from './ConfigSection';
import { useT } from '../../i18n';
import { VisibleFieldsSection } from './VisibleFieldsSection';

function toIconifyId(name: string): string {
    if (!name) return '';
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

// A number picks into extraTargetDps at that index (#774).
type PickerTarget = 'target' | 'holidays' | 'vacation' | number;

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintCls = 'text-[10px] mt-0.5';
const hintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

// Example DP values for the special-day lists — collapsed by default to keep the panel short.
const HOLIDAY_EXAMPLES: { title: string; value: string }[] = [
    { title: 'Boolean (z. B. feiertage.0.heute.boolean)', value: 'true' },
    {
        title: 'JSON – einzelne Tage',
        value: '[\n  "2026-01-01",\n  "2026-04-03",\n  "2026-12-25",\n  "2026-12-26"\n]',
    },
    { title: 'JSON – mit Zeitraum', value: '[\n  "2026-01-01",\n  "2026-12-24/2026-12-26"\n]' },
];
const VACATION_EXAMPLES: { title: string; value: string }[] = [
    { title: 'Boolean – Schalter „Urlaubsmodus“', value: 'true' },
    {
        title: 'JSON – Zeiträume (Start/Ende, inklusive)',
        value: '[\n  "2026-07-20/2026-08-07",\n  "2026-10-26/2026-10-30"\n]',
    },
    { title: 'JSON – gemischt mit Einzeltagen', value: '[\n  "2026-05-15",\n  "2026-07-20/2026-08-07"\n]' },
    {
        title: 'JSON – Zeitraum als Objekt (praktisch in Skripten)',
        value: '[\n  { "from": "2026-07-20", "to": "2026-08-07" }\n]',
    },
];

function SpecialDayExamples({ examples }: { examples: { title: string; value: string }[] }) {
    return (
        <details className="mt-1">
            <summary className="text-[10px] cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                Beispiele
            </summary>
            <div className="mt-1 space-y-1">
                {examples.map((ex) => (
                    <div key={ex.title}>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {ex.title}
                        </p>
                        <pre
                            className="text-[10px] px-2 py-1 rounded-md font-mono whitespace-pre-wrap"
                            style={{
                                background: 'var(--app-surface)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {ex.value}
                        </pre>
                    </div>
                ))}
            </div>
        </details>
    );
}

// Exception value (#757): written once while the special-day DP marks today.
function ExceptionValueField({
    value,
    disabled,
    placeholder,
    onChange,
}: {
    value: string;
    disabled: boolean;
    placeholder: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="mt-1.5" style={{ opacity: disabled ? 0.5 : 1 }}>
            <label className={labelCls} style={labelStyle}>
                Wert während der Ausnahme (optional)
            </label>
            <input
                type="text"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={inputCls}
                style={inputStyle}
            />
            <p className={hintCls} style={hintStyle}>
                Wird einmal geschrieben, sobald der Tag als Sondertag gilt. Bis dahin pausieren alle anderen Ereignisse,
                außer denen mit genau diesem Filter. Am Ende stellt die Uhr den Wert des zuletzt fälligen Ereignisses
                wieder her.
            </p>
        </div>
    );
}

/** "Im Frontend bearbeitbar" switch under a special-day DP (#785). */
function FrontendEditableToggle({
    value,
    disabled,
    onChange,
}: {
    value: boolean;
    disabled: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between mt-1.5" style={{ opacity: disabled ? 0.5 : 1 }}>
            <div className="min-w-0 pr-2">
                <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    Im Frontend bearbeitbar
                </p>
                <p className={hintCls} style={hintStyle}>
                    Tage per Datumswähler hinzufügen/entfernen (Kalender-Taste am Widget). Ein DP mit true/false wird
                    nie überschrieben.
                </p>
            </div>
            <button
                onClick={() => onChange(!value)}
                disabled={disabled}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                    style={{ left: value ? '14px' : '2px' }}
                />
            </button>
        </div>
    );
}

export function TimerConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const targetDp = (o.targetDp as string | undefined) ?? '';
    const extraTargetDps = (o.extraTargetDps as string[] | undefined) ?? [];
    const value = (o.value as string | undefined) ?? 'true';
    const allowEventValue = o.allowEventValue === true;
    const reapplyOnStart = o.reapplyOnStart === true;
    const stateBaseId = o.stateBaseId as string | undefined;
    const holidaysDp = (o.holidaysDp as string | undefined) ?? '';
    const vacationDp = (o.vacationDp as string | undefined) ?? '';
    const holidaysValue = (o.holidaysValue as string | undefined) ?? '';
    const vacationValue = (o.vacationValue as string | undefined) ?? '';
    const holidaysEditable = o.holidaysEditable !== false;
    const vacationEditable = o.vacationEditable !== false;
    const addIcon = (o.addIcon as string | undefined) ?? '';
    const addIconSize = (o.addIconSize as number | undefined) ?? 16;

    const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);

    const setOpts = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    const setExtra = (next: string[]) => setOpts({ extraTargetDps: next.length > 0 ? next : undefined });

    const currentPickerValue =
        typeof pickerTarget === 'number'
            ? (extraTargetDps[pickerTarget] ?? '')
            : pickerTarget === 'target'
              ? targetDp
              : pickerTarget === 'holidays'
                ? holidaysDp
                : pickerTarget === 'vacation'
                  ? vacationDp
                  : '';

    const onPick = (id: string) => {
        if (typeof pickerTarget === 'number') setExtra(extraTargetDps.map((v, i) => (i === pickerTarget ? id : v)));
        else if (pickerTarget === 'target') setOpts({ targetDp: id });
        else if (pickerTarget === 'holidays') setOpts({ holidaysDp: id });
        else if (pickerTarget === 'vacation') setOpts({ vacationDp: id });
        setPickerTarget(null);
    };

    return (
        <>
            {pickerTarget !== null && (
                <DatapointPicker
                    currentValue={currentPickerValue}
                    onSelect={onPick}
                    onClose={() => setPickerTarget(null)}
                />
            )}

            {iconPickerOpen && (
                <IconPickerModal
                    current={addIcon}
                    onSelect={(name) => {
                        setOpts({ addIcon: name || undefined });
                        setIconPickerOpen(false);
                    }}
                    onClose={() => setIconPickerOpen(false)}
                />
            )}

            <div className="space-y-2.5">
                <VisibleFieldsSection
                    values={o}
                    onChange={setOpts}
                    fields={[
                        { key: 'showMasterSwitch', label: 'Master-Schalter' },
                        { key: 'showEvents', label: 'Ereignis-Liste' },
                        {
                            key: 'showAddButton',
                            label: '+ Ereignis-Button',
                            children: (
                                <>
                                    <div>
                                        <label className={labelCls} style={labelStyle}>
                                            Icon statt Text (Hinzufügen-Button)
                                        </label>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setIconPickerOpen(true)}
                                                className="flex-1 flex items-center gap-1.5 text-[10px] rounded px-2 py-1 text-left hover:opacity-80"
                                                style={inputStyle}
                                            >
                                                {addIcon ? (
                                                    <>
                                                        <AuraIcon icon={toIconifyId(addIcon)} width={12} height={12} />
                                                        <span className="truncate font-mono">{addIcon}</span>
                                                    </>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)' }}>
                                                        {'Kein Icon — Text „+ Ereignis hinzufügen“'}
                                                    </span>
                                                )}
                                            </button>
                                            {addIcon && (
                                                <button
                                                    onClick={() => setOpts({ addIcon: undefined })}
                                                    className="shrink-0 hover:opacity-70 p-1"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                    title="Icon entfernen"
                                                >
                                                    <X size={11} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {addIcon && (
                                        <div className="flex items-center gap-2">
                                            <label
                                                className="text-[11px] shrink-0"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                Größe
                                            </label>
                                            <input
                                                type="range"
                                                min={10}
                                                max={32}
                                                step={1}
                                                value={addIconSize}
                                                onChange={(e) => setOpts({ addIconSize: Number(e.target.value) })}
                                                className="flex-1"
                                            />
                                            <span
                                                className="text-[10px] font-mono w-7 text-right"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {addIconSize}px
                                            </span>
                                        </div>
                                    )}
                                </>
                            ),
                        },
                        { key: 'showAstroSymbol', label: 'Astro-Symbol (☀↑/☀↓)' },
                        { key: 'showSpecialDaysButton', label: 'Ausnahmetage-Taste (Urlaub/Feiertage)' },
                    ]}
                />

                <ConfigSection title={t('cfg.section.datapoints')} sectionKey="datapoints">
                    <SubGroup title="Ziel-Aktion">
                        <p className={hintCls} style={hintStyle}>
                            Was das Widget tut, wenn ein Ereignis auslöst. Nur hier (Admin) konfigurierbar — der
                            Anwender legt nur Zeiten fest.
                        </p>
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Ziel-Datenpunkt
                            </label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={targetDp}
                                    onChange={(e) => setOpts({ targetDp: e.target.value || undefined })}
                                    placeholder="z.B. hue.0.light.1.on"
                                    className={`flex-1 font-mono min-w-0 ${inputCls}`}
                                    style={inputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={() => setPickerTarget('target')}
                                    className="px-2 rounded-lg shrink-0"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <Database size={13} />
                                </button>
                                {/* Same width as the remove button below, so all inputs line up. */}
                                {extraTargetDps.length > 0 && (
                                    <span className="px-1.5 shrink-0 invisible" aria-hidden>
                                        <X size={13} />
                                    </span>
                                )}
                            </div>
                            {extraTargetDps.map((dp, i) => (
                                <div key={i} className="flex gap-1 mt-1">
                                    <input
                                        type="text"
                                        value={dp}
                                        onChange={(e) =>
                                            setExtra(extraTargetDps.map((v, j) => (j === i ? e.target.value : v)))
                                        }
                                        placeholder="weiterer Datenpunkt"
                                        className={`flex-1 font-mono min-w-0 ${inputCls}`}
                                        style={inputStyle}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setPickerTarget(i)}
                                        className="px-2 rounded-lg shrink-0"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <Database size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExtra(extraTargetDps.filter((_, j) => j !== i))}
                                        className="px-1.5 rounded-lg shrink-0 hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Datenpunkt entfernen"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => setExtra([...extraTargetDps, ''])}
                                className="mt-1 flex items-center gap-1 text-[11px] hover:opacity-80"
                                style={{ color: 'var(--accent)' }}
                            >
                                <Plus size={12} /> Weiterer Datenpunkt
                            </button>
                            <p className={hintCls} style={hintStyle}>
                                Alle Datenpunkte bekommen beim Auslösen denselben Wert — z. B. mehrere Thermostate.
                            </p>
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Wert beim Auslösen
                            </label>
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => setOpts({ value: e.target.value })}
                                placeholder="true / false / 50 / Text"
                                className={inputCls}
                                style={inputStyle}
                            />
                            <p className={hintCls} style={hintStyle}>
                                {
                                    'Wird automatisch als Boolean / Zahl / Text geparst. Bei „Zeitraum“-Ereignissen wird am Ende der invertierte Wert geschrieben.'
                                }
                            </p>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                            <div className="min-w-0 pr-2">
                                <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                    Wert pro Ereignis erlauben
                                </p>
                                <p className={hintCls} style={hintStyle}>
                                    Anwender darf pro Ereignis einen eigenen Wert setzen (überschreibt den
                                    Standardwert).
                                </p>
                            </div>
                            <button
                                onClick={() => setOpts({ allowEventValue: !allowEventValue })}
                                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                style={{ background: allowEventValue ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                <span
                                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                    style={{ left: allowEventValue ? '14px' : '2px' }}
                                />
                            </button>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                            <div className="min-w-0 pr-2">
                                <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                    Plan beim Adapterstart nachholen
                                </p>
                                <p className={hintCls} style={hintStyle}>
                                    Schreibt nach einem Neustart den Wert, der laut Plan gerade gilt. Von außen geht das
                                    jederzeit über den DP{' '}
                                    <code className="font-mono">
                                        {stateBaseId ? `${stateBaseId}.reapply` : 'timers.<id>.reapply'}
                                    </code>{' '}
                                    = <code className="font-mono">true</code>.
                                </p>
                            </div>
                            <button
                                onClick={() => setOpts({ reapplyOnStart: reapplyOnStart ? undefined : true })}
                                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                                style={{ background: reapplyOnStart ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                <span
                                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                    style={{ left: reapplyOnStart ? '14px' : '2px' }}
                                />
                            </button>
                        </div>
                    </SubGroup>
                    <SubGroup title="Sondertage">
                        <div className={hintCls} style={hintStyle}>
                            <p>
                                Quell-DPs für die Filter {'„Feiertage“'} / {'„Urlaub“'} / {'„ohne Sondertage“'}. Der
                                DP-Wert ist <b>entweder</b>:
                            </p>
                            <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                <li>
                                    <b>Boolean</b> – <code className="font-mono">true</code> = heute ist Sondertag,{' '}
                                    <code className="font-mono">false</code> = nicht
                                </li>
                                <li>
                                    <b>oder JSON-Array</b> – Tage <code className="font-mono">YYYY-MM-DD</code> und
                                    Zeiträume <code className="font-mono">YYYY-MM-DD/YYYY-MM-DD</code> (beide Enden
                                    inklusive), beliebig gemischt
                                </li>
                            </ul>
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Feiertage-DP
                            </label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={holidaysDp}
                                    onChange={(e) => setOpts({ holidaysDp: e.target.value || undefined })}
                                    placeholder="z.B. 0_userdata.0.feiertage"
                                    className={`flex-1 font-mono min-w-0 ${inputCls}`}
                                    style={inputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={() => setPickerTarget('holidays')}
                                    className="px-2 rounded-lg shrink-0"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <Database size={13} />
                                </button>
                            </div>
                            <SpecialDayExamples examples={HOLIDAY_EXAMPLES} />
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Urlaub-DP
                            </label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={vacationDp}
                                    onChange={(e) => setOpts({ vacationDp: e.target.value || undefined })}
                                    placeholder="z.B. 0_userdata.0.urlaub"
                                    className={`flex-1 font-mono min-w-0 ${inputCls}`}
                                    style={inputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={() => setPickerTarget('vacation')}
                                    className="px-2 rounded-lg shrink-0"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <Database size={13} />
                                </button>
                            </div>
                            <SpecialDayExamples examples={VACATION_EXAMPLES} />
                        </div>
                        <p className={hintCls} style={hintStyle}>
                            Tipp: Listen lassen sich im Frontend über die Kalender-Taste des Widgets pflegen — oder z.
                            B. mit dem Adapter <code className="font-mono">iobroker.javascript</code> bzw. einer
                            Blockly-Routine.
                        </p>
                        <div>
                            <p className={labelCls} style={labelStyle}>
                                Feiertage
                            </p>
                            <ExceptionValueField
                                value={holidaysValue}
                                disabled={!holidaysDp}
                                placeholder="z.B. 18"
                                onChange={(v) => setOpts({ holidaysValue: v || undefined })}
                            />
                            <FrontendEditableToggle
                                value={holidaysEditable}
                                disabled={!holidaysDp}
                                onChange={(v) => setOpts({ holidaysEditable: v ? undefined : false })}
                            />
                        </div>
                        <div>
                            <p className={labelCls} style={labelStyle}>
                                Urlaub
                            </p>
                            <ExceptionValueField
                                value={vacationValue}
                                disabled={!vacationDp}
                                placeholder="z.B. 16"
                                onChange={(v) => setOpts({ vacationValue: v || undefined })}
                            />
                            <FrontendEditableToggle
                                value={vacationEditable}
                                disabled={!vacationDp}
                                onChange={(v) => setOpts({ vacationEditable: v ? undefined : false })}
                            />
                        </div>
                    </SubGroup>
                </ConfigSection>
            </div>
        </>
    );
}
