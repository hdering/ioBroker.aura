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
import { HtmlSelect, type HtmlSelectSize } from '../common/HtmlSelect';
import { EnumCurrent, EnumOptionLabel, type EnumEntry, type EnumEntryDisplay } from './enumEntry';

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

    // --- CUSTOM (3×3 Standard-Grid, vordefinierte Component-Slots: icon / select / label) ---
    if (layout === 'custom') {
        return (
            <div className="relative w-full h-full">
                <CustomGridView
                    config={config}
                    value={currentLabel}
                    valueColor={currentColor}
                    extraComponents={{
                        icon: showIcon ? (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: currentColor ?? 'var(--accent)', flexShrink: 0 }}
                            />
                        ) : null,
                        select: selectEl,
                        label: showValue
                            ? renderCurrent('aura-widget-value text-base font-semibold truncate', {
                                  color: currentColor ?? 'var(--text-primary)',
                              })
                            : null,
                    }}
                />
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
                    <div className="flex items-center gap-2 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <span
                                className="aura-widget-title text-sm truncate"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    flex: '1',
                                    minWidth: 0,
                                }}
                            >
                                {config.title}
                            </span>
                        )}
                    </div>
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
                            color: 'var(--text-secondary)',
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
                <div className="w-1 rounded-full self-stretch" style={{ background: accent }} />
                <div className="flex flex-col justify-between flex-1 min-w-0">
                    {(showTitle || showIcon) && (
                        <div className="flex items-center gap-2">
                            {showIcon && (
                                <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: accent }} />
                            )}
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                                        flex: '1',
                                        minWidth: 0,
                                    }}
                                >
                                    {config.title}
                                </p>
                            )}
                        </div>
                    )}
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
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2" style={titleStyle}>
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs"
                            style={{
                                color: 'var(--text-secondary)',
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
                </div>
            )}
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
