import type { NumberFormat } from '../utils/formatValue';

export interface WidgetConfig {
    id: string;
    type: WidgetType;
    title: string;
    datapoint: string; // ioBroker Datenpunkt ID
    gridPos: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    layout?: WidgetLayout;
    options?: Record<string, unknown>; // Widget-spezifische Optionen
    mobileOrder?: number; // Sortierung in der mobilen Ansicht (einzelne Spalte)
}

/**
 * A saved, reusable widget blueprint ("Widget-Designer" preset). Stores a full
 * widget config plus any group/panels definitions it references, so the whole
 * composite can be re-inserted elsewhere. Datapoints are kept as-is; on insert a
 * mapping dialog lets the user re-point them (see utils/widgetPresetDps.ts).
 */
export interface WidgetPreset {
    id: string; // preset-<ts>-<rand>
    name: string; // user-provided name
    icon?: string; // emoji shown on the catalog card
    category?: string; // optional, reuses DP_TEMPLATE_CATEGORIES ids
    widget: WidgetConfig; // the blueprint (id/gridPos are reassigned on insert)
    groupDefs?: Record<string, WidgetConfig[]>; // for group/panels/universal composites
    createdAt?: number;
}

export type WidgetType =
    | 'switch'
    | 'value'
    | 'dimmer'
    | 'thermostat'
    | 'chart'
    | 'list'
    | 'clock'
    | 'calendar'
    | 'header'
    | 'group'
    | 'echart'
    | 'evcc'
    | 'weather'
    | 'gauge'
    | 'camera'
    | 'autolist'
    | 'image'
    | 'iframe'
    | 'fill'
    | 'trash'
    | 'shutter'
    | 'jsontable'
    | 'windowcontact'
    | 'binarysensor'
    | 'stateimage'
    | 'echartsPreset'
    | 'html'
    | 'datepicker'
    | 'mediaplayer'
    | 'slider'
    | 'chips'
    | 'trashSchedule'
    | 'httpRequest'
    | 'button'
    | 'climate'
    | 'aircontrol'
    | 'universal'
    | 'enum'
    | 'light'
    | 'carousel'
    | 'panels'
    | 'knob'
    | 'timer'
    | 'adapterstatus'
    | 'scriptstatus'
    | 'adapterlogs'
    | 'loadtimes'
    | 'input'
    | 'alarm'
    | 'map'
    | 'statusoverview'
    | 'energiebilanz'
    | 'mirror'
    | 'menu'
    | 'messages';

export type WidgetLayout =
    | 'default'
    | 'card'
    | 'compact'
    | 'minimal'
    | 'agenda'
    | 'flow'
    | 'battery'
    | 'production'
    | 'consumption'
    | 'loadpoints'
    | 'custom'
    | 'count'
    | 'list'
    | 'light-all'
    | 'light-brightness'
    | 'light-color'
    | 'light-temperature'
    | 'light-custom'
    | 'knob-endless'
    | 'knob-scale';

// ── Light widget option types ─────────────────────────────────────────────────

/** Which DPs the widget uses for color. */
export type LightColorMode = 'hsv' | 'rgb' | 'hex' | 'hm-color' | 'none';

/** Tab identifiers inside the light widget. */
export type LightTab = 'power' | 'brightness' | 'color' | 'temperature' | 'effects';

export interface LightEffect {
    /** Display name shown in the effects list */
    label: string;
    /** Value written to effectDp on selection (parsed as number or string) */
    value: string;
    /** Optional preview color (hex) for the chip */
    color?: string;
}

// ── Timer / Zeitschaltuhr widget ──────────────────────────────────────────────

export type TimerWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type TimerAstroEvent = 'sunrise' | 'sunset' | 'dawn' | 'dusk' | 'solarNoon';

export type TimerTrigger =
    | { kind: 'time'; hour: number; minute: number }
    | { kind: 'astro'; event: TimerAstroEvent; offsetMin: number }
    | { kind: 'once'; iso: string } // YYYY-MM-DDTHH:mm — fires once at this moment
    | { kind: 'range'; fromIso: string; toIso: string }; // fires once at fromIso, once at toIso

