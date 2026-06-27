import { Database } from 'lucide-react';
import { SANDBOX_PRESETS, type SandboxPreset } from '../../utils/iframeSandbox';

interface Props {
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
    onOpenPicker: () => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: value ? '18px' : '2px' }}
            />
        </button>
    );
}

export function HtmlConfig({ options: o, onChange, onOpenPicker }: Props) {
    const set = (patch: Record<string, unknown>) => onChange(patch);

    return (
        <>
            {/* Datenpunkt */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Datenpunkt (optional)
                </label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={(o.htmlDatapoint as string) ?? ''}
                        onChange={(e) => set({ htmlDatapoint: e.target.value || undefined })}
                        placeholder="z.B. javascript.0.myHtml"
                        className={`${iCls} flex-1 font-mono min-w-0`}
                        style={iSty}
                    />
                    <button
                        type="button"
                        onClick={onOpenPicker}
                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title="Aus ioBroker wählen"
                    >
                        <Database size={13} />
                    </button>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Wenn gesetzt, wird der DP-Wert als HTML angezeigt (überschreibt statisches HTML).
                </p>
            </div>

            {/* Static HTML */}
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Statisches HTML
                </label>
                <textarea
                    value={(o.htmlContent as string) ?? ''}
                    onChange={(e) => set({ htmlContent: e.target.value || undefined })}
                    placeholder="<b>Hallo</b> <span style='color:red'>Welt</span>"
                    rows={6}
                    className={iCls}
                    style={{ ...iSty, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.5 }}
                />
            </div>

            {/* Scrollable */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Scrollen erlauben
                </label>
                <Toggle
                    value={(o.scrollable as boolean) ?? true}
                    onToggle={() => set({ scrollable: !((o.scrollable as boolean) ?? true) })}
                />
            </div>

            {/* Sandbox */}
            <SandboxPicker
                preset={(o.sandboxPreset as SandboxPreset | undefined) ?? 'standard'}
                custom={(o.sandboxCustom as string | undefined) ?? ''}
                onChangePreset={(p) => set({ sandboxPreset: p })}
                onChangeCustom={(s) => set({ sandboxCustom: s || undefined })}
            />
        </>
    );
}

function SandboxPicker({
    preset,
    custom,
    onChangePreset,
    onChangeCustom,
}: {
    preset: SandboxPreset;
    custom: string;
    onChangePreset: (p: SandboxPreset) => void;
    onChangeCustom: (s: string) => void;
}) {
    const info = SANDBOX_PRESETS.find((p) => p.value === preset) ?? SANDBOX_PRESETS[2];
    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Sandbox
            </label>
            <select
                value={preset}
                onChange={(e) => onChangePreset(e.target.value as SandboxPreset)}
                className={iCls}
                style={iSty}
            >
                {SANDBOX_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                        {p.label}
                    </option>
                ))}
            </select>
            <p className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                {info.description}
            </p>
            {preset !== 'off' && preset !== 'custom' && info.flags && (
                <p
                    className="text-[10px] mt-0.5 font-mono leading-tight"
                    style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                >
                    {info.flags}
                </p>
            )}
            {preset === 'custom' && (
                <input
                    type="text"
                    value={custom}
                    onChange={(e) => onChangeCustom(e.target.value)}
                    placeholder="allow-scripts allow-forms"
                    className={`${iCls} font-mono mt-1`}
                    style={iSty}
                />
            )}
        </div>
    );
}
