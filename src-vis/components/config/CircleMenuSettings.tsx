/**
 * Editor block "Kreismenü" (#815) — the shared `circle*` options of every widget
 * that offers `layout: 'circle'` (shutter, thermostat, enum). The widget hands in
 * what only it knows: the intro line, the entries for the order list and what the
 * round button shows without an own icon.
 */
import type { ReactNode } from 'react';
import { SubGroup } from './ConfigSection';
import { CircleOrderEditor } from './CircleOrderEditor';
import { IconButton } from './ConditionEditor';

const hint: React.CSSProperties = { color: 'var(--text-secondary)' };
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/**
 * Does the widget draw its circle menu — as the circle layout or as a
 * 'circle-menu' cell of its custom grid (#838)? Then the settings below apply.
 */
export function showsCircleMenu(layout: string | undefined, o: Record<string, unknown>): boolean {
    if (layout === 'circle') return true;
    if (layout !== 'custom') return false;
    const g = o.customGrid as { cells?: unknown[] } | unknown[] | undefined;
    const cells = Array.isArray(g) ? g : (g?.cells ?? []);
    return cells.some((c) => (c as { type?: string; componentKey?: string })?.componentKey === 'circle-menu');
}

/** Right end of the button-size slider = no fixed size: the button fills the widget. */
const TRIGGER_MAX = 400;

function ToggleRow({ label, text, on, toggle }: { label: string; text: string; on: boolean; toggle: () => void }) {
    return (
        <div className="flex items-start justify-between gap-2">
            <div>
                <label className="text-[11px] block" style={hint}>
                    {label}
                </label>
                <p className="text-[10px]" style={hint}>
                    {text}
                </p>
            </div>
            <button
                onClick={toggle}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
                style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: on ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

function SliderRow({
    label,
    shown,
    value,
    min,
    max,
    step,
    onChange,
    note,
}: {
    label: string;
    shown: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (n: number) => void;
    note?: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-[11px]" style={hint}>
                    {label}
                </label>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {shown}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1"
                style={{ accentColor: 'var(--accent)' }}
            />
            {note && (
                <p className="text-[10px] mt-0.5" style={hint}>
                    {note}
                </p>
            )}
        </div>
    );
}

export function CircleMenuSettings({
    o,
    setO,
    intro,
    entries,
    iconPlaceholder,
    widgetIconFallback = true,
}: {
    o: Record<string, unknown>;
    setO: (patch: Record<string, unknown>) => void;
    /** One line on what the circle holds for this widget. */
    intro: ReactNode;
    /** Entries in default order for `circleOrder`; unset = the widget keeps its own order (no list). */
    entries?: { key: string; label: string }[];
    /** What the round button shows while neither `circleIcon` nor the widget icon is set. */
    iconPlaceholder: string;
    /** The widget icon stands in for an unset `circleIcon` (off where something else comes first). */
    widgetIconFallback?: boolean;
}) {
    const widgetIcon = widgetIconFallback ? (o.icon as string) || undefined : undefined;
    const triggerSize = (o.circleTriggerSize as number) || TRIGGER_MAX;
    const itemSize = (o.circleItemSize as number) || 48;
    return (
        <SubGroup title="Kreismenü" className="aura-circle-settings">
            <p className="text-[10px]" style={hint}>
                {intro}
            </p>
            <div>
                <label className="text-[11px] mb-1 block" style={hint}>
                    Richtung
                </label>
                <select
                    value={(o.circleDirection as string) || 'auto'}
                    onChange={(e) => setO({ circleDirection: e.target.value === 'auto' ? undefined : e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                >
                    <option value="auto">Automatisch</option>
                    <option value="full">Vollkreis</option>
                    <option value="top">Halbkreis oben</option>
                    <option value="right">Halbkreis rechts</option>
                    <option value="bottom">Halbkreis unten</option>
                    <option value="left">Halbkreis links</option>
                </select>
            </div>
            {entries && (
                <CircleOrderEditor
                    entries={entries}
                    order={o.circleOrder}
                    onChange={(circleOrder) => setO({ circleOrder })}
                />
            )}
            <div>
                <label className="text-[11px] mb-1 block" style={hint}>
                    Icon im Knopf
                </label>
                <div className="flex items-center gap-2" data-aura-circle-icon="">
                    <IconButton
                        value={(o.circleIcon as string) || undefined}
                        fallback={widgetIcon}
                        placeholder={widgetIcon ? 'Widget-Icon' : iconPlaceholder}
                        onChange={(circleIcon) => setO({ circleIcon })}
                    />
                </div>
            </div>
            <SliderRow
                label="Größe des Knopfs"
                shown={o.circleTriggerSize ? `${triggerSize} px` : 'Widget-Größe'}
                value={triggerSize}
                min={40}
                max={TRIGGER_MAX}
                step={4}
                onChange={(n) => setO({ circleTriggerSize: n >= TRIGGER_MAX ? undefined : n })}
                note="Ganz rechts füllt der Knopf das Widget; höchstens so groß wie das Widget."
            />
            <SliderRow
                label="Größe der Einträge"
                shown={`${itemSize} px`}
                value={itemSize}
                min={32}
                max={96}
                step={2}
                onChange={(n) => setO({ circleItemSize: n })}
            />
            <ToggleRow
                label="Offen lassen"
                text="Das Menü bleibt nach einer Auswahl offen."
                on={!!o.circleKeepOpen}
                toggle={() => setO({ circleKeepOpen: !o.circleKeepOpen })}
            />
            <ToggleRow
                label="Hintergrund abdunkeln"
                text="Dunkelt die Seite hinter dem geöffneten Menü ab."
                on={o.circleShade !== false}
                toggle={() => setO({ circleShade: o.circleShade === false ? undefined : false })}
            />
        </SubGroup>
    );
}