/**
 * Filter that restricts on which days the trigger may fire.
 * - all-days:       no restriction (default)
 * - no-special:     skip days listed in holidaysDp / vacationDp
 * - only-holidays:  fire ONLY on days listed in holidaysDp
 * - only-vacation:  fire ONLY on days listed in vacationDp
 * - blocked:        skip if current time is within blockFromMin..blockToMin
 */
export type TimerFilter = 'all-days' | 'no-special' | 'only-holidays' | 'only-vacation' | 'blocked';

export interface TimerEvent {
    id: string;
    enabled: boolean;
    label?: string;
    weekdays: TimerWeekday[]; // empty array = never fires
    trigger: TimerTrigger;
    filter: TimerFilter;
    blockFromMin?: number; // filter='blocked': start of blocked window (minutes since 00:00)
    blockToMin?: number; // filter='blocked': end of blocked window
    value?: string; // per-event override — only honored when allowEventValue is on
}

/**
 * Widget-level options. The target datapoint and value to write are configured
 * by the admin in the widget edit panel; the dashboard user only edits the
 * schedule (events) via the on-widget modal.
 *
 * Persisted in WidgetConfig.options and mirrored to aura.0.timers.<widgetId>.config
 * for the backend scheduler.
 */
export interface TimerWidgetOptions {
    enabled?: boolean;
    events?: TimerEvent[];
    targetDp?: string; // datapoint written when an event fires (admin-set)
    value?: string; // value written (parsed to bool/number/string)
    allowEventValue?: boolean; // when true, frontend modal shows per-event value field (overrides widget value)
    holidaysDp?: string; // optional DP (JSON array of YYYY-MM-DD strings) — special days
    vacationDp?: string; // optional DP (JSON array of YYYY-MM-DD strings) — vacation days
    stateBaseId?: string; // the timers.<widgetId> base path used by the backend scheduler
}

// ── Custom-Grid layout ────────────────────────────────────────────────────────

export type CustomCellType =
    | 'empty'
    | 'title'
    | 'value'
    | 'unit'
    | 'text'
    | 'dp'
    | 'field'
    | 'image'
    | 'component'
    // Interactive cell types (Universal Widget)
    | 'switch'
    | 'slider'
    | 'button'
    | 'icon'
    | 'state-icon'
    | 'datepicker'
    | 'stepper'
    | 'input'
    | 'progress'
    | 'state-text'
    | 'select'
    | 'lastchange';
export type CustomCellAlign = 'left' | 'center' | 'right';
export type CustomCellValign = 'top' | 'middle' | 'bottom';

