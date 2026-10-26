/**
 * EnumConfig — config panel for the "Auswahlfeld" (enum) widget.
 *
 * Maps DP values (e.g. 0/1/2/3) to entries and offers a one-click import from
 * the DP's native common.states. Each entry is edited in a single compact row:
 * value/id · icon · label · color · up/down · remove — mirroring the universal
 * widget's DP-Auswahlfeld cell. How the current selection is rendered
 * (text / icon+text / icon) is a widget-level option (see Darstellung).
 *
 * Alternatively the whole list can come from a datapoint holding JSON
 * (issue #577) — then the entries are read live instead of being maintained
 * here, and this panel only configures the source and its field names via
 * the shared EnumJsonSourceSection (the Universal Widget's Auswahl cell
 * offers the very same editor).
 */
import { useState, type ReactNode } from 'react';
import type { WidgetConfig } from '../../types';
import { type EnumEntry } from '../widgets/enumEntry';
import { getObjectDirect } from '../../hooks/useIoBroker';
import type { EnumJsonKeys } from '../../utils/enumEntriesJson';
import { EnumEntriesEditor } from './EnumEntriesEditor';
import { EnumJsonSourceSection } from './EnumJsonSourceSection';
import { ConfigSection, SubGroup } from './ConfigSection';
import { CircleMenuSettings, showsCircleMenu } from './CircleMenuSettings';
import { StatusDpField } from './StatusDpField';
import { useT } from '../../i18n';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
    /** The shared main datapoint field (WidgetFrame renderMainDpField). */
    mainDpField: ReactNode;
}

/** Small on/off switch matching the config-panel style. */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                style={{ left: on ? '14px' : '2px' }}
            />
        </button>
    );
}

const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const fieldCls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

/** Widget option name carrying the field-name override for one JSON field. */
const KEY_OPTION: Record<keyof EnumJsonKeys, string> = {
    value: 'entriesValueKey',
    label: 'entriesLabelKey',
    color: 'entriesColorKey',
    icon: 'entriesIconKey',
    image: 'entriesImageKey',
};

