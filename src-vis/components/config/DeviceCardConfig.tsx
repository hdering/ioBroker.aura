import { useState } from 'react';
import { Database, Plus, Unlink, X } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';
import { dpVarMap } from '../../utils/popupPlaceholders';
import {
    detachDeviceCard,
    deviceCardColor,
    deviceCardExtraDpsRaw,
    extraDpKeyProblem,
    extraDpVarMap,
    prefixVars,
    type DeviceCardExtraDp,
    type ExtraDpKeyProblem,
} from '../../utils/deviceCard';
import { useDeviceCardShareCount, useDeviceCardSiblingExtraKeys } from '../../hooks/useDeviceCardShareCount';
import { useDpNameVars, useDpNameVarsList } from '../../hooks/useDpNameVars';
import { useT } from '../../i18n';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintStyle: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.8 };

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

/**
 * Settings of the "Gerätekarte" (#743): the card's datapoint, what the placeholders
 * resolve to with it, and — when other cards share this layout — how many, plus the
 * way out for a card that has to differ ("Als eigene Karte abspalten").
 */
export function DeviceCardConfig({ config, onConfigChange }: Props) {
    const t = useT();
    // 'main' = the card's own datapoint, a number = that row of the further datapoints.
    const [picker, setPicker] = useState<'main' | number | null>(null);
    const [confirmDetach, setConfirmDetach] = useState(false);
    const dp = config.datapoint ?? '';
    const tokens = Object.entries({ ...dpVarMap(dp.trim()), ...useDpNameVars(dp.trim()) });
    const defId = config.options?.defId as string | undefined;
    const shareCount = useDeviceCardShareCount(defId);

    // Further datapoints (#1007): the card's own rows, then the short names that
    // linked cards use and this one still lacks - empty, ready to be filled in.
    const raw = deviceCardExtraDpsRaw(config);
    const siblingKeys = useDeviceCardSiblingExtraKeys(defId);
    const rows: (DeviceCardExtraDp & { index: number })[] = [
        ...raw.map((e, index) => ({ ...e, index })),
        ...siblingKeys.filter((k) => !raw.some((e) => e.key.trim() === k)).map((key) => ({ key, dp: '', index: -1 })),
    ];
    const problems: (ExtraDpKeyProblem | null)[] = [];
    {
        const seen: string[] = [];
        for (const r of rows) {
            const key = r.key.trim();
            problems.push(key ? extraDpKeyProblem(key, seen) : null);
            seen.push(key);
        }
    }
    const extraNames = useDpNameVarsList(rows.map((r) => r.dp.trim()).filter(Boolean), '{{dpname}}');
    const writeExtras = (next: DeviceCardExtraDp[]) => {
        const { extraDps: _drop, ...rest } = config.options ?? {};
        onConfigChange({ ...config, options: next.length ? { ...rest, extraDps: next } : rest });
    };
    const setRow = (pos: number, patch: Partial<DeviceCardExtraDp>) => {
        const row = rows[pos];
        if (row.index >= 0) writeExtras(raw.map((e, i) => (i === row.index ? { ...e, ...patch } : e)));
        else writeExtras([...raw, { key: row.key, dp: row.dp, ...patch }]);
    };

    return (
        <div className="space-y-3" data-aura-devicecard-config="">
            <div>
                <label className={labelCls} style={labelStyle}>
                    {t('devicecard.dp')}
                </label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={dp}
                        onChange={(e) => onConfigChange({ ...config, datapoint: e.target.value })}
                        placeholder="hm-rpc.0.ABC123.1.ACTUAL_TEMPERATURE"
                        className={inputCls}
                        style={inputStyle}
                        data-aura-devicecard-dp=""
                    />
                    <button
                        type="button"
                        onClick={() => setPicker('main')}
                        className="px-2 rounded-lg shrink-0"
                        style={{ ...inputStyle, color: 'var(--accent)' }}
                        title={t('devicecard.pickDp')}
                    >
                        <Database size={14} />
                    </button>
                </div>
                <p className="text-[10px] mt-1" style={hintStyle}>
                    {t('devicecard.dpHint')}
                </p>
            </div>

            {tokens.length > 0 && (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('devicecard.tokens')}
                    </label>
                    <table className="w-full text-[11px] font-mono" data-aura-devicecard-tokens="">
                        <tbody>
                            {tokens.map(([key, value]) => (
                                <tr key={key}>
                                    <td className="pr-2 py-0.5 whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                                        {`{{${key}}}`}
                                    </td>
                                    <td className="py-0.5 break-all" style={{ color: 'var(--text-primary)' }}>
                                        {value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div data-aura-devicecard-extras="">
                <label className={labelCls} style={labelStyle}>
                    {t('devicecard.extraDps')}
                </label>
                <div className="space-y-1.5">
                    {rows.map((row, pos) => {
                        const problem = problems[pos];
                        const key = row.key.trim();
                        const rowTokens =
                            key && !problem && row.dp.trim()
                                ? Object.entries({
                                      ...extraDpVarMap(key, row.dp.trim()),
                                      ...prefixVars(key, extraNames[row.dp.trim()] ?? {}),
                                  })
                                : [];
                        return (
                            <div key={`${row.index}:${pos}`} data-aura-devicecard-extra={key}>
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        value={row.key}
                                        onChange={(e) => setRow(pos, { key: e.target.value })}
                                        placeholder={t('devicecard.extraKey')}
                                        className={inputCls}
                                        style={{
                                            ...inputStyle,
                                            width: '7rem',
                                            flex: 'none',
                                            ...(problem ? { borderColor: '#ef4444' } : {}),
                                        }}
                                        data-aura-devicecard-extra-key=""
                                    />
                                    <input
                                        type="text"
                                        value={row.dp}
                                        onChange={(e) => setRow(pos, { dp: e.target.value })}
                                        placeholder="hm-rpc.0.XYZ789.1.TEMPERATURE"
                                        className={inputCls}
                                        style={inputStyle}
                                        data-aura-devicecard-extra-dp=""
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setPicker(pos)}
                                        className="px-2 rounded-lg shrink-0"
                                        style={{ ...inputStyle, color: 'var(--accent)' }}
                                        title={t('devicecard.pickDp')}
                                    >
                                        <Database size={14} />
                                    </button>
                                    {row.index >= 0 && (
                                        <button
                                            type="button"
                                            onClick={() => writeExtras(raw.filter((_, i) => i !== row.index))}
                                            className="px-2 rounded-lg shrink-0"
                                            style={{ ...inputStyle, color: 'var(--text-secondary)' }}
                                            title={t('devicecard.extraRemove')}
                                            data-aura-devicecard-extra-remove=""
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                {problem && (
                                    <p className="text-[10px] mt-0.5" style={{ color: '#ef4444' }}>
                                        {t(`devicecard.extraKey.${problem}`)}
                                    </p>
                                )}
                                {row.index < 0 && (
                                    <p className="text-[10px] mt-0.5" style={hintStyle}>
                                        {t('devicecard.extraFromLinked')}
                                    </p>
                                )}
                                {rowTokens.length > 0 && (
                                    <table
                                        className="w-full text-[11px] font-mono mt-1"
                                        data-aura-devicecard-extra-tokens=""
                                    >
                                        <tbody>
                                            {rowTokens.map(([token, value]) => (
                                                <tr key={token}>
                                                    <td
                                                        className="pr-2 py-0.5 whitespace-nowrap"
                                                        style={{ color: 'var(--accent)' }}
                                                    >
                                                        {`{{${token}}}`}
                                                    </td>
                                                    <td
                                                        className="py-0.5 break-all"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    >
                                                        {value}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={() => writeExtras([...raw, { key: '', dp: '' }])}
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md mt-1.5"
                    style={{ ...inputStyle, color: 'var(--accent)' }}
                    data-aura-devicecard-extra-add=""
                >
                    <Plus size={12} />
                    {t('devicecard.extraAdd')}
                </button>
                <p className="text-[10px] mt-1" style={hintStyle}>
                    {t('devicecard.extraHint')}
                </p>
            </div>

            <p className="text-[10px]" style={hintStyle}>
                {t('devicecard.childHint')}
            </p>

            <div
                className="rounded-lg px-2.5 py-2 space-y-2"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            >
                <p
                    className="text-[11px] flex items-center gap-1.5"
                    style={{ color: 'var(--text-primary)' }}
                    data-aura-devicecard-share=""
                >
                    {shareCount > 1 && (
                        <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: deviceCardColor(config.options?.defId as string | undefined) }}
                        />
                    )}
                    {shareCount > 2
                        ? t('devicecard.sharedWith', { count: shareCount - 1 })
                        : shareCount === 2
                          ? t('devicecard.sharedWithOne')
                          : t('devicecard.notShared')}
                </p>
                {shareCount > 1 && (
                    <p className="text-[10px]" style={hintStyle}>
                        {t('devicecard.colorHint')}
                    </p>
                )}
                <p className="text-[10px]" style={hintStyle}>
                    {t('devicecard.copyHint')}
                </p>
                {shareCount > 1 &&
                    (confirmDetach ? (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] flex-1" style={{ color: 'var(--text-primary)' }}>
                                {t('devicecard.detachConfirm')}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmDetach(false);
                                    onConfigChange(detachDeviceCard(config));
                                }}
                                className="text-[11px] px-2 py-1 rounded-md"
                                style={{ background: 'var(--accent)', color: '#fff' }}
                                data-aura-devicecard-detach-ok=""
                            >
                                {t('devicecard.detach')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDetach(false)}
                                className="text-[11px] px-2 py-1 rounded-md"
                                style={inputStyle}
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmDetach(true)}
                            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
                            style={{ ...inputStyle, color: 'var(--accent)' }}
                            data-aura-devicecard-detach=""
                        >
                            <Unlink size={12} />
                            {t('devicecard.detach')}
                        </button>
                    ))}
            </div>

            {picker !== null && (
                <DatapointPicker
                    currentValue={picker === 'main' ? dp : (rows[picker]?.dp ?? '')}
                    onSelect={(id) => {
                        if (picker === 'main') onConfigChange({ ...config, datapoint: id });
                        else if (rows[picker]) setRow(picker, { dp: id });
                        setPicker(null);
                    }}
                    onClose={() => setPicker(null)}
                />
            )}
        </div>
    );
}
