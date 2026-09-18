/**
 * Charging / connection badges and the charging effect of the fill widget (#671).
 *
 * Drawn as an HTML overlay on top of whichever renderer is on screen, for the same
 * reason the limits are (see FillLimits): every layout has its own viewBox and its own
 * scaling, so an icon placed inside the SVG comes out squashed in one layout and tiny
 * in the next. Measuring the bar's real box once and drawing in pixels is immune to
 * all of it — and it keeps the five renderers free of a feature none of them owns.
 *
 * The blink effect is not here: it belongs on the fill itself, so it is a CSS class on
 * the host (`.aura-fill-blink`, see index.css) that reaches every `[data-aura-fill-level]`.
 * Only the sweep ("Knight Rider") needs geometry, and that is what this layer has.
 */
import type { RefObject } from 'react';
import { Zap, WifiOff } from 'lucide-react';
import { useTrackBox } from './FillLimits';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { FillStatus } from '../../utils/fillStatus';

export interface FillStatusLayerProps {
    /** Positioned ancestor the overlay is placed in. */
    hostRef: RefObject<HTMLElement>;
    /**
     * The bar, when the layout has one. Its box carries the badges and bounds the
     * sweep; without it (segments, wave) the host box stands in, which is the whole
     * visualisation and the best anchor those layouts can offer.
     */
    trackRef?: RefObject<Element> | null;
    orientation: 'vertical' | 'horizontal';
    /** Fill level 0..1 — the sweep runs over the filled part, not the empty track. */
    fillFrac: number;
    status: FillStatus;
    showChargeIcon: boolean;
    showOfflineIcon: boolean;
    /** Freely chosen icons (Iconify id or legacy Lucide name); empty = the defaults. */
    chargeIcon?: string;
    offlineIcon?: string;
    chargeColor: string;
    offlineColor: string;
}

/** Below this share of the bar there is nothing to sweep over — use the whole track. */
const MIN_SWEEP_FRAC = 0.08;
/** Icons when nothing is picked. Filled shapes — a stroked outline vanishes at badge size. */
export const DEFAULT_CHARGE_ICON = 'mdi:flash';
export const DEFAULT_OFFLINE_ICON = 'mdi:wifi-off';

export function FillStatusLayer({
    hostRef,
    trackRef,
    orientation,
    fillFrac,
    status,
    showChargeIcon,
    showOfflineIcon,
    chargeIcon,
    offlineIcon,
    chargeColor,
    offlineColor,
}: FillStatusLayerProps) {
    // No track ref: measure the host against itself, which yields its own box at 0/0.
    const box = useTrackBox(hostRef, trackRef ?? hostRef);
    const badges = [
        status.charging && showChargeIcon ? ('charge' as const) : null,
        status.offline && showOfflineIcon ? ('offline' as const) : null,
    ].filter(Boolean) as ('charge' | 'offline')[];
    const sweep = status.effect === 'scan';
    if (!box || (!badges.length && !sweep)) return null;

    const vertical = orientation === 'vertical';
    const cross = Math.min(box.width, box.height);
    const size = Math.max(9, Math.min(22, cross * 0.45));
    const pad = Math.max(2, Math.min(6, cross * 0.08));

    // The lit part of the bar. An almost empty battery has nothing to sweep over, so
    // the sweep falls back to the full track — a charging light on an empty cell is
    // exactly when the animation says the most.
    const frac = Math.max(0, Math.min(1, fillFrac));
    const useFull = frac < MIN_SWEEP_FRAC;
    const litLen = useFull ? 1 : frac;
    const sweepBox = vertical
        ? {
              left: box.left,
              top: box.top + (1 - litLen) * box.height,
              width: box.width,
              height: litLen * box.height,
          }
        : { left: box.left, top: box.top, width: litLen * box.width, height: box.height };

    return (
        <div
            data-aura-fill-status=""
            data-aura-fill-charging={status.charging ? '1' : '0'}
            data-aura-fill-connected={status.connected === null ? '' : status.connected ? '1' : '0'}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}
        >
            {sweep && (
                <div
                    data-aura-fill-scan=""
                    style={{
                        position: 'absolute',
                        ...sweepBox,
                        overflow: 'hidden',
                        borderRadius: Math.min(9, cross / 2),
                    }}
                >
                    <div
                        className={vertical ? 'aura-fill-scan-band-y' : 'aura-fill-scan-band-x'}
                        style={{
                            position: 'absolute',
                            ...(vertical
                                ? { left: 0, right: 0, top: 0, height: '45%' }
                                : { top: 0, bottom: 0, left: 0, width: '45%' }),
                            background: `linear-gradient(${vertical ? '180deg' : '90deg'}, transparent, ${chargeColor}, transparent)`,
                            opacity: 0.65,
                        }}
                    />
                </div>
            )}

            {badges.length > 0 && (
                <div
                    data-aura-fill-badges=""
                    style={{
                        position: 'absolute',
                        left: box.left,
                        top: box.top,
                        width: box.width,
                        height: box.height,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'flex-end',
                        gap: pad / 2,
                        padding: pad,
                        // The badge sits on the fill as often as on the empty track, and the
                        // fill colour is the user's. A shadow keeps it readable on both.
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
                    }}
                >
                    {badges.map((kind) => {
                        // Any icon of the picker, Iconify or Lucide. The colour rides on
                        // `style.color` rather than a `color` prop: that is the one channel
                        // both shapes of icon component understand (an Iconify icon paints
                        // with currentColor, a Lucide one strokes with it).
                        const Icon =
                            kind === 'charge'
                                ? getWidgetIcon(chargeIcon || DEFAULT_CHARGE_ICON, Zap)
                                : getWidgetIcon(offlineIcon || DEFAULT_OFFLINE_ICON, WifiOff);
                        return (
                            <span
                                key={kind}
                                data-aura-fill-badge={kind}
                                style={{
                                    display: 'inline-flex',
                                    flexShrink: 0,
                                    color: kind === 'charge' ? chargeColor : offlineColor,
                                }}
                            >
                                <Icon size={size} />
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
