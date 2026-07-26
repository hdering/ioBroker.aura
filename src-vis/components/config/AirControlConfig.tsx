import { useEffect, useState } from 'react';
import { Database, RefreshCw, ExternalLink } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { useT } from '../../i18n';
import { getObjectViewDirect, getObjectDirect } from '../../hooks/useIoBroker';
import { DatapointPicker } from './DatapointPicker';
import {
    CLIMATE_FIELDS,
    CLIMATE_PROFILES,
    CUSTOM_PROFILE_ID,
    buildDpMap,
    getProfile,
    type ClimateFieldKey,
} from '../../utils/climateProfiles';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const sectionTitleCls = 'text-[11px] font-semibold uppercase tracking-wide mt-3 mb-1';

const GITHUB_ISSUE_URL = 'https://github.com/hdering/ioBroker.aura/issues/new';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

interface DiscoveredDevice {
    root: string;
    name: string;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveName(name: unknown, fallback: string): string {
    if (typeof name === 'string' && name.trim()) return name;
    if (name && typeof name === 'object') {
        const rec = name as Record<string, string>;
        return rec.en || rec.de || Object.values(rec)[0] || fallback;
    }
    return fallback;
}

/**
 * Config panel for the `aircontrol` (Klimasteuerung) widget: pick a manufacturer
 * profile, auto-detect concrete devices and fill all datapoints, or edit each
 * datapoint manually. Hosts its own DatapointPicker instance.
 */
export function AirControlConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const deviceType = (o.deviceType as string | undefined) ?? CUSTOM_PROFILE_ID;
    const profile = getProfile(deviceType);

    const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [discovered, setDiscovered] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<string | null>(null);

    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    // ── device discovery ───────────────────────────────────────────────────────
    const discover = async () => {
        if (!profile) return;
        setLoading(true);
        try {
            const res = await getObjectViewDirect('state', `${profile.adapter}.`, `${profile.adapter}.香`);
            const ids = new Set(res.rows.map((r) => r.id));
            const rootRe = new RegExp(`^(${escapeRe(profile.adapter)}\\.\\d+\\.devices\\.[^.]+)\\.`);
            const roots = new Set<string>();
            for (const r of res.rows) {
                const m = r.id.match(rootRe);
                if (m) roots.add(m[1]);
            }
            const valid = [...roots].filter((root) =>
                profile.requiredFields.every((f) => {
                    const rel = profile.relPaths[f];
                    return rel ? ids.has(`${root}.${rel}`) : true;
                }),
            );
            const withNames = await Promise.all(
                valid.map(async (root) => {
                    const obj = await getObjectDirect(root).catch(() => null);
                    return { root, name: resolveName(obj?.common?.name, root.split('.').pop() ?? root) };
                }),
            );
            withNames.sort((a, b) => a.name.localeCompare(b.name, 'de'));
            setDevices(withNames);
            setDiscovered(true);
        } finally {
            setLoading(false);
        }
    };

    // Auto-discover when a real profile is selected.
    useEffect(() => {
        setDevices([]);
        setDiscovered(false);
        if (profile) discover();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceType]);

    const onSelectProfile = (id: string) => {
        const prof = getProfile(id);
        setO({
            deviceType: id,
            // Pre-fill temperature range from the profile (still editable below).
            ...(prof
                ? { tempMin: prof.tempRange.min, tempMax: prof.tempRange.max, tempStep: prof.tempRange.step }
                : {}),
        });
    };

    const applyDevice = (root: string) => {
        if (!profile || !root) return;
        onConfigChange({
            ...config,
            options: { ...o, deviceType, deviceRoot: root, ...buildDpMap(profile, root) },
        });
    };

