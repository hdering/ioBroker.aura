import { useState } from 'react';
import { Database, Unlink } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { DatapointPicker } from './DatapointPicker';
import { dpVarMap } from '../../utils/popupPlaceholders';
import { detachDeviceCard, deviceCardColor } from '../../utils/deviceCard';
import { useDeviceCardShareCount } from '../../hooks/useDeviceCardShareCount';
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
    const [picker, setPicker] = useState(false);
    const [confirmDetach, setConfirmDetach] = useState(false);
    const dp = config.datapoint ?? '';
    const tokens = Object.entries(dpVarMap(dp.trim()));
    const shareCount = useDeviceCardShareCount(config.options?.defId as string | undefined);

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
                        onClick={() => setPicker(true)}
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

            {picker && (
                <DatapointPicker
                    currentValue={dp}
                    onSelect={(id) => {
                        onConfigChange({ ...config, datapoint: id });
                        setPicker(false);
                    }}
                    onClose={() => setPicker(false)}
                />
            )}
        </div>
    );
}
