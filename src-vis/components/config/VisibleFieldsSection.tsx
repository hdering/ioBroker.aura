import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { ConfigSection } from './ConfigSection';

/**
 * One show/hide switch of the widget edit dialog. Every visibility option of every
 * widget uses this row, so they all look and read the same (label left, switch right).
 */
export function ToggleRow({
    label,
    hint,
    on,
    onChange,
    extra,
    visKey,
    children,
}: {
    label: ReactNode;
    hint?: ReactNode;
    on: boolean;
    onChange: (next: boolean) => void;
    /** Control between label and switch, e.g. an alignment picker that belongs to the field. */
    extra?: ReactNode;
    /** Option key, rendered as `data-aura-vis-key` (the structure test collects these). */
    visKey?: string;
    /** Sub-options of this field, indented below it. The caller decides when to render them. */
    children?: ReactNode;
}) {
    return (
        <div data-aura-vis-key={visKey}>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                        {label}
                    </span>
                    {hint && (
                        <p
                            className="text-[10px] leading-tight"
                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                        >
                            {hint}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {extra}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => onChange(!on)}
                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                        style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                            style={{ left: on ? '14px' : '2px' }}
                        />
                    </button>
                </div>
            </div>
            {children && (
                <div className="mt-1 mb-1.5 ml-1 pl-3 space-y-2" style={{ borderLeft: '2px solid var(--app-border)' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

export interface VisibleField {
    key: string;
    label: ReactNode;
    /** The widget's own default when the option is unset (default: shown). */
    def?: boolean;
    /** The option stores "hidden" (hideScrollbar, hideFilterButton …): the switch shows its negation. */
    invert?: boolean;
    hint?: ReactNode;
    /** Not offered right now (e.g. needs a datapoint first). */
    hidden?: boolean;
    extra?: ReactNode;
    /** Sub-options; rendered only while the field is on. */
    children?: ReactNode;
}

/** Whether a field is currently shown, given the stored options. */
export function isFieldOn(f: Pick<VisibleField, 'key' | 'def' | 'invert'>, values: Record<string, unknown>): boolean {
    const raw = values[f.key];
    if (raw === undefined) return f.def ?? true;
    return f.invert ? raw !== true : raw !== false;
}

/**
 * "Sichtbare Felder" — the first section of every widget's own settings, folded like
 * every section, with an n/m count of the fields shown
 * (docs-internal/widget-config-template.md).
 */
export function VisibleFieldsSection({
    fields,
    values,
    onChange,
}: {
    fields: VisibleField[];
    values: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    const shown = fields.filter((f) => !f.hidden);
    if (shown.length === 0) return null;
    const rows = shown.map((f) => {
        const on = isFieldOn(f, values);
        return (
            <ToggleRow
                key={f.key}
                visKey={f.key}
                label={f.label}
                hint={f.hint}
                on={on}
                extra={on ? f.extra : undefined}
                onChange={(next) => onChange({ [f.key]: f.invert ? !next : next })}
            >
                {on ? f.children : undefined}
            </ToggleRow>
        );
    });
    const title = t('cfg.visibleFields');
    // Compact on purpose: a list of switches reads as one block, not as separate settings.
    const list = <div className="space-y-1">{rows}</div>;
    const onCount = shown.filter((f) => isFieldOn(f, values)).length;
    return (
        <ConfigSection title={title} sectionKey="visible" count={`${onCount}/${shown.length}`}>
            {list}
        </ConfigSection>
    );
}