    // ── datapoint field row ────────────────────────────────────────────────────
    const fieldRow = (key: ClimateFieldKey) => {
        const meta = CLIMATE_FIELDS.find((f) => f.key === key)!;
        const value = (o[meta.optionKey] as string) ?? '';
        return (
            <div key={key}>
                <label className={labelCls} style={labelStyle}>
                    {t(`aircontrol.field.${key}` as Parameters<typeof t>[0])}
                </label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => setO({ [meta.optionKey]: e.target.value || undefined })}
                        placeholder={profile?.relPaths[key] ? `…${profile.relPaths[key]}` : 'adapter.0.…'}
                        className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={inputStyle}
                    />
                    <button
                        onClick={() => setPickerTarget(meta.optionKey)}
                        className="text-xs px-2 py-1.5 rounded-lg shrink-0"
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                        title={t('aircontrol.pick')}
                    >
                        <Database size={12} />
                    </button>
                </div>
            </div>
        );
    };

    const controlFields = CLIMATE_FIELDS.filter((f) => f.group === 'control').map((f) => f.key);
    const infoFields = CLIMATE_FIELDS.filter((f) => f.group === 'info').map((f) => f.key);

    const toggle = (key: string, label: string) => {
        const checked = o[key] !== false;
        return (
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={checked} onChange={(e) => setO({ [key]: e.target.checked })} />
                {label}
            </label>
        );
    };

    return (
        <div className="space-y-1.5">
            {/* Manufacturer ── */}
            <label className={labelCls} style={labelStyle}>
                {t('aircontrol.manufacturer')}
            </label>
            <select
                className={inputCls}
                style={inputStyle}
                value={deviceType}
                onChange={(e) => onSelectProfile(e.target.value)}
            >
                {CLIMATE_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.label}
                    </option>
                ))}
                <option value={CUSTOM_PROFILE_ID}>{t('aircontrol.custom')}</option>
            </select>

            {/* Device discovery ── */}
            {profile && (
                <>
                    <label className={labelCls} style={{ ...labelStyle, marginTop: 8 }}>
                        {t('aircontrol.device')}
                    </label>
                    <div className="flex gap-1">
                        <select
                            className={inputCls}
                            style={inputStyle}
                            value={(o.deviceRoot as string) ?? ''}
                            onChange={(e) => applyDevice(e.target.value)}
                        >
                            <option value="">
                                {loading
                                    ? t('aircontrol.detecting')
                                    : devices.length === 0 && discovered
                                      ? t('aircontrol.noDevices')
                                      : t('aircontrol.chooseDevice')}
                            </option>
                            {devices.map((d) => (
                                <option key={d.root} value={d.root}>
                                    {d.name} · {d.root.split('.').pop()}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={discover}
                            disabled={loading}
                            className="text-xs px-2 py-1.5 rounded-lg shrink-0 disabled:opacity-40"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                            title={t('aircontrol.rescan')}
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </>
            )}

            {/* Datapoints — control ── */}
            <p className={sectionTitleCls} style={labelStyle}>
                {t('aircontrol.section.control')}
            </p>
            {controlFields.map(fieldRow)}

            {/* Datapoints — info ── */}
            <p className={sectionTitleCls} style={labelStyle}>
                {t('aircontrol.section.info')}
            </p>
            {infoFields.map(fieldRow)}

            {/* Display options ── */}
            <p className={sectionTitleCls} style={labelStyle}>
                {t('aircontrol.section.display')}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
                {toggle('showVanes', t('aircontrol.showVanes'))}
                {toggle('showEco', t('aircontrol.showEco'))}
                {toggle('showConsumption', t('aircontrol.showConsumption'))}
                {toggle('showOutside', t('aircontrol.showOutside'))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('aircontrol.tempMin')}
                    </label>
                    <input
                        type="number"
                        value={(o.tempMin as number) ?? profile?.tempRange.min ?? 16}
                        onChange={(e) => setO({ tempMin: Number(e.target.value) })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('aircontrol.tempMax')}
                    </label>
                    <input
                        type="number"
                        value={(o.tempMax as number) ?? profile?.tempRange.max ?? 31}
                        onChange={(e) => setO({ tempMax: Number(e.target.value) })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('aircontrol.tempStep')}
                    </label>
                    <input
                        type="number"
                        step="0.5"
                        value={(o.tempStep as number) ?? profile?.tempRange.step ?? 1}
                        onChange={(e) => setO({ tempStep: Number(e.target.value) })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            </div>

            {/* More manufacturers hint ── */}
            <div
                className="mt-3 rounded-lg p-2.5 text-[11px] leading-relaxed"
                style={{
                    background: 'var(--app-bg)',
                    border: '1px dashed var(--app-border)',
                    color: 'var(--text-secondary)',
                }}
            >
                {t('aircontrol.moreHint')}
                <a
                    href={GITHUB_ISSUE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 font-medium"
                    style={{ color: 'var(--accent)' }}
                >
                    <ExternalLink size={12} /> {t('aircontrol.suggestAdapter')}
                </a>
            </div>

            {/* Shared DatapointPicker ── */}
            {pickerTarget && (
                <DatapointPicker
                    currentValue={(o[pickerTarget] as string) ?? ''}
                    onSelect={(id) => {
                        setO({ [pickerTarget]: id });
                        setPickerTarget(null);
                    }}
                    onClose={() => setPickerTarget(null)}
                />
            )}
        </div>
    );
}
