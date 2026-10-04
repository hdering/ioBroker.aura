import { useT } from '../../i18n';

/**
 * "Zeitpunkt: Änderung | Aktualisierung" under a "show last change" toggle. Shared by
 * the widget frame, list entries, the auto list and custom cells; `undefined` is the
 * default (`lastChange`, the datapoint's `lc`) so untouched configs stay unchanged.
 */
export function LastChangeSourcePicker({
    value,
    onChange,
    labelClassName = 'text-[11px]',
}: {
    value: string | undefined;
    onChange: (next: 'lastUpdate' | undefined) => void;
    labelClassName?: string;
}) {
    const t = useT();
    const current = value === 'lastUpdate' ? 'lastUpdate' : 'lastChange';
    const choices = [
        { id: 'lastChange', label: t('wf.edit.lcSource.lastChange'), hint: t('wf.edit.lcSourceHint.lastChange') },
        { id: 'lastUpdate', label: t('wf.edit.lcSource.lastUpdate'), hint: t('wf.edit.lcSourceHint.lastUpdate') },
    ] as const;
    return (
        <div className="flex items-center gap-2">
            <label className={`${labelClassName} shrink-0`} style={{ color: 'var(--text-secondary)' }}>
                {t('wf.edit.lastChangeSource')}
            </label>
            <div className="flex gap-1">
                {choices.map((c) => {
                    const active = current === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            title={c.hint}
                            onClick={() => onChange(c.id === 'lastUpdate' ? 'lastUpdate' : undefined)}
                            className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                            style={{
                                background: active ? 'var(--accent)' : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {c.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