export interface CustomCell {
    type: CustomCellType;
    text?: string; // 'text' / 'button' type: static text content / button label
    dpId?: string; // 'dp' / 'switch' / 'slider' / 'button' / 'state-icon' type: ioBroker datapoint ID
    fieldKey?: string; // 'field' type: key into widget-supplied extraFields map
    componentKey?: string; // 'component' type: key into widget-supplied extraComponents map
    prefix?: string; // 'value' / 'dp' type: text prepended to value
    suffix?: string; // 'value' / 'dp' type: text appended to value
    decimals?: number; // 'value' / 'dp' type: decimal places override (undefined = use global)
    numberFormat?: NumberFormat; // 'value' / 'dp' type: thousands separator override (undefined = use global)
    valueFactor?: number; // 'dp' / 'progress' type: display-only multiplier (default 1)
    valueOffset?: number; // 'dp' / 'progress' type: display-only additive offset (default 0)
    valueTransform?: string; // 'dp' / 'progress' type: selected transform preset id (editor only; disambiguates presets sharing factor/offset)
    valueTimeFormat?: string; // 'dp' type: render the value as time/date (see TIME_DISPLAY_PRESETS); undefined = plain value
    valueTimePattern?: string; // 'dp' type: token pattern, only used when valueTimeFormat is 'custom'
    fontSize?: number; // px; undefined = auto
    bold?: boolean;
    italic?: boolean;
    color?: string; // CSS color; '' / undefined = theme default
    conditions?: CellConditionRule[]; // per-cell conditional formatting (Universal Widget) — reacts to the cell's own or a foreign DP value
    align?: CustomCellAlign; // default: 'left'
    valign?: CustomCellValign; // default: 'middle'
    allowOverflow?: boolean; // allow text to overflow into adjacent cells
    wrap?: boolean; // wrap long text onto multiple lines instead of ellipsis (default false)
    colSpan?: number; // 'component' type: how many grid columns to span (1..cols)
    rowSpan?: number; // analog colSpan, vertical
    imageUrl?: string; // 'image' type: static URL or base64 data URI (fallback when dpId is empty)
    objectFit?: 'contain' | 'cover' | 'fill'; // 'image' type: CSS object-fit
    imageWidth?: number; // 'image' type: explicit width in px (undefined = fill cell width)
    imageHeight?: number; // 'image' type: explicit height in px (undefined = fill cell height)
    // NOTE: 'image' cells also reuse `dpId` — when set, the image source is read from that datapoint's value (URL / path / base64), like the standalone Image widget.
    // 'slider' type
    min?: number;
    max?: number;
    step?: number;
    barStyle?: boolean;
    barSize?: number;
    orientation?: 'horizontal' | 'vertical';
    valuePosition?: 'none' | 'left' | 'right' | 'top' | 'bottom'; // 'slider' cell: where to render the current DP value (default 'none')
    // 'button' type
    sendValue?: string; // payload sent to dpId on click (parsed as bool/number/string)
    // 'icon' / 'state-icon' type
    iconName?: string; // Lucide icon name
    trueIcon?: string; // 'state-icon' / 'switch' (icon mode): Lucide icon for truthy value
    falseIcon?: string; // 'state-icon' / 'switch' (icon mode): Lucide icon for falsy value
    trueColor?: string; // 'state-icon' / 'switch' (icon mode): color for truthy value
    falseColor?: string; // 'state-icon' / 'switch' (icon mode): color for falsy value
    // active-state detection for 'state-icon' (issue #467), 'switch' and 'state-text' (issue #567)
    stateMode?: 'boolean' | 'condition'; // default 'boolean' (truthy coercion: true/1/'true'/'1'/'on'); 'condition' uses operator + value
    stateOperator?: ConditionOperator; // 'condition' mode: comparison against stateValue
    stateValue?: string; // 'condition' mode: comparison value (parsed numerically where needed)
    // 'switch' type
    statusDpId?: string; // 'switch' cell: read-back DP — state, label and colours come from here while clicks still write to dpId (split command/status devices, issue #567)
    controlMode?: 'toggle' | 'icon' | 'button'; // 'switch' cell: visual control style (default 'toggle')
    buttonTextColor?: string; // 'switch' cell (button mode): label text color (default #fff)
    buttonTrueColor?: string; // 'switch' cell (button mode): background for truthy value (falls back to color)
    buttonFalseColor?: string; // 'switch' cell (button mode): background for falsy value (falls back to color)
    buttonTrueTextColor?: string; // 'switch' cell (button mode): label color for truthy value (falls back to buttonTextColor)
    buttonFalseTextColor?: string; // 'switch' cell (button mode): label color for falsy value (falls back to buttonTextColor)
    buttonSize?: number; // 'switch' cell (button mode): padding scale in px (default 8)
    buttonWidth?: 'auto' | 'full' | 'uniform'; // 'switch' cell (button mode): 'auto' fits text, 'full' fills cell, 'uniform' matches widest sibling button (default 'auto')
    momentary?: boolean; // 'switch' cell: Taster-Modus — write trueValue on press, falseValue after delay
    momentaryDelay?: number; // 'switch' cell: ms before writing falseValue (default 500)
    confirmAction?: boolean; // 'switch' cell: require confirmation overlay before toggling
    confirmText?: string; // 'switch' cell: optional prompt text in confirmation overlay
    trueValue?: string; // 'switch' cell: payload written when switching ON  (parsed as bool/number/string; default true)
    falseValue?: string; // 'switch' cell: payload written when switching OFF (parsed as bool/number/string; default false)
    // 'datepicker' type
    dateFormat?: string; // DateOutputFormat string: how to encode the picked date when writing to dpId
    datePattern?: string; // token pattern used when dateFormat === 'custom' (e.g. 'MM.yyyy')
    dateInput?: 'picker' | 'custom'; // 'datepicker' cell: native pickers (default) or a free-text pattern field
    dateInputPattern?: string; // token pattern typed into the field when dateInput === 'custom'
    showTime?: boolean; // show time-of-day picker alongside date input
    timeOnly?: boolean; // hide date input, only edit/write time-of-day
    // 'input' type
    inputMode?: 'text' | 'number'; // 'input' cell: which native input variant (default 'text')
    multiline?: boolean; // 'input' cell: render a multi-line textarea instead of a single-line input
    submitMode?: 'submit' | 'live'; // 'input' cell: write on Enter/Send/blur ('submit', default) or on every keystroke ('live')
    showSubmit?: boolean; // 'input' cell: show the Send button in submit mode (default true)
    clearAfterSubmit?: boolean; // 'input' cell: command field — clear the field after sending and never show the DP value
    // 'progress' type
    showValue?: boolean; // 'progress' cell: overlay current value/percentage on top of bar
    // 'state-text' type — reuses trueColor/falseColor + color/text styling
    trueText?: string; // 'state-text' cell / 'switch' cell (button mode): label rendered for truthy value
    falseText?: string; // 'state-text' cell / 'switch' cell (button mode): label rendered for falsy value
    // 'select' type — dropdown that maps DP values to labels (mini enum widget per cell)
    entries?: { value: string; label: string; color?: string; icon?: string }[]; // 'select' cell: selectable value/label pairs (icon: Lucide/Iconify ID)
    showSelectedLabel?: boolean; // 'select' cell: render current label next to dropdown
    hideSelect?: boolean; // 'select' cell: hide dropdown and render entries as a button group
    entryDisplay?: 'icon' | 'icon-text' | 'text'; // 'select' cell: how the current entry is shown (default 'text')
    // last-change display (for value-bearing cells)
    showLastChange?: boolean; // show lc timestamp below the cell content
    lastChangeFormat?: 'relative' | 'time' | 'datetime'; // timestamp format (default 'relative')
}

