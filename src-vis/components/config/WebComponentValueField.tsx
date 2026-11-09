import { useState } from 'react';
import { Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';

interface Props {
    /** `options.wcValueDp` */
    value: unknown;
    onChange: (dp: string | undefined) => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

/**
 * "Wert-Datenpunkt" of the webcomponent widget (`options.wcValueDp`): the datapoint
 * that holds the value a component edits (`value` / `iob-change` of the contract).
 * Offered for components that declare `editsValue` in their manifest, and whenever
 * one is set, so it can be removed again.
 */
export function WebComponentValueField({ value, onChange }: Props) {
    const [picking, setPicking] = useState(false);
    const current = typeof value === 'string' ? value : '';
    return (
        <div data-field="wcValueDp">
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Wert-Datenpunkt
            </label>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={current}
                    placeholder="optional"
                    onChange={(e) => onChange(e.target.value.trim() || undefined)}
                    className={`${iCls} flex-1 font-mono min-w-0`}
                    style={iSty}
                />
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ ...iSty, color: 'var(--text-secondary)' }}
                    title="Aus ioBroker wählen"
                >
                    <Database size={13} />
                </button>
            </div>
            <p className="text-[10px] mt-0.5" style={hintSty}>
                Der Datenpunkt liefert den Wert, den diese Komponente bearbeitet (z. B. einen Zeitplan oder eine Liste).
                Änderungen in der Komponente werden hineingeschrieben. JSON-Text kommt als Objekt an.
            </p>
            {picking && (
                <DatapointPicker
                    currentValue={current}
                    onSelect={(id) => {
                        onChange(id || undefined);
                        setPicking(false);
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
