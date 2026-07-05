import { lazyWithReload } from '../../utils/lazyWithReload';
import { SwitchWidget } from './SwitchWidget';
import { ValueWidget } from './ValueWidget';
import { DimmerWidget } from './DimmerWidget';
import { ThermostatWidget } from './ThermostatWidget';
import { ListWidget } from './ListWidget';
import { ClockWidget } from './ClockWidget';
import { CalendarWidget } from './CalendarWidget';
import { HeaderWidget } from './HeaderWidget';
// GroupWidget imports WidgetFrame (circular) — safe because it's only used inside render functions
import { GroupWidget } from './GroupWidget';
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
import { DatePickerWidget } from './DatePickerWidget';
import { MediaplayerWidget } from './MediaplayerWidget';
import { SliderWidget } from './SliderWidget';
import { UniversalWidget } from './UniversalWidget';
import { EnumWidget } from './EnumWidget';
import { LightWidget } from './LightWidget';
import { CarouselWidget } from './CarouselWidget';
import { PanelsWidget } from './PanelsWidget';
import { KnobWidget } from './KnobWidget';
import { TimerWidget } from './TimerWidget';
import { AdapterStatusWidget } from './AdapterStatusWidget';
import { ScriptStatusWidget } from './ScriptStatusWidget';
import { AdapterLogsWidget } from './AdapterLogsWidget';
import { InputWidget } from './InputWidget';
import { AlarmWidget } from './AlarmWidget';
import { ChipsWidget } from './ChipsWidget';
import { EnergiebilanzWidget } from './EnergiebilanzWidget';
import { HttpRequestWidget } from './HttpRequestWidget';
import { ButtonWidget } from './ButtonWidget';
import { StatusOverviewWidget } from './StatusOverviewWidget';

// Chart widgets are heavy (recharts ~380 KB, echarts ~1.1 MB) — lazy-loaded so
// dashboards without charts skip the cost. Consumers must render these inside
// a <Suspense> boundary.
const ChartWidget = lazyWithReload(() => import('./ChartWidget').then((m) => ({ default: m.ChartWidget })));
const ClimateWidget = lazyWithReload(() => import('./ClimateWidget').then((m) => ({ default: m.ClimateWidget })));
const EChartWidget = lazyWithReload(() => import('./EChartWidget').then((m) => ({ default: m.EChartWidget })));
const EChartsPresetWidget = lazyWithReload(() =>
    import('./EChartsPresetWidget').then((m) => ({ default: m.EChartsPresetWidget })),
);
// MapWidget is heavy (leaflet) — lazy-loaded like the chart widgets.
const MapWidget = lazyWithReload(() => import('./MapWidget').then((m) => ({ default: m.MapWidget })));
// LoadTimesWidget pulls in recharts — lazy-load it like the other chart widgets.
const LoadTimesWidget = lazyWithReload(() => import('./LoadTimesWidget').then((m) => ({ default: m.LoadTimesWidget })));

export function getWidgetMap() {
    return {
        switch: SwitchWidget,
        value: ValueWidget,
        dimmer: DimmerWidget,
        thermostat: ThermostatWidget,
        chart: ChartWidget,
        list: ListWidget,
        clock: ClockWidget,
        calendar: CalendarWidget,
        header: HeaderWidget,
        group: GroupWidget,
        echart: EChartWidget,
        evcc: EvccWidget,
        weather: WeatherWidget,
        gauge: GaugeWidget,
        camera: CameraWidget,
        autolist: AutoListWidget,
        image: ImageWidget,
        iframe: IframeWidget,
        fill: FillWidget,
        trash: TrashWidget,
        trashSchedule: TrashScheduleWidget,
        shutter: ShutterWidget,
        jsontable: JsonTableWidget,
        html: HtmlWidget,
        windowcontact: WindowContactWidget,
        binarysensor: BinarySensorWidget,
        stateimage: StateImageWidget,
        echartsPreset: EChartsPresetWidget,
        datepicker: DatePickerWidget,
        mediaplayer: MediaplayerWidget,
        slider: SliderWidget,
        climate: ClimateWidget,
        universal: UniversalWidget,
        enum: EnumWidget,
        light: LightWidget,
        carousel: CarouselWidget,
        panels: PanelsWidget,
        knob: KnobWidget,
        timer: TimerWidget,
        adapterstatus: AdapterStatusWidget,
        scriptstatus: ScriptStatusWidget,
        adapterlogs: AdapterLogsWidget,
        input: InputWidget,
        alarm: AlarmWidget,
        chips: ChipsWidget,
        energiebilanz: EnergiebilanzWidget,
        httpRequest: HttpRequestWidget,
        button: ButtonWidget,
        map: MapWidget,
        statusoverview: StatusOverviewWidget,
        loadtimes: LoadTimesWidget,
    } as const;
}

export type WidgetMap = ReturnType<typeof getWidgetMap>;
