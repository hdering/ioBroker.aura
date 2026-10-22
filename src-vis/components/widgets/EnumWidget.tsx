import { useMemo, useRef } from 'react';
import { ListChecks } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import type { WidgetProps } from '../../types';
import { parseEnumEntriesJson } from '../../utils/enumEntriesJson';
import { contentPositionClass, titlePositionStyle } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { ConfirmOverlay } from './ConfirmOverlay';
import { CustomGridView } from './CustomGridView';
import { AccentBar } from './AccentBar';
import { useStatusFields } from '../../hooks/useStatusFields';
import { HtmlSelect, type HtmlSelectSize } from '../common/HtmlSelect';
import {
    EnumCurrent,
    EnumEntryLabel,
    EnumOptionLabel,
    entryRenderMode,
    type EnumEntry,
    type EnumEntryDisplay,
} from './enumEntry';
import { CircleMenu, type CircleDirection, type CircleMenuItem } from './CircleMenu';
import { resolveImageSource } from '../../utils/assetUrl';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';

function parseValue(raw: string): boolean | number | string {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : raw;
}

function findEntry(entries: EnumEntry[], current: unknown): EnumEntry | undefined {
    if (current === null || current === undefined) return undefined;
    const s = String(current);
    return entries.find((e) => e.value === s);
}

/**
 * An entry as it fits into a round button: its image or icon filling a share of
 * the circle, else the label. `iconPx` sizes icons (px, unset = `share`); images take `share` of
 * the button. The colour is left to the caller (an active entry draws white).
 */
function EnumCircleContent({ entry, iconPx, share }: { entry: EnumEntry; iconPx?: number; share: string }) {
    const mode = entryRenderMode(entry);
    if (mode === 'image' && entry.image) {
        return (
            <img
                src={resolveImageSource(entry.image)}
                alt={entry.label}
                style={{ width: share, height: share, objectFit: 'contain' }}
            />
        );
    }
    if (entry.icon && (mode === 'icon' || mode === 'text')) {
        const Icon = getWidgetIcon(entry.icon, ListChecks);
        return iconPx ? (
            <Icon size={iconPx} style={{ flexShrink: 0 }} />
        ) : (
            <Icon style={{ width: share, height: share, flexShrink: 0 }} />
        );
    }
    if (mode === 'html') return <EnumEntryLabel entry={entry} style={{ color: 'inherit' }} />;
    return (
        <span
            style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
            }}
        >
            {entry.label || entry.value}
        </span>
    );
}