export function EnumConfig({ config, onConfigChange, mainDpField }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const entries = (o.entries as EnumEntry[] | undefined) ?? [];
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const fromJson = o.entriesSource === 'json';
    const isCircle = config.layout === 'circle';

    const importFromStates = async () => {
        if (!config.datapoint) {
            setImportStatus('Kein Datenpunkt gewählt');
            return;
        }
        setImporting(true);
        setImportStatus(null);
        try {
            const obj = await getObjectDirect(config.datapoint);
            const states = (obj?.common as { states?: Record<string, string> | string } | undefined)?.states;
            let parsed: Record<string, string> | null = null;
            if (typeof states === 'object' && states) {
                parsed = states as Record<string, string>;
            } else if (typeof states === 'string') {
                // ioBroker also supports the legacy "0:zu;1:auf" format
                parsed = {};
                states.split(';').forEach((pair) => {
                    const [k, v] = pair.split(':');
                    if (k !== undefined && v !== undefined) parsed![k.trim()] = v.trim();
                });
            }
            if (!parsed || Object.keys(parsed).length === 0) {
                setImportStatus('Keine common.states am Datenpunkt');
                return;
            }
            const imported: EnumEntry[] = Object.entries(parsed).map(([k, v]) => ({
                value: String(k),
                label: String(v),
            }));
            setO({ entries: imported });
            setImportStatus(`${imported.length} Einträge importiert`);
        } catch (err) {
            setImportStatus('Fehler beim Lesen des DP');

            console.error('[EnumConfig] import failed', err);
        } finally {
            setImporting(false);
        }
    };

    return (
        <>
            <ConfigSection title={t('cfg.section.datapoints')} sectionKey="datapoints">
                {mainDpField}
                <StatusDpField value={o.statusDp as string | undefined} onChange={(id) => setO({ statusDp: id })} />
            </ConfigSection>
            <ConfigSection title={t('cfg.section.settings')} sectionKey="settings">
                <SubGroup title="Einträge">
                    {/* Quelle der Einträge: von Hand gepflegt oder aus einem JSON-DP (#577) */}
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Einträge
                        </label>
                        <div
                            className="flex rounded-lg overflow-hidden shrink-0"
                            style={{ border: '1px solid var(--app-border)' }}
                        >
                            {(
                                [
                                    { key: 'manual', label: 'Manuell' },
                                    { key: 'json', label: 'JSON-Datenpunkt' },
                                ] as const
                            ).map(({ key, label }) => {
                                const active = (fromJson ? 'json' : 'manual') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setO({ entriesSource: key })}
                                        className="text-[10px] px-2 py-1 transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: 'none',
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {fromJson && (
                        <EnumJsonSourceSection
                            dp={(o.entriesDp as string) ?? ''}
                            keys={{
                                value: o.entriesValueKey as string | undefined,
                                label: o.entriesLabelKey as string | undefined,
                                color: o.entriesColorKey as string | undefined,
                                icon: o.entriesIconKey as string | undefined,
                                image: o.entriesImageKey as string | undefined,
                            }}
                            onDpChange={(dp) => setO({ entriesDp: dp })}
                            onKeyChange={(field, v) => setO({ [KEY_OPTION[field]]: v })}
                        />
                    )}

                    {!fromJson && (
                        <>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={importFromStates}
                                    disabled={importing || !config.datapoint}
                                    className="text-[11px] px-2 py-1 rounded-lg hover:opacity-80 disabled:opacity-40"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {importing ? 'Lese …' : 'Aus common.states importieren'}
                                </button>
                                {importStatus && (
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        {importStatus}
                                    </span>
                                )}
                            </div>

                            <EnumEntriesEditor
                                entries={entries}
                                onChange={(next) => setO({ entries: next })}
                                emptyHint="Noch keine Einträge. Lege Wert→Eintrag-Paare an oder importiere sie aus dem Datenpunkt."
                            />
                        </>
                    )}
                </SubGroup>
            </ConfigSection>
            <ConfigSection title={t('cfg.section.look')} sectionKey="look">
                {showsCircleMenu(config.layout, o) && (
                    <CircleMenuSettings
                        o={o}
                        setO={setO}
                        intro="Im Kreis: die Einträge in der Reihenfolge der Liste oben – mit Icon oder Bild, sonst mit Text. Der Knopf zeigt den aktiven Eintrag."
                        iconPlaceholder="Bild des aktiven Eintrags, sonst Widget-Icon"
                        widgetIconFallback={false}
                    />
                )}
                {/* ── Anzeige (die Schalter stehen in „Sichtbare Felder“) ── */}
                <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Anzeige aktueller Eintrag
                        </label>
                        <div
                            className="flex rounded-lg overflow-hidden shrink-0"
                            style={{ border: '1px solid var(--app-border)' }}
                        >
                            {(
                                [
                                    { key: 'text', label: 'Text' },
                                    { key: 'icon-text', label: 'Icon + Text' },
                                    { key: 'icon', label: 'Icon' },
                                ] as const
                            ).map(({ key, label }) => {
                                const active = ((o.entryDisplay as string) ?? 'text') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setO({ entryDisplay: key })}
                                        className="text-[10px] px-2 py-1 transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: 'none',
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Größe und Breite des Dropdowns (#679) — das Kreismenü hat keins */}
                <div className="space-y-1.5 pt-1" hidden={isCircle}>
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Größe Auswahlfeld
                        </label>
                        <div
                            className="flex rounded-lg overflow-hidden shrink-0"
                            style={{ border: '1px solid var(--app-border)' }}
                        >
                            {(
                                [
                                    { key: 'sm', label: 'Klein' },
                                    { key: 'md', label: 'Mittel' },
                                    { key: 'lg', label: 'Groß' },
                                ] as const
                            ).map(({ key, label }) => {
                                const active = ((o.selectSize as string) ?? 'sm') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setO({ selectSize: key })}
                                        className="text-[10px] px-2 py-1 transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: 'none',
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Breite Auswahlfeld (px)
                            </label>
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Leer = so breit wie der Eintrag
                            </p>
                        </div>
                        <input
                            type="number"
                            min={40}
                            max={600}
                            placeholder="auto"
                            value={(o.selectWidth as number | undefined) ?? ''}
                            onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                setO({ selectWidth: Number.isFinite(n) && n > 0 ? n : undefined });
                            }}
                            className={`${fieldCls} shrink-0`}
                            style={{ ...iSty, width: '80px' }}
                        />
                    </div>
                </div>
            </ConfigSection>
            <ConfigSection title={t('cfg.section.behavior')} sectionKey="behavior">
                {/* Sicherheitsabfrage vor dem Schalten (#674) */}
                <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                Sicherheitsabfrage
                            </label>
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Bestätigung vor dem Schalten
                            </p>
                        </div>
                        <Toggle on={!!o.confirmAction} onClick={() => setO({ confirmAction: !o.confirmAction })} />
                    </div>
                    {o.confirmAction === true && (
                        <div style={{ borderLeft: '2px solid var(--app-border)', paddingLeft: 10, marginLeft: 2 }}>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Abfragetext (optional)
                            </label>
                            <input
                                type="text"
                                value={(o.confirmText as string) ?? ''}
                                onChange={(e) => setO({ confirmText: e.target.value || undefined })}
                                placeholder="Wirklich umschalten?"
                                className={`${fieldCls} w-full`}
                                style={iSty}
                            />
                        </div>
                    )}
                </div>
            </ConfigSection>
        </>
    );
}
