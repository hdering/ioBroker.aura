import type { WidgetLayout } from '../types';

const NO_CUSTOM = new Set([
  'iframe', 'jsontable', 'html', 'trash', 'trashSchedule', 'header', 'fill', 'list', 'autolist', 'datepicker',
]);

export function getAvailableLayouts(widgetType: string): WidgetLayout[] {
  switch (widgetType) {
    case 'camera':
      return ['minimal', 'default', 'custom'];
    case 'fill':
      return ['default', 'battery'];
    case 'gauge':
    case 'climate':
    case 'echartsPreset':
    case 'chips':
    case 'group':
    case 'trash':
    case 'trashSchedule':
      return ['default'];
    case 'chart':
      return ['default', 'card'];
    case 'mediaplayer':
      return ['default', 'compact', 'custom'];
    case 'httpRequest':
    case 'button':
      return ['default', 'compact', 'minimal', 'custom'];
    case 'slider':
      return ['default', 'custom'];
    case 'evcc':
      return ['default', 'compact', 'flow', 'battery', 'production', 'consumption', 'loadpoints', 'custom'];
    default: {
      const base: WidgetLayout[] = ['default', 'card', 'compact', 'minimal'];
      if (widgetType === 'calendar') base.push('agenda');
      if (widgetType === 'autolist') base.push('count');
      if (!NO_CUSTOM.has(widgetType)) base.push('custom');
      return base;
    }
  }
}