/** Legacy: 9-element array, row-major (index = row*3 + col). Kept as alias for compat. */
export type CustomGrid = CustomCell[];

/** New custom-grid format with variable dimensions. */
export interface CustomGridDef {
    cols: number; // 1..20
    rows: number; // 1..20
    cells: CustomCell[]; // length = cols*rows, row-major (index = row*cols + col)
    /** Optional per-column CSS grid-template-columns track sizes (e.g. 'auto', '1fr', '60px'). Length must equal cols. */
    colSizes?: string[];
    /** Optional per-row CSS grid-template-rows track sizes (e.g. 'auto', '1fr', '40px'). Length must equal rows. */
    rowSizes?: string[];
}

export interface ioBrokerState {
    val: boolean | number | string | null;
    ack: boolean;
    ts: number;
    lc: number;
    from?: string;
    q?: number;
}

export interface WidgetProps {
    config: WidgetConfig;
    editMode: boolean;
    onConfigChange: (config: WidgetConfig) => void;
    /**
     * Widgets without a single ioBroker datapoint (e.g. CalendarWidget fetching
     * iCal feeds) can report their own last-update timestamp here so that the
     * generic "Letzte Änderung anzeigen" overlay in WidgetFrame can render it.
     */
    onLastChange?: (ts: number) => void;
    /**
     * Widgets whose body is a cross-document iframe report `true` here. Clicks
     * inside such a frame never enter the host document's event path, so the
     * widget's click action would be unreachable — WidgetFrame answers this by
     * rendering a small host-side action button over the widget. (issue #527)
     */
    onNeedsActionButton?: (needs: boolean) => void;
}

export interface ioBrokerObject {
    _id: string;
    type: 'state' | 'channel' | 'device' | 'folder' | 'adapter' | 'instance' | 'enum' | 'script';
    common: {
        name: string | Record<string, string>;
        type?: 'boolean' | 'number' | 'string' | 'mixed';
        role?: string;
        unit?: string;
        min?: number;
        max?: number;
        step?: number;
        read?: boolean;
        write?: boolean;
        enabled?: boolean; // instance: whether the adapter instance is enabled
        members?: string[]; // enum.rooms / enum.functions member IDs
        custom?: Record<string, { enabled?: boolean } | null>;
        // Value→text map for multi-state DPs. ioBroker allows several shapes:
        //   { "0": "closed", … } · ["closed", …] · "0:closed;1:tilted;2:open"
        states?: Record<string, string> | string[] | string;
    };
    /** Adapter-specific fields (device model/manufacturer, etc.). Shape varies per adapter. */
    native?: Record<string, unknown>;
}

