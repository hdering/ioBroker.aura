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
  | 'trash';

export type WidgetLayout = 'default' | 'card' | 'compact' | 'minimal' | 'agenda' | 'flow' | 'battery' | 'production' | 'consumption' | 'loadpoints';

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
    members?: string[];   // enum.rooms / enum.functions member IDs
  };
}

export interface ObjectViewResult {
  rows: { id: string; value: ioBrokerObject }[];
}

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
