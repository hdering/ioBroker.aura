import type { WidgetLayout } from '../types';

const NO_CUSTOM = new Set([
    'iframe',
    'jsontable',
    'html',
    'trash',
    'trashSchedule',
    'header',
    'fill',
    'list',
    'autolist',
    'datepicker',
    'adapterstatus',
    'scriptstatus',
    'adapterlogs',
    'alarm',
]);

export function getAvailableLayouts(widgetType: string): WidgetLayout[] {
    switch (widgetType) {
        case 'universal':
            return ['custom'];
        case 'input':
            return ['default', 'custom'];
        case 'knob':
            return ['default', 'knob-scale', 'knob-endless', 'custom'];
        case 'camera':
            return ['minimal', 'default', 'custom'];
        case 'fill':
            return ['default', 'battery'];
        case 'gauge':
        case 'climate':
        case 'echartsPreset':
        case 'chips':
        case 'group':
        case 'carousel':
        case 'panels':
        case 'trash':
        case 'trashSchedule':
        case 'adapterstatus':
        case 'scriptstatus':
        case 'adapterlogs':
        case 'alarm':
        case 'map':
            return ['default'];
        case 'statusoverview':
            return ['default', 'compact', 'count'];
        case 'chart':
            return ['default', 'card'];
        case 'mediaplayer':
            return ['default', 'compact', 'custom'];
        case 'httpRequest':
        case 'button':
            return ['default', 'compact', 'minimal', 'custom'];
        case 'slider':
            return ['default', 'custom'];
        case 'enum':
            return ['default', 'compact', 'minimal', 'card', 'custom'];
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
