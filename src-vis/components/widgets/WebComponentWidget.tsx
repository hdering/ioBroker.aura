import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Puzzle } from 'lucide-react';
import {
    importWebComponent,
    isSameTheme,
    NAVIGATE_EVENT,
    type WebComponentElement,
    type WebComponentTheme,
} from '@iobroker/web-components';
import { useT } from '../../i18n';
import { useThemeEpoch } from '../../store/themeEpoch';
import { useDashboardStore } from '../../store/dashboardStore';
import { useNavigationStore } from '../../store/navigationStore';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useConfigStore } from '../../store/configStore';
import {
    findKnownWebComponent,
    findTabForView,
    themeFromVars,
    typedSettings,
    withoutHostSettings,
} from '../../utils/webComponentHost';
import { findWebComponent, getWebComponentSocket, useWebComponentCatalog } from '../../utils/webComponentRegistry';
import type { WidgetProps } from '../../types';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import { useWebComponentDialogs } from './WebComponentDialog';

const FILL = { display: 'block', width: '100%', height: '100%' } as const;

type Status = 'loading' | 'ready' | 'missing' | 'failed' | 'unset';

/**
 * Shows an ioBroker web component (`@iobroker/web-components`) of an installed
 * adapter: its custom element gets Aura's socket, the settings stored in the
 * widget, the colors and the font of the theme, the edit mode and Aura's dialogs
 * (WebComponentDialog). The element subscribes and writes on its own.
 */
export function WebComponentWidget({ config, editMode }: WidgetProps) {
    const t = useT();
    const opts = config.options ?? {};
    const tag = typeof opts.wcTag === 'string' ? opts.wcTag : '';
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Puzzle);

    const { components, loading } = useWebComponentCatalog();
    const component = findWebComponent(components, tag, opts.wcAdapter);
    const known = component ? undefined : findKnownWebComponent(tag, opts.wcAdapter);
    const lang = useConfigStore((s) => s.frontend.language ?? 'de');

    const [status, setStatus] = useState<Status>(tag ? 'loading' : 'unset');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!tag) {
            setStatus('unset');
            return;
        }
        if (!component) {
            setStatus(loading ? 'loading' : 'missing');
            return;
        }
        let alive = true;
        setStatus('loading');
        // The module first: the element must have its class before it gets its properties
        importWebComponent(component).then(
            () => alive && setStatus('ready'),
            (e: unknown) => {
                if (!alive) return;
                setError(e instanceof Error ? e.message : String(e));
                setStatus('failed');
            },
        );
        return () => {
            alive = false;
        };
    }, [tag, component, loading]);

    const elRef = useRef<WebComponentElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);

    // socket: one bridge for all elements, ready once the system language is known
    useLayoutEffect(() => {
        if (status !== 'ready') return;
        let alive = true;
        void getWebComponentSocket().then((socket) => {
            if (alive && elRef.current) elRef.current.socket = socket;
        });
        return () => {
            alive = false;
        };
    }, [status]);

    // settings: a new object only when the values changed - the element subscribes anew on each one
    // (without what the widget frame covers itself - the element keeps its defaults there)
    const settingsJson = JSON.stringify(
        component
            ? withoutHostSettings(typedSettings(component.manifest, opts.wcSettings), tag, component.adapter)
            : {},
    );
    const settings = useMemo(
        () => JSON.parse(settingsJson) as Record<string, string | number | boolean>,
        [settingsJson],
    );
    useLayoutEffect(() => {
        if (status === 'ready' && elRef.current) elRef.current.settings = settings;
    }, [status, settings]);

    useLayoutEffect(() => {
        if (status === 'ready' && elRef.current) elRef.current.editMode = editMode;
    }, [status, editMode]);

    // theme: Aura's variables as they apply to this widget (a section may have its own theme)
    const themeEpoch = useThemeEpoch();
    const themeRef = useRef<WebComponentTheme | null>(null);
    useLayoutEffect(() => {
        if (status !== 'ready' || !elRef.current || !hostRef.current) return;
        const css = getComputedStyle(hostRef.current);
        const root = getComputedStyle(document.documentElement);
        const theme = themeFromVars(
            (name) => css.getPropertyValue(name),
            root.colorScheme === 'dark',
            css.fontFamily,
            parseFloat(root.fontSize) || 16,
        );
        if (themeRef.current && isSameTheme(themeRef.current, theme)) return;
        themeRef.current = theme;
        elRef.current.theme = theme;
    }, [status, themeEpoch]);

    // dialogs: in Aura's look instead of the browser's <dialog>
    const dialog = useWebComponentDialogs(elRef, status === 'ready', editMode);

    // iob-navigate: show a tab of this layout, named by slug, id or name
    useEffect(() => {
        const el = elRef.current;
        if (status !== 'ready' || !el) return;
        const onNavigate = (event: Event): void => {
            if (editMode) return;
            const view = (event as CustomEvent<{ view?: unknown }>).detail?.view;
            const { layouts, activeLayoutId } = useDashboardStore.getState();
            const layout = layouts.find((l) => l.id === activeLayoutId);
            const target = findTabForView(view, layouts, activeLayoutId, layout?.activeSectionId);
            if (!target) return;
            event.preventDefault();
            useNavigationStore.getState().navigateTo(target.layoutId, target.tabId, undefined, target.sectionId);
        };
        el.addEventListener(NAVIGATE_EVENT, onNavigate);
        return () => el.removeEventListener(NAVIGATE_EVENT, onNavigate);
    }, [status, editMode]);

    let body: React.ReactNode;
    if (status === 'ready' && component) {
        body = createElement(component.manifest.tag, { ref: elRef, style: FILL });
    } else if (editMode || status === 'unset') {
        const text =
            status === 'unset'
                ? t('wc.unset')
                : status === 'missing'
                  ? known
                      ? t('wc.missingAdapter', {
                            name: lang === 'de' ? known.name.de : known.name.en,
                            adapter: known.adapter,
                            version: known.minVersion,
                        })
                      : t('wc.missing', { tag })
                  : status === 'failed'
                    ? t('wc.failed', { tag, error })
                    : t('common.loading');
        body = (
            <div
                className="h-full flex items-center justify-center text-center text-xs px-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                {text}
            </div>
        );
    } else {
        body = null; // at runtime a missing component stays empty instead of showing an error
    }

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
                ref={hostRef}
                className="aura-widget-value relative flex-1 min-h-0"
                style={{ color: 'var(--text-primary)' }}
            >
                {body}
            </div>
            {dialog}
        </div>
    );
}
