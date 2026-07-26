// ─────────────────────────────────────────────────────────────────────────────
// Climate / air-conditioner manufacturer profiles for the `aircontrol` widget.
//
// A profile maps the widget's logical fields (power, targetTemp, mode …) to the
// device-root-relative datapoint paths of a concrete ioBroker adapter. Once the
// user picks a profile and a concrete device root, `buildDpMap()` produces the
// `config.options.<optionKey>Dp` values automatically.
//
// Adding a new manufacturer = adding one CLIMATE_PROFILES entry (pure data).
// Field option keys and value types are shared across all profiles via
// CLIMATE_FIELDS, so the widget and config panel stay in sync.
// ─────────────────────────────────────────────────────────────────────────────

export type ClimateFieldKey =
    | 'power'
    | 'currentTemp'
    | 'targetTemp'
    | 'mode'
    | 'fanSpeed'
    | 'verticalVane'
    | 'horizontalVane'
    | 'eco'
    | 'online'
    | 'error'
    | 'powerConsumption'
    | 'outsideTemp';

export interface ClimateFieldMeta {
    key: ClimateFieldKey;
    /** Key under `config.options` that stores the datapoint id (always `<key>` + 'Dp'-style). */
    optionKey: string;
    /** Grouping in the config panel + widget rendering. */
    group: 'control' | 'info';
    /** Expected value type — used for DatapointPicker filtering. */
    valueType: 'boolean' | 'number';
}

// Single source of truth for the 12 logical fields.
export const CLIMATE_FIELDS: ClimateFieldMeta[] = [
    { key: 'power', optionKey: 'powerDp', group: 'control', valueType: 'boolean' },
    { key: 'currentTemp', optionKey: 'currentTempDp', group: 'info', valueType: 'number' },
    { key: 'targetTemp', optionKey: 'targetTempDp', group: 'control', valueType: 'number' },
    { key: 'mode', optionKey: 'modeDp', group: 'control', valueType: 'number' },
    { key: 'fanSpeed', optionKey: 'fanSpeedDp', group: 'control', valueType: 'number' },
    { key: 'verticalVane', optionKey: 'vaneVDp', group: 'control', valueType: 'number' },
    { key: 'horizontalVane', optionKey: 'vaneHDp', group: 'control', valueType: 'number' },
    { key: 'eco', optionKey: 'ecoDp', group: 'control', valueType: 'boolean' },
    { key: 'online', optionKey: 'onlineDp', group: 'info', valueType: 'boolean' },
    { key: 'error', optionKey: 'errorDp', group: 'info', valueType: 'boolean' },
    { key: 'powerConsumption', optionKey: 'consumptionDp', group: 'info', valueType: 'number' },
    { key: 'outsideTemp', optionKey: 'outsideTempDp', group: 'info', valueType: 'number' },
];

export const FIELD_BY_KEY: Record<ClimateFieldKey, ClimateFieldMeta> = Object.fromEntries(
    CLIMATE_FIELDS.map((f) => [f.key, f]),
) as Record<ClimateFieldKey, ClimateFieldMeta>;

export interface ClimateEnumEntry {
    value: number;
    /** i18n suffix, resolved as `aircontrol.mode.<labelKey>` / `aircontrol.fan.<labelKey>`. */
    labelKey: string;
}

export interface ClimateProfile {
    /** Stable id, e.g. the adapter name. */
    id: string;
    /** Human label shown in the manufacturer dropdown. */
    label: string;
    /** ioBroker adapter prefix used for device discovery, e.g. 'mitsubishi-local-control'. */
    adapter: string;
    /** Device-root-relative datapoint paths per logical field. */
    relPaths: Partial<Record<ClimateFieldKey, string>>;
    /** Fields that must resolve to an existing state for a device root to be offered. */
    requiredFields: ClimateFieldKey[];
    tempRange: { min: number; max: number; step: number };
    /** Fallback operation-mode enum (used when the DP has no common.states). */
    modes: ClimateEnumEntry[];
    /** Fallback fan-speed enum (used when the DP has no common.states). */
    fanSpeeds: ClimateEnumEntry[];
}

/** Sentinel id for "no profile" — user fills every datapoint manually. */
export const CUSTOM_PROFILE_ID = 'custom';

export const CLIMATE_PROFILES: ClimateProfile[] = [
    {
        id: 'mitsubishi-local-control',
        label: 'Mitsubishi (mitsubishi-local-control)',
        adapter: 'mitsubishi-local-control',
        relPaths: {
            power: 'control.power',
            currentTemp: 'info.insideTemperature1Fine',
            targetTemp: 'control.targetTemperature',
            mode: 'control.operationMode',
            fanSpeed: 'control.fanSpeed',
            verticalVane: 'control.vaneVerticalDirection',
            horizontalVane: 'control.vaneHorizontalDirection',
            eco: 'control.powerSaving',
            online: 'info.deviceOnline',
            error: 'info.hasError',
            powerConsumption: 'info.powerConsumed',
            outsideTemp: 'info.outsideTemperature',
        },
        requiredFields: ['power', 'targetTemp', 'currentTemp', 'mode'],
        tempRange: { min: 16, max: 31, step: 1 },
        modes: [
            { value: 0, labelKey: 'auto' },
            { value: 1, labelKey: 'heat' },
            { value: 2, labelKey: 'dry' },
            { value: 3, labelKey: 'cool' },
            { value: 7, labelKey: 'vent' },
        ],
        fanSpeeds: [
            { value: 0, labelKey: 'auto' },
            { value: 1, labelKey: 'lowest' },
            { value: 2, labelKey: 'low' },
            { value: 3, labelKey: 'medium' },
            { value: 5, labelKey: 'high' },
            { value: 6, labelKey: 'max' },
        ],
    },
];

export function getProfile(id: string | undefined): ClimateProfile | undefined {
    if (!id || id === CUSTOM_PROFILE_ID) return undefined;
    return CLIMATE_PROFILES.find((p) => p.id === id);
}

/**
 * Builds the `config.options` datapoint map for a concrete device root, e.g.
 * root `mitsubishi-local-control.0.devices.e8c7cf294cb3` →
 * `{ powerDp: 'mitsubishi-local-control.0.devices.e8c7cf294cb3.control.power', … }`.
 */
export function buildDpMap(profile: ClimateProfile, deviceRoot: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, rel] of Object.entries(profile.relPaths)) {
        if (!rel) continue;
        const meta = FIELD_BY_KEY[key as ClimateFieldKey];
        if (meta) out[meta.optionKey] = `${deviceRoot}.${rel}`;
    }
    return out;
}