export interface ObjectViewResult {
    rows: { id: string; value: ioBrokerObject }[];
}

// ── Widget click action ───────────────────────────────────────────────────────

export type ClickAction =
    | { kind: 'none' }
    | { kind: 'popup-dimmer' }
    | { kind: 'popup-thermostat'; setpointDp?: string; modeDp?: string }
    | { kind: 'popup-switch' }
    | { kind: 'popup-shutter' }
    | { kind: 'popup-mediaplayer' }
    | { kind: 'popup-image'; url?: string; dp?: string; fit?: 'contain' | 'cover' }
    | {
          kind: 'popup-iframe';
          url: string;
          sandbox?: boolean;
          sandboxPreset?: 'off' | 'minimal' | 'standard' | 'extended' | 'full' | 'custom';
          sandboxCustom?: string;
      }
    | { kind: 'popup-json'; json?: string; dp?: string }
    | { kind: 'popup-html'; html?: string; dp?: string }
    | { kind: 'popup-widget'; widgetId?: string }
    | { kind: 'link-tab'; layoutId: string; tabId: string; sectionId?: string }
    | { kind: 'link-external'; url: string; newTab?: boolean }
    | { kind: 'link-widget'; layoutId: string; tabId: string; widgetId: string; sectionId?: string }
    | { kind: 'popup-view'; viewId: string; dp?: string }
    /**
     * Lists every datapoint that sits under the same parent / channel / device as
     * the clicked one. `dp` overrides the source datapoint (default: the widget's
     * own, or the clicked list row's).
     */
    | { kind: 'popup-dps'; scope?: 'parent' | 'channel' | 'device'; dp?: string; relevantOnly?: boolean };

// options.clickAction?: ClickAction
// options.popupTitle?: string      – override header title in popup
// options.popupHideTitle?: boolean  – hide the title bar entirely
// options.popupShowHistory?: boolean – show history icon in popup header
// options.popupAutoCloseSec?: number – per-click-action auto-close override (0 = off, >0 = seconds; undefined = inherit view/global)
// options.popupTransparency?: number – per-click-action popup transparency in % (0 = opaque; undefined = inherit view/global)
// options.popupBackdropDim?: number – per-click-action backdrop dim in % (0 = clear; undefined = inherit view/global)

// ── Messages (issue #429) ─────────────────────────────────────────────────────
// An info / warning / error notice pushed into Aura by writing JSON — or plain
// text — to one of the `messages.send` datapoints. The adapter parses, defaults
// and archives every payload, so what reaches the frontend is already validated;
// see docs/einstellungen/meldungen.md for the wire format.

export type MessageSeverity = 'info' | 'success' | 'warning' | 'error';

export type MessagePosition =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center-left'
    | 'center'
    | 'center-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

/**
 * How the severity colour is applied to the card.
 *   bar     accent stripe on the leading edge (default)
 *   filled  the whole card takes the colour
 *   outline the colour runs all the way around
 *   plain   no accent at all
 */
export type MessageAppearance = 'bar' | 'filled' | 'outline' | 'plain';

export type MessageAlign = 'left' | 'center' | 'right';

/** How the card prints the send time — `time` = 14:07, `datetime` = 17.08.26, 14:07. */
export type MessageTimeFormat = 'time' | 'datetime';

/** A button on the toast. Writes `value` to `dp`, then closes unless close=false. */
export interface MessageAction {
    label: string;
    dp: string;
    value: string; // always string; parsed to bool/number/string on write
    close: boolean;
}

/** Who sees the message. Absent fields mean "no restriction". */
export interface MessageTarget {
    clients?: string[]; // aura.0.clients.<id>
    layout?: string; // layout slug, id or name
    tab?: string; // tab slug, id or name
}

