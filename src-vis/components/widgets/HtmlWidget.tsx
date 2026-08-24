import { useEffect, useMemo } from 'react';
import { Code2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useT } from '../../i18n';
import { useTemplateStates } from '../../hooks/useTemplateValues';
import { useTemplateSpecials } from '../../hooks/useTemplateSpecials';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveSandboxAttr, type SandboxPreset } from '../../utils/iframeSandbox';
import { resolveHtmlAssets } from '../../utils/assetUrl';
import { extractTemplateDpRefs, renderTemplate } from '../../utils/htmlTemplate';
import { extractJsonPath } from '../../utils/dpRef';
import { formatNum, type NumberFormat } from '../../utils/formatValue';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import type { WidgetProps } from '../../types';

export function HtmlWidget({ config, onNeedsActionButton }: WidgetProps) {
    const opts = config.options ?? {};
    const htmlContent = (opts.htmlContent as string) ?? '';
    const htmlDatapoint = (opts.htmlDatapoint as string) ?? '';
    const scrollable = (opts.scrollable as boolean) ?? true;
    const sandboxPreset = opts.sandboxPreset as SandboxPreset | undefined;
    const sandboxCustom = opts.sandboxCustom as string | undefined;
    const sandboxAttr = resolveSandboxAttr(sandboxPreset, sandboxCustom, 'standard');
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Code2);

    const { value: dpValue } = useDatapoint(htmlDatapoint);
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const numFmt = (opts.numberFormat as NumberFormat | undefined) ?? globalNumFmt;

    const rawHtml = htmlDatapoint && dpValue != null && dpValue !== '' ? String(dpValue) : htmlContent;

    // Datapoint placeholders: `{0_userdata.0.temp}` for any state, `{dp}` for the
    // widget's own value datapoint, both with an optional JSON path
    // (`{dp}#battery.soc`, see utils/htmlTemplate). Tokens are also filled in HTML
    // that comes FROM a datapoint, so a script can deliver the markup only once and
    // aura keeps the values live.
    //
    // `{dp}` prefers the explicit option and falls back to the widget's main
    // datapoint (set e.g. when the widget was created from one).
    const mainDp = (opts.valueDatapoint as string) || config.datapoint || '';
    const { value: mainValue } = useDatapoint(mainDp);
    const tokenRefs = useMemo(() => extractTemplateDpRefs(rawHtml), [rawHtml]);
    const tokenStates = useTemplateStates(tokenRefs);
    const specials = useTemplateSpecials(config);
    const t = useT();

    const fmt = (v: unknown): string => {
        if (v === null || v === undefined) return '–';
        return typeof v === 'number' ? formatNum(v, decimals, numFmt) : String(v);
    };

    // srcDoc has no base URL of its own, so `<img src="/adapter/…">` inside the
    // sandbox would resolve against aura's own server and 404 — rewrite every
    // src the same way as the standalone image widget does. (issue #519)
    const html = useMemo(() => {
        if (!rawHtml) return rawHtml;
        const filled = renderTemplate(rawHtml, {
            vars: mainDp ? { dp: fmt(mainValue) } : {},
            resolve: (ref) => fmt(tokenStates[ref]?.val),
            resolveVarPath: (name, path) => (name === 'dp' ? fmt(extractJsonPath(mainValue, path)) : '–'),
            // Calculating forms work on raw values: a display-formatted "1.234,5"
            // could not be multiplied, and a decimal comma would wreck SVG geometry.
            resolveRaw: (ref, field) => tokenStates[ref]?.[field] ?? null,
            rawVars: { dp: mainValue ?? null, ...specials },
            ops: { formatNum: (v, d) => formatNum(v, d, numFmt), decimals, t },
        });
        return resolveHtmlAssets(filled);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawHtml, tokenStates, mainValue, mainDp, decimals, numFmt, specials, t]);

    // The sandboxed srcDoc frame is its own document, so clicks in the rendered
    // HTML never reach the frame's click action — ask for the action button.
    useEffect(() => {
        onNeedsActionButton?.(!!html);
    }, [onNeedsActionButton, html]);

    if (!html) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <WidgetIcon size={32} strokeWidth={1} />
                    <span className="text-xs opacity-60">Kein HTML oder Datenpunkt konfiguriert</span>
                </div>
            </div>
        );
    }

    return (
        <div className="aura-widget-row flex flex-col h-full">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs truncate flex-1 min-w-0"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
            )}
            <iframe
                srcDoc={html}
                sandbox={sandboxAttr}
                title={config.title || 'HTML'}
                className="aura-widget-value flex-1 min-h-0 w-full block"
                style={{ border: 'none' }}
                scrolling={scrollable ? 'auto' : 'no'}
            />
        </div>
    );
}
