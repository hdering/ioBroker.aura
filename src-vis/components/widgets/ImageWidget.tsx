import { useState, useEffect, useMemo, useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useReloadTrigger } from '../../hooks/useReloadTrigger';
import { CustomGridView } from './CustomGridView';
import { resolveAssetUrl, resolveImageSource } from '../../utils/assetUrl';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';

type FitMode = 'none' | 'contain' | 'width' | 'height';

export function ImageWidget({ config }: WidgetProps) {
    const opts = config.options ?? {};
    const imageUrl = resolveAssetUrl((opts.imageUrl as string) ?? '');
    const datapointId = (opts.imageDatapoint as string) ?? '';
    const fit = (opts.fit as FitMode) ?? 'contain';
    const refreshSeconds = (opts.refreshInterval as number) ?? 0;
    // SVG sources are usually transparent (a QR code is bare black paths), so on
    // a dark theme they vanish into the card. An explicit backdrop keeps them
    // readable - and a QR code scannable. (issue #592)
    const imageBackground = (opts.imageBackground as string) || undefined;

    const { value: dpValue } = useDatapoint(datapointId);
    // A script that saves a new picture under the same name writes the same path
    // again - the src would not change, so every write of the source DP counts as
    // a reload. A separate trigger DP does the same for a fixed URL. (issue #853)
    const sourceWrites = useReloadTrigger(datapointId);
    const triggerWrites = useReloadTrigger((opts.reloadDp as string) ?? '');

    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, ImageIcon);
    const layout = config.layout ?? 'default';

    // Incrementing key forces <img> reload on refresh tick
    const [tick, setTick] = useState(0);
    const [loadError, setLoadError] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasSource = !!imageUrl || !!datapointId;

    useEffect(() => {
        setLoadError(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (!hasSource || refreshSeconds < 1) return;
        intervalRef.current = setInterval(() => setTick((n) => n + 1), refreshSeconds * 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [hasSource, imageUrl, refreshSeconds]);

    const fromDp = !!datapointId && dpValue != null;
    const reload = tick + triggerWrites + (fromDp ? sourceWrites : 0);
    // A time stamp, not the counter: `_t=1` after a page reload would hit the
    // browser cache from the previous visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const reloadStamp = useMemo(() => Date.now(), [reload]);

    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={imageUrl || (dpValue ? String(dpValue) : '')}
                extraFields={{
                    url: imageUrl || '–',
                    dp: datapointId || '–',
                }}
            />
        );

    // Build src from datapoint value (base64, URL or web-adapter path) or from static URL
    const src = (() => {
        if (!fromDp && !imageUrl) return '';
        const resolved = resolveImageSource(fromDp ? String(dpValue) : imageUrl);
        // data:/blob: URIs carry the payload inline – no cache-bust
        if (!resolved || resolved.startsWith('data:') || resolved.startsWith('blob:')) return resolved;
        if (reload === 0) return resolved;
        const sep = resolved.includes('?') ? '&' : '?';
        return `${resolved}${sep}_t=${reloadStamp}`;
    })();

    if (!src) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                <HeaderGroup>
                    {(showTitle || showIcon) && (
                        <TitleRow align={titleAlign} className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                            {showIcon && (
                                <WidgetIcon
                                    className="aura-widget-icon"
                                    size={iconSize}
                                    style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                                />
                            )}
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                    style={{
                                        '--aura-title-color': 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
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
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <WidgetIcon size={iconSize} strokeWidth={1} />
                    <span className="text-xs opacity-60">Keine URL oder Datenpunkt konfiguriert</span>
                </div>
            </div>
        );
    }

    const imgStyle: React.CSSProperties = (() => {
        switch (fit) {
            case 'none':
                return { display: 'block', flexShrink: 0 };
            case 'contain':
                return { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
            case 'width':
                return { width: '100%', height: 'auto', display: 'block' };
            case 'height':
                return { height: '100%', width: 'auto', display: 'block' };
        }
    })();

    return (
        <div className="aura-widget-row flex flex-col h-full">
            <HeaderGroup>
                {(showTitle || showIcon) && (
                    <TitleRow align={titleAlign} className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    '--aura-title-color': 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
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
            <div
                className="aura-widget-value"
                style={{
                    flex: '1 1 0',
                    minHeight: 0,
                    overflow: fit === 'none' ? 'auto' : 'hidden',
                    display: 'flex',
                    alignItems: fit === 'none' ? 'flex-start' : 'center',
                    justifyContent: fit === 'none' ? 'flex-start' : 'center',
                    position: 'relative',
                    background: imageBackground,
                }}
            >
                <img
                    src={src}
                    alt={config.title || ''}
                    style={imgStyle}
                    onLoad={() => setLoadError(false)}
                    onError={() => setLoadError(true)}
                />
                {loadError && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ background: 'rgba(0,0,0,0.55)' }}
                    >
                        <ImageIcon size={28} style={{ color: '#ef4444' }} />
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
                            Ladefehler
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
