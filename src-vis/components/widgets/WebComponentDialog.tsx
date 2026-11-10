/**
 * Dialogs of ioBroker web components in Aura's look (`dialogs` property of the
 * element, `@iobroker/web-components`). Without it a component falls back to the
 * `<dialog>` of the browser; with it a dialog looks like Aura's popups: the
 * backdrop and surface of the popup settings, rounded panel, a title bar with a
 * close button, full width on a phone.
 *
 * Two kinds, as the component asks:
 * - element: the component renders the content; Aura moves `request.element`
 *   into its frame and closes on `iob-dialog-close` with its `detail`.
 * - form: Aura renders `request.form` with the fields of the settings editor
 *   (WebComponentFields) and resolves with the typed values on OK.
 * Close button, backdrop, Escape and Cancel resolve with null.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
    DIALOG_CLOSE_EVENT,
    getText,
    getThemeCssVariables,
    isFormDialog,
    type WebComponentElement,
    type WebComponentElementDialog,
    type WebComponentFormDialog,
    type WebComponentTheme,
} from '@iobroker/web-components';
import { useT } from '../../i18n';
import { useConfigStore } from '../../store/configStore';
import { usePortalTarget, usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { usePopupLayer } from '../../contexts/PopupLayerContext';
import {
    DEFAULT_BACKDROP_DIM,
    DEFAULT_POPUP_BACKGROUND,
    DEFAULT_POPUP_BORDER,
    usePopupConfigStore,
} from '../../store/popupConfigStore';
import { useEscapeLayer } from '../../utils/escapeStack';
import {
    createDialogController,
    dialogFrameSize,
    formResult,
    initialFormValues,
    type ActiveDialog,
} from '../../utils/webComponentDialogs';
import { WebComponentFields, type WebComponentLang } from '../config/WebComponentFields';

/** What the widget captures when a dialog opens */
interface DialogContext {
    /** The theme of the element: an element dialog's content gets it as `--iob-*` variables */
    theme?: WebComponentTheme;
}

/**
 * Hands the element its `dialogs` and draws the dialog it opens. One dialog per
 * widget at a time; it closes with null when the widget unmounts, the element
 * changes or the edit mode starts, and none opens in edit mode.
 *
 * @param elRef the element of the component
 * @param ready true once the element is defined and mounted
 * @param editMode the widget is in the editor
 * @returns the dialog to render (a portal), or null
 */
export function useWebComponentDialogs(
    elRef: RefObject<WebComponentElement | null>,
    ready: boolean,
    editMode: boolean,
): ReactNode {
    const [active, setActive] = useState<ActiveDialog<DialogContext> | null>(null);
    const editRef = useRef(editMode);
    editRef.current = editMode;
    const [controller] = useState(() => createDialogController<DialogContext>(setActive, () => editRef.current));

    useLayoutEffect(() => {
        const el = elRef.current;
        if (!ready || !el) return;
        const dialogs = {
            open: (request: unknown) => controller.open(request, { theme: el.theme }),
        };
        el.dialogs = dialogs;
        return () => {
            if (el.dialogs === dialogs) el.dialogs = null;
            controller.closeAll();
        };
    }, [ready, controller, elRef]);

    useEffect(() => {
        if (editMode) controller.closeAll();
    }, [editMode, controller]);

    if (!active) return null;
    return (
        <WebComponentDialog key={active.id} dialog={active} onClose={(result) => controller.close(active.id, result)} />
    );
}

