/**
 * Host dialogs for ioBroker web components (`@iobroker/web-components`): what the
 * `dialogs` property of an element does in Aura, kept free of React and of the DOM
 * so it can be tested on its own.
 *
 * - `createDialogController` - one dialog per widget at a time: a new request
 *   resolves the open one with null, as does closing the widget or entering the
 *   edit mode.
 * - `checkDialogRequest` - a request the host can show (an element or a form), or null.
 * - `initialFormValues` / `formResult` - the values a form dialog starts with and
 *   the values it resolves with, typed as the form declares them.
 * - `dialogFrameSize` - the size of the dialog frame on this screen.
 */
import {
    DECORATION_TYPES,
    getPanelSettingTypes,
    isFormDialog,
    toSettings,
    type WebComponentDialogRequest,
    type WebComponentSettings,
    type WebComponentSettingsPanel,
} from '@iobroker/web-components';

/** A request that passed `checkDialogRequest` */
export type CheckedDialogRequest = WebComponentDialogRequest;

/**
 * The request as the host can show it, or null: a form needs a panel with items,
 * an element dialog an element (anything else a component sends is refused with
 * null instead of a broken dialog).
 *
 * @param request what the component handed to `dialogs.open()`
 */
export function checkDialogRequest(request: unknown): CheckedDialogRequest | null {
    if (!request || typeof request !== 'object') return null;
    const r = request as WebComponentDialogRequest;
    if (isFormDialog(r)) {
        const form = r.form as Partial<WebComponentSettingsPanel> | null;
        return form && typeof form === 'object' && form.items && typeof form.items === 'object' ? r : null;
    }
    const element = (r as { element?: unknown }).element as { nodeType?: unknown } | null | undefined;
    return element && typeof element === 'object' && element.nodeType === 1 ? r : null;
}

/** The dialog on screen: its request and what the host needs to draw it */
export interface ActiveDialog<C = unknown> {
    /** Increases with every dialog, so a late close of an older one is ignored */
    id: number;
    request: CheckedDialogRequest;
    /** What the host captured when the dialog opened, e.g. the theme of the element */
    context?: C;
}

export interface DialogController<C = unknown> {
    /**
     * Show a dialog; resolves with the result, or null when it was cancelled, refused,
     * replaced by the next one or closed with the widget.
     *
     * @param request what the component asked for
     * @param context what the host needs to draw it
     */
    open(request: unknown, context?: C): Promise<unknown>;
    /**
     * The dialog `id` closes with `result` (null = cancelled). A close of a dialog that
     * is no longer on screen does nothing.
     *
     * @param id the dialog
     * @param result its result
     */
    close(id: number, result: unknown): void;
    /** Close whatever is open with null - the widget unmounts or enters the edit mode */
    closeAll(): void;
    /** The dialog on screen */
    readonly current: ActiveDialog<C> | null;
}

/**
 * One dialog at a time for one element.
 *
 * @param onChange called with the dialog to draw, null when none is open
 * @param isBlocked true while no dialog may open (edit mode): `open` resolves null at once
 */
export function createDialogController<C = unknown>(
    onChange: (current: ActiveDialog<C> | null) => void,
    isBlocked: () => boolean = () => false,
): DialogController<C> {
    let current: { shown: ActiveDialog<C>; resolve: (result: unknown) => void } | null = null;
    let nextId = 1;

    const finish = (result: unknown): void => {
        const open = current;
        if (!open) return;
        current = null;
        open.resolve(result === undefined ? null : result);
    };

    return {
        open(request: unknown, context?: C): Promise<unknown> {
            if (isBlocked()) return Promise.resolve(null);
            const checked = checkDialogRequest(request);
            if (!checked) {
                console.warn('[webcomponent] dialog request without form or element ignored:', request);
                return Promise.resolve(null);
            }
            // only one dialog per element: the one on screen gives way
            finish(null);
            return new Promise((resolve) => {
                const shown: ActiveDialog<C> = { id: nextId++, request: checked, context };
                current = { shown, resolve };
                onChange(shown);
            });
        },
        close(id: number, result: unknown): void {
            if (current?.shown.id !== id) return;
            finish(result);
            onChange(null);
        },
        closeAll(): void {
            if (!current) return;
            finish(null);
            onChange(null);
        },
        get current(): ActiveDialog<C> | null {
            return current?.shown ?? null;
        },
    };
}

/**
 * The defaults of a form: `default` of every field that carries a value.
 *
 * @param form the panel of the dialog
 */
export function formDefaults(form: WebComponentSettingsPanel): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [name, item] of Object.entries(form.items || {})) {
        if (item && !DECORATION_TYPES.includes(item.type) && item.default !== undefined) {
            values[name] = item.default;
        }
    }
    return values;
}

/**
 * The values a form starts with: the defaults of its fields, overwritten by `data`
 * of the request. Only the fields of the form are kept; a value of `data` that is
 * undefined or null leaves the default in place.
 *
 * @param form the panel of the dialog
 * @param data `request.data`
 */
export function initialFormValues(form: WebComponentSettingsPanel, data: unknown): Record<string, unknown> {
    const values = formDefaults(form);
    const types = getPanelSettingTypes(form);
    if (data && typeof data === 'object') {
        for (const [name, value] of Object.entries(data as Record<string, unknown>)) {
            if (name in types && value !== undefined && value !== null) values[name] = value;
        }
    }
    return values;
}

/**
 * What a form dialog resolves with on OK: the values typed as the form declares
 * them (a number for number/slider, a boolean for checkbox, a string otherwise);
 * a field without a value is missing.
 *
 * @param form the panel of the dialog
 * @param values the values as the form holds them
 */
export function formResult(form: WebComponentSettingsPanel, values: Record<string, unknown>): WebComponentSettings {
    return toSettings(getPanelSettingTypes(form), values);
}

/** Below this viewport width the dialog takes the whole width of the screen */
export const COMPACT_DIALOG_BELOW = 640;
/** Width of a dialog that asks for none - as the browser dialog of the package */
export const DEFAULT_DIALOG_WIDTH = 480;

export interface DialogFrameSize {
    /** A phone: the dialog spans the screen up to a small margin */
    compact: boolean;
    /** In px */
    width: number;
    /** In px; undefined = as high as the content, up to `maxHeight` */
    height?: number;
    /** In px */
    maxHeight: number;
}

const positive = (n: unknown): number | undefined =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

/**
 * The size of the dialog frame: `width` / `height` of the request, at most the
 * screen minus a margin. On a phone the dialog spans the whole width.
 *
 * @param request the request
 * @param request.width the width it asks for, in px
 * @param request.height the height it asks for, in px
 * @param viewport the size of the browser window, in px
 * @param viewport.width the width
 * @param viewport.height the height
 */
export function dialogFrameSize(
    request: { width?: unknown; height?: unknown },
    viewport: { width: number; height: number },
): DialogFrameSize {
    const compact = viewport.width < COMPACT_DIALOG_BELOW;
    const margin = compact ? 8 : 16;
    const maxWidth = Math.max(160, Math.floor(viewport.width - 2 * margin));
    const maxHeight = Math.max(160, Math.floor(viewport.height - 2 * margin));
    const width = compact ? maxWidth : Math.min(positive(request.width) ?? DEFAULT_DIALOG_WIDTH, maxWidth);
    const wantHeight = positive(request.height);
    return {
        compact,
        width,
        height: wantHeight === undefined ? undefined : Math.min(wantHeight, maxHeight),
        maxHeight,
    };
}
