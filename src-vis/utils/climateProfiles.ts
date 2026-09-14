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
//
// Some adapters keep one set of datapoints PER operation mode (Daikin: the
// setpoint of "cooling" is a different state than the setpoint of "heating").
// Those paths carry the `{mode}` placeholder and are resolved at runtime from
// the current value of the operation-mode datapoint — see `applyModeSlug()`.
// ─────────────────────────────────────────────────────────────────────────────

export type ClimateFieldKey =
    | 'power'
    | 'currentTemp'
    | 'targetTemp'
    | 'mode'
    | 'fanSpeed'
    | 'fanSpeedFixed'
    | 'verticalVane'
    | 'horizontalVane'
    | 'eco'
    | 'boost'
    | 'online'
    | 'error'
    | 'powerConsumption'
    | 'humidity'
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

// Single source of truth for the logical fields.
export const CLIMATE_FIELDS: ClimateFieldMeta[] = [
    { key: 'power', optionKey: 'powerDp', group: 'control', valueType: 'boolean' },
    { key: 'currentTemp', optionKey: 'currentTempDp', group: 'info', valueType: 'number' },
    { key: 'targetTemp', optionKey: 'targetTempDp', group: 'control', valueType: 'number' },
    { key: 'mode', optionKey: 'modeDp', group: 'control', valueType: 'number' },
    { key: 'fanSpeed', optionKey: 'fanSpeedDp', group: 'control', valueType: 'number' },
    { key: 'fanSpeedFixed', optionKey: 'fanSpeedFixedDp', group: 'control', valueType: 'number' },
    { key: 'verticalVane', optionKey: 'vaneVDp', group: 'control', valueType: 'number' },
    { key: 'horizontalVane', optionKey: 'vaneHDp', group: 'control', valueType: 'number' },
    { key: 'eco', optionKey: 'ecoDp', group: 'control', valueType: 'boolean' },
    { key: 'boost', optionKey: 'boostDp', group: 'control', valueType: 'boolean' },
    { key: 'online', optionKey: 'onlineDp', group: 'info', valueType: 'boolean' },
    { key: 'error', optionKey: 'errorDp', group: 'info', valueType: 'boolean' },
    { key: 'powerConsumption', optionKey: 'consumptionDp', group: 'info', valueType: 'number' },
    { key: 'humidity', optionKey: 'humidityDp', group: 'info', valueType: 'number' },
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
    /**
     * Regex source for the part BEHIND the adapter name that isolates one device
     * root during discovery. Defaults to `.<instance>.devices.<id>`.
     */
    deviceRootPattern?: string;
    /** Device-root-relative datapoint paths per logical field. May contain `{mode}`. */
    relPaths: Partial<Record<ClimateFieldKey, string>>;
    /** Fields that must resolve to an existing state for a device root to be offered. */
    requiredFields: ClimateFieldKey[];
    tempRange: { min: number; max: number; step: number };
    /**
     * true = the temperature limits belong to the resolved setpoint datapoint
     * (they differ per operation mode), so the config panel must not freeze
     * `tempRange` into the widget options.
     */
    tempRangeFromDatapoint?: boolean;
    /**
     * Fallback slug per operation-mode value, used to fill `{mode}` when the mode
     * datapoint carries no `common.states` (the live states always win).
     */
    modeSlugs?: Record<number, string>;
    /** Fallback operation-mode enum (used when the DP has no common.states). */
    modes: ClimateEnumEntry[];
    /** Fallback fan-speed enum (used when the DP has no common.states). */
    fanSpeeds: ClimateEnumEntry[];
}

/** Sentinel id for "no profile" — user fills every datapoint manually. */
export const CUSTOM_PROFILE_ID = 'custom';

/** Placeholder inside a `relPaths` entry that stands for the current operation mode. */
export const MODE_PLACEHOLDER = '{mode}';

/** Device root shape of the majority of adapters: `<adapter>.<instance>.devices.<id>`. */
export const DEFAULT_DEVICE_ROOT_PATTERN = '\\.\\d+\\.devices\\.[^.]+';

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
    {
        // Every device sits directly under the instance, keyed by its cloud id:
        // `daikin-cloud.0.<deviceId>.climateControl.…`. Setpoint, fan speed and
        // both vanes exist once PER operation mode, hence the `{mode}` paths.
        id: 'daikin-cloud',
        label: 'Daikin (daikin-cloud)',
        adapter: 'daikin-cloud',
        deviceRootPattern: '\\.\\d+\\.[^.]+',
        relPaths: {
            power: 'climateControl.onOffMode',
            currentTemp: 'climateControl.sensoryData.roomTemperature',
            targetTemp: 'climateControl.temperatureControl.operationModes.{mode}.setpoints.roomTemperature',
            mode: 'climateControl.operationMode',
            fanSpeed: 'climateControl.fanControl.operationModes.{mode}.fanSpeed.currentMode',
            fanSpeedFixed: 'climateControl.fanControl.operationModes.{mode}.fanSpeed.modes.fixed',
            verticalVane: 'climateControl.fanControl.operationModes.{mode}.fanDirection.vertical.currentMode',
            horizontalVane: 'climateControl.fanControl.operationModes.{mode}.fanDirection.horizontal.currentMode',
            boost: 'climateControl.powerfulMode',
            online: 'cloudConnected',
            error: 'climateControl.isInErrorState',
            humidity: 'climateControl.sensoryData.roomHumidity',
            outsideTemp: 'climateControl.sensoryData.outdoorTemperature',
        },
        // The setpoint is mode-dependent and simply absent in "dry" / "fanOnly",
        // so it can never be a discovery criterion.
        requiredFields: ['power', 'mode', 'currentTemp'],
        tempRange: { min: 10, max: 32, step: 0.5 },
        tempRangeFromDatapoint: true,
        modeSlugs: { 0: 'fanOnly', 1: 'heating', 2: 'cooling', 3: 'auto', 4: 'dry' },
        modes: [
            { value: 0, labelKey: 'vent' },
            { value: 1, labelKey: 'heat' },
            { value: 2, labelKey: 'cool' },
            { value: 3, labelKey: 'auto' },
            { value: 4, labelKey: 'dry' },
        ],
        fanSpeeds: [
            { value: 0, labelKey: 'auto' },
            { value: 1, labelKey: 'quiet' },
            { value: 2, labelKey: 'fixed' },
        ],
    },
];