/** The size of the browser window, kept up to date */
function useViewportSize(): { width: number; height: number } {
    const read = () => ({ width: window.innerWidth, height: window.innerHeight });
    const [size, setSize] = useState(read);
    useEffect(() => {
        const onResize = () => setSize(read());
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);
    return size;
}

const stop = (e: React.SyntheticEvent): void => e.stopPropagation();

function WebComponentDialog({
    dialog,
    onClose,
}: {
    dialog: ActiveDialog<DialogContext>;
    onClose: (result: unknown) => void;
}) {
    const t = useT();
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as WebComponentLang;
    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();
    const layer = usePopupLayer();
    const viewport = useViewportSize();
    const background = usePopupConfigStore((s) => s.globalPopupBackground) ?? DEFAULT_POPUP_BACKGROUND;
    const backdropDim = usePopupConfigStore((s) => s.globalBackdropDim) ?? DEFAULT_BACKDROP_DIM;
    const { request } = dialog;
    const form = isFormDialog(request);
    const size = dialogFrameSize(request, viewport);
    const title = getText(request.title, lang);
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const downOnBackdrop = useRef(false);

    // Escape closes the topmost layer only - this dialog lies above the popup it may sit in
    useEscapeLayer(() => onClose(null));

    // Focus into the dialog: on a desktop the first field of a form, else the panel -
    // a tablet must not pop up its keyboard on its own.
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
        const first =
            form && fine
                ? panel.querySelector<HTMLElement>(
                      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
                  )
                : null;
        (first ?? panel).focus({ preventScroll: true });
    }, [form]);

    // A popup this widget sits in must not close itself on its timer while the user works in here
    const keepAlive = (): void => layer?.keepAlive();

    return createPortal(
        <div
            data-aura-app="frontend"
            data-aura-wc-dialog={form ? 'form' : 'element'}
            className={`fixed inset-0 z-[9000] flex items-center justify-center ${size.compact ? 'p-2' : 'p-4'}`}
            style={{ background: `rgba(0,0,0,${backdropDim / 100})`, color: 'var(--text-primary)', ...themeVars }}
            // The dialog is a React child of the widget: nothing done in here may reach
            // the widget's own handlers (click action, selection in the editor).
            onPointerDown={(e) => {
                downOnBackdrop.current = e.target === e.currentTarget;
                e.stopPropagation();
                keepAlive();
            }}
            onClick={(e) => {
                e.stopPropagation();
                // only a tap that started on the backdrop - not a text selection dragged out of a field
                if (e.target === e.currentTarget && downOnBackdrop.current) onClose(null);
                downOnBackdrop.current = false;
            }}
            onKeyDown={(e) => {
                e.stopPropagation();
                keepAlive();
            }}
            onPointerUp={stop}
            onMouseDown={stop}
            onMouseUp={stop}
            onDoubleClick={stop}
            onContextMenu={stop}
            onTouchStart={stop}
            onTouchMove={stop}
            onTouchEnd={stop}
            onWheel={stop}
            onKeyUp={stop}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-label={title ? undefined : t('wc.dialog')}
                tabIndex={-1}
                className="aura-wc-dialog relative flex flex-col overflow-hidden rounded-2xl shadow-2xl focus:outline-none"
                style={{
                    width: size.width,
                    height: size.height,
                    maxHeight: size.maxHeight,
                    background,
                    border: `1px solid ${DEFAULT_POPUP_BORDER}`,
                }}
            >
                <div
                    className="shrink-0 flex items-center gap-2 pl-5 pr-2.5 py-2.5"
                    style={{ borderBottom: `1px solid ${DEFAULT_POPUP_BORDER}` }}
                >
                    <span id={titleId} className="flex-1 min-w-0 truncate font-semibold text-sm">
                        {title}
                    </span>
                    <button
                        type="button"
                        onClick={() => onClose(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity shrink-0"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--app-bg)',
                            border: `1px solid ${DEFAULT_POPUP_BORDER}`,
                        }}
                        title={t('common.close')}
                        aria-label={t('common.close')}
                    >
                        <X size={14} />
                    </button>
                </div>
                {form ? (
                    <FormBody request={request} lang={lang} onClose={onClose} />
                ) : (
                    <ElementBody
                        request={request as WebComponentElementDialog}
                        theme={dialog.context?.theme}
                        onClose={onClose}
                    />
                )}
            </div>
        </div>,
        portal,
    );
}

/**
 * The content a component rendered itself: moved into the frame, with the theme of
 * the element as `--iob-*` variables (it left the element, where they were set).
 */
function ElementBody({
    request,
    theme,
    onClose,
}: {
    request: WebComponentElementDialog;
    theme?: WebComponentTheme;
    onClose: (result: unknown) => void;
}) {
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        if (theme) {
            for (const [name, value] of Object.entries(getThemeCssVariables(theme)))
                body.style.setProperty(name, value);
        }
        const content = request.element;
        body.appendChild(content);
        const onDialogClose = (event: Event): void => {
            event.stopPropagation();
            closeRef.current((event as CustomEvent).detail ?? null);
        };
        body.addEventListener(DIALOG_CLOSE_EVENT, onDialogClose);
        return () => {
            body.removeEventListener(DIALOG_CLOSE_EVENT, onDialogClose);
            if (content.parentNode === body) body.removeChild(content);
        };
    }, [request, theme]);

    return <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto flex flex-col p-4" />;
}

/** A form: the fields of the settings editor, typed values on OK */
function FormBody({
    request,
    lang,
    onClose,
}: {
    request: WebComponentFormDialog;
    lang: WebComponentLang;
    onClose: (result: unknown) => void;
}) {
    const t = useT();
    const [values, setValues] = useState(() => initialFormValues(request.form, request.data));
    // typed as the fields declare - what they show and what `hidden` / `disabled` see
    const data = useMemo(() => formResult(request.form, values) as Record<string, unknown>, [request.form, values]);

    const onSet = (key: string, value: unknown): void =>
        setValues((current) => {
            const next = { ...current };
            if (value === undefined || value === '') delete next[key];
            else next[key] = value;
            return next;
        });

    return (
        <form
            className="flex-1 min-h-0 flex flex-col"
            onSubmit={(e) => {
                e.preventDefault();
                onClose(formResult(request.form, values));
            }}
        >
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
                <WebComponentFields items={request.form.items} data={data} lang={lang} onSet={onSet} />
            </div>
            <div
                className="shrink-0 flex items-center justify-end gap-2 px-5 py-3"
                style={{ borderTop: `1px solid ${DEFAULT_POPUP_BORDER}` }}
            >
                <button
                    type="button"
                    data-action="cancel"
                    onClick={() => onClose(null)}
                    className="min-h-9 px-4 py-2 text-xs rounded-lg hover:opacity-80"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    {getText(request.cancel, lang) || t('common.cancel')}
                </button>
                <button
                    type="submit"
                    data-action="ok"
                    className="min-h-9 px-4 py-2 text-xs font-medium rounded-lg text-white hover:opacity-90"
                    style={{ background: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                    {getText(request.ok, lang) || t('common.ok')}
                </button>
            </div>
        </form>
    );
}
