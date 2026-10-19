/**
 * "In ioBroker veröffentlichen" (#798) — shared by the static list, the dynamic list
 * and the Statusübersicht.
 *
 * The adapter computes the content (lib/widgetPublish.js), so this panel only stores
 * the switch and, for the lists, which filter the published rows use. That filter is
 * separate from the one the widget starts with on purpose: a viewer may switch the
 * chip in the header, and a report at 22:00 must not depend on what somebody last
 * clicked.
 */
import { buildFilterChoices, type ListFilterOptions } from '../../../utils/listFilter';
import { NS } from '../../../utils/namespace';

export interface PublishSectionOptions extends ListFilterOptions {
    publishCount?: boolean;
    publishFilter?: string;
    valueFilter?: string;
}

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

const STATES: { key: string; hint: string }[] = [
    { key: 'count', hint: 'Anzahl' },
    { key: 'items', hint: 'Liste als JSON' },
    { key: 'text', hint: 'Zeilen „Raum: Name (Wert)“' },
    { key: 'ts', hint: 'letzte Änderung' },
];

export function PublishSection({
    widgetId,
    opts,
    setOpts,
    kind,
}: {
    widgetId: string;
    opts: PublishSectionOptions;
    setOpts: (patch: { publishCount?: boolean; publishFilter?: string }) => void;
    /** 'list' offers the filter choice; 'status' publishes the hints as shown. */
    kind: 'list' | 'autolist' | 'status';
}) {
    const on = opts.publishCount === true;
    const choices = kind === 'status' ? [] : buildFilterChoices(opts);
    const startLabel = choices.find((c) => c.key === (opts.valueFilter ?? 'all'))?.label ?? 'Alle';
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    In ioBroker veröffentlichen (Anzahl + Liste)
                </label>
                <button
                    onClick={() => setOpts({ publishCount: !on })}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: on ? '18px' : '2px' }}
                    />
                </button>
            </div>
            {on && (
                <>
                    {kind !== 'status' && (
                        <div>
                            <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Filter für die Veröffentlichung
                            </label>
                            <select
                                value={opts.publishFilter ?? ''}
                                onChange={(e) => setOpts({ publishFilter: e.target.value || undefined })}
                                className="w-full text-[11px] rounded px-2 py-1.5 focus:outline-none"
                                style={iSty}
                            >
                                <option value="">Wie Filter im Frontend ({startLabel})</option>
                                {choices.map((c) => (
                                    <option key={c.key} value={c.key}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="space-y-0.5">
                        {STATES.map((s) => (
                            <p
                                key={s.key}
                                className="text-[10px] font-mono truncate"
                                style={{ color: 'var(--text-secondary)' }}
                                title={s.hint}
                            >
                                {NS}.lists.{widgetId}.{s.key}
                                <span className="font-sans" style={{ opacity: 0.7 }}>
                                    {' '}
                                    – {s.hint}
                                </span>
                            </p>
                        ))}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        {kind === 'status'
                            ? 'Der Adapter rechnet selbst, auch ohne geöffneten Browser. Welche Datenpunkte dazugehören, erfährt er beim ersten Öffnen des Dashboards nach dem Speichern.'
                            : kind === 'autolist'
                              ? 'Der Adapter rechnet selbst, auch ohne geöffneten Browser. Die Suche bleibt im Browser: neue Geräte kommen nach dem nächsten Öffnen des Dashboards dazu.'
                              : 'Der Adapter rechnet selbst, auch ohne geöffneten Browser. Die Suche im Frontend zählt nie mit.'}
                    </p>
                </>
            )}
        </div>
    );
}