export function EnumWidget({ config }: WidgetProps) {
    const { value } = useDatapoint(config.datapoint);
    const { setState } = useIoBroker();

    const o = config.options ?? {};
    const layout = config.layout ?? 'default';
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const showValue = o.showValue !== false; // current label
    const showSelect = o.showSelect !== false; // dropdown
    // How the current selection is rendered: plain text, icon + text, or icon only.
    const entryDisplay = (o.entryDisplay as EnumEntryDisplay | undefined) ?? 'text';
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const confirmAction = !!o.confirmAction;
    const confirmText = (o.confirmText as string) ?? '';
    // Size and width of the dropdown (#679). Without them the control keeps the
    // size it always had and hugs the current entry, so existing widgets are
    // pixel-identical.
    const selectSize = (o.selectSize as HtmlSelectSize) ?? 'sm';
    const selectWidth = Number(o.selectWidth) > 0 ? Number(o.selectWidth) : undefined;

    // Entries come either from the manually maintained list or from a datapoint
    // holding JSON (issue #577). The JSON DP is only subscribed in that mode.
    const fromJson = o.entriesSource === 'json';
    const { value: entriesRaw } = useDatapoint(fromJson ? ((o.entriesDp as string) ?? '') : '');
    const manualEntries = o.entries as EnumEntry[] | undefined;
    const valueKey = o.entriesValueKey as string | undefined;
    const labelKey = o.entriesLabelKey as string | undefined;
    const colorKey = o.entriesColorKey as string | undefined;
    const iconKey = o.entriesIconKey as string | undefined;
    const imageKey = o.entriesImageKey as string | undefined;
    const jsonEntries = useMemo(
        () =>
            fromJson
                ? parseEnumEntriesJson(entriesRaw, {
                      value: valueKey,
                      label: labelKey,
                      color: colorKey,
                      icon: iconKey,
                      image: imageKey,
                  })
                : [],
        [fromJson, entriesRaw, valueKey, labelKey, colorKey, iconKey, imageKey],
    );
    const entries = fromJson ? jsonEntries : (manualEntries ?? []);

    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, ListChecks);

    const current = findEntry(entries, value);
    const currentLabel = current?.label ?? (value === null || value === undefined ? '–' : String(value));
    const currentColor = current?.color;

    // Optional security confirmation (#674). The picked value is parked in a ref
    // instead of state: useConfirmAction only re-runs the action closure, and a ref
    // is always current — even for the disabled path, where run() fires straight away.
    const picked = useRef<string | null>(null);
    const doPick = () => {
        const raw = picked.current;
        picked.current = null;
        if (raw === null) return;
        setState(config.datapoint, parseValue(raw));
    };
    const { run: runPick, pending, confirm, cancel } = useConfirmAction(doPick, confirmAction);

    const onPick = (raw: string) => {
        picked.current = raw;
        runPick();
    };
    const cancelPick = () => {
        picked.current = null;
        cancel();
    };

    const confirmOverlay = pending ? (
        <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancelPick} />
    ) : null;

    // Render the current selection honoring the entryDisplay option
    // (text / icon+text / icon) — shared with the list widgets' select row.
    const renderCurrent = (className: string, style: React.CSSProperties) => (
        <EnumCurrent
            entry={current}
            display={entryDisplay}
            fallback={currentLabel}
            className={className}
            style={style}
        />
    );

    // Dropdown option content: icon + label when an entry has an icon, otherwise
    // its own rich render mode.
    const renderOption = (e: EnumEntry) => <EnumOptionLabel entry={e} />;

    const selectCore = showSelect ? (
        <HtmlSelect
            value={current?.value ?? ''}
            onPick={onPick}
            size={selectSize}
            // A fixed width is only meaningful if the control fills it — otherwise
            // it would keep hugging the label inside the wider box.
            fullWidth={!!selectWidth}
            entries={entries.map((e) => ({ value: e.value, content: renderOption(e) }))}
        />
    ) : null;

    // The width sits on a wrapper: HtmlSelect's own root is inline-flex and would
    // shrink back to the label.
    const selectEl =
        selectCore && selectWidth ? (
            <div className="min-w-0 shrink-0" style={{ width: selectWidth }}>
                {selectCore}
            </div>
        ) : (
            selectCore
        );

    const { battery, reach, batteryIcon, reachIcon, statusBadges, statusItemCells } = useStatusFields(config);

    // --- CUSTOM (3×3 Standard-Grid, vordefinierte Component-Slots: icon / select / label) ---
    if (layout === 'custom') {
        return (
            <div className="relative w-full h-full">
                <CustomGridView
                    config={config}
                    value={currentLabel}
                    valueColor={currentColor}
                    extraFields={{ battery, reach }}
                    extraComponents={{
                        'battery-icon': batteryIcon,
                        'reach-icon': reachIcon,
                        'status-badges': statusBadges,
                        ...statusItemCells,
                        icon: showIcon ? (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{
                                    // A cell colour wins (grids built from the default layout grey it, #768).
                                    '--aura-icon-color': `var(--aura-cell-color, ${currentColor ?? 'var(--accent)'})`,
                                    flexShrink: 0,
                                }}
                            />
                        ) : null,
                        select: selectEl,
                        label: showValue
                            ? renderCurrent('aura-widget-value text-base font-semibold truncate', {
                                  color: currentColor ?? 'var(--text-primary)',
                              })
                            : null,
                        // The big label of the minimal and card layouts (#768).
                        'label-lg': showValue
                            ? renderCurrent('aura-widget-value text-xl font-bold truncate max-w-full', {
                                  color: currentColor ?? 'var(--accent)',
                              })
                            : null,
                        'accent-bar': <AccentBar color={currentColor ?? 'var(--accent)'} />,
                    }}
                />
                {confirmOverlay}
            </div>
        );
    }

    // --- CIRCLE (#815): the value list fanned out around a round button ---
    if (layout === 'circle') {
        const itemSize = (o.circleItemSize as number) || 48;
        const accent = currentColor ?? 'var(--accent)';
        const items: CircleMenuItem[] = entries.map((e) => {
            const active = current?.value === e.value;
            return {
                key: `value-${e.value}`,
                content: <EnumCircleContent entry={e} iconPx={Math.round(itemSize * 0.5)} share="70%" />,
                title: e.label || e.value,
                active,
                onSelect: () => onPick(e.value),
                // An entry's own colour tints it while it is not the active one.
                style: !active && e.color ? { color: e.color } : undefined,
            };
        });
        // Own button icon first, else the active entry's picture, else the widget icon.
        const ownIcon = o.circleIcon ? getWidgetIcon(o.circleIcon as string, ListChecks) : null;
        const entryPicture = !ownIcon && current && (current.icon || entryRenderMode(current) === 'image');
        const pictureOnly = entryDisplay === 'icon' && !!entryPicture;
        const iconStyle: React.CSSProperties = {
            '--aura-icon-color': accent,
            color: accent,
            width: '34%',
            height: '34%',
            flexShrink: 0,
        } as React.CSSProperties;
        const TriggerIcon = ownIcon ?? (showIcon && !entryPicture ? WidgetIcon : null);
        return (
            <div className="aura-widget-row h-full" style={{ position: 'relative' }}>
                <CircleMenu
                    triggerTitle={`${config.title ? `${config.title}: ` : ''}${currentLabel}`}
                    triggerStyle={{ borderColor: accent }}
                    items={items}
                    direction={(o.circleDirection as CircleDirection) || 'auto'}
                    itemSize={itemSize}
                    keepOpen={!!o.circleKeepOpen}
                    shade={o.circleShade !== false}
                    triggerSize={(o.circleTriggerSize as number) || undefined}
                    trigger={
                        <>
                            {TriggerIcon && <TriggerIcon className="aura-widget-icon" style={iconStyle} />}
                            {entryPicture && current && (
                                <span
                                    className="aura-widget-icon flex items-center justify-center"
                                    style={{
                                        color: accent,
                                        width: pictureOnly ? '50%' : '34%',
                                        height: pictureOnly ? '50%' : '34%',
                                    }}
                                >
                                    <EnumCircleContent entry={current} share="100%" />
                                </span>
                            )}
                            {showValue && !pictureOnly && (
                                <span
                                    className="aura-widget-value font-semibold text-center"
                                    style={{
                                        color: currentColor ?? 'var(--text-primary)',
                                        fontSize: '13cqw',
                                        lineHeight: 1.15,
                                        marginTop: '3cqw',
                                        maxWidth: '80%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {currentLabel}
                                </span>
                            )}
                        </>
                    }
                    below={
                        showTitle ? (
                            <p
                                className="aura-widget-title text-xs truncate w-full shrink-0"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: (titleAlign === 'left'
                                        ? 'center'
                                        : titleAlign) as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        ) : null
                    }
                />
                <StatusBadges config={config} />
                {confirmOverlay}
            </div>
        );
    }

    // --- COMPACT ---
    if (layout === 'compact') {
        return (
            <div
                className="aura-widget-row flex items-center justify-between h-full gap-2"
                style={{ position: 'relative' }}
            >
                {(showTitle || showIcon) && (
                    <TitleRow align={titleAlign} className="flex items-center gap-2 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <span
                                className="aura-widget-title text-sm truncate"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    flex: '1',
                                    minWidth: 0,
                                }}
                            >
                                {config.title}
                            </span>
                        )}
                        <HeaderSlotsInline />
                    </TitleRow>
                )}
                <div className="flex items-center gap-2 shrink-0 min-w-0">
                    {showValue &&
                        renderCurrent('aura-widget-value text-base font-semibold truncate', {
                            color: currentColor ?? 'var(--text-primary)',
                        })}
                    {selectEl}
                </div>
                <StatusBadges config={config} />
                {confirmOverlay}
            </div>
        );
    }

    // --- MINIMAL: Label groß zentriert, Dropdown darunter ---
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-2"
                style={{ position: 'relative' }}
            >
                {showValue &&
                    renderCurrent('aura-widget-value text-xl font-bold truncate max-w-full', {
                        color: currentColor ?? 'var(--accent)',
                    })}
                {selectEl}
                {showTitle && (
                    <span
                        className="aura-widget-title text-xs mt-1 truncate max-w-full"
                        style={{
                            '--aura-title-color': 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                <StatusBadges config={config} />
                {confirmOverlay}
            </div>
        );
    }

    // --- CARD ---
    if (layout === 'card') {
        const accent = currentColor ?? 'var(--accent)';
        return (
            <div className="aura-widget-row flex h-full gap-3" style={{ position: 'relative' }}>
                <AccentBar color={accent} />
                <div className="flex flex-col justify-between flex-1 min-w-0">
                    <HeaderGroup>
                        {(showTitle || showIcon) && (
                            <TitleRow align={titleAlign} className="flex items-center gap-2">
                                {showIcon && (
                                    <WidgetIcon
                                        className="aura-widget-icon"
                                        size={iconSize}
                                        style={{ '--aura-icon-color': accent }}
                                    />
                                )}
                                {showTitle && (
                                    <p
                                        className="aura-widget-title text-xs truncate"
                                        style={{
                                            '--aura-title-color': 'var(--text-secondary)',
                                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                                            flex: '1',
                                            minWidth: 0,
                                        }}
                                    >
                                        {config.title}
                                    </p>
                                )}
                                <HeaderSlotsInline />
                            </TitleRow>
                        )}
                        <HeaderSlotsRow2 />
                    </HeaderGroup>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {showValue && renderCurrent('aura-widget-value text-xl font-bold truncate', { color: accent })}
                        {selectEl}
                    </div>
                </div>
                <StatusBadges config={config} />
                {confirmOverlay}
            </div>
        );
    }

    // --- DEFAULT ---
    const posClass = contentPositionClass(o.contentPosition as string | undefined);
    const titlePos = o.titlePosition as string | undefined;
    const titleStyle = titlePositionStyle(titlePos);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            <HeaderGroup>
                {(showTitle || showIcon) && (
                    <TitleRow align={titleAlign} className="flex items-center gap-2" style={titleStyle}>
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: '1',
                                    minWidth: 0,
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                        <HeaderSlotsInline />
                    </TitleRow>
                )}
                <HeaderSlotsRow2 />
            </HeaderGroup>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                {showValue &&
                    renderCurrent('aura-widget-value text-base font-semibold truncate', {
                        color: currentColor ?? 'var(--text-primary)',
                    })}
                {selectEl}
            </div>
            <StatusBadges config={config} />
            {confirmOverlay}
        </div>
    );
}
