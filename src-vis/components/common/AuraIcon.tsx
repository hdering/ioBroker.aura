/**
 * One icon, whatever its source: an Iconify id (`mdi:garage`) or a file of an
 * installed ioBroker icon adapter (`iob:vis-icontwo/Lights/light_on.png`, #716).
 *
 * Drop-in for `<Icon icon=… width height style className>` from `@iconify/react`
 * wherever the id comes from the user's config.
 */
import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import {
    adapterIconUrl,
    isTintableAdapterIcon,
    parseAdapterIconId,
    type AdapterIconRef,
} from '../../utils/adapterIconId';

type Size = number | string | undefined;

/** url → did the file load. A mask gives no load event of its own, so the file
 *  is probed once through an Image — the browser cache serves the mask then. */
const probed = new Map<string, boolean>();
const probing = new Map<string, Promise<boolean>>();

function probe(url: string): Promise<boolean> {
    const known = probed.get(url);
    if (known !== undefined) return Promise.resolve(known);
    let p = probing.get(url);
    if (!p) {
        p = new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        }).then((ok) => {
            probed.set(url, ok);
            probing.delete(url);
            return ok;
        });
        probing.set(url, p);
    }
    return p;
}

interface AdapterIconProps {
    iconRef: AdapterIconRef;
    width?: Size;
    height?: Size;
    style?: React.CSSProperties;
    className?: string;
    /** Rendered instead when the file cannot be loaded (adapter removed, file renamed). */
    fallback?: React.ReactNode;
}

export function AdapterIcon({
    iconRef,
    width = '1em',
    height = width,
    style,
    className,
    fallback = null,
}: AdapterIconProps) {
    const url = adapterIconUrl(iconRef);
    const [failed, setFailed] = useState(() => probed.get(url) === false);
    const tint = isTintableAdapterIcon(iconRef);

    useEffect(() => {
        setFailed(probed.get(url) === false);
        if (!tint || probed.has(url)) return;
        let cancelled = false;
        void probe(url).then((ok) => {
            if (!cancelled && !ok) setFailed(true);
        });
        return () => {
            cancelled = true;
        };
    }, [url, tint]);

    if (failed) return <>{fallback}</>;

    const box: React.CSSProperties = { width, height, flexShrink: 0 };
    if (tint) {
        const mask = `url("${url}") center / contain no-repeat`;
        return (
            <span
                aria-hidden="true"
                data-aura-adapter-icon="mask"
                className={className}
                style={{
                    display: 'inline-block',
                    ...box,
                    backgroundColor: 'currentColor',
                    WebkitMask: mask,
                    mask,
                    ...style,
                }}
            />
        );
    }
    return (
        <img
            src={url}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-aura-adapter-icon="image"
            className={className}
            style={{ display: 'inline-block', ...box, objectFit: 'contain', ...style }}
            onError={() => {
                probed.set(url, false);
                setFailed(true);
            }}
        />
    );
}

interface AuraIconProps {
    icon: string;
    width?: Size;
    height?: Size;
    style?: React.CSSProperties;
    className?: string;
}

export function AuraIcon({ icon, width, height, style, className }: AuraIconProps) {
    const iconRef = parseAdapterIconId(icon);
    if (iconRef)
        return <AdapterIcon iconRef={iconRef} width={width} height={height} style={style} className={className} />;
    return <Icon icon={icon} width={width} height={height} style={style} className={className} />;
}
