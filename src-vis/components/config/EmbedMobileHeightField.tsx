import {
    EMBED_MOBILE_HEIGHT_MODES,
    EMBED_MOBILE_HEIGHT_PX_DEFAULT,
    resolveEmbedMobileHeight,
    type EmbedMobileHeightMode,
} from '../../utils/embedMobileHeight';

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** Shared by the iframe and html config panels — see utils/embedMobileHeight. */
export function EmbedMobileHeightField({
    options,
    onChange,
}: {
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const { mode, px } = resolveEmbedMobileHeight(options);
    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Höhe auf dem Handy
            </label>
            <select
                value={mode}
                onChange={(e) => onChange({ mobileHeight: e.target.value as EmbedMobileHeightMode })}
                className={iCls}
                style={iSty}
            >
                {EMBED_MOBILE_HEIGHT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                        {m.label}
                    </option>
                ))}
            </select>
            {mode === 'px' && (
                <input
                    type="number"
                    min={40}
                    step={10}
                    value={px}
                    onChange={(e) =>
                        onChange({ mobileHeightPx: parseInt(e.target.value) || EMBED_MOBILE_HEIGHT_PX_DEFAULT })
                    }
                    className={`${iCls} mt-1`}
                    style={iSty}
                />
            )}
            <p className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                Seitenverhältnis passt zu Inhalten, die mit der Breite mitwachsen. Seiten, die sich selbst umbrechen (z.
                B. Grafana), brauchen die Zeilenhöhe oder eine feste Höhe.
            </p>
        </div>
    );
}
