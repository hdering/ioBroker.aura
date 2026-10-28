/**
 * StatusDpField — the optional read-back datapoint (`options.statusDp`) of widgets that
 * write a value: the widget shows what this datapoint reports, writes still go to the
 * main datapoint. For devices that split command and status (Tasmota: cmnd.* / stat.*),
 * issues #567, #828. Read side: hooks/useReadBackDatapoint.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';

const fieldSty = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function StatusDpField({
    value,
    onChange,
    label = 'Status-Datenpunkt (optional)',
    placeholder = 'z.B. mqtt.1.device.stat.VALUE',
    hint = 'Separater Status-DP für Geräte, die Befehl und Rückmeldung trennen (z.B. Tasmota: cmnd.* schreibt, stat.* meldet). Angezeigt wird dann der Wert von hier – geschrieben wird weiter auf den Hauptdatenpunkt. Leer = Hauptdatenpunkt.',
}: {
    value: string | undefined;
    onChange: (id: string | undefined) => void;
    label?: string;
    placeholder?: string;
    hint?: string;
}) {
    const [picking, setPicking] = useState(false);
    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value || undefined)}
                    placeholder={placeholder}
                    className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                    style={fieldSty}
                />
                <button
                    onClick={() => setPicking(true)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ ...fieldSty, color: 'var(--text-secondary)' }}
                >
                    <Database size={13} />
                </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                {hint}
            </p>
            {picking && (
                <DatapointPicker
                    currentValue={value ?? ''}
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
