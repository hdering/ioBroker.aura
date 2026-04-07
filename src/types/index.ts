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
}

export type WidgetType =
  | 'switch'
  | 'value'
  | 'dimmer'
  | 'thermostat'
  | 'chart'
  | 'list';

export type WidgetLayout = 'default' | 'card' | 'compact' | 'minimal';

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
  type: 'state' | 'channel' | 'device' | 'folder' | 'adapter' | 'instance';
  common: {
    name: string | Record<string, string>;
    type?: 'boolean' | 'number' | 'string' | 'mixed';
    role?: string;
    unit?: string;
    min?: number;
    max?: number;
    read?: boolean;
    write?: boolean;
  };
}

export interface ObjectViewResult {
  rows: { id: string; value: ioBrokerObject }[];
}
