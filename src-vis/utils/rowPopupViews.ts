/**
 * Built-in popups for list rows set to "automatic" (#925), one per widget type a row
 * is recognised as. They live in data/builtinPopups/row-*.json and are seeded into
 * every installation (ALWAYS_SEEDED_VIEW_IDS) so they show up under Admin › Popups,
 * where they can be edited, deleted and restored like any other view.
 *
 * Row-level only: a list row on 'auto' opens them when the admin assigned no view to
 * that widget type. Widgets on the dashboard never pick them up - unlike the retired
 * BUILTIN_TYPE_DEFAULTS, which handed every widget of a type a popup.
 *
 * A module of its own because both popupConfigStore and utils/rowClickAction need it,
 * and the store cannot import rowClickAction without closing a module cycle.
 */
export const ROW_TYPE_VIEW_IDS: Readonly<Record<string, string>> = {
    light: 'pv-builtin-row-light',
    switch: 'pv-builtin-row-switch',
    dimmer: 'pv-builtin-row-dimmer',
    shutter: 'pv-builtin-row-shutter',
    thermostat: 'pv-builtin-row-thermostat',
    windowcontact: 'pv-builtin-row-windowcontact',
    binarysensor: 'pv-builtin-row-binarysensor',
    value: 'pv-builtin-row-value',
};
