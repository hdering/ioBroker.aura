/**
 * "Sicherheitsabfrage" block of the edit dialog for widgets with several kinds of
 * writes (shutter, thermostat — #977): the confirmAction toggle plus the optional
 * question text. Same options as switch and enum, so the MCP schema stays uniform.
 */
export function ConfirmActionFields({
    options,
    setO,
    hintText,
    placeholder,
}: {
    options: Record<string, unknown>;
    setO: (patch: Record<string, unknown>) => void;
    /** What gets confirmed, in the widget's words. */
    hintText: string;
    placeholder: string;
}) {
    const on = options.confirmAction === true;
    const hint = { color: 'var(--text-secondary)' };
    return (
        <div className="aura-cfg-confirm space-y-1.5">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <label className="text-[11px] font-medium block" style={hint}>
                        Sicherheitsabfrage
                    </label>
                    <p className="text-[10px]" style={{ ...hint, opacity: 0.7 }}>
                        {hintText}
                    </p>
                </div>
                <button
                    data-aura-cfg="confirmAction"
                    onClick={() => setO({ confirmAction: on ? undefined : true })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
                    style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: on ? '18px' : '2px' }}
                    />
                </button>
            </div>
            {on && (
                <div style={{ borderLeft: '2px solid var(--app-border)', paddingLeft: 10, marginLeft: 2 }}>
                    <label className="text-[11px] mb-1 block" style={hint}>
                        Abfragetext (optional)
                    </label>
                    <input
                        type="text"
                        data-aura-cfg="confirmText"
                        value={(options.confirmText as string) ?? ''}
                        onChange={(e) => setO({ confirmText: e.target.value || undefined })}
                        placeholder={placeholder}
                        className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
