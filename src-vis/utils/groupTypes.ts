import type { WidgetConfig } from '../types';

/**
 * Widget types drawn by GroupWidget: the group itself and the device card (#743),
 * which is a group whose children resolve `{{dp}}` against the card's datapoint and
 * whose children are shared by every copy of the card. Everything that treats a
 * group's frame, header, height or editor specially asks this.
 */
export function isGroupType(type: string | undefined): boolean {
    return type === 'group' || type === 'devicecard';
}

/** Types whose children live in the groupDefsStore under `options.defId`. */
export const DEF_HOST_TYPES: ReadonlySet<string> = new Set(['group', 'panels', 'devicecard']);

/** The widget keeps its children under a group def (`options.defId`). */
export function hostsGroupDef<T extends Pick<WidgetConfig, 'type' | 'options'>>(
    w: T | undefined,
): w is T & { options: NonNullable<T['options']> & { defId: string } } {
    return !!w && DEF_HOST_TYPES.has(w.type) && typeof w.options?.defId === 'string' && !!w.options.defId;
}
