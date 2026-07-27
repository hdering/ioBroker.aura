import { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

/**
 * Editor for the "Spiegel" (mirror) widget: pick the source widget whose content
 * should be shown here. Reuses the whole-dashboard widget-picker UX from
 * ClickActionEditor's popup-widget branch; the mirror only stores the source's id
 * in `options.targetWidgetId`.
 */
export function MirrorConfig({ config, onConfigChange }: Props) {
    const layouts = useDashboardStore((s) => s.layouts);
    const [search, setSearch] = useState('');

    const selectedId = (config.options?.targetWidgetId as string | undefined) ?? '';

    // Candidates: every widget on the dashboard, except this mirror itself and any
    // other mirror (no mirror chains → no cycles).
    const allWidgets = layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs.flatMap((t) => t.widgets)));
    const candidates = allWidgets
        .filter((w) => w.id !== config.id && w.type !== 'mirror')
        .sort((a, b) => (a.title || a.type).localeCompare(b.title || b.type, 'de'))
        .filter((w) => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                (w.title || w.type).toLowerCase().includes(q) ||
                w.id.toLowerCase().includes(q) ||
                w.type.toLowerCase().includes(q)
            );
        });

    const select = (id: string | undefined) => {
        // Make the mirror start out as a visual clone of the source: adopt its
        // size (w/h — the mirror keeps its own position x/y) and the frame-level
        // appearance options WidgetFrame reads from the mirror's OWN config
        // (transparent/transparency/styleOverride). The content already comes
        // from the source live via MirrorWidget, but those frame options don't —
        // so without copying them a mirror of e.g. a transparent group would
        // still draw a card. Picking "— Kein Widget —" leaves everything as is.
        const target = id ? allWidgets.find((w) => w.id === id) : undefined;
        if (!target) {
            onConfigChange({ ...config, options: { ...config.options, targetWidgetId: id } });
            return;
        }
        onConfigChange({
            ...config,
            gridPos: { ...config.gridPos, w: target.gridPos.w, h: target.gridPos.h },
            options: {
                ...config.options,
                targetWidgetId: id,
                transparent: target.options?.transparent,
                transparency: target.options?.transparency,
                styleOverride: target.options?.styleOverride,
            },
        });
    };

    const rowStyle = (id: string): React.CSSProperties => ({
        padding: '4px 8px',
        cursor: 'pointer',
        background: selectedId === id ? 'var(--accent)' : 'transparent',
        color: selectedId === id ? '#fff' : 'var(--text-primary)',
        borderRadius: 4,
    });

    return (
        <div className="space-y-1.5">
            <label className={labelCls} style={labelStyle}>
                Gespiegeltes Widget
            </label>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen nach Name, Typ oder ID…"
                className={inputCls}
                style={inputStyle}
            />
            <div style={{ ...inputStyle, padding: '4px', maxHeight: 220, overflowY: 'auto', borderRadius: 8 }}>
                {/* header */}
                <div
                    className="grid gap-x-2 px-2 pb-1 text-[10px]"
                    style={{
                        gridTemplateColumns: '1fr 90px 1fr',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--app-border)',
                    }}
                >
                    <span>Titel</span>
                    <span>Typ</span>
                    <span>ID</span>
                </div>
                {/* "none" row */}
                <div
                    className="grid gap-x-2 px-2 rounded text-xs"
                    style={{ ...rowStyle(''), gridTemplateColumns: '1fr 90px 1fr' }}
                    onClick={() => select(undefined)}
                >
                    <span className="truncate italic">— Kein Widget —</span>
                    <span />
                    <span />
                </div>
                {candidates.map((w) => (
                    <div
                        key={w.id}
                        className="grid gap-x-2 px-2 rounded text-xs"
                        style={{ ...rowStyle(w.id), gridTemplateColumns: '1fr 90px 1fr' }}
                        onClick={() => select(w.id)}
                    >
                        <span className="truncate">{w.title || '–'}</span>
                        <span className="truncate" style={{ opacity: 0.75 }}>
                            {w.type}
                        </span>
                        <span className="truncate" style={{ opacity: 0.6, fontFamily: 'monospace' }}>
                            {w.id}
                        </span>
                    </div>
                ))}
                {candidates.length === 0 && (
                    <div className="px-2 py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Keine Widgets gefunden
                    </div>
                )}
            </div>
        </div>
    );
}