export interface AuraMessage {
    id: string;
    ts: number;
    severity: MessageSeverity;
    /** Confirmed by someone. Shared across clients — the counter counts !read. */
    read: boolean;
    /** Seconds until auto-close. 0 = stays open; always 0 when requireAck is set. */
    durationSec: number;
    /** No auto-close, no click-away — only the confirm button closes it. */
    requireAck: boolean;
    position: MessagePosition;
    /** 0..100. A higher value pushes past a full position and pauses the lowest one. */
    priority: number;
    /** false = deliver but keep out of the archive. */
    persist: boolean;
    title?: string;
    text?: string;
    html?: string;
    image?: string;
    icon?: string; // Lucide/Iconify id, overrides the severity icon
    /** Popup view (name or id) rendered as the body instead of text/html/image. */
    view?: string;
    /** `{{dp}}` context for that view. */
    dp?: string;
    width?: number;
    height?: number;
    transparency?: number;
    /** Where the accent colour goes. Undefined = the admin default. */
    appearance?: MessageAppearance;
    /** Replaces the severity colour for bar / fill / outline. */
    color?: string;
    /** Explicit card background; wins over what `appearance` would paint. */
    background?: string;
    /** Explicit text colour for title and body. */
    textColor?: string;
    align?: MessageAlign;
    /** Print `ts` on the card. Absent = off; the adapter resolves the admin default. */
    showTime?: boolean;
    /** Only set alongside showTime; absent falls back to `time`. */
    timeFormat?: MessageTimeFormat;
    /** Datapoint written when the message is confirmed. */
    ackDp?: string;
    ackValue?: string;
    actions?: MessageAction[];
    target?: MessageTarget;
    /** Set once the message was closed on every client (ack or dismiss). */
    dismissed?: boolean;
    ackedAt?: number;
}

/**
 * What `messages.lastMessage` carries. Either a fresh message, or a close marker
 * telling every client to drop an open toast — `dismissed` is the discriminator,
 * a real message never sets it at delivery time.
 */
export type MessageBroadcast = AuraMessage | { id: string; ts: number; dismissed: true; read: boolean };

/**
 * A message as the MessageBuilder form holds it — every field a string, so an
 * empty input round-trips as "not set" rather than 0/false. Persisted (not just
 * the derived payload) wherever a message is configured in the UI, so re-opening
 * the editor shows what was entered. `draftToPayload` turns it into the JSON that
 * goes on the wire.
 */
export interface MessageDraft {
    id: string;
    severity: MessageSeverity;
    title: string;
    text: string;
    html: string;
    image: string;
    icon: string;
    view: string;
    dp: string;
    position: '' | MessagePosition;
    durationSec: string;
    requireAck: boolean;
    priority: string;
    width: string;
    height: string;
    transparency: string;
    appearance: '' | MessageAppearance;
    align: '' | MessageAlign;
    /**
     * Timestamp override. '' = take the admin default, 'off' = force it away, a
     * format = show it in exactly that shape. One control instead of a toggle plus
     * a format select, because "show it" is never asked without "in which shape".
     */
    showTime: '' | 'off' | MessageTimeFormat;
    color: string;
    background: string;
    textColor: string;
    ackDp: string;
    ackValue: string;
    persist: boolean;
    actions: { label: string; dp: string; value: string; close: boolean }[];
    targetClients: string;
    targetLayout: string;
    targetTab: string;
}

// ── Conditional widget styling ────────────────────────────────────────────────

// 'active'/'inactive' are the truthiness test (isActiveVal): > 0, true or a
// non-empty string. Distinct from 'true'/'false', which only match true/1 resp.
// false/0 — a dimmer at 42 is 'active' but not 'true'.
//
// 'changed' is an *event*, not a state: it is true only for the single evaluation
// that follows a new value arriving, and needs a caller that tracks which refs
// just changed (useConditionStyle). Everywhere else it stays false — see
// evaluateClause. Its purpose is `refreshWidget`, where "the datapoint moved at
// all" is the trigger and no comparison value exists (issue #537).
export type ConditionOperator =
    | '=='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'true'
    | 'false'
    | 'active'
    | 'inactive'
    | 'contains'
    | 'changed';

