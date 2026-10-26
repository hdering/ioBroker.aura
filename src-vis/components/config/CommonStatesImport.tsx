/**
 * CommonStatesImport — reads common.states of a datapoint ({"1":"eingehend",…} or
 * "1:eingehend;2:…") into the JSON table's value mapping (#852). The datapoint is
 * picked freely and defaults to the table's own one; the read is a one-shot import,
 * nothing stays linked.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import { readCommonStates } from '../../utils/commonStates';

const fieldSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function CommonStatesImport({
    defaultDp,
    onImport,
}: {
    /** Prefilled datapoint — the table's own. */
    defaultDp: string;
    /** Receives the value → text pairs; returns how many entries were added. */
    onImport: (states: Record<string, string>) => number;
}) {
    const [dp, setDp] = useState(defaultDp);
    const [picking, setPicking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const run = async () => {
        const id = dp.trim();
        if (!id) return;
        setBusy(true);
        setStatus(null);
        try {
            const states = await readCommonStates(id);
            if (!states) {
                setStatus('Keine common.states am Datenpunkt');
                return;
            }
            const added = onImport(states);
            const total = Object.keys(states).length;
            setStatus(
                added === total ? `${added} Einträge importiert` : `${total} Werte gelesen, ${added} neu hinzugefügt`,
            );
        } catch (err) {
            setStatus('Fehler beim Lesen des DP');
            console.error('[CommonStatesImport] import failed', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-1">
            <label className="text-[11px] block" style={{ color: 'var(--text-secondary)' }}>
                Aus common.states eines Datenpunkts übernehmen
            </label>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={dp}
                    onChange={(e) => setDp(e.target.value)}
                    placeholder="Datenpunkt mit common.states"
                    className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                    style={fieldSty}
                />
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    title="Datenpunkt wählen…"
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ ...fieldSty, color: 'var(--text-secondary)' }}
                >
                    <Database size={13} />
                </button>
                <button
                    type="button"
                    onClick={run}
                    disabled={busy || !dp.trim()}
                    className="text-[11px] px-2 rounded-lg hover:opacity-80 disabled:opacity-40 shrink-0"
                    style={{ ...fieldSty, color: 'var(--text-secondary)' }}
                >
                    {busy ? 'Lese …' : 'Importieren'}
                </button>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                {status ?? 'Vorhandene Einträge behalten Icon und Farbe; neue Werte werden angehängt.'}
            </p>
            {picking && (
                <DatapointPicker
                    currentValue={dp}
                    onSelect={(id) => {
                        setDp(id);
                        setPicking(false);
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
