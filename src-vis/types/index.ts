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
    | 'energiebilanz';

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
    valueFactor?: number; // 'dp' / 'progress' type: display-only multiplier (default 1)
    valueOffset?: number; // 'dp' / 'progress' type: display-only additive offset (default 0)
    valueTransform?: string; // 'dp' / 'progress' type: selected transform preset id (editor only; disambiguates presets sharing factor/offset)
    fontSize?: number; // px; undefined = auto
    bold?: boolean;
    italic?: boolean;
    color?: string; // CSS color; '' / undefined = theme default
    align?: CustomCellAlign; // default: 'left'
    valign?: CustomCellValign; // default: 'middle'
    allowOverflow?: boolean; // allow text to overflow into adjacent cells
    wrap?: boolean; // wrap long text onto multiple lines instead of ellipsis (default false)
    colSpan?: number; // 'component' type: how many grid columns to span (1..cols)
    rowSpan?: number; // analog colSpan, vertical
    imageUrl?: string; // 'image' type: URL or base64 data URI
    objectFit?: 'contain' | 'cover' | 'fill'; // 'image' type: CSS object-fit
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
    // 'state-icon' active-state detection (issue #467)
    stateMode?: 'boolean' | 'condition'; // default 'boolean' (truthy coercion); 'condition' uses operator + value
    stateOperator?: ConditionOperator; // 'condition' mode: comparison against stateValue
    stateValue?: string; // 'condition' mode: comparison value (parsed numerically where needed)
    // 'switch' type
    controlMode?: 'toggle' | 'icon' | 'button'; // 'switch' cell: visual control style (default 'toggle')
    buttonTextColor?: string; // 'switch' cell (button mode): label text color (default #fff)
    buttonSize?: number; // 'switch' cell (button mode): padding scale in px (default 8)
    momentary?: boolean; // 'switch' cell: Taster-Modus — write trueValue on press, falseValue after delay
    momentaryDelay?: number; // 'switch' cell: ms before writing falseValue (default 500)
    confirmAction?: boolean; // 'switch' cell: require confirmation overlay before toggling
    confirmText?: string; // 'switch' cell: optional prompt text in confirmation overlay
    trueValue?: string; // 'switch' cell: payload written when switching ON  (parsed as bool/number/string; default true)
    falseValue?: string; // 'switch' cell: payload written when switching OFF (parsed as bool/number/string; default false)
    // 'datepicker' type
    dateFormat?: string; // DateOutputFormat string: how to encode the picked date when writing to dpId
    showTime?: boolean; // show time-of-day picker alongside date input
    timeOnly?: boolean; // hide date input, only edit/write time-of-day
    // 'input' type
    inputMode?: 'text' | 'number'; // 'input' cell: which native input variant (default 'text')
    multiline?: boolean; // 'input' cell: render a multi-line textarea instead of a single-line input
    submitMode?: 'submit' | 'live'; // 'input' cell: write on Enter/Send/blur ('submit', default) or on every keystroke ('live')
    showSubmit?: boolean; // 'input' cell: show the Send button in submit mode (default true)
    // 'progress' type
    showValue?: boolean; // 'progress' cell: overlay current value/percentage on top of bar
    // 'state-text' type — reuses trueColor/falseColor + color/text styling
    trueText?: string; // 'state-text' cell: label rendered for truthy value
    falseText?: string; // 'state-text' cell: label rendered for falsy value
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
    | { kind: 'popup-view'; viewId: string; dp?: string };

// options.clickAction?: ClickAction
// options.popupTitle?: string      – override header title in popup
// options.popupHideTitle?: boolean  – hide the title bar entirely
// options.popupShowHistory?: boolean – show history icon in popup header
// options.popupAutoCloseSec?: number – per-click-action auto-close override (0 = off, >0 = seconds; undefined = inherit view/global)

// ── Conditional widget styling ────────────────────────────────────────────────

export type ConditionOperator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'true' | 'false' | 'contains';

export interface ConditionClause {
    datapoint: string;
    operator: ConditionOperator;
    value: string; // always string; parsed numerically where needed
    valueType?: 'static' | 'datapoint'; // when 'datapoint', `value` is the second DP ID
}

export interface ConditionStyle {
    accent?: string;
    bg?: string; // --widget-bg
    border?: string; // --widget-border
    textPrimary?: string;
    textSecondary?: string;
}

export interface WidgetCondition {
    id: string;
    label?: string;
    logic: 'AND' | 'OR'; // how to combine multiple clauses
    clauses: ConditionClause[];
    style: ConditionStyle;
    effect?: 'none' | 'pulse' | 'blink';
    hideWidget?: boolean; // enable visibility control (see visibilityMode)
    // Polarity of the visibility control. 'hideOnMatch' (default, back-compat) hides
    // the widget when the condition is true; 'showOnMatch' shows it only when true
    // (i.e. hides while the condition is false).
    visibilityMode?: 'hideOnMatch' | 'showOnMatch';
    reflow?: boolean; // if hiding: remove from grid so other widgets slide up
}

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
    visibility?: 'always' | 'nonzero' | 'condition'; // default 'always'; 'nonzero' = show when dp is active (>0 / true / non-empty)
    logic?: 'AND' | 'OR'; // combine clauses when visibility === 'condition'
    clauses?: ConditionClause[]; // visibility clauses (reuses the condition shape)
}

export interface BadgeAggregate {
    enabled: boolean;
    corner?: BadgeCorner;
    color?: string;
    size?: BadgeSize;
}
