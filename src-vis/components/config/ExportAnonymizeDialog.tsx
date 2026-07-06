import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Database, Type, Link2, MapPin, CheckCheck } from 'lucide-react';
import { useT } from '../../i18n';
import type { AnonymizeOptions } from '../../utils/widgetExportImport';

const ALL_KEYS: (keyof AnonymizeOptions)[] = ['datapoints', 'titles', 'urls', 'geoAndCode'];

/**
 * Small modal shown before an export. Lets the user pick which data classes to
 * anonymise (all off by default = verbatim export). It knows nothing about the
 * payload or item type — the caller passes an `onExport` that performs the
 * actual `exportX(payload, opts)` call with the chosen options.
 */
export function ExportAnonymizeDialog({
    onExport,
    onClose,
}: {
    onExport: (opts: AnonymizeOptions) => void;
    onClose: () => void;
}) {
    const t = useT();
    const [opts, setOpts] = useState<AnonymizeOptions>({});

    const rows: { key: keyof AnonymizeOptions; icon: typeof Database; label: string; hint: string }[] = [
        { key: 'datapoints', icon: Database, label: t('exportAnon.datapoints'), hint: t('exportAnon.datapointsHint') },
        { key: 'titles', icon: Type, label: t('exportAnon.titles'), hint: t('exportAnon.titlesHint') },
        { key: 'urls', icon: Link2, label: t('exportAnon.urls'), hint: t('exportAnon.urlsHint') },
        { key: 'geoAndCode', icon: MapPin, label: t('exportAnon.geoAndCode'), hint: t('exportAnon.geoAndCodeHint') },
    ];

    const toggle = (key: keyof AnonymizeOptions) => setOpts((o) => ({ ...o, [key]: !o[key] }));

    const allSelected = ALL_KEYS.every((k) => opts[k]);
    const toggleAll = () =>
        setOpts(allSelected ? {} : { datapoints: true, titles: true, urls: true, geoAndCode: true });

    return createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4" onClick={onClose}>
            <div
                className="rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4"
                style={{
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                        {t('exportAnon.title')}
                    </h2>
                    <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        <X size={18} />
                    </button>
                </div>

                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('exportAnon.subtitle')}
                </p>

                <button
                    onClick={toggleAll}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                >
                    <CheckCheck size={13} />
                    {allSelected ? t('exportAnon.selectNone') : t('exportAnon.selectAll')}
                </button>

                <div className="space-y-2">
                    {rows.map(({ key, icon: Icon, label, hint }) => (
                        <label
                            key={key}
                            className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer hover:opacity-90"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        >
                            <input
                                type="checkbox"
                                checked={!!opts[key]}
                                onChange={() => toggle(key)}
                                className="mt-0.5 shrink-0"
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <span
                                className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                            >
                                <Icon size={13} />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {label}
                                </p>
                                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    {hint}
                                </p>
                            </div>
                        </label>
                    ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => {
                            onExport(opts);
                            onClose();
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Download size={13} /> {t('exportAnon.export')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