export interface ConditionClause {
    datapoint: string;
    operator: ConditionOperator;
    value: string; // always string; parsed numerically where needed
    valueType?: 'static' | 'datapoint'; // when 'datapoint', `value` is the second DP ID
}

export interface ConditionStyle {
    /** Colour of the pulsing ring — only read by the effect `border`. */
    ringColor?: string;
    accent?: string;
    bg?: string; // --widget-bg
    border?: string; // --widget-border
    borderWidth?: string; // --widget-border-width, e.g. '2px'
    radius?: string; // --widget-radius, e.g. '18px'
    opacity?: string; // --widget-opacity, 0…1
    textPrimary?: string;
    textSecondary?: string;
    /** Whole-card text style. Not a CSS variable — see the .aura-cond-* rules. */
    bold?: boolean;
    italic?: boolean;
}

// ── "Anzeige überschreiben" ──────────────────────────────────────────────────
// Effects that cannot be expressed as a CSS variable because they replace a value
// the widget reads out of its own config (issue #96). WidgetFrame merges them into
// the *rendered* copy of the config only — the edit dialog and every onConfigChange
// keep the raw values, exactly like the `[[dp]]` title substitution beside it.
//
// title / showTitle / icon / iconSize / showIcon need no per-widget wiring: every
// widget already reads those options (44 read `icon`, 51 read `iconSize`, all via
// getWidgetIcon). `valueText` does — a widget has to read `options.valueTextOverride`
// for it to show up, which is why widgetRegistry declares per type which slots the
// editor offers.
//
// Derived, not stored: the rules carry `elements`, and computeResult() folds the
// matching ones into this shape for applyConditionSet().
export interface ConditionSet {
    title?: string; // replaces config.title ([[dp]] tokens in it still resolve)
    showTitle?: boolean;
    icon?: string; // replaces options.icon
    iconSize?: number;
    showIcon?: boolean;
    valueText?: string; // replaces the displayed value (widgets with the 'value' slot)
    showValue?: boolean;
}

/** Which override slots a widget type actually honours — see widgetRegistry. */
export type ConditionSlot = 'icon' | 'title' | 'value';

/**
 * A single element of a widget: its title, its icon, the value it prints. A rule
 * says per element what should happen to it — everything about one element lives
 * in one place, instead of splitting visibility and content from appearance.
 */
export type ConditionPart = ConditionSlot;

export interface ConditionElement {
    /**
     * `undefined` leaves the visibility alone, `true` shows the element (and opens
     * the content fields), `false` hides it. The only way to hide — there is no
     * second switch for it.
     */
    show?: boolean;
    /** Replaces the text of the title resp. the value. */
    text?: string;
    /** Icon element only. */
    icon?: string;
    iconSize?: number;
    /**
     * Appearance. Travels as a class + variable on the frame root, read by the
     * .aura-cond-* rules in index.css against the class every widget puts on its
     * title/icon/value — so it needs no wiring per widget type. `bold`/`italic`
     * and `fontSize` are meaningless on the icon and not offered there (the icon
     * has `iconSize` instead).
     */
    color?: string;
    bold?: boolean;
    italic?: boolean;
    /** Text size in px. undefined = the size the widget renders the element at. */
    fontSize?: number;
}

export interface WidgetCondition {
    id: string;
    label?: string;
    logic: 'AND' | 'OR'; // how to combine multiple clauses
    clauses: ConditionClause[];
    style: ConditionStyle;
    /** What the rule does to the widget's elements while it matches (issue #96). */
    elements?: Partial<Record<ConditionPart, ConditionElement>>;
    /** `border` pulses the frame alone, so the content stays readable. */
    effect?: 'none' | 'pulse' | 'blink' | 'border';
    // Remount the widget when the rule fires, so embedded content (iframe, camera,
    // image) re-fetches. Rules with a 'changed' clause fire on every change; all
    // others fire on the rising edge of the match (issue #537).
    refreshWidget?: boolean;
    /**
     * Send a message when the rule fires — same edge semantics as refreshWidget
     * (issue #429). Stored as the builder draft so the editor can re-open it.
     */
    notify?: MessageDraft;
    hideWidget?: boolean; // enable visibility control (see visibilityMode)
    // Polarity of the visibility control. 'hideOnMatch' (default, back-compat) hides
    // the widget when the condition is true; 'showOnMatch' shows it only when true
    // (i.e. hides while the condition is false).
    visibilityMode?: 'hideOnMatch' | 'showOnMatch';
    reflow?: boolean; // if hiding: remove from grid so other widgets slide up
}