// ── raw state names → i18n suffix ───────────────────────────────────────────
// Adapters write their raw protocol names into `common.states` ("fanOnly",
// "windNice"). Those are the labels the selector would show; where a
// translation exists, it wins. Keys are lower-cased.

export const MODE_LABEL_KEYS: Record<string, string> = {
    auto: 'auto',
    automatic: 'auto',
    heat: 'heat',
    heating: 'heat',
    cool: 'cool',
    cooling: 'cool',
    dry: 'dry',
    dehumidify: 'dry',
    fan: 'vent',
    fanonly: 'vent',
    fan_only: 'vent',
    ventilation: 'vent',
    off: 'off',
};

export const FAN_LABEL_KEYS: Record<string, string> = {
    auto: 'auto',
    quiet: 'quiet',
    silent: 'quiet',
    fixed: 'fixed',
    lowest: 'lowest',
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'max',
};

export const VANE_LABEL_KEYS: Record<string, string> = {
    stop: 'stop',
    swing: 'swing',
    windnice: 'windNice',
    floorheatingairflow: 'floorHeating',
};

const LABEL_KEYS: Record<'mode' | 'fan' | 'vane', Record<string, string>> = {
    mode: MODE_LABEL_KEYS,
    fan: FAN_LABEL_KEYS,
    vane: VANE_LABEL_KEYS,
};

/**
 * i18n key for a raw `common.states` label, or null when the name is unknown
 * and has to be shown as the adapter wrote it.
 */
export function stateLabelKey(kind: 'mode' | 'fan' | 'vane', raw: string): string | null {
    const suffix = LABEL_KEYS[kind][raw.trim().toLowerCase()];
    return suffix ? `aircontrol.${kind}.${suffix}` : null;
}

// ── mode-dependent datapoints ───────────────────────────────────────────────

/** true when the path is only usable once the current operation mode is known. */
export function isModePath(path: string | undefined): boolean {
    return !!path && path.includes(MODE_PLACEHOLDER);
}

/**
 * Fills `{mode}` with the slug of the active operation mode. An unresolved
 * placeholder yields '' — the caller then has no datapoint, which is exactly
 * right for modes that do not own the field (Daikin "dry" has no setpoint).
 */
export function applyModeSlug(dp: string | undefined, slug: string | null | undefined): string {
    if (!dp) return '';
    if (!dp.includes(MODE_PLACEHOLDER)) return dp;
    if (!slug) return '';
    return dp.split(MODE_PLACEHOLDER).join(slug);
}

/**
 * Slug that fills `{mode}` for the given mode value: the adapter's own state
 * name if it published one, else the profile fallback. The state names ARE the
 * path segments (`operationMode` 2 = "cooling" → `operationModes.cooling.…`).
 */
export function modeSlugFor(
    value: number | null,
    liveStates: Record<string, string> | null | undefined,
    profile: ClimateProfile | undefined,
): string | null {
    if (value === null || !Number.isFinite(value)) return null;
    const live = liveStates?.[String(value)];
    if (typeof live === 'string' && live.trim()) return live.trim();
    return profile?.modeSlugs?.[value] ?? null;
}

// ── discovery ───────────────────────────────────────────────────────────────

/** Regex that captures the device root of a state id belonging to this profile. */
export function deviceRootRegex(profile: ClimateProfile): RegExp {
    const adapter = profile.adapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^(${adapter}${profile.deviceRootPattern ?? DEFAULT_DEVICE_ROOT_PATTERN})\\.`);
}

/**
 * Required state ids for a candidate root. Mode-dependent fields are left out:
 * their id is not known before the device reports its current mode.
 */
export function requiredStateIds(profile: ClimateProfile, root: string): string[] {
    const out: string[] = [];
    for (const f of profile.requiredFields) {
        const rel = profile.relPaths[f];
        if (rel && !isModePath(rel)) out.push(`${root}.${rel}`);
    }
    return out;
}

export function getProfile(id: string | undefined): ClimateProfile | undefined {
    if (!id || id === CUSTOM_PROFILE_ID) return undefined;
    return CLIMATE_PROFILES.find((p) => p.id === id);
}

/**
 * Builds the `config.options` datapoint map for a concrete device root, e.g.
 * root `mitsubishi-local-control.0.devices.e8c7cf294cb3` →
 * `{ powerDp: 'mitsubishi-local-control.0.devices.e8c7cf294cb3.control.power', … }`.
 * `{mode}` stays in the id; the widget substitutes it live.
 *
 * Fields the profile does not know are set to `undefined` on purpose: spreading
 * the result over the existing options clears whatever an earlier profile left
 * behind instead of pointing the new device at a foreign adapter's datapoint.
 */
export function buildDpMap(profile: ClimateProfile, deviceRoot: string): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const meta of CLIMATE_FIELDS) {
        const rel = profile.relPaths[meta.key];
        out[meta.optionKey] = rel ? `${deviceRoot}.${rel}` : undefined;
    }
    return out;
}
