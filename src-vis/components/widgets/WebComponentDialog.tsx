/**
 * Dialogs of ioBroker web components in Aura's look (`dialogs` property of the
 * element, `@iobroker/web-components`). Without it a component falls back to the
 * `<dialog>` of the browser; with it a dialog IS a popup of the widget
 * (WidgetPopupDialog): the widget's popup options (size, fullscreen, colours,
 * backdrop, title) apply as to any popup of it, the request's width and height
 * where the widget sets none.
 *
 * Two kinds, as the component asks:
 * - element: the component renders the content; Aura moves `request.element`
 *   into its frame and closes on `iob-dialog-close` with its `detail`.
 * - form: Aura renders `request.form` with the fields of the settings editor
 *   (WebComponentFields) and resolves with the typed values on OK.
 * Close button, backdrop, Escape and Cancel resolve with null.
 */
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
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
import { usePopupLayer } from '../../contexts/PopupLayerContext';
import { DEFAULT_POPUP_BORDER } from '../../store/popupConfigStore';
import type { ClickAction, WidgetConfig } from '../../types';
import { WidgetPopupDialog } from './popup/WidgetClickPopup';
import {
    createDialogController,
    DEFAULT_DIALOG_WIDTH,
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
 * @param widget the widget - its popup options shape the dialog
 * @returns the dialog to render (a portal), or null
 */
export function useWebComponentDialogs(
    elRef: RefObject<WebComponentElement | null>,
    ready: boolean,
    editMode: boolean,
    widget: WidgetConfig,
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
        <WebComponentDialog
            key={active.id}
            dialog={active}
            widget={widget}
            onClose={(result) => controller.close(active.id, result)}
        />
    );
}

const stop = (e: React.SyntheticEvent): void => e.stopPropagation();
const NO_ACTION: ClickAction = { kind: 'none' };
const positive = (n: unknown): number | undefined => (typeof n === 'number' && n > 0 ? n : undefined);

/**
 * One dialog of a component, in the popup of the widget (WidgetPopupDialog): the
 * widget's popup options size and colour it like any popup of that widget, the
 * request's width and height apply where the widget sets none.
 */
function WebComponentDialog({
    dialog,
    widget,
    onClose,
}: {
    dialog: ActiveDialog<DialogContext>;
    widget: WidgetConfig;
    onClose: (result: unknown) => void;
}) {
    const t = useT();
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as WebComponentLang;
    const layer = usePopupLayer();
    const { request } = dialog;
    const form = isFormDialog(request);
    const title = getText(request.title, lang) || t('wc.dialog');
    const focusRef = useRef<HTMLDivElement | null>(null);

    // Focus into the dialog: on a desktop the first field of a form, else the content -
    // a tablet must not pop up its keyboard on its own.
    useEffect(() => {
        const box = focusRef.current;
        if (!box) return;
        const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
        const first =
            form && fine
                ? box.querySelector<HTMLElement>(
                      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
                  )
                : null;
        (first ?? box).focus({ preventScroll: true });
    }, [form]);

    // A popup this widget sits in must not close itself on its timer while the user works in here
    const keepAlive = (): void => layer?.keepAlive();
    // closing without a result: close button, backdrop, Escape
    const cancel = useCallback(() => onClose(null), [onClose]);

    const body = (
        <div
            ref={focusRef}
            tabIndex={-1}
            className="aura-wc-dialog h-full flex flex-col focus:outline-none"
            style={{ color: 'var(--text-primary)', minWidth: 'min(280px, calc(100vw - 32px))' }}
        >
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
    );

    return (
        // The dialog is a React child of the widget: nothing done in here may reach the
        // widget's own handlers (click action, selection in the editor).
        <div
            style={{ display: 'contents' }}
            onPointerDown={(e) => {
                e.stopPropagation();
                keepAlive();
            }}
            onKeyDown={(e) => {
                e.stopPropagation();
                keepAlive();
            }}
            onClick={stop}
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
            <WidgetPopupDialog
                widget={widget}
                action={NO_ACTION}
                onClose={cancel}
                custom={{
                    body,
                    title,
                    // a form or element without a width of its own gets the usual dialog width
                    width: positive(request.width) ?? DEFAULT_DIALOG_WIDTH,
                    height: positive(request.height),
                    attrs: { 'data-aura-wc-dialog': form ? 'form' : 'element' },
                }}
            />
        </div>
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

    return <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col p-4" />;
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
            <div className="flex-1 min-h-0 px-5 py-4 space-y-3">
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
