import { useMemo } from 'react';
import { Heading2 } from 'lucide-react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { useTemplateStates } from '../../hooks/useTemplateValues';
import { useTemplateSpecials } from '../../hooks/useTemplateSpecials';
import { extractTemplateDpRefs, renderTemplate } from '../../utils/htmlTemplate';
import { formatNum } from '../../utils/formatValue';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import type { WidgetConfig } from '../../types';

interface Props {
    config: WidgetConfig;
}

export function HeaderWidget({ config }: Props) {
    const opts = config.options ?? {};
    const rawSubtitle = (opts.subtitle as string | undefined) ?? '';
    const showTitle = opts.showTitle !== false;
    const showSubtitle = opts.showSubtitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Heading2);
    const layout = config.layout ?? 'default';

    // The rule (accent bar in default/compact/framed, divider in minimal) is optional
    // and takes its own colour; unset falls back to the theme variables it always used.
    const showAccent = opts.showAccent !== false;
    // Titel so, wie er eingegeben wurde; Versalien nur auf Wunsch, in jedem Stil (#723).
    const titleUppercase = opts.titleUppercase === true;
    const caps = titleUppercase ? ' uppercase tracking-wider' : '';
    const accentColor = (opts.accentColor as string) || undefined;

    // Own text colour / size per line. The size is a px value scaled by the global
    // font scale (like every other explicit px size in the app), and it carries its
    // own line-height — a Tailwind text-* class ships an absolute one, which would
    // clip the descenders of a larger font.
    const px = (v: number) => `calc(${v}px * var(--font-scale, 1))`;
    const titleColor = (opts.titleColor as string) || undefined;
    const subtitleColor = (opts.subtitleColor as string) || undefined;
    const titleSize = Number(opts.titleSize) || undefined;
    const subtitleSize = Number(opts.subtitleSize) || undefined;
    const titleSizeStyle: React.CSSProperties = titleSize ? { fontSize: px(titleSize), lineHeight: 1.25 } : {};
    const subtitleSizeStyle: React.CSSProperties = subtitleSize ? { fontSize: px(subtitleSize), lineHeight: 1.35 } : {};
    // The icon sits in the title line and shares its colour today (--header-text); a
    // coloured title next to a theme-coloured icon would just look like a bug.
    const headerText = titleColor ?? 'var(--header-text, var(--text-primary))';

    // ── Bindings in the subtitle ──────────────────────────────────────────────
    // The subtitle carries the same binding layer as free HTML (utils/htmlTemplate,
    // docs/widgets/bindings.md): `{0_userdata.0.Temp}`, `{id;round(0)}` and
    // `{{ a + b }}`, plus the context variables (`{view}`, `{wname}`, …). The widget
    // has no datapoint of its own, so there is no `{dp}` here — every reference is
    // spelled out, which is also what makes the subscription set derivable from the
    // text alone. A subtitle without a brace subscribes to nothing.
    const t = useT();
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const hasBinding = rawSubtitle.includes('{');
    const tokenRefs = useMemo(() => (hasBinding ? extractTemplateDpRefs(rawSubtitle) : []), [rawSubtitle, hasBinding]);
    const tokenStates = useTemplateStates(tokenRefs);
    const specials = useTemplateSpecials(config);
    const subtitle = useMemo(() => {
        if (!hasBinding) return rawSubtitle;
        const fmt = (v: unknown): string => {
            if (v === null || v === undefined) return '–';
            return typeof v === 'number' ? formatNum(v, defaultDecimals, numberFormat) : String(v);
        };
        return renderTemplate(rawSubtitle, {
            vars: Object.fromEntries(Object.entries(specials).map(([k, v]) => [k, String(v)])),
            resolve: (ref) => fmt(tokenStates[ref]?.val),
            resolveRaw: (ref, field) => tokenStates[ref]?.[field] ?? null,
            rawVars: { ...specials },
            ops: { formatNum: (v, d) => formatNum(v, d, numberFormat), decimals: defaultDecimals, t },
        });
    }, [rawSubtitle, hasBinding, tokenStates, specials, defaultDecimals, numberFormat, t]);

    const justifyContent = titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start';

    // The subtitle belongs to every style, not just the default one — the option and
    // its "Untertitel anzeigen" switch are offered regardless of the chosen style, so
    // compact and minimal used to swallow a subtitle the user had filled in.
    // `align` only follows the title alignment where that option has an effect at all
    // (the default style); compact and minimal always draw the title on the left, so a
    // centred subtitle underneath would just look misaligned.
    const renderSubtitle = (align?: string) =>
        subtitle && showSubtitle ? (
            <p
                className="aura-widget-value text-xs mt-0.5"
                style={{
                    color: subtitleColor ?? 'var(--text-secondary)',
                    textAlign: align as React.CSSProperties['textAlign'],
                    ...subtitleSizeStyle,
                }}
            >
                {subtitle}
            </p>
        ) : null;

    if (layout === 'minimal') {
        return (
            <div className="aura-widget-row flex flex-col justify-center h-full px-1">
                <div className="flex items-center gap-3">
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: titleColor ?? 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <span
                            className={`aura-widget-title text-xs font-semibold shrink-0 ${titleUppercase ? 'tracking-widest uppercase' : 'tracking-wide'}`}
                            style={{ color: titleColor ?? 'var(--text-secondary)', ...titleSizeStyle }}
                        >
                            {config.title}
                        </span>
                    )}
                    {showAccent && (
                        <div className="flex-1 h-px" style={{ background: accentColor ?? 'var(--app-border)' }} />
                    )}
                </div>
                {renderSubtitle()}
            </div>
        );
    }

    if (layout === 'compact') {
        // The accent rule spans the full widget height here (self-stretch in an
        // h-full row) — that is the compact look and stays true with a subtitle.
        return (
            <div className="aura-widget-row flex items-center gap-3 h-full">
                {showAccent && (
                    <div
                        className="w-1 self-stretch rounded-full"
                        style={{ background: accentColor ?? 'var(--header-accent, var(--accent))' }}
                    />
                )}
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{ color: headerText, flexShrink: 0 }}
                    />
                )}
                <div className="flex flex-col min-w-0 flex-1">
                    {showTitle && (
                        <span
                            className={`aura-widget-title font-semibold text-base${caps}`}
                            style={{ color: headerText, ...titleSizeStyle }}
                        >
                            {config.title}
                        </span>
                    )}
                    {renderSubtitle()}
                </div>
            </div>
        );
    }

    // default / card — the accent rule sits BESIDE title and subtitle (not inside the
    // title row), so it spans the whole text block instead of stopping above the
    // subtitle. Its w-1 plus the gap-3 is exactly the pl-4 the subtitle used to carry
    // to line up under the icon, so the indent now comes from the layout itself.
    return (
        <div className="aura-widget-row flex flex-col justify-center h-full">
            <div className="flex gap-3">
                {titleAlign === 'left' && showAccent && (
                    <div
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ background: accentColor ?? 'var(--header-accent, var(--accent))' }}
                    />
                )}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-3" style={{ justifyContent }}>
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: headerText, flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <h2
                                className={`aura-widget-title font-bold text-xl leading-tight${caps}`}
                                style={{ color: headerText, ...titleSizeStyle }}
                            >
                                {config.title}
                            </h2>
                        )}
                    </div>
                    {renderSubtitle(titleAlign)}
                </div>
            </div>
        </div>
    );
}
