import { SwitchWidget } from './SwitchWidget';
import { ValueWidget } from './ValueWidget';
import { DimmerWidget } from './DimmerWidget';
import { ThermostatWidget } from './ThermostatWidget';
import { ChartWidget } from './ChartWidget';
import { ListWidget } from './ListWidget';
import { ClockWidget } from './ClockWidget';
import { CalendarWidget } from './CalendarWidget';
import { HeaderWidget } from './HeaderWidget';
// GroupWidget imports WidgetFrame (circular) — safe because it's only used inside render functions
import { GroupWidget } from './GroupWidget';
import { EChartWidget } from './EChartWidget';
import { EvccWidget } from './EvccWidget';
import { WeatherWidget } from './WeatherWidget';
import { GaugeWidget } from './GaugeWidget';
import { CameraWidget } from './CameraWidget';
import { AutoListWidget } from './AutoListWidget';
import { ImageWidget } from './ImageWidget';
import { IframeWidget } from './IframeWidget';
import { FillWidget } from './FillWidget';
import { TrashWidget } from './TrashWidget';
import { TrashScheduleWidget } from './TrashScheduleWidget';
import { ShutterWidget } from './ShutterWidget';
import { JsonTableWidget } from './JsonTableWidget';
import { HtmlWidget } from './HtmlWidget';
import { WindowContactWidget } from './WindowContactWidget';
import { BinarySensorWidget } from './BinarySensorWidget';
import { StateImageWidget } from './StateImageWidget';
import { EChartsPresetWidget } from './EChartsPresetWidget';
import { DatePickerWidget } from './DatePickerWidget';
import { MediaplayerWidget } from './MediaplayerWidget';
import { SliderWidget } from './SliderWidget';
import { ClimateWidget } from './ClimateWidget';

export function getWidgetMap() {
  return {
    switch:        SwitchWidget,
    value:         ValueWidget,
    dimmer:        DimmerWidget,
    thermostat:    ThermostatWidget,
    chart:         ChartWidget,
    list:          ListWidget,
    clock:         ClockWidget,
    calendar:      CalendarWidget,
    header:        HeaderWidget,
    group:         GroupWidget,
    echart:        EChartWidget,
    evcc:          EvccWidget,
    weather:       WeatherWidget,
    gauge:         GaugeWidget,
    camera:        CameraWidget,
    autolist:      AutoListWidget,
    image:         ImageWidget,
    iframe:        IframeWidget,
    fill:          FillWidget,
    trash:         TrashWidget,
    trashSchedule: TrashScheduleWidget,
    shutter:       ShutterWidget,
    jsontable:     JsonTableWidget,
    html:          HtmlWidget,
    windowcontact: WindowContactWidget,
    binarysensor:  BinarySensorWidget,
    stateimage:    StateImageWidget,
    echartsPreset: EChartsPresetWidget,
    datepicker:    DatePickerWidget,
    mediaplayer:   MediaplayerWidget,
    slider:        SliderWidget,
    climate:       ClimateWidget,
  } as const;
}

export type WidgetMap = ReturnType<typeof getWidgetMap>;