// ── Conditional formatting of a single element ────────────────────────────────
// One rule combines ConditionClauses (own value when `datapoint` is empty or the
// {dp} token, otherwise a foreign DP) and, when matched, overrides how ONE element
// looks. Several matching rules are merged in order, later wins per field, so
// effects stack. Same evaluateClause() operator engine as WidgetCondition.
//
// Carried by:
//   CustomCell.conditions           — a custom-grid cell (any widget in layout 'custom')
//   StaticListEntry.conditions      — one row of the static list
//   AutoListEntry.conditions        — one row of the dynamic list
//   options.rowConditions           — all rows of a list; clause DPs may use {{parent}}
//   EntrySubDp.conditions           — one datapoint of a row's second line
//
// The name CellConditionRule is kept because it is what the stored configs
// reference; ElementConditionRule is the alias the list code reads with.

/**
 * Which part of an element a rule paints. Cells have only one part and ignore it;
 * a list row has four, matching how issue #572 phrases it ("Farbe des Wertes,
 * Namens und Icons"). Default 'row' — background and hiding act on the whole row.
 */
export type ElementConditionTarget = 'row' | 'name' | 'value' | 'icon';

export interface CellConditionRule {
    id: string;
    label?: string;
    logic?: 'AND' | 'OR'; // how to combine clauses (default 'AND')
    clauses: ConditionClause[]; // empty `datapoint` = the element's own value; otherwise a foreign DP ref
    /** Which part of the element to paint. Ignored by custom-grid cells. */
    target?: ElementConditionTarget;
    // Effects applied when the rule matches (undefined = no override):
    color?: string; // text / icon color
    bg?: string; // element background
    bold?: boolean;
    italic?: boolean;
    icon?: string; // icon override (icon / state-icon cells, list row icon)
    iconColor?: string; // icon colour, when it should differ from the text colour
    iconSize?: number; // icon size in px (list rows / second-line datapoints); undefined = the element's configured size
    fontSize?: number; // text size in px; undefined = the size the element is rendered at
    text?: string; // replaces the displayed text ("true" → "ONLINE")
    /** Same two effects the widget level offers, applied to this element alone. */
    effect?: 'none' | 'pulse' | 'blink';
    hide?: boolean; // blank the element (background is kept)
}

/** The list code's name for the same rule — see the comment above. */
export type ElementConditionRule = CellConditionRule;

// ── Badges ──────────────────────────────────────────────────────────────────
// Small overlay indicators that sit on the edge/corner of a widget, group or
// tab. A badge is a self-contained element (not a condition effect): it can be
// always visible, or gated by an optional condition that reuses ConditionClause.

export type BadgeStyle = 'dot' | 'count' | 'label';
export type BadgeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BadgeSize = 'sm' | 'md' | 'lg' | number; // preset or explicit pixel size

export interface BadgeDef {
    id: string;
    style: BadgeStyle;
    corner: BadgeCorner; // which edge/corner the badge sits on
    color?: string; // dot/pill colour (CSS); falls back to var(--accent)
    size?: BadgeSize; // dot/text size, default 'md'
    dp?: string; // 'count': datapoint ref (supports JSON path) whose live value is shown
    label?: string; // 'label': fixed text
    icon?: string; // 'label': optional Iconify id
    // default 'always'. 'nonzero' is legacy — the editor no longer offers it and
    // rewrites it to a 'condition' with an 'active' clause on the same dp; the
    // runtime still evaluates stored ones (show while dp is >0 / true / non-empty).
    visibility?: 'always' | 'nonzero' | 'condition';
    logic?: 'AND' | 'OR'; // combine clauses when visibility === 'condition'
    clauses?: ConditionClause[]; // visibility clauses (reuses the condition shape)
}

export interface BadgeAggregate {
    enabled: boolean;
    corner?: BadgeCorner;
    color?: string;
    size?: BadgeSize;
}
