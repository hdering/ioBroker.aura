/**
 * Central widget registry – single source of truth for all widget metadata.
 *
 * To add a new widget type:
 *   1. Add its WidgetType literal to src/types/index.ts
 *   2. Add one entry to WIDGET_REGISTRY below
 *   3. Import the component in WidgetFrame.tsx and add it to WIDGET_COMPONENTS
 *
 * Everything else (dropdowns, dialogs, previews, color labels) is derived
 * automatically from this file.
 */

import {
  Zap, TrendingUp, SlidersHorizontal, Thermometer, BarChart2, List,
  Clock, CalendarDays, Heading2, Layers2, Cloud, Gauge, Camera, ImageIcon, MonitorDot, Droplets, Truck, AlignJustify, Table2,
  DoorOpen, ShieldAlert, ToggleRight, LineChart, Code2, CalendarClock, Music, CalendarCheck2, Tag, Globe, MousePointerClick, Wind,
  LayoutGrid, ListChecks, Lightbulb, CircleDot, Timer, ServerCog, ScrollText, TextCursorInput, /* GalleryHorizontal — re-import when carousel is re-enabled */
  type LucideIcon,
} from 'lucide-react';
import type { WidgetType } from './types';

export type AddMode =
  | 'datapoint'   // requires an ioBroker state ID
  | 'group'       // legacy – no longer used for new widgets
  | 'free'        // no datapoint / special config (clock, header, …)
  | 'wizard-only' // cannot be added manually (calendar)

export type WidgetGroup = 'control' | 'special' | 'layout';

export interface WidgetMeta {
  type: WidgetType;
  /** Full German name shown in dialogs, admin lists, … */
  label: string;
  /** Short name for compact labels (TabWizard badges) */
  shortLabel: string;
  /** Lucide icon component – render at any size */
  Icon: LucideIcon;
  /** String name of Icon (used to store/restore icon from config.options.icon) */
  iconName: string;
  /** Accent color for UI elements */
  color: string;
  /** Default grid width (columns) */
  defaultW: number;
  /** Default grid height (rows) */
  defaultH: number;
  /** How the widget is added via the "Manuell" dialog */
  addMode: AddMode;
  /** UI grouping in widget pickers */
  widgetGroup: WidgetGroup;
  /** Mock data shown in WidgetPreview thumbnails */
  mock: { t: string; v: string; u?: string; sub?: string };
  /** Short hint shown in ManualWidgetDialog – when to use this type */
  hint?: string;
  /** Option keys pre-filled with {{key}} placeholders when adding this widget inside a popup view editor */
  popupDefaults?: Record<string, string>;
}

export const WIDGET_GROUPS: { id: WidgetGroup; label: string }[] = [
  { id: 'control', label: 'Steuerung & Anzeige' },
  { id: 'special', label: 'Spezial' },
  { id: 'layout',  label: 'Layout' },
];

