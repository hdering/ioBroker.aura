import { Power } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { useStatusFields } from '../../hooks/useStatusFields';
import { ConfirmOverlay } from './ConfirmOverlay';

function parseVal(raw: string | undefined, fallback: boolean): boolean | number | string {
    if (raw === undefined || raw === '') return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    return raw;
}

export function SwitchWidget({ config }: WidgetProps) {
    const { value } = useDatapoint(config.datapoint);
    const { setState } = useIoBroker();
    const layout = config.layout ?? 'default';
    const o = config.options ?? {};
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const momentary = (o.momentary as boolean) ?? false;
    const momentaryDelay = (o.momentaryDelay as number) ?? 500;
    const confirmAction = (o.confirmAction as boolean) ?? false;
    const confirmText = (o.confirmText as string) ?? '';

    const onValue = o.onValue as string | undefined;
    const offValue = o.offValue as string | undefined;
    const trueWrite = parseVal(onValue, true);
    const falseWrite = parseVal(offValue, false);
    const isOn = onValue !== undefined && onValue !== '' ? String(value) === String(trueWrite) : Boolean(value);

    const toggle = () => {
        if (momentary) {
            setState(config.datapoint, trueWrite);
            setTimeout(() => setState(config.datapoint, falseWrite), momentaryDelay);
        } else {
            setState(config.datapoint, isOn ? falseWrite : trueWrite);
        }
    };

    const { run: handleToggle, pending, confirm, cancel } = useConfirmAction(toggle, confirmAction);

    const WidgetIcon = getWidgetIcon(config.options?.icon as string | undefined, Power);
    const showTitle = o.showTitle !== false;
    const showLabel = o.showLabel !== false;
    const showIcon = o.showIcon !== false;

    const iconSize = (o.iconSize as number) || 20;
    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    // Icon-/Bild-Modus statt Schiebeschalter
    const controlMode = (o.controlMode as string) ?? 'toggle';
    const isIconMode = controlMode === 'icon';
    const isImageMode = controlMode === 'image';
    const onColor = (o.onColor as string) || 'var(--accent-green)';
    const offColor = (o.offColor as string) || 'var(--text-secondary)';
    const OnIconComp = getWidgetIcon(o.onIcon as string | undefined, WidgetIcon);
    const OffIconComp = getWidgetIcon(o.offIcon as string | undefined, WidgetIcon);
    const StateIcon = isOn ? OnIconComp : OffIconComp;
    const stateColor = isOn ? onColor : offColor;
    const controlIconSize = (o.controlIconSize as number) || 28;
    const onImage = o.onImage as string | undefined;
    const offImage = o.offImage as string | undefined;
    const stateImage = isOn ? onImage : offImage;

    // Bedienelement für Icon- oder Bild-Modus (gemeinsamer Button-Wrapper)
    const iconControlButton = (extraClass = '') => (
        <button
            onClick={handleToggle}
            className={`aura-widget-action nodrag flex items-center justify-center shrink-0 transition-transform hover:scale-110 focus:outline-none ${extraClass}`}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            aria-label={isOn ? 'AN' : 'AUS'}
        >
            {isImageMode && stateImage ? (
                <img
                    src={resolveAssetUrl(stateImage)}
                    style={{ width: controlIconSize, height: controlIconSize, objectFit: 'contain' }}
                    alt=""
                />
            ) : (
                <StateIcon size={controlIconSize} style={{ color: stateColor }} />
            )}
        </button>
    );

    if (layout === 'custom')
        return (
            <div className="relative w-full h-full">
                <CustomGridView
                    config={config}
                    value={isOn ? 'AN' : 'AUS'}
                    extraFields={{ battery, reach }}
                    extraComponents={{
                        icon: showIcon ? (
                            <WidgetIcon
                                size={iconSize}
                                style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        ) : null,
                        'battery-icon': batteryIcon,
                        'reach-icon': reachIcon,
                        'status-badges': statusBadges,
                        toggle:
                            isIconMode || isImageMode ? (
                                iconControlButton()
                            ) : (
                                <button
                                    onClick={handleToggle}
                                    className="aura-widget-action nodrag relative w-10 h-5 rounded-full transition-colors focus:outline-none"
                                    style={{
                                        background: isOn
                                            ? 'var(--switch-bg, var(--accent))'
                                            : 'var(--switch-off-bg, var(--app-border))',
                                        border: '1px solid var(--switch-border, transparent)',
                                    }}
                                >
                                    <span
                                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow transition-transform"
                                        style={{
                                            left: isOn ? '22px' : '2px',
                                            background: 'var(--switch-thumb-color, #fff)',
                                        }}
                                    />
                                </button>
                            ),
                    }}
                />
                {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
            </div>
        );

    // --- CARD: Vollflächige farbige Karte mit großem Icon ---
    if (layout === 'card') {
        return (
            <button
                onClick={handleToggle}
                className="aura-widget-row aura-widget-action w-full h-full flex flex-col items-center justify-center gap-3 rounded-widget transition-all duration-300"
                style={{
                    position: 'relative',
                    background: isOn
                        ? 'linear-gradient(135deg, var(--accent-green), color-mix(in srgb, var(--accent-green) 60%, black))'
                        : 'var(--app-bg)',
                    border: `2px solid ${isOn ? 'var(--accent-green)' : 'var(--app-border)'}`,
                }}
            >
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{
                            color: isOn ? '#fff' : 'var(--text-secondary)',
                            filter: isOn ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'none',
                        }}
                    />
                )}
                <div className="text-center">
                    {showTitle && (
                        <p
                            className="aura-widget-title font-bold text-sm"
                            style={{
                                color: isOn ? '#fff' : 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                    {showLabel && (
                        <p
                            className="aura-widget-value text-xs opacity-70"
                            style={{ color: isOn ? '#fff' : 'var(--text-secondary)' }}
                        >
                            {isOn ? 'AN' : 'AUS'}
                        </p>
                    )}
                </div>
                <StatusBadges config={config} />
                {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
            </button>
        );
    }

    // --- COMPACT: Zeile mit Icon + Titel + Toggle ---
    if (layout === 'compact') {
        return (
            <div className="aura-widget-row flex items-center gap-2 h-full" style={{ position: 'relative' }}>
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }}
                    />
                )}
                {showTitle && (
                    <span
                        className="aura-widget-title flex-1 text-sm truncate"
                        style={{
                            color: 'var(--text-primary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                {!showTitle && <span className="flex-1" />}
                {isIconMode || isImageMode ? (
                    iconControlButton()
                ) : (
                    <button
                        onClick={handleToggle}
                        className="aura-widget-action relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none"
                        style={{
                            background: isOn
                                ? 'var(--switch-bg, var(--accent-green))'
                                : 'var(--switch-off-bg, var(--app-border))',
                            border: '1px solid var(--switch-border, transparent)',
                        }}
                    >
                        <span
                            className={`absolute top-1/2 -translate-y-1/2 left-0.5 w-5 h-5 rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0'}`}
                            style={{ background: 'var(--switch-thumb-color, #fff)' }}
                        />
                    </button>
                )}
                <StatusBadges config={config} />
                {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
            </div>
        );
    }

    // --- DEFAULT ---
    const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);
    const titlePos = config.options?.titlePosition as string | undefined;
    const titleStyle = titlePositionStyle(titlePos);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2" style={titleStyle}>
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)', flexShrink: 0 }}
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
            <div className="flex items-center justify-between">
                {showLabel && (
                    <span
                        className="aura-widget-value text-base font-semibold"
                        style={{ color: isOn ? 'var(--accent-green)' : 'var(--text-secondary)' }}
                    >
                        {isOn ? 'AN' : 'AUS'}
                    </span>
                )}
                {isIconMode || isImageMode ? (
                    iconControlButton(!showLabel ? 'ml-auto' : '')
                ) : (
                    <button
                        onClick={handleToggle}
                        className={`aura-widget-action relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${!showLabel ? 'ml-auto' : ''}`}
                        style={{
                            background: isOn
                                ? 'var(--switch-bg, var(--accent-green))'
                                : 'var(--switch-off-bg, var(--app-border))',
                            border: '1px solid var(--switch-border, transparent)',
                        }}
                    >
                        <span
                            className={`absolute top-1/2 -translate-y-1/2 left-0.5 w-5 h-5 rounded-full shadow transition-transform duration-200 ${isOn ? 'translate-x-6' : 'translate-x-0'}`}
                            style={{ background: 'var(--switch-thumb-color, #fff)' }}
                        />
                    </button>
                )}
            </div>
            <StatusBadges config={config} />
            {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
        </div>
    );
}
