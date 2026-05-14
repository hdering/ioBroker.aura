export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  datapoint: string;        // ioBroker Datenpunkt ID
  gridPos: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  layout?: WidgetLayout;
  options?: Record<string, unknown>;  // Widget-spezifische Optionen
  mobileOrder?: number;               // Sortierung in der mobilen Ansicht (einzelne Spalte)
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
  | 'enum';

export type WidgetLayout = 'default' | 'card' | 'compact' | 'minimal' | 'agenda' | 'flow' | 'battery' | 'production' | 'consumption' | 'loadpoints' | 'custom' | 'count';

// ── Custom-Grid layout ────────────────────────────────────────────────────────

export type CustomCellType =
  | 'empty' | 'title' | 'value' | 'unit' | 'text' | 'dp' | 'field' | 'image' | 'component'
  // Interactive cell types (Universal Widget)
  | 'switch' | 'slider' | 'button' | 'icon' | 'state-icon' | 'datepicker'
  | 'stepper' | 'input' | 'progress' | 'state-text';
export type CustomCellAlign  = 'left' | 'center' | 'right';
export type CustomCellValign = 'top'  | 'middle'  | 'bottom';

export interface CustomCell {
  type:      CustomCellType;
  text?:     string;            // 'text' / 'button' type: static text content / button label
  dpId?:     string;            // 'dp' / 'switch' / 'slider' / 'button' / 'state-icon' type: ioBroker datapoint ID
  fieldKey?:     string;            // 'field' type: key into widget-supplied extraFields map
  componentKey?: string;            // 'component' type: key into widget-supplied extraComponents map
  prefix?:   string;            // 'value' / 'dp' type: text prepended to value
  suffix?:   string;            // 'value' / 'dp' type: text appended to value
  decimals?: number;            // 'value' / 'dp' type: decimal places override (undefined = use global)
  fontSize?: number;            // px; undefined = auto
  bold?:     boolean;
  italic?:   boolean;
  color?:    string;            // CSS color; '' / undefined = theme default
  align?:         CustomCellAlign;   // default: 'left'
  valign?:        CustomCellValign;  // default: 'middle'
  allowOverflow?: boolean;           // allow text to overflow into adjacent cells
  colSpan?:       number;            // 'component' type: how many grid columns to span (1..cols)
  rowSpan?:       number;            // analog colSpan, vertical
  imageUrl?:      string;            // 'image' type: URL or base64 data URI
  objectFit?:     'contain' | 'cover' | 'fill';  // 'image' type: CSS object-fit
  // 'slider' type
  min?:         number;
  max?:         number;
  step?:        number;
  barStyle?:    boolean;
  barSize?:     number;
  orientation?: 'horizontal' | 'vertical';
  // 'button' type
  sendValue?: string;           // payload sent to dpId on click (parsed as bool/number/string)
  // 'icon' / 'state-icon' type
  iconName?:  string;           // Lucide icon name
  trueIcon?:  string;           // 'state-icon' / 'switch' (icon mode): Lucide icon for truthy value
  falseIcon?: string;           // 'state-icon' / 'switch' (icon mode): Lucide icon for falsy value
  trueColor?: string;           // 'state-icon' / 'switch' (icon mode): color for truthy value
  falseColor?: string;          // 'state-icon' / 'switch' (icon mode): color for falsy value
  // 'switch' type
  controlMode?: 'toggle' | 'icon';  // 'switch' cell: visual control style (default 'toggle')
  // 'datepicker' type
  dateFormat?: string;           // DateOutputFormat string: how to encode the picked date when writing to dpId
  showTime?:   boolean;          // show time-of-day picker alongside date input
  timeOnly?:   boolean;          // hide date input, only edit/write time-of-day
  // 'input' type
  inputMode?: 'text' | 'number'; // 'input' cell: which native input variant (default 'text')
  // 'progress' type
  showValue?: boolean;           // 'progress' cell: overlay current value/percentage on top of bar
  // 'state-text' type — reuses trueColor/falseColor + color/text styling
  trueText?:  string;            // 'state-text' cell: label rendered for truthy value
  falseText?: string;            // 'state-text' cell: label rendered for falsy value
}

/** Legacy: 9-element array, row-major (index = row*3 + col). Kept as alias for compat. */
export type CustomGrid = CustomCell[];

/** New custom-grid format with variable dimensions. */
export interface CustomGridDef {
  cols: number;                 // 1..8
  rows: number;                 // 1..8
  cells: CustomCell[];          // length = cols*rows, row-major (index = row*cols + col)
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
  type: 'state' | 'channel' | 'device' | 'folder' | 'adapter' | 'instance' | 'enum';
  common: {
    name: string | Record<string, string>;
    type?: 'boolean' | 'number' | 'string' | 'mixed';
    role?: string;
    unit?: string;
    min?: number;
    max?: number;
    read?: boolean;
    write?: boolean;
    enabled?: boolean;     // instance: whether the adapter instance is enabled
    members?: string[];   // enum.rooms / enum.functions member IDs
    custom?: Record<string, { enabled?: boolean } | null>;
  };
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
  | { kind: 'popup-image';     url?: string;  dp?: string;  fit?: 'contain' | 'cover' }
  | { kind: 'popup-iframe';    url: string;   sandbox?: boolean }
  | { kind: 'popup-json';      json?: string; dp?: string }
  | { kind: 'popup-html';      html?: string; dp?: string }
  | { kind: 'popup-widget';    widgetId?: string }
  | { kind: 'link-tab';        layoutId: string; tabId: string }
  | { kind: 'link-external';   url: string;   newTab?: boolean }
  | { kind: 'link-widget';     layoutId: string; tabId: string; widgetId: string }
  | { kind: 'popup-view';      viewId: string };

// options.clickAction?: ClickAction
// options.popupTitle?: string      – override header title in popup
// options.popupHideTitle?: boolean  – hide the title bar entirely
// options.popupShowHistory?: boolean – show history icon in popup header
// options.popupAutoCloseSec?: number – per-click-action auto-close override (0 = off, >0 = seconds; undefined = inherit view/global)

// ── Conditional widget styling ────────────────────────────────────────────────

export type ConditionOperator =
  | '==' | '!='
  | '>'  | '>='
  | '<'  | '<='
  | 'true' | 'false'
  | 'contains';

export interface ConditionClause {
  datapoint: string;
  operator: ConditionOperator;
  value: string;        // always string; parsed numerically where needed
  valueType?: 'static' | 'datapoint'; // when 'datapoint', `value` is the second DP ID
}

export interface ConditionStyle {
  accent?: string;
  bg?: string;          // --widget-bg
  border?: string;      // --widget-border
  textPrimary?: string;
  textSecondary?: string;
}

export interface WidgetCondition {
  id: string;
  label?: string;
  logic: 'AND' | 'OR';  // how to combine multiple clauses
  clauses: ConditionClause[];
  style: ConditionStyle;
  effect?: 'none' | 'pulse' | 'blink';
  hideWidget?: boolean;  // hide the widget when condition is true
  reflow?: boolean;      // if hiding: remove from grid so other widgets slide up
}