export const WIDGET_REGISTRY: WidgetMeta[] = [
  {
    type: 'switch',
    label: 'Schalter',      shortLabel: 'Schalter',
    Icon: Zap,              iconName: 'Zap',        color: '#22c55e',
    defaultW: 8,            defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Wohnzimmer', v: 'AN' },
    hint: 'Ein/Aus-Schalter für Boolean-Datenpunkte (z.B. Lampe, Steckdose)',
  },
  {
    type: 'shutter',
    label: 'Rollladen',      shortLabel: 'Rollladen',
    Icon: AlignJustify,      iconName: 'AlignJustify', color: '#64748b',
    defaultW: 8,             defaultH: 5,
    addMode: 'datapoint',    widgetGroup: 'control',
    mock: { t: 'Wohnzimmer', v: '45', u: '%' },
    hint: 'Rollladen-Position (0–100 %) steuern und anzeigen',
    popupDefaults: { activityDp: '{{activityDp}}', directionDp: '{{directionDp}}', stopDp: '{{stopDp}}', batteryDp: '{{batteryDp}}', unreachDp: '{{unreachDp}}' },
  },
  {
    type: 'dimmer',
    label: 'Dimmer',        shortLabel: 'Dimmer',
    Icon: SlidersHorizontal, iconName: 'SlidersHorizontal', color: '#f59e0b',
    defaultW: 10,           defaultH: 5,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Licht', v: '75', u: '%' },
    hint: 'Licht dimmen – Helligkeitsregler 0–100 % mit Ein/Aus-Taste',
  },
  {
    type: 'slider',
    label: 'Schieberegler', shortLabel: 'Regler',
    Icon: SlidersHorizontal, iconName: 'SlidersHorizontal', color: '#0ea5e9',
    defaultW: 8,            defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Lautstärke', v: '50', u: '%' },
    hint: 'Beliebigen Zahlenwert per Schieberegler einstellen',
  },
  {
    type: 'thermostat',
    label: 'Thermostat',    shortLabel: 'Thermostat',
    Icon: Thermometer,      iconName: 'Thermometer', color: '#ef4444',
    defaultW: 10,           defaultH: 6,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Heizung', v: '21.0', sub: 'Ist: 19.5°' },
    hint: 'Soll-Temperatur einstellen und Ist-Temperatur anzeigen',
    popupDefaults: { setpointDp: '{{dp}}' },
  },
  {
    type: 'value',
    label: 'Wert-Anzeige',  shortLabel: 'Wert',
    Icon: TrendingUp,       iconName: 'TrendingUp', color: '#3b82f6',
    defaultW: 8,            defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Temperatur', v: '21.5', u: '°C' },
    hint: 'Einen Datenpunktwert als Zahl/Text anzeigen (read-only)',
  },
  {
    type: 'gauge',
    label: 'Gauge',         shortLabel: 'Gauge',
    Icon: Gauge,            iconName: 'Gauge',      color: '#f97316',
    defaultW: 8,            defaultH: 5,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Gauge', v: '72', u: 'kW' },
    hint: 'Zahlenwert als Tachonadel/Kreisbogen visualisieren',
  },
  {
    type: 'chart',
    label: 'Diagramm (einfach)', shortLabel: 'Diagramm',
    Icon: BarChart2,        iconName: 'BarChart2',  color: '#8b5cf6',
    defaultW: 12,           defaultH: 5,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Verbrauch', v: '245', u: 'W' },
    hint: 'Verlauf eines einzelnen Datenpunkts als einfaches Diagramm',
  },
  {
    type: 'climate',
    label: 'Raumklima',         shortLabel: 'Klima',
    Icon: Wind,                 iconName: 'Wind',         color: '#06b6d4',
    defaultW: 10,               defaultH: 6,
    addMode: 'datapoint',       widgetGroup: 'control',
    mock: { t: 'Wohnzimmer', v: '21.4', u: '°C', sub: '💧 52%' },
    hint: 'Temperatur, Luftfeuchtigkeit und optionalen Temperaturverlauf kombiniert anzeigen',
    popupDefaults: { targetDatapoint: '{{targetDatapoint}}', humidityDatapoint: '{{humidityDatapoint}}' },
  },
  {
    type: 'echart',
    label: 'Diagramm (erweitert)', shortLabel: 'Diagramm (erw.)',
    Icon: BarChart2,        iconName: 'BarChart2',  color: '#10b981',
    defaultW: 12,           defaultH: 5,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'EChart', v: '' },
    hint: 'Erweitertes Diagramm mit mehreren Datenpunkten und Optionen',
  },
  {
    type: 'echartsPreset',
    label: 'eCharts',       shortLabel: 'eCharts',
    Icon: LineChart,        iconName: 'LineChart',  color: '#10b981',
    defaultW: 12,           defaultH: 5,
    addMode: 'free',        widgetGroup: 'control',
    mock: { t: 'eCharts', v: '' },
    hint: 'Vorkonfiguriertes eCharts-Diagramm per JSON-Preset',
  },
  {
    type: 'list',
    label: 'Statische Liste', shortLabel: 'Liste',
    Icon: List,               iconName: 'List',       color: '#06b6d4',
    defaultW: 10,             defaultH: 6,
    addMode: 'free',          widgetGroup: 'control',
    mock: { t: 'Statische Liste', v: '' },
    hint: 'Manuell gepflegte Liste mit frei konfigurierbaren Datenpunkt-Links',
  },
  {
    type: 'autolist',
    label: 'Dynamische Liste', shortLabel: 'Dynamische Liste',
    Icon: List,             iconName: 'List',       color: '#14b8a6',
    defaultW: 10,           defaultH: 6,
    addMode: 'free',        widgetGroup: 'control',
    mock: { t: 'Dynamische Liste', v: '' },
    hint: 'Datenpunkte automatisch aus einem ioBroker-Ordner auflisten',
  },
  {
    type: 'clock',
    label: 'Uhrzeit',       shortLabel: 'Uhr',
    Icon: Clock,            iconName: 'Clock',      color: '#ec4899',
    defaultW: 8,            defaultH: 4,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Uhrzeit', v: '12:34' },
    hint: 'Aktuelle Uhrzeit und Datum anzeigen (kein Datenpunkt nötig)',
  },
  {
    type: 'weather',
    label: 'Wetter',        shortLabel: 'Wetter',
    Icon: Cloud,            iconName: 'Cloud',      color: '#0ea5e9',
    defaultW: 10,           defaultH: 5,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Wetter', v: '18°', sub: '⛅ Bewölkt' },
    hint: 'Wetterdaten vom ioBroker-Wetter-Adapter anzeigen',
  },
  {
    type: 'calendar',
    label: 'Kalender',      shortLabel: 'Kalender',
    Icon: CalendarDays,     iconName: 'CalendarDays', color: '#f97316',
    defaultW: 12,           defaultH: 6,
    addMode: 'wizard-only', widgetGroup: 'special',
    mock: { t: 'Kalender', v: '3' },
    hint: 'Termine aus dem iCal-Adapter (nur per Tab-Wizard hinzufügbar)',
  },
  {
    type: 'evcc',
    label: 'evcc',          shortLabel: 'evcc',
    Icon: Zap,              iconName: 'Zap',        color: '#6366f1',
    defaultW: 12,           defaultH: 6,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'evcc', v: '' },
    hint: 'evcc Wallbox-Ladesteuerung einbinden',
  },
  {
    type: 'camera',
    label: 'Kamera',        shortLabel: 'Kamera',
    Icon: Camera,           iconName: 'Camera',     color: '#6b7280',
    defaultW: 10,           defaultH: 5,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Kamera', v: '' },
    hint: 'Kamera-Livebild einbinden (go2rtc / MJPEG-Stream)',
  },
  {
    type: 'image',
    label: 'Bild',          shortLabel: 'Bild',
    Icon: ImageIcon,        iconName: 'ImageIcon',  color: '#0ea5e9',
    defaultW: 10,           defaultH: 5,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'Bild', v: '' },
    hint: 'Statisches Bild, lokale Datei oder URL anzeigen',
  },
  {
    type: 'trash',
    label: 'Müllabfuhr',      shortLabel: 'Müll',
    Icon: Truck,              iconName: 'Truck',       color: '#6b7280',
    defaultW: 10,             defaultH: 5,
    addMode: 'free',          widgetGroup: 'special',
    mock: { t: 'Müllabfuhr', v: '' },
    hint: 'Nächste Müllabfuhr-Termine vom Trash-Adapter anzeigen',
  },
  {
    type: 'trashSchedule',
    label: 'Müllabfuhr-Zeitplan', shortLabel: 'Müllabfuhr-Zeitplan',
    Icon: CalendarCheck2,         iconName: 'CalendarCheck2', color: '#6b7280',
    defaultW: 10,                 defaultH: 5,
    addMode: 'datapoint',         widgetGroup: 'special',
    mock: { t: 'Müllabfuhr-Zeitplan', v: '' },
    hint: 'Detaillierter Müllabfuhr-Kalender (Datenpunkt vom Trash-Adapter)',
  },
  {
    type: 'fill',
    label: 'Füllstandsanzeige', shortLabel: 'Füllstand',
    Icon: Droplets,             iconName: 'Droplets',    color: '#0ea5e9',
    defaultW: 8,                defaultH: 6,
    addMode: 'datapoint',       widgetGroup: 'control',
    mock: { t: 'Wassertank', v: '68', u: '%' },
    hint: 'Füllstand (z.B. Wassertank, Heizöl) als Balken visualisieren',
  },
  {
    type: 'iframe',
    label: 'iFrame',         shortLabel: 'iFrame',
    Icon: MonitorDot,        iconName: 'MonitorDot',  color: '#64748b',
    defaultW: 12,            defaultH: 6,
    addMode: 'free',         widgetGroup: 'special',
    mock: { t: 'iFrame', v: '' },
    hint: 'Externe Webseite oder lokale URL einbetten',
  },
  {
    type: 'header',
    label: 'Abschnittstitel', shortLabel: 'Abschnitt',
    Icon: Heading2,         iconName: 'Heading2',   color: '#94a3b8',
    defaultW: 12,           defaultH: 1,
    addMode: 'free',        widgetGroup: 'layout',
    mock: { t: 'Abschnitt', v: '' },
    hint: 'Trennlinie mit Überschrift zur Gliederung des Dashboards',
  },
  {
    type: 'group',
    label: 'Gruppe',        shortLabel: 'Gruppe',
    Icon: Layers2,          iconName: 'Layers2',    color: '#a78bfa',
    defaultW: 12,           defaultH: 6,
    addMode: 'free',        widgetGroup: 'layout',
    mock: { t: 'Gruppe', v: '' },
    hint: 'Mehrere Widgets in einem gemeinsamen Rahmen gruppieren',
  },
  {
    type: 'button',
    label: 'Button',        shortLabel: 'Button',
    Icon: MousePointerClick, iconName: 'MousePointerClick', color: '#6366f1',
    defaultW: 4,            defaultH: 3,
    addMode: 'free',        widgetGroup: 'layout',
    mock: { t: 'Öffnen', v: '' },
    hint: 'Klick-Aktion auslösen (Datenpunkt schreiben, HTTP-Call, Szene …)',
  },
  {
    type: 'jsontable',
    label: 'JSON-Tabelle',  shortLabel: 'JSON',
    Icon: Table2,           iconName: 'Table2',     color: '#0ea5e9',
    defaultW: 12,           defaultH: 5,
    addMode: 'datapoint',   widgetGroup: 'special',
    mock: { t: 'JSON-Tabelle', v: '' },
    hint: 'JSON-Array-Datenpunkt als formatierte Tabelle anzeigen',
  },
  {
    type: 'windowcontact',
    label: 'Fenster-/Türkontakt', shortLabel: 'Kontakt',
    Icon: DoorOpen,              iconName: 'DoorOpen',    color: '#22c55e',
    defaultW: 8,                 defaultH: 4,
    addMode: 'datapoint',        widgetGroup: 'control',
    mock: { t: 'Fenster', v: 'false' },
    hint: 'Fenster- oder Türkontakt-Status anzeigen (offen/geschlossen)',
  },
  {
    type: 'binarysensor',
    label: 'Binärsensor',   shortLabel: 'Sensor',
    Icon: ShieldAlert,      iconName: 'ShieldAlert', color: '#f59e0b',
    defaultW: 8,            defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Bewegung', v: 'false' },
    hint: 'Allgemeinen Binärsensor anzeigen (z.B. Bewegungsmelder, Alarm)',
  },
  {
    type: 'stateimage',
    label: 'Zustandsbild',  shortLabel: 'Zustandsbild',
    Icon: ToggleRight,      iconName: 'ToggleRight', color: '#22c55e',
    defaultW: 8,            defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'control',
    mock: { t: 'Garage', v: 'false' },
    hint: 'Je nach Zustand (true/false) ein anderes Bild anzeigen',
  },
  {
    type: 'html',
    label: 'HTML',          shortLabel: 'HTML',
    Icon: Code2,            iconName: 'Code2',       color: '#f59e0b',
    defaultW: 10,           defaultH: 5,
    addMode: 'free',        widgetGroup: 'special',
    mock: { t: 'HTML', v: '' },
    hint: 'Beliebigen HTML/CSS-Code frei einbetten',
  },
  {
    type: 'datepicker',
    label: 'Datumswähler',  shortLabel: 'Datum',
    Icon: CalendarClock,    iconName: 'CalendarClock', color: '#6366f1',
    defaultW: 10,           defaultH: 4,
    addMode: 'datapoint',   widgetGroup: 'special',
    mock: { t: 'Datum', v: '01.01.2025' },
    hint: 'Datum/Uhrzeit auswählen und als Datenpunkt speichern',
  },
  {
    type: 'mediaplayer',
    label: 'Mediaplayer',   shortLabel: 'Player',
    Icon: Music,            iconName: 'Music',         color: '#a855f7',
    defaultW: 14,           defaultH: 6,
    addMode: 'free',        widgetGroup: 'control',
    mock: { t: 'Ocean Planet', v: 'Ethereal Nights' },
    hint: 'Mediaplayer steuern (Sonos, Squeezeserver, Spotify …)',
  },
  {
    type: 'chips',
    label: 'Schnellzugriff-Chips', shortLabel: 'Chips',
    Icon: Tag,                     iconName: 'Tag',    color: '#f97316',
    defaultW: 10,                  defaultH: 3,
    addMode: 'free',               widgetGroup: 'control',
    mock: { t: 'Szenen', v: '' },
    hint: 'Kompakte Schaltflächen-Leiste für Szenen und häufige Aktionen',
  },
  {
    type: 'httpRequest',
    label: 'HTTP-Aktion',          shortLabel: 'HTTP',
    Icon: Globe,                   iconName: 'Globe',  color: '#0ea5e9',
    defaultW: 8,                   defaultH: 3,
    addMode: 'free',               widgetGroup: 'control',
    mock: { t: 'HTTP-Aktion', v: '' },
    hint: 'HTTP GET/POST-Anfrage per Klick auslösen (z.B. Webhook)',
  },
  {
    type: 'universal',
    label: 'Universal-Widget',     shortLabel: 'Universal',
    Icon: LayoutGrid,              iconName: 'LayoutGrid', color: '#8b5cf6',
    defaultW: 10,                  defaultH: 6,
    addMode: 'free',               widgetGroup: 'control',
    mock: { t: 'Universal', v: '' },
    hint: 'Freies Raster – Zellen einzeln mit Schaltern, Reglern, Werten und Bildern belegen',
  },
  {
    type: 'enum',
    label: 'Auswahlfeld',          shortLabel: 'Auswahl',
    Icon: ListChecks,              iconName: 'ListChecks', color: '#0ea5e9',
    defaultW: 8,                   defaultH: 4,
    addMode: 'datapoint',          widgetGroup: 'control',
    mock: { t: 'Modus', v: 'Bereit' },
    hint: 'DP-Werte (0,1,2…) auf Text-Labels mappen; Dropdown schreibt den Wert zurück',
  },
  {
    type: 'light',
    label: 'RGB-Licht',            shortLabel: 'Licht',
    Icon: Lightbulb,               iconName: 'Lightbulb', color: '#fbbf24',
    defaultW: 8,                   defaultH: 9,
    addMode: 'datapoint',          widgetGroup: 'control',
    mock: { t: 'LED-Strip', v: 'Aus' },
    hint: 'RGB / CCT / Dimmer in einem Widget – Helligkeit, Farbe, Lichtwärme, Effekte (Hue, HmIP, generisch)',
  },
  {
    type: 'knob',
    label: 'Drehregler',           shortLabel: 'Knob',
    Icon: CircleDot,               iconName: 'CircleDot', color: '#6366f1',
    defaultW: 6,                   defaultH: 6,
    addMode: 'datapoint',          widgetGroup: 'control',
    mock: { t: 'Drehregler', v: '65', u: '%' },
    hint: 'Wert über Drehknopf einstellen – 3 Zeigertypen (Linie/Kreis/Pfeil), Winkelbereich konfigurierbar',
  },
  {
    type: 'timer',
    label: 'Zeitschaltuhr',        shortLabel: 'Timer',
    Icon: Timer,                   iconName: 'Timer',     color: '#0ea5e9',
    defaultW: 8,                   defaultH: 5,
    addMode: 'free',               widgetGroup: 'special',
    mock: { t: 'Zeitschaltuhr', v: '3 Ereignisse' },
    hint: 'Zeitgesteuerte Ereignisse — Wochentag/Astro/Einmalig/Zeitraum, schreibt Ziel-DP automatisch (Backend-Scheduler)',
  },
  {
    type: 'adapterstatus',
    label: 'Adapter-Status',       shortLabel: 'Adapter',
    Icon: ServerCog,               iconName: 'ServerCog', color: '#0ea5e9',
    defaultW: 10,                  defaultH: 8,
    addMode: 'free',               widgetGroup: 'special',
    mock: { t: 'Adapter-Status', v: '' },
    hint: 'Liste aller ioBroker-Instanzen mit Status, Update-Hinweisen und optionalen Neustart-/Update-Aktionen',
  },
  {
    type: 'scriptstatus',
    label: 'Skript-Status',        shortLabel: 'Skripte',
    Icon: ScrollText,              iconName: 'ScrollText', color: '#22c55e',
    defaultW: 10,                  defaultH: 8,
    addMode: 'free',               widgetGroup: 'special',
    mock: { t: 'Skript-Status', v: '' },
    hint: 'Liste aller JavaScript-Skripte mit Status, Filter (laufend/gestoppt) und optionalen Start-/Stopp-Aktionen',
  },
  {
    type: 'input',
    label: 'Eingabefeld',          shortLabel: 'Eingabe',
    Icon: TextCursorInput,         iconName: 'TextCursorInput', color: '#0ea5e9',
    defaultW: 10,                  defaultH: 3,
    addMode: 'datapoint',          widgetGroup: 'control',
    mock: { t: 'Eingabe', v: 'Text…' },
    hint: 'Text per Tastatur eingeben und in einen Datenpunkt schreiben (live oder nach Bestätigung)',
  },
  // Carousel widget disabled — not yet ready for production use.
  // Re-enable by uncommenting; all supporting code (widgetMap, types, i18n,
  // option editor, persistence) is still in place.
  // {
  //   type: 'carousel',
  //   label: 'Karussell',            shortLabel: 'Karussell',
  //   Icon: GalleryHorizontal,       iconName: 'GalleryHorizontal', color: '#ec4899',
  //   defaultW: 12,                  defaultH: 6,
  //   addMode: 'free',               widgetGroup: 'layout',
  //   mock: { t: 'Karussell', v: '' },
  //   hint: 'Mehrere Widgets als swipebare Slides – Wischen, Pagination-Dots und Pfeil-Buttons',
  // },
];

/** Fast lookup by type */
export const WIDGET_BY_TYPE = Object.fromEntries(
  WIDGET_REGISTRY.map((m) => [m.type, m]),
) as Record<WidgetType, WidgetMeta>;

/** All {{key}} placeholder names available in popup views (union of all popupDefaults keys + dp) */
export const ALL_POPUP_PLACEHOLDER_KEYS: string[] = (() => {
  const keys = new Set<string>(['dp']);
  WIDGET_REGISTRY.forEach((m) => Object.keys(m.popupDefaults ?? {}).forEach((k) => keys.add(k)));
  return [...keys].sort();
})();

/**
 * Returns the effective default size for a widget type.
 * Checks user overrides first, falls back to registry defaults.
 */
export function getEffectiveSize(
  type: string,
  overrides: Record<string, { w: number; h: number }>,
): { w: number; h: number } {
  if (overrides[type]) return overrides[type];
  const meta = WIDGET_BY_TYPE[type as WidgetType];
  return meta ? { w: meta.defaultW, h: meta.defaultH } : { w: 2, h: 2 };
}
